import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { db, auditLog } from '../db/index'
import { desc, sql } from 'drizzle-orm'
import { getAiConfig, patchAiConfig, resetAiConfig } from '../services/aiConfig'

export const router = Router()

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

router.use(requireAuth, requireRole(ADMIN_ROLES))

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

// ─── GET usage stats from audit_log ──────────────────────────────────────────
router.get('/ai-usage', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const rows = (db as any)
      .prepare(
        `SELECT action, COUNT(*) as count
         FROM audit_log
         WHERE action LIKE 'ai_%' AND created_at >= ?
         GROUP BY action
         ORDER BY count DESC`,
      )
      .all(since)

    const totalRow = (db as any)
      .prepare(`SELECT COUNT(*) as total FROM audit_log WHERE action LIKE 'ai_%' AND created_at >= ?`)
      .get(since)

    res.json({
      success: true,
      data: {
        since,
        total_calls: totalRow?.total ?? 0,
        by_action: rows,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})
