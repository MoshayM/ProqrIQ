import { db } from '../../db/index'
import { eq, sql } from 'drizzle-orm'
import { aiRouteOverrides, aiUsageLog, users } from '../../db/schema'
import { getProvider, activeProviders, estimateCost } from './providers'
import type { AIRequest, AIResponse } from './providers'
import { getStoredKey } from './keyStore'

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

// Compute routing dynamically so admin-UI key changes + cold-start env vars are always respected.
// Never freeze provider availability at module-load time — check at call time instead.

function isGroqEnabled(): boolean {
  return !!(getStoredKey('groq') || process.env.GROQ_API_KEY)
}

function quality(): RouteResult {
  if (isGroqEnabled()) return { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  return { provider: 'anthropic', model: 'claude-sonnet-4-5' }
}

function ollama(model: string): RouteResult {
  if (process.env.OLLAMA_ENABLED === 'true') return { provider: 'ollama', model }
  if (isGroqEnabled())                        return { provider: 'groq',   model: 'llama-3.1-8b-instant' }
  return { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }
}

function getDefault(task: AITask): RouteResult {
  const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true'
  const ollamaModel   = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen2.5:14b'
  const ollamaFast    = process.env.OLLAMA_FAST_MODEL    ?? 'qwen2.5:7b'
  switch (task) {
    case 'costing':            return quality()
    // When Ollama is unavailable, fall back to Sonnet (not Haiku) — Haiku scores ~62% which is
    // below the 70% confidence gate, so bulk items would always return needs_clarification.
    case 'bulk_costing':       return ollamaEnabled ? { provider: 'ollama', model: ollamaModel } : quality()
    case 'cad_costing':        return quality()
    case 'kb_summary':         return ollama(ollamaFast)
    case 'supplier_suggest':   return ollama(ollamaFast)
    case 'supplier_recommend': return quality()
    case 'negotiation':        return quality()
    case 'clarification':      return ollama(ollamaFast)
    case 'extraction':         return ollamaEnabled ? { provider: 'ollama', model: ollamaModel } : quality()
    case 'generic':            return quality()
  }
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
  return getDefault(task)
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

// ─── Retry + error classification helpers ─────────────────────────────────────

function isTransientAIError(err: unknown): boolean {
  const msg    = ((err as Error).message ?? '').toLowerCase()
  const status = (err as { status?: number }).status
  return (
    status === 529 || status === 503 || status === 502 || status === 504 ||
    msg.includes('overload') || msg.includes('unavailable') ||
    msg.includes('timeout') || msg.includes('econnreset') ||
    msg.includes('service_unavailable') || msg.includes('internal_server_error')
  )
}

function isRateLimitError(err: unknown): boolean {
  const msg    = ((err as Error).message ?? '').toLowerCase()
  const status = (err as { status?: number }).status
  return status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')
}

/** Retry fn up to maxAttempts for transient errors with exponential backoff. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientAIError(err)) throw err
      const delayMs = Math.min(800 * Math.pow(2, attempt), 8000) // 800 ms → 1.6 s → 3.2 s
      console.warn(`[AI Router] transient error on "${label}" (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delayMs}ms: ${(err as Error).message}`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// ─── All-providers-exhausted sentinel ────────────────────────────────────────

class AllProvidersExhaustedError extends Error {
  constructor(providerCount: number) {
    super(`ALL_PROVIDERS_EXHAUSTED:${providerCount}`)
    this.name = 'AllProvidersExhaustedError'
  }
}

// ─── Per-provider representative fallback model ───────────────────────────────
// Used when a provider is selected as a fallback and we need a good default model.

const PROVIDER_FALLBACK_MODEL: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  groq:      'llama-3.3-70b-versatile',
  together:  'meta-llama/Llama-3.1-70B-Instruct-Turbo',
  openai:    'gpt-4o-mini',
  google:    'gemini-1.5-flash',
  xai:       'grok-2-1212',
  azure:     process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
  ollama:    process.env.OLLAMA_DEFAULT_MODEL    ?? 'qwen2.5:14b',
}

function isBudgetError(err: unknown): boolean {
  const msg    = ((err as Error).message ?? '').toLowerCase()
  const status = (err as { status?: number }).status
  return status === 402 || msg.includes('budget exhaust')
}

/** Classify an AI error into a user-friendly message + HTTP status. */
export function classifyAIError(err: unknown): { httpStatus: number; message: string; code: string } {
  if (err instanceof AllProvidersExhaustedError) {
    return {
      httpStatus: 503,
      message:    'No AI provider could complete this request. Ask your admin to configure additional providers in AI Control settings.',
      code:       'AI_ALL_PROVIDERS_FAILED',
    }
  }

  const msg    = ((err as Error).message ?? '').toLowerCase()
  const status = (err as { status?: number }).status

  if (isBudgetError(err)) {
    return { httpStatus: 402, message: 'Monthly AI budget exhausted. Contact your admin to increase the limit.', code: 'AI_BUDGET_EXCEEDED' }
  }
  if (isRateLimitError(err)) {
    return { httpStatus: 429, message: 'AI rate limit reached — please wait a moment and try again.', code: 'AI_RATE_LIMITED' }
  }
  if (msg.includes('api key') || msg.includes('not configured') || msg.includes('unauthorized') || status === 401) {
    return { httpStatus: 503, message: 'AI provider not configured. Ask your admin to check AI Control settings.', code: 'AI_NOT_CONFIGURED' }
  }
  if (isTransientAIError(err)) {
    // This path is only reached if called directly — completeWithRouter never lets a transient error bubble
    return { httpStatus: 503, message: 'AI processing failed — please try again.', code: 'AI_BUSY' }
  }
  return { httpStatus: 500, message: 'AI processing failed — please try again.', code: 'AI_FAILED' }
}

// ─── Main completion helper (drop-in for callers) ─────────────────────────────

/** Try every configured provider (except the one that already failed) in sequence.
 *  Each gets 2 retry attempts for transient errors. If ALL fail, throws
 *  AllProvidersExhaustedError so the caller sees a clear "no provider worked" signal.
 */
async function tryFallbacks(
  primaryRoute: RouteResult,
  request:      Omit<AIRequest, 'model'>,
  task:         string,
): Promise<{ response: AIResponse; usedRoute: RouteResult }> {
  const allActive = activeProviders()
  // Build ordered fallback list — every configured provider except the one that just failed
  const fallbacks: RouteResult[] = allActive
    .filter(p => p.id !== primaryRoute.provider)
    .map(p => ({
      provider: p.id,
      model:    PROVIDER_FALLBACK_MODEL[p.id] ?? p.id,
    }))

  for (const fb of fallbacks) {
    try {
      const fbProvider = getProvider(fb.provider)
      const response = await withRetry(
        () => fbProvider.complete({ ...request, model: fb.model }),
        `${fb.provider}/${fb.model}`,
        2,
      )
      console.warn(`[AI Router] task "${task}" fell back: ${primaryRoute.provider}/${primaryRoute.model} → ${fb.provider}/${fb.model}`)
      return { response, usedRoute: fb }
    } catch (e) {
      console.warn(`[AI Router] fallback ${fb.provider}/${fb.model} also failed (task "${task}"): ${(e as Error).message}`)
    }
  }

  // Every available provider (primary + all fallbacks) has been exhausted
  const totalTried = 1 + fallbacks.length
  throw new AllProvidersExhaustedError(totalTried)
}

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
    // Primary: up to 3 attempts for transient errors before falling back
    response = await withRetry(
      () => provider.complete({ ...opts.request, model: route.model }),
      `${route.provider}/${route.model}`,
      3,
    )
  } catch (primaryErr) {
    console.warn(`[AI Router] ${route.provider}/${route.model} failed for task "${opts.task}" — cascading to other providers: ${(primaryErr as Error).message}`)
    // Budget exhaustion is a per-user limit, not a provider issue — propagate immediately
    if (isBudgetError(primaryErr)) throw primaryErr
    // For everything else (transient, rate limit, not configured) — try every other active provider
    const fb  = await tryFallbacks(route, opts.request, opts.task)
    response  = fb.response
    usedRoute = fb.usedRoute
  }

  trackUsage({
    userId:   opts.userId,
    task:     opts.task,
    response: { ...response, provider: usedRoute.provider, model: usedRoute.model },
    quoteId:  opts.quoteId,
    batchId:  opts.batchId,
  })

  return response.content
}
