import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { db, users, auditLog } from '../db/index'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'

const router = Router()

const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(['admin', 'engineer', 'cost_analyst', 'ceo']),
})

const updateUserSchema = z.object({
  role: z.enum(['admin', 'engineer', 'cost_analyst', 'ceo']).optional(),
  is_active: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field required',
})

// All users routes require admin + organization plan
router.use(requireAuth, requireRole(['admin']), requirePlan('organization'))

// GET /users
router.get('/', async (req: Request, res: Response) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      is_active: users.is_active,
      created_at: users.created_at,
      last_login: users.last_login,
    }).from(users)

    return res.json({ success: true, data: allUsers })
  } catch (err) {
    console.error('List users error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /users
router.post('/', validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { email, full_name, password, role } = req.body

    // Check unique email
    const [existing] = await db.select().from(users).where(eq(users.email, email))
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email already exists',
        error_code: 'EMAIL_CONFLICT',
      })
    }

    const password_hash = await bcrypt.hash(password, 12)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.insert(users).values({
      id,
      email,
      full_name,
      password_hash,
      role,
      is_active: true,
      created_at: now,
    })

    // Audit log
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user.id,
      action: 'INSERT',
      entity_type: 'users',
      entity_id: id,
      details: JSON.stringify({ email, full_name, role }),
      created_at: now,
    })

    const [newUser] = await db.select({
      id: users.id,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      is_active: users.is_active,
      created_at: users.created_at,
      last_login: users.last_login,
    }).from(users).where(eq(users.id, id))

    return res.status(201).json({ success: true, data: newUser })
  } catch (err) {
    console.error('Create user error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /users/:id
router.patch('/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body

    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        error_code: 'USER_NOT_FOUND',
      })
    }

    await db.update(users).set(updates).where(eq(users.id, id))

    // Audit log
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user.id,
      action: 'UPDATE',
      entity_type: 'users',
      entity_id: id,
      details: JSON.stringify({ before: { role: user.role, is_active: user.is_active }, after: updates }),
      created_at: new Date().toISOString(),
    })

    const [updated] = await db.select({
      id: users.id,
      email: users.email,
      full_name: users.full_name,
      role: users.role,
      is_active: users.is_active,
      created_at: users.created_at,
      last_login: users.last_login,
    }).from(users).where(eq(users.id, id))

    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Update user error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

export { router }
