import { db } from '../../db/index'
import { eq, sql } from 'drizzle-orm'
import { aiRouteOverrides, aiUsageLog, users } from '../../db/schema'
import { getProvider, activeProviders, estimateCost } from './providers'
import type { AIRequest, AIResponse } from './providers'
import { getStoredKey } from './keyStore'

// Providers that can handle image/PDF inputs
const VISION_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'xai'])

// ─── Task types ───────────────────────────────────────────────────────────────

export type AITask =
  | 'costing'           // single-part cost estimate
  | 'bulk_costing'      // batch of independent parts
  | 'assembly_costing'  // assembly-level operations roll-up
  | 'cad_costing'       // drawing/CAD file analysis (vision path enabled by requiresVision)
  | 'kb_summary'        // knowledge-base summarisation
  | 'supplier_suggest'  // supplier discovery (speed > precision)
  | 'supplier_recommend'
  | 'supplier_extraction' // structured data extraction from a supplier quote document
  | 'negotiation'       // negotiation talking points (quality matters)
  | 'clarification'     // simple Q&A on an existing quote or help chat
  | 'extraction'        // generic structured extraction (backward-compat alias)
  | 'email_compose'     // template-driven outbound email drafting
  | 'generic'           // untyped fallback — routes to fast tier

export interface RouteResult {
  provider: string
  model:    string
}

// ─── Default routing table ────────────────────────────────────────────────────

const ENV_OVERRIDES: Partial<Record<AITask, string | undefined>> = {
  costing:              process.env.AI_ROUTE_COSTING,
  bulk_costing:         process.env.AI_ROUTE_BULK_COSTING,
  assembly_costing:     process.env.AI_ROUTE_ASSEMBLY_COSTING,
  cad_costing:          process.env.AI_ROUTE_CAD_COSTING,
  kb_summary:           process.env.AI_ROUTE_KB_SUMMARY,
  supplier_suggest:     process.env.AI_ROUTE_SUPPLIER_SUGGEST,
  supplier_recommend:   process.env.AI_ROUTE_SUPPLIER_RECOMMEND,
  supplier_extraction:  process.env.AI_ROUTE_SUPPLIER_EXTRACTION,
  negotiation:          process.env.AI_ROUTE_NEGOTIATION,
  clarification:        process.env.AI_ROUTE_CLARIFICATION,
  extraction:           process.env.AI_ROUTE_EXTRACTION,
  email_compose:        process.env.AI_ROUTE_EMAIL_COMPOSE,
  generic:              process.env.AI_ROUTE_GENERIC,
}

// Compute routing dynamically so admin-UI key changes + cold-start env vars are always respected.
// Never freeze provider availability at module-load time — check at call time instead.

function isGroqEnabled(): boolean {
  return !!(getStoredKey('groq') || process.env.GROQ_API_KEY)
}

// ─── Two routing tiers ────────────────────────────────────────────────────────
// quality(): accuracy-first. Groq 70B free → Anthropic Sonnet paid.
//   Use for: costing, extraction, negotiation — tasks where an incorrect answer
//   costs more than the model call.
// fast(): cost-first. Groq 8B free → Anthropic Haiku paid.
//   Use for: discovery, summaries, clarification, email — tasks where speed and
//   cheapness matter more than maximum accuracy.
// Vision routing is handled separately via requiresVision + VISION_FALLBACK_MODEL.

function quality(): RouteResult {
  if (isGroqEnabled()) return { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
}

function fast(): RouteResult {
  if (isGroqEnabled()) return { provider: 'groq', model: 'llama-3.1-8b-instant' }
  return { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }
}

function getDefault(task: AITask): RouteResult {
  switch (task) {
    // ─── Costing — accuracy critical, confidence gate enforced ────────────────
    case 'costing':             return quality()
    case 'bulk_costing':        return quality()
    case 'assembly_costing':    return quality()
    // cad_costing: quality() for text-mode 3D files; vision override kicks in for images
    case 'cad_costing':         return quality()

    // ─── Supplier intelligence — extraction and negotiation need quality ───────
    case 'supplier_extraction': return quality()
    case 'extraction':          return quality()  // backward-compat alias
    case 'negotiation':         return quality()
    case 'supplier_recommend':  return quality()

    // ─── Fast/cheap — speed matters more than peak accuracy ───────────────────
    case 'supplier_suggest':    return fast()
    case 'kb_summary':          return fast()
    case 'clarification':       return fast()
    case 'email_compose':       return fast()
    case 'generic':             return fast()     // untyped calls get the cheap model
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

// Standard fallback model per provider (used when provider is chosen as a cascade target)
const PROVIDER_FALLBACK_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',   // Sonnet for quality fallback cascade
  groq:      'llama-3.3-70b-versatile',
  together:  'meta-llama/Llama-3.1-70B-Instruct-Turbo',
  openai:    'gpt-4o-mini',
  google:    'gemini-1.5-flash',
  xai:       'grok-2-1212',
  azure:     process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
  ollama:    process.env.OLLAMA_DEFAULT_MODEL    ?? 'qwen2.5:14b',
}

// Vision-capable model per provider — used when requiresVision=true forces a provider switch.
// These models are confirmed to support image/PDF inputs.
const VISION_FALLBACK_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',  // Sonnet supports vision; Haiku does not
  openai:    'gpt-4o',
  google:    'gemini-1.5-pro',
  xai:       'grok-2-vision-1212',
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
  task:            AITask
  request:         Omit<AIRequest, 'model'>
  userId:          string
  quoteId?:        string
  batchId?:        string
  requiresVision?: boolean
}): Promise<string> {
  await checkBudget(opts.userId)

  let route = await getModelForTask(opts.task)

  // If this request includes an image/PDF and the selected provider can't handle vision,
  // find the first active vision-capable provider instead of silently dropping the image.
  if (opts.requiresVision && !VISION_PROVIDERS.has(route.provider)) {
    const visionRoute = activeProviders()
      .filter(p => VISION_PROVIDERS.has(p.id))
      .map(p => ({
        provider: p.id,
        model: VISION_FALLBACK_MODEL[p.id] ?? PROVIDER_FALLBACK_MODEL[p.id] ?? p.id,
      }))[0]
    if (visionRoute) {
      console.log(`[AI Router] Vision required for task "${opts.task}" — overriding ${route.provider}/${route.model} → ${visionRoute.provider}/${visionRoute.model}`)
      route = visionRoute
    } else {
      console.warn(`[AI Router] Vision required but no vision-capable provider active — proceeding with ${route.provider} (image will be text-only)`)
    }
  }

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
