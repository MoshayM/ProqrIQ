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

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()

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
