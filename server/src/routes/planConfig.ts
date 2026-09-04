import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { db, client } from '../db'
import { planConfigs, auditLog } from '../db/schema'

export const router = Router()

const ADMIN_ROLES = ['admin', 'developer', 'owner']

function rowToObj(columns: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  columns.forEach((col, i) => { obj[col] = row[i] })
  return obj
}

function parseFeatures(raw: unknown) {
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return raw } }
  return raw
}

const DEFAULT_SEEDS = [
  {
    plan: 'free' as const, display_name: 'Free',
    monthly_price_inr: 0, annual_price_inr: 0,
    monthly_price_usd: 0, annual_price_usd: 0,
    trial_days: 0,
    features: JSON.stringify({
      quotes_per_month: 10, bulk_batch_items: 10, assembly_depth: 2,
      kb_documents: 5, ai_model: 'haiku',
      supplier_discovery: false, negotiation_reports: false,
      excel_pdf_export: false, passkey_auth: false,
      ai_cost_control: false, custom_margin: false,
      sso_saml: false, priority_support: false, audit_log_export: false,
    }),
    effective_from: '2024-01-01T00:00:00.000Z', created_by: 'system',
  },
  {
    plan: 'pro' as const, display_name: 'Pro',
    monthly_price_inr: 399900, annual_price_inr: 3999000,
    monthly_price_usd: 4900, annual_price_usd: 49000,
    trial_days: 14,
    features: JSON.stringify({
      quotes_per_month: 200, bulk_batch_items: 50, assembly_depth: 3,
      kb_documents: 50, ai_model: 'sonnet',
      supplier_discovery: true, negotiation_reports: true,
      excel_pdf_export: true, passkey_auth: true,
      ai_cost_control: false, custom_margin: false,
      sso_saml: false, priority_support: true, audit_log_export: false,
    }),
    effective_from: '2024-01-01T00:00:00.000Z', created_by: 'system',
  },
  {
    plan: 'organization' as const, display_name: 'Organization',
    monthly_price_inr: 1499900, annual_price_inr: 14999000,
    monthly_price_usd: 18900, annual_price_usd: 189000,
    trial_days: 14,
    features: JSON.stringify({
      quotes_per_month: null, bulk_batch_items: 50, assembly_depth: 3,
      kb_documents: null, ai_model: 'sonnet_opus',
      supplier_discovery: true, negotiation_reports: true,
      excel_pdf_export: true, passkey_auth: true,
      ai_cost_control: true, custom_margin: true,
      sso_saml: true, priority_support: true, audit_log_export: true,
    }),
    effective_from: '2024-01-01T00:00:00.000Z', created_by: 'system',
  },
]

async function ensureDefaults() {
  const res = await client.execute('SELECT COUNT(*) FROM plan_configs')
  const count = Number(res.rows[0][0] ?? 0)
  if (count === 0) {
    for (const seed of DEFAULT_SEEDS) {
      await db.insert(planConfigs).values({ ...seed, id: crypto.randomUUID() })
    }
  }
}

// ─── GET /api/admin/plan-config ───────────────────────────────────────────────

router.get('/plan-config', requireAuth, requireRole(ADMIN_ROLES), async (_req: Request, res: Response) => {
  try {
    await ensureDefaults()
    const result = await client.execute(`
      SELECT p.* FROM plan_configs p
      INNER JOIN (
        SELECT plan, MAX(effective_from) as mef FROM plan_configs GROUP BY plan
      ) latest ON p.plan = latest.plan AND p.effective_from = latest.mef
      ORDER BY p.plan ASC`)
    const configs = result.rows
      .map(r => rowToObj(result.columns, r as unknown[]))
      .map(r => ({ ...r, features: parseFeatures(r.features) }))
    res.json({ success: true, data: configs })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET /api/admin/plan-config/history/:plan ─────────────────────────────────

router.get('/plan-config/history/:plan', requireAuth, requireRole(ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const result = await client.execute({
      sql: 'SELECT * FROM plan_configs WHERE plan = ? ORDER BY effective_from DESC LIMIT 20',
      args: [req.params.plan],
    })
    res.json({
      success: true,
      data: result.rows
        .map(r => rowToObj(result.columns, r as unknown[]))
        .map(r => ({ ...r, features: parseFeatures(r.features) })),
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── PUT /api/admin/plan-config/:plan ────────────────────────────────────────
// Saves a new version. Existing subscribers are grandfathered until period_end.

router.put('/plan-config/:plan', requireAuth, requireRole(ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const { plan } = req.params
    if (!['free', 'pro', 'organization'].includes(plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan' }); return
    }
    const { display_name, monthly_price_inr, annual_price_inr,
            monthly_price_usd, annual_price_usd, trial_days, features } = req.body

    if (monthly_price_inr === undefined || !features) {
      res.status(400).json({ success: false, error: 'monthly_price_inr and features are required' }); return
    }

    const id  = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.insert(planConfigs).values({
      id,
      plan:              plan as 'free' | 'pro' | 'organization',
      display_name:      String(display_name ?? plan),
      monthly_price_inr: Number(monthly_price_inr),
      annual_price_inr:  Number(annual_price_inr ?? 0),
      monthly_price_usd: Number(monthly_price_usd ?? 0),
      annual_price_usd:  Number(annual_price_usd ?? 0),
      trial_days:        Number(trial_days ?? 14),
      features:          typeof features === 'string' ? features : JSON.stringify(features),
      effective_from:    now,
      created_by:        req.user!.id,
      created_at:        now,
    })

    await db.insert(auditLog).values({
      id: crypto.randomUUID(), user_id: req.user!.id,
      action: 'plan_config_updated', entity_type: 'plan_config', entity_id: id,
      details: JSON.stringify({ plan, monthly_price_inr, annual_price_inr, trial_days }),
      created_at: now,
    })

    res.json({ success: true, id, effective_from: now })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET /api/plan-config/public ─────────────────────────────────────────────
// Public — used on Pricing page to show current prices

router.get('/plan-config/public', async (_req: Request, res: Response) => {
  try {
    await ensureDefaults()
    const result = await client.execute(`
      SELECT p.plan, p.display_name, p.monthly_price_inr, p.annual_price_inr,
             p.monthly_price_usd, p.annual_price_usd, p.trial_days, p.features
      FROM plan_configs p
      INNER JOIN (
        SELECT plan, MAX(effective_from) as mef FROM plan_configs GROUP BY plan
      ) latest ON p.plan = latest.plan AND p.effective_from = latest.mef`)
    const configs = result.rows
      .map(r => rowToObj(result.columns, r as unknown[]))
      .map(r => ({ ...r, features: parseFeatures(r.features) }))
    res.json({ success: true, data: configs })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})
