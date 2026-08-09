import { db } from '../../db/index'
import { eq, sql } from 'drizzle-orm'
import { aiRouteOverrides, aiUsageLog, users } from '../../db/schema'
import { getProvider, estimateCost } from './providers'
import { toTogetherModel } from './providers/together'
import type { AIRequest, AIResponse } from './providers'

// ─── Task types ───────────────────────────────────────────────────────────────

export type AITask =
  | 'costing'
  | 'bulk_costing'
  | 'cad_costing'
  | 'kb_summary'
  | 'supplier_suggest'
  | 'supplier_recommend'
  | 'negotiation'
  | 'clarification'
  | 'extraction'
  | 'generic'

export interface RouteResult {
  provider: string
  model:    string
}

// ─── Default routing table ────────────────────────────────────────────────────

const ENV_OVERRIDES: Partial<Record<AITask, string | undefined>> = {
  costing:            process.env.AI_ROUTE_COSTING,
  bulk_costing:       process.env.AI_ROUTE_BULK_COSTING,
  cad_costing:        process.env.AI_ROUTE_CAD_COSTING,
  kb_summary:         process.env.AI_ROUTE_KB_SUMMARY,
  supplier_suggest:   process.env.AI_ROUTE_SUPPLIER_SUGGEST,
  supplier_recommend: process.env.AI_ROUTE_SUPPLIER_RECOMMEND,
  negotiation:        process.env.AI_ROUTE_NEGOTIATION,
  clarification:      process.env.AI_ROUTE_CLARIFICATION,
  extraction:         process.env.AI_ROUTE_EXTRACTION,
  generic:            process.env.AI_ROUTE_GENERIC,
}

// When OLLAMA_ENABLED=true, high-volume cheap tasks route to local inference by default.
// Tasks needing vision (cad_costing) or high accuracy (costing, negotiation) stay on Claude.
// Any task can be overridden via the AiControl UI or AI_ROUTE_* env vars.
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED === 'true'
const OLLAMA_MODEL   = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen2.5:14b'
const OLLAMA_FAST    = process.env.OLLAMA_FAST_MODEL    ?? 'qwen2.5:7b'

function ollama(model: string): RouteResult {
  return OLLAMA_ENABLED
    ? { provider: 'ollama',    model }
    : { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }
}

