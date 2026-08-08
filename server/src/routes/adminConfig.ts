import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { db, auditLog, aiUsageLog, aiRouteOverrides, users } from '../db/index'
import { desc, sql, gte, sum } from 'drizzle-orm'
import { getAiConfig, patchAiConfig, resetAiConfig } from '../services/aiConfig'
import {
  getModelForTask,
  setRouteOverride,
  deleteRouteOverride,
} from '../services/ai/aiRouter'
import { activeProviders } from '../services/ai/providers'
import type { AITask } from '../services/ai/aiRouter'

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
