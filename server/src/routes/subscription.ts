import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { requireAuth } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { db } from '../db'
import {
  subscriptions,
  usageCounters,
  organizations,
  organizationMembers,
  auditLog,
} from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import {
  getRazorpayClient,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from '../services/razorpay'

export const router = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodStart(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

const PLAN_LIMITS: Record<string, { quotes_per_month: number | null; bulk_batch_items: number; supplier_searches_per_month: number | null }> = {
  free:         { quotes_per_month: 10,   bulk_batch_items: 10, supplier_searches_per_month: 0 },
  pro:          { quotes_per_month: 200,  bulk_batch_items: 50, supplier_searches_per_month: null },
  organization: { quotes_per_month: null, bulk_batch_items: 50, supplier_searches_per_month: null },
}

async function getOrCreateUsage(userId: string) {
  const periodStart = getPeriodStart()
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
    return { quotes_used: 0, bulk_used: 0, supplier_searches_used: 0, ai_tokens_used: 0 }
  }
  return {
    quotes_used: existing[0].quotes_used ?? 0,
    bulk_used: existing[0].bulk_used ?? 0,
    supplier_searches_used: existing[0].supplier_searches_used ?? 0,
    ai_tokens_used: existing[0].ai_tokens_used ?? 0,
  }
}

// ─── GET /api/subscription ────────────────────────────────────────────────────

router.get('/subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    const subRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.user_id, userId))
      .limit(1)

    const sub = subRows[0]
    const plan = sub?.plan ?? 'free'
    const status = sub?.status ?? 'active'

    const usage = await getOrCreateUsage(userId)
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free

    res.json({
      success: true,
      data: {
        plan,
        status,
        billing_cycle: sub?.billing_cycle ?? null,
        trial_ends_at: sub?.trial_ends_at ?? null,
        current_period_end: sub?.current_period_end ?? null,
        usage,
        limits,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/subscription/checkout (Stripe) ────────────────────────────────

router.post('/subscription/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
    if (!STRIPE_SECRET_KEY) {
      res.status(404).json({ success: false, error: 'Stripe not configured' })
      return
    }

    const { plan, billing } = req.body as { plan: 'pro' | 'organization'; billing: 'monthly' | 'annual' }
    const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'
    const stripe     = new Stripe(STRIPE_SECRET_KEY)
    const priceId    = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`] ?? ''

    const session = await stripe.checkout.sessions.create({
      mode:         'subscription',
      line_items:   priceId ? [{ price: priceId, quantity: 1 }] : [],
      success_url:  `${CLIENT_URL}/billing?success=1`,
      cancel_url:   `${CLIENT_URL}/billing?canceled=1`,
      metadata:     { user_id: req.user!.id, plan, billing },
    })

    res.json({ success: true, data: { url: session.url } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/subscription/portal (Stripe) ──────────────────────────────────

router.post('/subscription/portal', requireAuth, async (req: Request, res: Response) => {
  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
    if (!STRIPE_SECRET_KEY) {
      res.status(404).json({ success: false, error: 'Stripe not configured' })
      return
    }

    const userId  = req.user!.id
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.user_id, userId)).limit(1)
    const sub     = subRows[0]

    if (!sub?.stripe_customer_id) {
      res.status(400).json({ success: false, error: 'No Stripe customer found' })
      return
    }

    const stripe     = new Stripe(STRIPE_SECRET_KEY)
    const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'
    const session    = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${CLIENT_URL}/billing`,
    })

    res.json({ success: true, data: { url: session.url } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/subscription/razorpay/checkout ────────────────────────────────

router.post('/subscription/razorpay/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isRazorpayConfigured()) {
      res.status(404).json({ success: false, error: 'Razorpay not configured' })
      return
    }

    const { plan, billing } = req.body as { plan: 'pro' | 'organization'; billing: 'monthly' | 'annual' }
    const planId = process.env[`RAZORPAY_PLAN_${plan.toUpperCase()}_${billing.toUpperCase()}`]
    if (!planId) {
      res.status(400).json({ success: false, error: 'Razorpay plan not configured — run npm run razorpay:setup' })
      return
    }

    const rzp          = getRazorpayClient()
    const total_count  = billing === 'annual' ? 12 : 120
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = await (rzp.subscriptions as any).create({
      plan_id:        planId,
      customer_notify: 1,
      total_count,
      notes: { user_id: req.user!.id, plan, billing },
    })

    res.json({
      success: true,
      data: {
        subscription_id: subscription.id,
        key_id:          process.env.RAZORPAY_KEY_ID,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/subscription/razorpay/verify ──────────────────────────────────
// Called by the client after Razorpay popup succeeds

router.post('/subscription/razorpay/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      plan,
      billing,
    } = req.body as {
      razorpay_payment_id:      string
      razorpay_subscription_id: string
      razorpay_signature:       string
      plan:    string
      billing: string
    }

    if (!verifyPaymentSignature(razorpay_payment_id, razorpay_subscription_id, razorpay_signature)) {
      res.status(400).json({ success: false, error: 'Invalid payment signature' })
      return
    }

    const userId    = req.user!.id
    const now       = new Date().toISOString()
    const periodEnd = new Date(Date.now() + (billing === 'annual' ? 365 : 30) * 86_400_000).toISOString()

    const existing = await db.select().from(subscriptions).where(eq(subscriptions.user_id, userId)).limit(1)

    if (existing.length > 0) {
      await db.update(subscriptions).set({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan:                   plan as any,
        status:                 'active',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        billing_cycle:          billing as any,
        razorpay_subscription_id,
        current_period_start:   now,
        current_period_end:     periodEnd,
      }).where(eq(subscriptions.user_id, userId))
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.insert(subscriptions) as any).values({
        user_id:                userId,
        plan,
        status:                 'active',
        billing_cycle:          billing,
        razorpay_subscription_id,
        current_period_start:   now,
        current_period_end:     periodEnd,
      })
    }

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'subscription_activated',
      entity_type: 'subscription',
      entity_id:   userId,
      details:     JSON.stringify({ plan, billing, gateway: 'razorpay', razorpay_payment_id }),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/subscription/cancel ───────────────────────────────────────────

router.post('/subscription/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    await db
      .update(subscriptions)
      .set({ status: 'canceled', canceled_at: new Date().toISOString() })
      .where(eq(subscriptions.user_id, userId))

    await db.insert(auditLog).values({
      user_id: userId,
      action: 'subscription_canceled',
      entity_type: 'subscription',
      entity_id: userId,
      details: JSON.stringify({ canceled_at: new Date().toISOString() }),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── GET /api/organization ────────────────────────────────────────────────────

router.get('/organization', requireAuth, requirePlan('organization'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id

    // Find the org where this user is a member
    const memberRows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.user_id, userId))
      .limit(1)

    let orgId: string | null = null

    if (memberRows.length > 0) {
      orgId = memberRows[0].org_id ?? null
    } else {
      // Check if owner
      const ownedOrg = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.owner_id, userId), isNull(organizations.deleted_at)))
        .limit(1)
      orgId = ownedOrg[0]?.id ?? null
    }

    if (!orgId) {
      res.status(404).json({ success: false, error: 'Organization not found' })
      return
    }

    const orgRows = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
    const org = orgRows[0]

    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.org_id, orgId))

    res.json({ success: true, data: { org, members } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── POST /api/organization/invite ───────────────────────────────────────────

router.post('/organization/invite', requireAuth, requirePlan('organization'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { email, role } = req.body as { email: string; role: string }

    if (!email || !role) {
      res.status(400).json({ success: false, error: 'email and role are required' })
      return
    }

    // Get org for this owner
    const ownedOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.owner_id, userId))
      .limit(1)

    if (!ownedOrg[0]) {
      res.status(404).json({ success: false, error: 'Organization not found' })
      return
    }

    // Insert without specifying id — schema default generates it
    await db.insert(organizationMembers).values({
      org_id: ownedOrg[0].id,
      user_id: null,
      email,
      role,
      joined_at: null,
    })

    // Fetch the newly created member to get its id
    const newMemberRows = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.org_id, ownedOrg[0].id), eq(organizationMembers.email, email)))
      .limit(1)

    const memberId = newMemberRows[0]?.id ?? 'unknown'

    await db.insert(auditLog).values({
      user_id: userId,
      action: 'org_member_invited',
      entity_type: 'organization_member',
      entity_id: memberId,
      details: JSON.stringify({ email, role, org_id: ownedOrg[0].id }),
    })

    res.json({ success: true, data: { member_id: memberId } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// ─── DELETE /api/organization/members/:id ─────────────────────────────────────

router.delete('/organization/members/:id', requireAuth, requirePlan('organization'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const memberId = req.params.id

    const memberRows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.id, memberId))
      .limit(1)

    if (!memberRows[0]) {
      res.status(404).json({ success: false, error: 'Member not found' })
      return
    }

    await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId))

    await db.insert(auditLog).values({
      user_id: userId,
      action: 'org_member_removed',
      entity_type: 'organization_member',
      entity_id: memberId,
      details: JSON.stringify({ removed_email: memberRows[0].email }),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})
