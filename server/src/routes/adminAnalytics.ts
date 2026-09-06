import { Router, Request, Response } from 'express'
import type { InValue } from '@libsql/client'
import { requireAuth, requireRole } from '../middleware/auth'
import { db, client } from '../db'
import { auditLog } from '../db/schema'

export const router = Router()

const ADMIN_ROLES = ['admin', 'developer', 'owner']

// Default plan monthly prices in paise (used when no plan_config row exists)
const DEFAULT_MONTHLY_INR: Record<string, number> = {
  free: 0, pro: 399900, organization: 1499900,
}
const DEFAULT_ANNUAL_INR: Record<string, number> = {
  free: 0, pro: 3999000, organization: 14999000,
}

function paise2inr(p: number) { return Math.round((p / 100) * 100) / 100 }

// Converts a libsql row (array-like with column keys) to a plain object
function rowToObj(columns: string[], row: ArrayLike<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  columns.forEach((col, i) => { obj[col] = row[i] })
  return obj
}

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

router.get('/analytics', requireAuth, requireRole(ADMIN_ROLES), async (_req: Request, res: Response) => {
  try {
    // ── User counts ────────────────────────────────────────────────────────────
    const totalUsersRes = await client.execute('SELECT COUNT(*) as c FROM users')
    const totalUsers = Number(totalUsersRes.rows[0][0] ?? 0)

    const newThisMonthRes = await client.execute(`
      SELECT COUNT(*) as c FROM users
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)
    const newThisMonth = Number(newThisMonthRes.rows[0][0] ?? 0)

    const newLastMonthRes = await client.execute(`
      SELECT COUNT(*) as c FROM users
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now','-1 month'))`)
    const newLastMonth = Number(newLastMonthRes.rows[0][0] ?? 0)

    // ── Subscription breakdown ─────────────────────────────────────────────────
    const subRes = await client.execute(`
      SELECT plan, billing_cycle, status, COUNT(*) as cnt
      FROM subscriptions GROUP BY plan, billing_cycle, status`)
    const subRows = subRes.rows.map(r => rowToObj(subRes.columns, r))

    const activeRows   = subRows.filter(r => r.status === 'active' || r.status === 'trialing')
    const trialingRows = subRows.filter(r => r.status === 'trialing')
    const canceledRows = subRows.filter(r => r.status === 'canceled')

    // ── Latest plan prices ─────────────────────────────────────────────────────
    const priceRes = await client.execute(`
      SELECT p.plan, p.monthly_price_inr, p.annual_price_inr FROM plan_configs p
      INNER JOIN (
        SELECT plan, MAX(effective_from) as mef FROM plan_configs GROUP BY plan
      ) latest ON p.plan = latest.plan AND p.effective_from = latest.mef`)
    const priceRows = priceRes.rows.map(r => rowToObj(priceRes.columns, r))

    const monthlyInr: Record<string, number> = { ...DEFAULT_MONTHLY_INR }
    const annualInr:  Record<string, number> = { ...DEFAULT_ANNUAL_INR }
    for (const r of priceRows) {
      monthlyInr[r.plan as string] = Number(r.monthly_price_inr ?? 0)
      annualInr[r.plan as string]  = Number(r.annual_price_inr ?? 0)
    }

    // ── MRR / ARR ──────────────────────────────────────────────────────────────
    let mrrPaise = 0
    for (const r of activeRows) {
      const plan = r.plan as string
      const monthly = r.billing_cycle === 'annual'
        ? (annualInr[plan] ?? 0) / 12
        : (monthlyInr[plan] ?? 0)
      mrrPaise += monthly * Number(r.cnt)
    }
    const mrr = paise2inr(mrrPaise)
    const arr = mrr * 12

    // ── Plan distribution ──────────────────────────────────────────────────────
    const planDistRes = await client.execute(`
      SELECT plan, COUNT(*) as cnt FROM subscriptions
      WHERE status IN ('active','trialing') GROUP BY plan`)
    const planDist: Record<string, number> = {}
    let totalPaying = 0
    for (const r of planDistRes.rows) {
      const plan = String(r[0])
      const cnt  = Number(r[1])
      planDist[plan] = cnt
      if (plan !== 'free') totalPaying += cnt
    }
    const arpu = totalPaying > 0 ? mrr / totalPaying : 0

    // ── Churn (last 30 days) ───────────────────────────────────────────────────
    const canceledThisMonthRes = await client.execute(`
      SELECT COUNT(*) as c FROM subscriptions
      WHERE status = 'canceled'
        AND strftime('%Y-%m', canceled_at) = strftime('%Y-%m', 'now')`)
    const canceledThisMonth = Number(canceledThisMonthRes.rows[0][0] ?? 0)

    const activeStartRes = await client.execute(`
      SELECT COUNT(*) as c FROM subscriptions
      WHERE (status IN ('active','trialing')
             OR (status = 'canceled' AND canceled_at > date('now','start of month')))
        AND created_at < date('now','start of month')`)
    const activeStartOfMonth = Number(activeStartRes.rows[0][0] ?? 0)

    const churnRate = activeStartOfMonth > 0
      ? (canceledThisMonth / activeStartOfMonth) * 100 : 0

    // ── Churned MRR this month ─────────────────────────────────────────────────
    const churnedSubsRes = await client.execute(`
      SELECT plan, billing_cycle FROM subscriptions
      WHERE status = 'canceled'
        AND strftime('%Y-%m', canceled_at) = strftime('%Y-%m', 'now')`)
    let churnedMrrPaise = 0
    for (const r of churnedSubsRes.rows) {
      const plan = String(r[0])
      const cycle = String(r[1])
      churnedMrrPaise += cycle === 'annual' ? (annualInr[plan] ?? 0) / 12 : (monthlyInr[plan] ?? 0)
    }
    const churnedMrr = paise2inr(churnedMrrPaise)

    // ── New MRR this month ─────────────────────────────────────────────────────
    const newSubsRes = await client.execute(`
      SELECT plan, billing_cycle FROM subscriptions
      WHERE status IN ('active','trialing') AND plan != 'free'
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)
    let newMrrPaise = 0
    for (const r of newSubsRes.rows) {
      const plan = String(r[0])
      const cycle = String(r[1])
      newMrrPaise += cycle === 'annual' ? (annualInr[plan] ?? 0) / 12 : (monthlyInr[plan] ?? 0)
    }
    const newMrr    = paise2inr(newMrrPaise)
    const netNewMrr = newMrr - churnedMrr

    // ── GRR ───────────────────────────────────────────────────────────────────
    const mrrBod = mrr + churnedMrr
    const grr    = mrrBod > 0 ? Math.min(100, ((mrrBod - churnedMrr) / mrrBod) * 100) : 100

    // ── Monthly signups (last 12 months) ──────────────────────────────────────
    const signupsRes = await client.execute(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as cnt
      FROM users WHERE created_at >= date('now', '-12 months')
      GROUP BY month ORDER BY month ASC`)
    const signupsByMonth = signupsRes.rows.map(r => ({ month: String(r[0]), cnt: Number(r[1]) }))

    // ── Revenue by month (from billing_transactions) ───────────────────────────
    const txMonthRes = await client.execute(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(amount_inr) as total_inr
      FROM billing_transactions
      WHERE status = 'succeeded' AND type = 'payment'
        AND created_at >= date('now', '-12 months')
      GROUP BY month ORDER BY month ASC`)
    const revenueByMonth = txMonthRes.rows.map(r => ({
      month: String(r[0]), revenue: paise2inr(Number(r[1] ?? 0)),
    }))

    // ── Trials expiring in 7 days ─────────────────────────────────────────────
    const trialsRes = await client.execute(`
      SELECT u.full_name as name, u.email, s.trial_ends_at, s.plan
      FROM subscriptions s JOIN users u ON s.user_id = u.id
      WHERE s.status = 'trialing' AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at <= date('now', '+7 days')
      ORDER BY s.trial_ends_at ASC LIMIT 20`)
    const trialsExpiringSoon = trialsRes.rows.map(r =>
      rowToObj(trialsRes.columns, r))

    // ── Upcoming renewals (30 days) ───────────────────────────────────────────
    const renewalsRes = await client.execute(`
      SELECT u.full_name as name, u.email, s.plan, s.billing_cycle, s.current_period_end
      FROM subscriptions s JOIN users u ON s.user_id = u.id
      WHERE s.status = 'active' AND s.current_period_end IS NOT NULL
        AND s.current_period_end <= date('now', '+30 days')
      ORDER BY s.current_period_end ASC LIMIT 20`)
    const upcomingRenewals = renewalsRes.rows.map(r =>
      rowToObj(renewalsRes.columns, r))

    // ── Recent churn ──────────────────────────────────────────────────────────
    const churnListRes = await client.execute(`
      SELECT u.full_name as name, u.email, s.plan, s.billing_cycle, s.canceled_at
      FROM subscriptions s JOIN users u ON s.user_id = u.id
      WHERE s.status = 'canceled' AND s.canceled_at >= date('now', '-30 days')
      ORDER BY s.canceled_at DESC LIMIT 20`)
    const recentChurn = churnListRes.rows.map(r =>
      rowToObj(churnListRes.columns, r))

    // ── Total billing revenue ──────────────────────────────────────────────────
    const totalRevRes = await client.execute(`
      SELECT COALESCE(SUM(amount_inr), 0) as total FROM billing_transactions
      WHERE status = 'succeeded' AND type = 'payment'`)
    const totalRevenuePaise = Number(totalRevRes.rows[0][0] ?? 0)

    // ── Trial conversion rate ──────────────────────────────────────────────────
    const totalTrialsRes = await client.execute(
      `SELECT COUNT(*) as c FROM subscriptions WHERE status IN ('trialing','active','canceled')`)
    const totalTrials = Number(totalTrialsRes.rows[0][0] ?? 0)
    const convertedRes = await client.execute(
      `SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND plan != 'free' AND trial_ends_at IS NOT NULL`)
    const convertedFromTrial = Number(convertedRes.rows[0][0] ?? 0)
    const trialConversionRate = totalTrials > 0 ? (convertedFromTrial / totalTrials) * 100 : 0

    // ── Top AI spenders ────────────────────────────────────────────────────────
    const topAiRes = await client.execute(`
      SELECT u.full_name as name, u.email, SUM(uc.ai_tokens_used) as tokens
      FROM usage_counters uc JOIN users u ON uc.user_id = u.id
      GROUP BY uc.user_id ORDER BY tokens DESC LIMIT 10`)
    const topAiSpend = topAiRes.rows.map(r => rowToObj(topAiRes.columns, r))

    res.json({
      success: true,
      data: {
        total_users: totalUsers,
        new_users_this_month: newThisMonth,
        new_users_last_month: newLastMonth,
        user_growth_pct: newLastMonth > 0
          ? ((newThisMonth - newLastMonth) / newLastMonth) * 100 : 0,

        active_subscriptions:  activeRows.reduce((s, r)  => s + Number(r.cnt), 0),
        trialing_subscriptions: trialingRows.reduce((s, r) => s + Number(r.cnt), 0),
        canceled_this_month:   canceledThisMonth,
        total_paying:          totalPaying,
        plan_distribution:     planDist,

        mrr, arr, arpu,
        run_rate:    arr,
        new_mrr:     newMrr,
        churned_mrr: churnedMrr,
        net_new_mrr: netNewMrr,

        churn_rate_pct:            parseFloat(churnRate.toFixed(2)),
        grr_pct:                   parseFloat(grr.toFixed(2)),
        trial_conversion_rate_pct: parseFloat(trialConversionRate.toFixed(2)),

        total_revenue_inr: paise2inr(totalRevenuePaise),
        revenue_by_month:  revenueByMonth,
        signups_by_month:  signupsByMonth,

        trials_expiring_soon: trialsExpiringSoon,
        upcoming_renewals:    upcomingRenewals,
        recent_churn:         recentChurn,
        top_ai_spend:         topAiSpend,

        // Derived / display helpers
        canceled_rows_count: canceledRows.length,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET /api/admin/analytics/subscriptions ───────────────────────────────────

router.get('/analytics/subscriptions', requireAuth, requireRole(ADMIN_ROLES), async (_req: Request, res: Response) => {
  try {
    const result = await client.execute(`
      SELECT s.id, s.plan, s.status, s.billing_cycle,
             s.trial_ends_at, s.current_period_start, s.current_period_end,
             s.canceled_at, s.created_at,
             s.stripe_subscription_id, s.razorpay_subscription_id,
             u.id as user_id, u.full_name as name, u.email, u.role
      FROM subscriptions s JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC LIMIT 200`)
    res.json({ success: true, data: result.rows.map(r => rowToObj(result.columns, r)) })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── PATCH /api/admin/analytics/subscriptions/:userId ────────────────────────

router.patch('/analytics/subscriptions/:userId', requireAuth, requireRole(ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const { plan, status, billing_cycle, current_period_end } = req.body

    const existing = await client.execute({
      sql: 'SELECT id FROM subscriptions WHERE user_id = ?',
      args: [userId],
    })

    if (existing.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO subscriptions (id, user_id, plan, status, billing_cycle, current_period_start, current_period_end, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(), userId,
          plan ?? 'free', status ?? 'active', billing_cycle ?? 'monthly',
          new Date().toISOString(), current_period_end ?? null, new Date().toISOString(),
        ],
      })
    } else {
      const sets: string[] = []
      const vals: InValue[] = []
      if (plan !== undefined)               { sets.push('plan = ?');               vals.push(plan) }
      if (status !== undefined)             { sets.push('status = ?');             vals.push(status) }
      if (billing_cycle !== undefined)      { sets.push('billing_cycle = ?');      vals.push(billing_cycle) }
      if (current_period_end !== undefined) { sets.push('current_period_end = ?'); vals.push(current_period_end) }
      if (status === 'canceled')            { sets.push('canceled_at = ?');        vals.push(new Date().toISOString()) }
      if (sets.length) {
        vals.push(userId)
        await client.execute({ sql: `UPDATE subscriptions SET ${sets.join(', ')} WHERE user_id = ?`, args: vals })
      }
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(), user_id: req.user!.id,
      action: 'admin_subscription_override', entity_type: 'subscription', entity_id: userId,
      details: JSON.stringify({ plan, status, billing_cycle, current_period_end }),
      created_at: new Date().toISOString(),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET /api/admin/analytics/transactions ────────────────────────────────────

router.get('/analytics/transactions', requireAuth, requireRole(ADMIN_ROLES), async (_req: Request, res: Response) => {
  try {
    const result = await client.execute(`
      SELECT bt.*, u.full_name as name, u.email FROM billing_transactions bt
      LEFT JOIN users u ON bt.user_id = u.id
      ORDER BY bt.created_at DESC LIMIT 200`)
    res.json({ success: true, data: result.rows.map(r => rowToObj(result.columns, r)) })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/admin/analytics/transactions ───────────────────────────────────

router.post('/analytics/transactions', requireAuth, requireRole(ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const { user_id, amount_inr, amount_usd, currency, type, status, gateway, plan, billing_cycle, notes, period_start, period_end } = req.body
    const id = crypto.randomUUID()
    await client.execute({
      sql: `INSERT INTO billing_transactions
              (id, user_id, amount_inr, amount_usd, currency, type, status, gateway, plan, billing_cycle, notes, period_start, period_end, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, user_id ?? null, amount_inr ?? 0, amount_usd ?? 0,
        currency ?? 'INR', type ?? 'payment', status ?? 'succeeded',
        gateway ?? 'manual', plan ?? 'pro', billing_cycle ?? 'monthly',
        notes ?? null, period_start ?? null, period_end ?? null,
        new Date().toISOString(),
      ],
    })
    await db.insert(auditLog).values({
      id: crypto.randomUUID(), user_id: req.user!.id,
      action: 'billing_transaction_created', entity_type: 'billing_transaction', entity_id: id,
      details: JSON.stringify({ user_id, amount_inr, plan, type }),
      created_at: new Date().toISOString(),
    })
    res.json({ success: true, id })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})
