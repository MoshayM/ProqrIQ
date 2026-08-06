import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../middleware/auth'
import { db, users, auditLog } from '../db/index'
import { eq } from 'drizzle-orm'
import { JWT_SECRET } from '../config'

const router = Router()

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(422).json({
        success: false,
        error: 'Email and password are required',
        error_code: 'VALIDATION_FAILED',
      })
    }

    const [user] = await db.select().from(users).where(eq(users.email, email))

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        error_code: 'AUTH_INVALID',
      })
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated',
        error_code: 'AUTH_DEACTIVATED',
      })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        error_code: 'AUTH_INVALID',
      })
    }

    // Update last_login
    await db.update(users)
      .set({ last_login: new Date().toISOString() })
      .where(eq(users.id, user.id))

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    const { password_hash: _ph, ...profile } = user

    return res.json({
      success: true,
      data: { token, user: profile },
    })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, (req as any).user.id))

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        error_code: 'AUTH_INVALID',
      })
    }

    const { password_hash: _ph, ...profile } = user

    return res.json({
      success: true,
      data: { user: profile },
    })
  } catch (err) {
    console.error('Me error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /auth/logout
router.post('/logout', requireAuth, (req: Request, res: Response) => {
  // Stateless JWT — client drops token
  return res.json({ success: true })
})

export { router }
