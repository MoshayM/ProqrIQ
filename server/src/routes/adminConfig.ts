import { Router } from 'express'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { db, auditLog, aiUsageLog, aiRouteOverrides, users } from '../db/index'
import { desc, sql, gte } from 'drizzle-orm'
import { getAiConfig, patchAiConfig, resetAiConfig } from '../services/aiConfig'
import {
  getModelForTask,
  setRouteOverride,
  deleteRouteOverride,
} from '../services/ai/aiRouter'
import { activeProviders } from '../services/ai/providers'
import { OllamaProvider } from '../services/ai/providers/ollama'
import type { AITask } from '../services/ai/aiRouter'

// Locate the ollama executable (works on Windows and Unix)
function findOllamaBin(): string {
  const candidates = [
    process.env.OLLAMA_BIN ?? '',
    'ollama',
    `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Ollama\\ollama.exe`,
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
  ]
  for (const c of candidates) {
    if (!c) continue
    if (c === 'ollama') return c   // rely on PATH
    if (existsSync(c)) return c
  }
  return 'ollama'
}

export const router = Router()

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

router.use(requireAuth, requireRole(ADMIN_ROLES), requirePlan('organization'))

// ─── GET current config ───────────────────────────────────────────────────────
router.get('/ai-config', (_req, res) => {
  res.json({ success: true, data: getAiConfig() })
})

