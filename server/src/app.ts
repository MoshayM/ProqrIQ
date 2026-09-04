import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import path from 'path'
import Stripe from 'stripe'

import { NODE_ENV } from './config'
import { verifyWebhookSignature } from './services/razorpay'

// ─── Route imports ────────────────────────────────────────────────────────────
import { router as authRouter }  from './routes/auth'
import { router as usersRouter } from './routes/users'
import { router as partsRouter } from './routes/parts'
import { router as quotationsRouter } from './routes/quotations'
import { router as aiRouter } from './routes/ai'
import { router as kbRouter }           from './routes/kb'
import { router as bulkBatchesRouter }  from './routes/bulkBatches'
import { router as assembliesRouter }   from './routes/assemblies'
import notificationsRouter              from './routes/notifications'
import { router as adminConfigRouter }  from './routes/adminConfig'
import { router as adminAnalyticsRouter } from './routes/adminAnalytics'
import { router as planConfigRouter }    from './routes/planConfig'
import { router as searchRouter }        from './routes/search'
import { router as suppliersRouter }    from './routes/suppliers'
import { router as subscriptionRouter } from './routes/subscription'
import { router as helpRouter }         from './routes/help'

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()

// Vercel (and most reverse proxies) sets X-Forwarded-For — trust one hop
// so express-rate-limit and req.ip see the real client IP.
app.set('trust proxy', 1)

// ─── Security & logging ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow static file serving
}))
app.use(cors({
  origin: NODE_ENV === 'production'
    ? [
        'https://proqriq-kappa.vercel.app',
        'https://proqriq.vercel.app',
        /\.vercel\.app$/,
      ]
    : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3099',
        /^http:\/\/localhost(:\d+)?$/,
      ],
  credentials: true,
}))
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'))

// ─── Stripe webhook — POST /api/webhooks/stripe ───────────────────────────────
// Register this URL in Stripe dashboard → Developers → Webhooks
// Events: checkout.session.completed | customer.subscription.updated | .deleted | invoice.payment_failed
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const KEY    = process.env.STRIPE_SECRET_KEY
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET
  if (!KEY || !SECRET) { res.status(400).json({ error: 'Webhook not configured' }); return }

  let event: Stripe.Event
  try {
    const stripe = new Stripe(KEY)
    event = stripe.webhooks.constructEvent(req.body as Buffer, req.headers['stripe-signature'] as string, SECRET)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message }); return
  }

  try {
    const { db }           = await import('./db')
    const { subscriptions } = await import('./db/schema')
    const { eq }           = await import('drizzle-orm')
    const data = event.data.object as unknown as Record<string, unknown>

    if (event.type === 'checkout.session.completed') {
      const meta   = (data.metadata ?? {}) as Record<string, string>
      const userId = meta.user_id
      if (userId) {
        const existing = await db.select().from(subscriptions).where(eq(subscriptions.user_id, userId)).limit(1)
        const now       = new Date().toISOString()
        const billing   = meta.billing ?? 'monthly'
        const periodEnd = new Date(Date.now() + (billing === 'annual' ? 365 : 30) * 86_400_000).toISOString()
        const patch = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          plan: (meta.plan ?? 'pro') as any,
          status: 'active' as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          billing_cycle: billing as any,
          stripe_customer_id:     data.customer as string,
          stripe_subscription_id: data.subscription as string,
          current_period_start:   now,
          current_period_end:     periodEnd,
        }
        if (existing.length > 0) {
          await db.update(subscriptions).set(patch).where(eq(subscriptions.user_id, userId))
        } else {
          await db.insert(subscriptions).values({ user_id: userId, ...patch })
        }
      }
    } else if (event.type === 'customer.subscription.updated') {
      const status = data.status as string
      await db.update(subscriptions).set({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: status as any,
        current_period_start: new Date((data.current_period_start as number) * 1000).toISOString(),
        current_period_end:   new Date((data.current_period_end   as number) * 1000).toISOString(),
      }).where(eq(subscriptions.stripe_subscription_id, data.id as string))
    } else if (event.type === 'customer.subscription.deleted') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(subscriptions).set({ status: 'canceled', plan: 'free' as any })
        .where(eq(subscriptions.stripe_subscription_id, data.id as string))
    } else if (event.type === 'invoice.payment_failed') {
      await db.update(subscriptions).set({ status: 'past_due' })
        .where(eq(subscriptions.stripe_customer_id, data.customer as string))
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Stripe Webhook]', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ─── Razorpay webhook — POST /api/webhooks/razorpay ──────────────────────────
// Register in Razorpay dashboard → Settings → Webhooks
// URL: https://proqriq.vercel.app/api/webhooks/razorpay
// Events to enable: payment.captured | payment.failed | order.paid
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig     = req.headers['x-razorpay-signature'] as string | undefined
  const rawBody = (req.body as Buffer).toString('utf-8')

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) { res.status(400).json({ error: 'Webhook not configured' }); return }
  if (!sig || !verifyWebhookSignature(rawBody, sig)) {
    res.status(400).json({ error: 'Invalid signature' }); return
  }

  try {
    const { db }            = await import('./db')
    const { subscriptions, auditLog } = await import('./db/schema')
    const { eq }            = await import('drizzle-orm')

    type RzpPayload = Record<string, Record<string, Record<string, unknown>>>
    const event   = JSON.parse(rawBody) as { event: string; payload: RzpPayload }
    const payment = (event.payload?.payment?.entity ?? {}) as Record<string, unknown>
    const order   = (event.payload?.order?.entity   ?? {}) as Record<string, unknown>

    // Orders flow: payment.captured fires after successful card payment
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const orderId = (payment.order_id ?? order.id) as string | undefined
      const notes   = (payment.notes ?? order.notes ?? {}) as Record<string, string>
      const plan    = notes.plan    as string | undefined
      const userId  = notes.user_id as string | undefined

      if (userId && plan) {
        const billing   = notes.billing ?? 'monthly'
        const months    = billing === 'annual' ? 365 : 30
        const periodEnd = new Date(Date.now() + months * 86_400_000).toISOString()

        await db.update(subscriptions).set({
          status:                  'active',
          plan:                    plan as 'free' | 'pro' | 'organization',
          billing_cycle:           billing as 'monthly' | 'annual',
          current_period_end:      periodEnd,
          razorpay_subscription_id: orderId ?? null,
        }).where(eq(subscriptions.user_id, userId))

        await db.insert(auditLog).values({
          id: crypto.randomUUID(), user_id: userId, action: 'subscription_activated',
          entity_type: 'subscription', entity_id: userId,
          details: JSON.stringify({ plan, billing, gateway: 'razorpay', event: event.event, order_id: orderId }),
          created_at: new Date().toISOString(),
        })
      }
    } else if (event.event === 'payment.failed') {
      const notes  = (payment.notes ?? {}) as Record<string, string>
      const userId = notes.user_id as string | undefined
      if (userId) {
        await db.update(subscriptions).set({ status: 'past_due' })
          .where(eq(subscriptions.user_id, userId))
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Razorpay Webhook]', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

// ─── Static files (drawings, KB docs) — only in local/non-cloud mode ─────────
if (!process.env.TURSO_DATABASE_URL) {
  const uploadsBase = path.resolve(__dirname, '../../data/uploads')
  app.use('/uploads', express.static(uploadsBase, {
    dotfiles: 'deny',
    maxAge:   '1d',
  }))
}

// ─── Rate limiter: only active in production ─────────────────────────────────
if (NODE_ENV === 'production') {
  const apiLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
      success:    false,
      error:      'Too many requests. Please try again later.',
      error_code: 'RATE_LIMITED',
    },
  })
  app.use('/api', apiLimiter)
}

