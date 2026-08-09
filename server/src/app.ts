import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import path from 'path'

import { NODE_ENV } from './config'

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
import { router as searchRouter }        from './routes/search'
import { router as suppliersRouter }    from './routes/suppliers'
import { router as subscriptionRouter } from './routes/subscription'

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
    : true,
  credentials: true,
}))
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'))

// ─── Stripe webhook (raw body needed — must come BEFORE json parser) ─────────
// Canonical webhook URL to configure in Stripe dashboard: POST /api/webhooks/stripe
// Events handled: checkout.session.completed, customer.subscription.updated,
//                 customer.subscription.deleted, invoice.payment_failed
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    res.status(200).json({ received: true })
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Stripe = (await import('stripe' as any)).default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new (Stripe as any)(STRIPE_SECRET_KEY)
    const sig = req.headers['stripe-signature'] as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = (stripe as any).webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET)

    const { db } = await import('./db')
    const { subscriptions } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = event.data.object as any

    if (event.type === 'checkout.session.completed') {
      const meta = data.metadata ?? {}
      const userId = meta.user_id as string
      if (userId) {
        const existing = await db.select().from(subscriptions).where(eq(subscriptions.user_id, userId)).limit(1)
        if (existing.length > 0) {
          await db.update(subscriptions).set({
            plan: meta.plan ?? 'pro',
            status: 'active',
            stripe_customer_id: data.customer,
            stripe_subscription_id: data.subscription,
          }).where(eq(subscriptions.user_id, userId))
        } else {
          await db.insert(subscriptions).values({
            user_id: userId,
            plan: meta.plan ?? 'pro',
            status: 'active',
            billing_cycle: meta.billing ?? 'monthly',
            stripe_customer_id: data.customer,
            stripe_subscription_id: data.subscription,
          })
        }
      }
    } else if (event.type === 'customer.subscription.updated') {
      const subId = data.id as string
      const status = data.status as string
      await db.update(subscriptions).set({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: status as any,
        current_period_start: new Date(data.current_period_start * 1000).toISOString(),
        current_period_end: new Date(data.current_period_end * 1000).toISOString(),
      }).where(eq(subscriptions.stripe_subscription_id, subId))
    } else if (event.type === 'customer.subscription.deleted') {
      const subId = data.id as string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(subscriptions).set({ status: 'canceled', plan: 'free' as any }).where(eq(subscriptions.stripe_subscription_id, subId))
    } else if (event.type === 'invoice.payment_failed') {
      const customerId = data.customer as string
      await db.update(subscriptions).set({ status: 'past_due' }).where(eq(subscriptions.stripe_customer_id, customerId))
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Stripe Webhook]', err)
    res.status(400).json({ error: (err as Error).message })
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
app.use('/api/search',       searchRouter)
app.use('/api/suppliers',    suppliersRouter)
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