// ─── PATCH config ─────────────────────────────────────────────────────────────
router.patch('/ai-config', async (req, res) => {
  try {
    const updated = patchAiConfig(req.body)

    await db.insert(auditLog).values({
      user_id:     (req as any).user?.id,
      action:      'ai_config_update',
      entity_type: 'ai_config',
      details:     JSON.stringify(req.body),
    })

    res.json({ success: true, data: updated })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST reset to defaults ───────────────────────────────────────────────────
router.post('/ai-config/reset', async (req, res) => {
  try {
    const reset = resetAiConfig()

    await db.insert(auditLog).values({
      user_id:     (req as any).user?.id,
      action:      'ai_config_reset',
      entity_type: 'ai_config',
      details:     null,
    })

    res.json({ success: true, data: reset })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET usage stats from ai_usage_log ───────────────────────────────────────
router.get('/ai-usage', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const rows = await db.select().from(aiUsageLog)
      .where(gte(aiUsageLog.created_at, since))
      .orderBy(desc(aiUsageLog.created_at))

    const byProvider: Record<string, { calls: number; cost: number; inputTokens: number; outputTokens: number }> = {}
    const byTask:     Record<string, { calls: number; cost: number }> = {}
    const byDay:      Record<string, number> = {}
    let totalCost = 0
    let totalCalls = 0

    for (const row of rows) {
      totalCalls++
      totalCost += row.estimated_cost_usd

      if (!byProvider[row.provider]) byProvider[row.provider] = { calls: 0, cost: 0, inputTokens: 0, outputTokens: 0 }
      byProvider[row.provider].calls++
      byProvider[row.provider].cost       += row.estimated_cost_usd
      byProvider[row.provider].inputTokens  += row.input_tokens
      byProvider[row.provider].outputTokens += row.output_tokens

      if (!byTask[row.task_type]) byTask[row.task_type] = { calls: 0, cost: 0 }
      byTask[row.task_type].calls++
      byTask[row.task_type].cost += row.estimated_cost_usd

      const day = (row.created_at ?? '').slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + row.estimated_cost_usd
    }

    // Per-user spend
    const userSpend = await db.select({
      user_id: aiUsageLog.user_id,
      total_cost: sql<number>`SUM(estimated_cost_usd)`,
      total_calls: sql<number>`COUNT(*)`,
    }).from(aiUsageLog)
      .where(gte(aiUsageLog.created_at, since))

    res.json({
      success: true,
      data: { since, total_calls: totalCalls, total_cost_usd: totalCost, by_provider: byProvider, by_task: byTask, by_user: userSpend, by_day: byDay },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET active providers ─────────────────────────────────────────────────────
router.get('/providers', (_req, res) => {
  const providers = activeProviders().map(p => ({ id: p.id, displayName: p.displayName, available: p.isAvailable() }))
  res.json({ success: true, data: providers })
})

// ─── GET current route table ──────────────────────────────────────────────────
router.get('/routes', async (_req, res) => {
  try {
    const tasks: AITask[] = ['costing', 'bulk_costing', 'cad_costing', 'kb_summary', 'supplier_suggest', 'supplier_recommend', 'negotiation', 'clarification', 'extraction', 'generic']
    const dbOverrides = await db.select().from(aiRouteOverrides)
    const overrideMap = Object.fromEntries(dbOverrides.map(r => [r.task, r]))

    const routes = await Promise.all(tasks.map(async task => ({
      task,
      ...(await getModelForTask(task)),
      is_overridden: !!overrideMap[task],
    })))

    res.json({ success: true, data: routes })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── SET route override ───────────────────────────────────────────────────────
router.put('/routes/:task', async (req, res) => {
  try {
    const { task } = req.params as { task: AITask }
    const { provider, model } = req.body as { provider: string; model: string }
    const userId = (req as unknown as { user: { id: string } }).user.id

    await setRouteOverride(task, provider, model, userId)
    await db.insert(auditLog).values({
      user_id: userId, action: 'ai_route_override',
      entity_type: 'ai_route', details: JSON.stringify({ task, provider, model }),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET locally-installed Ollama models ─────────────────────────────────────
router.get('/ollama/models', async (_req, res) => {
  try {
    const ollama = new OllamaProvider()
    const models = await ollama.listModels()
    res.json({ success: true, data: models })
  } catch (err) {
    res.json({ success: true, data: [] })
  }
})

// ─── POST /api/admin/ollama/test — send a quick JSON prompt to verify end-to-end ──
router.post('/ollama/test', async (req, res) => {
  const { model } = req.body as { model?: string }
  const ollama = new OllamaProvider()

  if (!ollama.isAvailable()) {
    res.status(400).json({ success: false, error: 'Ollama is disabled — set OLLAMA_ENABLED=true in server/.env' })
    return
  }

  const testModel = model ?? (process.env.OLLAMA_FAST_MODEL ?? 'qwen2.5:7b')
  const start = Date.now()

  try {
    const response = await ollama.complete({
      model:        testModel,
      systemPrompt: 'You are a JSON-only assistant. Output ONLY valid JSON. No markdown. No explanation.',
      userPrompt:   'Respond with exactly this JSON and nothing else: {"status":"ok","model":"' + testModel + '"}',
      maxTokens:    64,
    })

    const elapsed = Date.now() - start
    const raw = response.content.trim()

    // Try to parse what came back
    let parsed: unknown = null
    try { parsed = JSON.parse(raw) } catch { /* raw shown below */ }

    res.json({
      success:      true,
      data: {
        model:        testModel,
        elapsed_ms:   elapsed,
        raw_response: raw,
        parsed_ok:    parsed !== null,
        tokens_in:    response.inputTokens,
        tokens_out:   response.outputTokens,
      },
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error:   (err as Error).message,
      hint:    `Is Ollama running? Try: ollama serve   then: ollama pull ${testModel}`,
    })
  }
})

// ─── POST /api/admin/ollama/pull — stream pull progress via SSE ───────────────
// Body: { model: "qwen2.5:14b" }
// Response: text/event-stream  data: { status, completed, total, percent }
router.post('/ollama/pull', async (req, res) => {
  const { model } = req.body as { model?: string }
  if (!model) { res.status(400).json({ success: false, error: 'model is required' }); return }

  const bin = findOllamaBin()

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  send({ status: 'starting', model })

  try {
    const child = spawn(bin, ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] })

    // Ollama outputs progress lines to stdout
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      // Parse lines like: "pulling abc123:  42% ▕████     ▏ 2.0 GB/4.7 GB"
      for (const line of text.split('\n')) {
        const clean = line.replace(/\x1b\[[^m]*m|\r/g, '').trim()
        if (!clean) continue
        const pctMatch = clean.match(/(\d+)%/)
        const bytesMatch = clean.match(/([\d.]+\s*[KMGT]?B)\/([\d.]+\s*[KMGT]?B)/)
        send({
          status: 'downloading',
          model,
          message: clean,
          percent: pctMatch ? parseInt(pctMatch[1]) : null,
          progress: bytesMatch ? `${bytesMatch[1]} / ${bytesMatch[2]}` : null,
        })
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().replace(/\x1b\[[^m]*m|\r/g, '').trim()
      if (msg) send({ status: 'info', model, message: msg })
    })

    child.on('close', async (code) => {
      if (code === 0) {
        send({ status: 'done', model, success: true })
        await db.insert(auditLog).values({
          user_id:     (req as unknown as { user: { id: string } }).user?.id,
          action:      'ollama_model_pulled',
          entity_type: 'ollama',
          details:     JSON.stringify({ model }),
        }).catch(() => {/* non-fatal */})
      } else {
        send({ status: 'error', model, error: `ollama pull exited with code ${code}` })
      }
      res.end()
    })

    child.on('error', (err) => {
      send({ status: 'error', model, error: err.message, hint: 'Is Ollama installed? Get it from https://ollama.com' })
      res.end()
    })

    // Clean up if client disconnects
    req.on('close', () => { child.kill() })

  } catch (err) {
    send({ status: 'error', model, error: (err as Error).message })
    res.end()
  }
})

// ─── DELETE route override (revert to default) ────────────────────────────────
router.delete('/routes/:task', async (req, res) => {
  try {
    const { task } = req.params as { task: AITask }
    const userId = (req as unknown as { user: { id: string } }).user.id

    await deleteRouteOverride(task)
    await db.insert(auditLog).values({
      user_id: userId, action: 'ai_route_reset',
      entity_type: 'ai_route', details: JSON.stringify({ task }),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})