// ─── Health check (no auth, no rate limit) ────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' })
})

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter)
app.use('/api/users',         usersRouter)
app.use('/api/parts',         partsRouter)
app.use('/api/quotations',    quotationsRouter)
app.use('/api/ai',            aiRouter)
app.use('/api/kb',            kbRouter)
app.use('/api/bulk-batches',  bulkBatchesRouter)
app.use('/api/assemblies',    assembliesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/admin',        adminConfigRouter)
app.use('/api/admin',        adminAnalyticsRouter)
app.use('/api/admin',        planConfigRouter)
app.use('/api/search',       searchRouter)
app.use('/api/suppliers',    suppliersRouter)
app.use('/api/help',         helpRouter)
app.use('/api',              planConfigRouter)
app.use('/api',              subscriptionRouter)

// ─── Vercel cron: reset monthly usage counters (runs 1st of every month) ──────
app.post('/api/cron/reset-usage', async (req: Request, res: Response) => {
  // Vercel cron requests include a bearer token — verify it
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const { db } = await import('./db')
    const { usageCounters: usage_counters } = await import('./db/schema')
    const period = new Date().toISOString().slice(0, 7) + '-01'
    const result = await db.update(usage_counters).set({
      quotes_used: 0,
      bulk_used: 0,
      supplier_searches_used: 0,
      ai_tokens_used: 0,
      period_start: period,
    })
    console.log('[Cron] Usage counters reset for period', period)
    res.json({ success: true, period, result })
  } catch (err) {
    console.error('[Cron] reset-usage failed', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// Standalone assumptions confirm route
app.patch('/api/assumptions/:id/confirm', (req, res, next) => {
  // Forward to quotations router by re-pathing
  req.url = `/assumptions/${req.params.id}/confirm`
  quotationsRouter(req, res, next)
})

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success:    false,
    error:      'Route not found',
    error_code: 'NOT_FOUND',
  })
})

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (NODE_ENV !== 'production') {
    console.error('[GlobalError]', err)
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred'

  res.status(500).json({
    success:    false,
    error:      message,
    error_code: 'INTERNAL_ERROR',
  })
})

export default app
