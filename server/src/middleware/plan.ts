import { Request, Response, NextFunction } from 'express'
import { db } from '../db'
import { subscriptions, usageCounters } from '../db/schema'
import { eq, and } from 'drizzle-orm'

// Plan hierarchy: free (0) < pro (1) < organization (2)
const PLAN_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  organization: 2,
}

async function getUserPlan(userId: string): Promise<string> {
  const rows = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .limit(1)

  const row = rows[0]
  if (!row || !['active', 'trialing'].includes(row.status ?? '')) return 'free'
  return row.plan ?? 'free'
}

function getPeriodStart(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function requirePlan(minPlan: 'pro' | 'organization') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated', error_code: 'AUTH_MISSING' })
      return
    }
    if (['admin', 'developer', 'ceo', 'owner'].includes((req as any).user?.role)) return next()
    try {
      const plan = await getUserPlan(req.user.id)
      if ((PLAN_RANK[plan] ?? 0) < (PLAN_RANK[minPlan] ?? 0)) {
        res.status(402).json({
          success: false,
          error_code: 'PLAN_REQUIRED',
          required_plan: minPlan,
          upgrade_url: '/billing',
        })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function requireQuotaCheck(
  quotaType: 'quotes' | 'bulk' | 'supplier_searches',
  limit: number | null,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated', error_code: 'AUTH_MISSING' })
      return
    }
    if (['admin', 'developer', 'ceo', 'owner'].includes((req as any).user?.role)) { next(); return }
    if (limit === null) { next(); return }

    try {
      const userId = req.user.id
      const periodStart = getPeriodStart()

      // Upsert usage_counters row
      const existing = await db
        .select()
        .from(usageCounters)
        .where(and(eq(usageCounters.user_id, userId), eq(usageCounters.period_start, periodStart)))
        .limit(1)

      if (existing.length === 0) {
        await db.insert(usageCounters).values({
          user_id: userId,
          period_start: periodStart,
          quotes_used: 0,
          bulk_used: 0,
          supplier_searches_used: 0,
          ai_tokens_used: 0,
        })
      }

      // Re-fetch current count
      const current = await db
        .select()
        .from(usageCounters)
        .where(and(eq(usageCounters.user_id, userId), eq(usageCounters.period_start, periodStart)))
        .limit(1)

      const row = current[0]
      const fieldMap: Record<string, number> = {
        quotes: row?.quotes_used ?? 0,
        bulk: row?.bulk_used ?? 0,
        supplier_searches: row?.supplier_searches_used ?? 0,
      }
      const used = fieldMap[quotaType] ?? 0

      if (used >= limit) {
        res.status(402).json({
          success: false,
          error_code: 'QUOTA_EXCEEDED',
          used,
          limit,
          upgrade_url: '/billing',
        })
        return
      }

      // Increment in DB
      const updateMap: Record<string, Partial<typeof usageCounters.$inferInsert>> = {
        quotes: { quotes_used: used + 1 },
        bulk: { bulk_used: used + 1 },
        supplier_searches: { supplier_searches_used: used + 1 },
      }

      await db
        .update(usageCounters)
        .set(updateMap[quotaType])
        .where(and(eq(usageCounters.user_id, userId), eq(usageCounters.period_start, periodStart)))

      next()
    } catch (err) {
      next(err)
    }
  }
}