const DEFAULTS: Record<AITask, RouteResult> = {
  costing:            { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  // When Ollama is unavailable, fall back to Sonnet (not Haiku) — Haiku scores ~62% which is
  // below the 70% confidence gate, so bulk items would always return needs_clarification.
  bulk_costing:       OLLAMA_ENABLED ? { provider: 'ollama', model: OLLAMA_MODEL } : { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  cad_costing:        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  kb_summary:         ollama(OLLAMA_FAST),
  supplier_suggest:   ollama(OLLAMA_FAST),
  supplier_recommend: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  negotiation:        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  clarification:      ollama(OLLAMA_FAST),
  extraction:         ollama(OLLAMA_MODEL),
  generic:            { provider: 'anthropic', model: 'claude-sonnet-4-5' },
}

function parseRoute(raw: string): RouteResult {
  const [provider, ...rest] = raw.split('/')
  return { provider, model: rest.join('/') }
}

// In-memory cache for DB overrides (TTL 5 minutes)
let dbOverrideCache: Record<string, RouteResult> = {}
let dbCacheTs = 0

async function getDbOverrides(): Promise<Record<string, RouteResult>> {
  if (Date.now() - dbCacheTs < 300_000) return dbOverrideCache
  try {
    const rows = await db.select().from(aiRouteOverrides)
    dbOverrideCache = Object.fromEntries(rows.map(r => [r.task, { provider: r.provider, model: r.model }]))
    dbCacheTs = Date.now()
  } catch {
    // Table may not exist yet during dev — return empty
    dbOverrideCache = {}
    dbCacheTs = Date.now()
  }
  return dbOverrideCache
}

export async function getModelForTask(task: AITask): Promise<RouteResult> {
  const dbOverrides = await getDbOverrides()
  if (dbOverrides[task]) return dbOverrides[task]
  const envRaw = ENV_OVERRIDES[task]
  if (envRaw) return parseRoute(envRaw)
  return DEFAULTS[task]
}

export async function setRouteOverride(task: AITask, provider: string, model: string, updatedBy: string): Promise<void> {
  await db.insert(aiRouteOverrides)
    .values({ task, provider, model, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .onConflictDoUpdate({ target: aiRouteOverrides.task, set: { provider, model, updated_by: updatedBy, updated_at: new Date().toISOString() } })
  dbCacheTs = 0 // bust cache
}

export async function deleteRouteOverride(task: AITask): Promise<void> {
  await db.delete(aiRouteOverrides).where(eq(aiRouteOverrides.task, task))
  dbCacheTs = 0
}

// ─── Budget check ─────────────────────────────────────────────────────────────

export async function checkBudget(userId: string): Promise<void> {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user) return
    const budget = (user as unknown as { ai_budget_usd_monthly?: number }).ai_budget_usd_monthly ?? 20
    const spent  = (user as unknown as { ai_spend_usd_current?: number }).ai_spend_usd_current  ?? 0
    if (budget > 0 && spent >= budget) {
      const err = Object.assign(new Error('Monthly AI budget exhausted. Contact admin to increase your limit.'), { status: 429 })
      throw err
    }
  } catch (e: unknown) {
    if ((e as { status?: number }).status === 429) throw e
    // Budget columns not yet migrated — skip check silently
  }
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

export function trackUsage(opts: {
  userId:   string
  task:     AITask
  response: AIResponse
  quoteId?: string
  batchId?: string
}): void {
  setImmediate(async () => {
    try {
      const cost = estimateCost(opts.response.provider, opts.response.model, opts.response.inputTokens, opts.response.outputTokens)

      await db.insert(aiUsageLog).values({
        user_id:            opts.userId,
        task_type:          opts.task,
        provider:           opts.response.provider,
        model:              opts.response.model,
        input_tokens:       opts.response.inputTokens,
        output_tokens:      opts.response.outputTokens,
        estimated_cost_usd: cost,
        quote_id:           opts.quoteId ?? null,
        batch_id:           opts.batchId ?? null,
        created_at:         new Date().toISOString(),
      })

      // Increment running spend atomically
      await db.update(users)
        .set({ ai_spend_usd_current: sql`COALESCE(ai_spend_usd_current, 0) + ${cost}` })
        .where(eq(users.id, opts.userId))
    } catch { /* tracking is best-effort — never crash */ }
  })
}

// ─── Main completion helper (drop-in for callers) ─────────────────────────────

const HAIKU_FALLBACK = { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }

export async function completeWithRouter(opts: {
  task:       AITask
  request:    Omit<AIRequest, 'model'>
  userId:     string
  quoteId?:   string
  batchId?:   string
}): Promise<string> {
  await checkBudget(opts.userId)

  const route = await getModelForTask(opts.task)

  let response: AIResponse
  let usedRoute = route

  try {
    const provider = getProvider(route.provider)
    response = await provider.complete({ ...opts.request, model: route.model })
  } catch (primaryErr) {
    // Non-Anthropic failure: try Together AI cloud fallback for Ollama routes, then Haiku
    if (route.provider !== 'anthropic') {
      console.warn(
        `[AI Router] ${route.provider}/${route.model} failed for task "${opts.task}". Error: ${(primaryErr as Error).message}`,
      )

      // If route was Ollama and Together AI is configured, use it as intermediate fallback
      const togetherKey = process.env.TOGETHER_API_KEY
      if (route.provider === 'ollama' && togetherKey) {
        try {
          const together  = getProvider('together')
          const toModel   = toTogetherModel(route.model)
          console.warn(`[AI Router] Falling back to Together AI: ${toModel}`)
          response  = await together.complete({ ...opts.request, model: toModel })
          usedRoute = { provider: 'together', model: toModel }
        } catch (togetherErr) {
          console.warn(`[AI Router] Together AI also failed — falling back to Haiku. Error: ${(togetherErr as Error).message}`)
          const fallback = getProvider(HAIKU_FALLBACK.provider)
          response  = await fallback.complete({ ...opts.request, model: HAIKU_FALLBACK.model })
          usedRoute = HAIKU_FALLBACK
        }
      } else {
        try {
          const fallback = getProvider(HAIKU_FALLBACK.provider)
          response  = await fallback.complete({ ...opts.request, model: HAIKU_FALLBACK.model })
          usedRoute = HAIKU_FALLBACK
        } catch (fallbackErr) {
          throw new Error(
            `AI Router: primary (${route.provider}) and fallback (anthropic/haiku) both failed. ` +
            `Primary: ${(primaryErr as Error).message}. Fallback: ${(fallbackErr as Error).message}`,
          )
        }
      }
    } else {
      // Anthropic is the primary but failed. If it's a config/availability issue
      // (not a live API error) try Together AI as a last resort before giving up.
      const isConfigError = (primaryErr as Error).message.includes('is not configured')
      const togetherKey   = process.env.TOGETHER_API_KEY
      if (isConfigError && togetherKey) {
        console.warn(`[AI Router] Anthropic not configured for task "${opts.task}" — trying Together AI fallback`)
        try {
          const together = getProvider('together')
          // Use a capable instruction-tuned model as Anthropic stand-in
          const toModel = 'meta-llama/Llama-3.1-70B-Instruct-Turbo'
          response  = await together.complete({ ...opts.request, model: toModel })
          usedRoute = { provider: 'together', model: toModel }
        } catch (togetherErr) {
          // Throw the original Anthropic config error so the message is actionable
          throw primaryErr
        }
      } else {
        throw primaryErr
      }
    }
  }

  trackUsage({
    userId:  opts.userId,
    task:    opts.task,
    response: { ...response, provider: usedRoute.provider, model: usedRoute.model },
    quoteId: opts.quoteId,
    batchId: opts.batchId,
  })

  return response.content
}
