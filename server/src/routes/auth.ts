import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { requireAuth } from '../middleware/auth'
import { avatarUpload, saveUploadedFile } from '../middleware/upload'
import { db, users, auditLog, passkeyCredentials, passkeyChallenges, subscriptions } from '../db/index'
import { eq, lt, and } from 'drizzle-orm'
import { JWT_SECRET, RP_ID, RP_ORIGINS, RP_NAME } from '../config'

const router = Router()

// ─── helpers ─────────────────────────────────────────────────────────────────

const toBase64Url = (buf: Uint8Array) => Buffer.from(buf).toString('base64url')
const fromBase64Url = (s: string): Buffer => Buffer.from(s, 'base64url')

function issueToken(user: { id: string; email: string; role: string; full_name: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' },
  )
}

async function purgeExpiredChallenges() {
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expires_at, new Date().toISOString()))
}

// ─── password auth ────────────────────────────────────────────────────────────

// POST /auth/register — public self-service registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, plan = 'free', billing = 'monthly' } = req.body
    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, error: 'email, password, and full_name are required', error_code: 'MISSING_FIELDS' })
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters', error_code: 'WEAK_PASSWORD' })
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists', error_code: 'EMAIL_CONFLICT' })
    }

    const password_hash = await bcrypt.hash(password, 12)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.insert(users).values({
      id,
      email,
      full_name,
      password_hash,
      role: 'engineer',
      is_active: true,
      created_at: now,
      updated_at: now,
    })

    const needsPayment = plan === 'pro' || plan === 'organization'
    if (needsPayment) {
      await db.insert(subscriptions).values({
        user_id: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan: plan as any,
        status: 'pending_payment',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        billing_cycle: (billing === 'annual' ? 'annual' : 'monthly') as any,
        created_at: now,
      })
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: id,
      action: 'user_self_registered',
      entity_type: 'user',
      entity_id: id,
      details: JSON.stringify({ email, plan: needsPayment ? plan : 'free' }),
      created_at: now,
    })

    const token = issueToken({ id, email, role: 'engineer', full_name })
    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { id, email, role: 'engineer', full_name },
        needs_payment: needsPayment,
        pending_plan:    needsPayment ? plan    : undefined,
        pending_billing: needsPayment ? billing : undefined,
      },
    })
  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(422).json({ success: false, error: 'Email and password are required', error_code: 'VALIDATION_FAILED' })
    }
    const [user] = await db.select().from(users).where(eq(users.email, email))
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password', error_code: 'AUTH_INVALID' })
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account is deactivated', error_code: 'AUTH_DEACTIVATED' })
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password', error_code: 'AUTH_INVALID' })
    await db.update(users).set({ last_login: new Date().toISOString() }).where(eq(users.id, user.id))
    const token = issueToken(user)
    const { password_hash: _ph, ...profile } = user
    return res.json({ success: true, data: { token, user: profile } })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, (req as any).user.id))
    if (!user) return res.status(401).json({ success: false, error: 'User not found', error_code: 'AUTH_INVALID' })
    const { password_hash: _ph, ...profile } = user
    return res.json({ success: true, data: { user: profile } })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/logout
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  return res.json({ success: true })
})

// ─── profile management (requireAuth) ────────────────────────────────────────

// PATCH /auth/profile — update display name
router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId } = (req as any).user
    const { full_name } = req.body
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(422).json({ success: false, error: 'full_name is required', error_code: 'VALIDATION_FAILED' })
    }
    await db.update(users).set({ full_name: full_name.trim(), updated_at: new Date().toISOString() }).where(eq(users.id, userId))
    const [updated] = await db.select().from(users).where(eq(users.id, userId))
    const { password_hash: _ph, ...profile } = updated
    await db.insert(auditLog).values({ user_id: userId, action: 'profile_updated', entity_type: 'user', entity_id: userId })
    return res.json({ success: true, data: { user: profile } })
  } catch (err) {
    console.error('Profile update error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// PATCH /auth/password — change own password
router.patch('/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId } = (req as any).user
    const { old_password, new_password } = req.body
    if (!old_password || !new_password) {
      return res.status(422).json({ success: false, error: 'old_password and new_password are required', error_code: 'VALIDATION_FAILED' })
    }
    if (new_password.length < 8) {
      return res.status(422).json({ success: false, error: 'New password must be at least 8 characters', error_code: 'VALIDATION_FAILED' })
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    const valid = await bcrypt.compare(old_password, user.password_hash)
    if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect', error_code: 'AUTH_INVALID' })
    const hash = await bcrypt.hash(new_password, 12)
    await db.update(users).set({ password_hash: hash, updated_at: new Date().toISOString() }).where(eq(users.id, userId))
    await db.insert(auditLog).values({ user_id: userId, action: 'password_changed', entity_type: 'user', entity_id: userId })
    return res.json({ success: true })
  } catch (err) {
    console.error('Password change error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/avatar — upload profile picture
router.post('/avatar', requireAuth, avatarUpload, async (req: Request, res: Response) => {
  try {
    const { id: userId } = (req as any).user
    const file = req.file
    if (!file) return res.status(400).json({ success: false, error: 'No file provided', error_code: 'VALIDATION_FAILED' })
    const avatarUrl = await saveUploadedFile(file, 'avatars')
    await db.update(users).set({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).where(eq(users.id, userId))
    const [updated] = await db.select().from(users).where(eq(users.id, userId))
    const { password_hash: _ph, ...profile } = updated
    await db.insert(auditLog).values({ user_id: userId, action: 'avatar_updated', entity_type: 'user', entity_id: userId })
    return res.json({ success: true, data: { user: profile } })
  } catch (err) {
    console.error('Avatar upload error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// ─── passkey — registration (requireAuth) ─────────────────────────────────────

// GET /auth/passkey/credentials
router.get('/passkey/credentials', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id
    const creds = await db.select({ id: passkeyCredentials.id, device_type: passkeyCredentials.device_type, created_at: passkeyCredentials.created_at, last_used_at: passkeyCredentials.last_used_at })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.user_id, userId))
    return res.json({ success: true, data: { credentials: creds, count: creds.length } })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/passkey/register/options
router.post('/passkey/register/options', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId, email, full_name } = (req as any).user
    await purgeExpiredChallenges()
    const existing = await db.select({ id: passkeyCredentials.id, transports: passkeyCredentials.transports })
      .from(passkeyCredentials).where(eq(passkeyCredentials.user_id, userId))
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: userId,
      userName: email,
      userDisplayName: full_name,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({
        id: fromBase64Url(c.id),
        type: 'public-key' as const,
        transports: c.transports ? JSON.parse(c.transports) : [],
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    })
    await db.delete(passkeyChallenges).where(eq(passkeyChallenges.user_id, userId))
    const challengeId = crypto.randomUUID()
    await db.insert(passkeyChallenges).values({
      id: challengeId,
      challenge: options.challenge,
      user_id: userId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    return res.json({ success: true, data: { options, challengeId } })
  } catch (err) {
    console.error('Passkey register options error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/passkey/register/verify
router.post('/passkey/register/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: userId } = (req as any).user
    const { response, challengeId } = req.body
    const [challengeRow] = await db.select().from(passkeyChallenges)
      .where(and(eq(passkeyChallenges.id, challengeId), eq(passkeyChallenges.user_id, userId)))
    if (!challengeRow || new Date(challengeRow.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Challenge expired or not found', error_code: 'PASSKEY_CHALLENGE_INVALID' })
    }
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: RP_ORIGINS,
      expectedRPID: RP_ID,
    })
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ success: false, error: 'Passkey verification failed', error_code: 'PASSKEY_VERIFY_FAILED' })
    }
    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    await db.insert(passkeyCredentials).values({
      id: toBase64Url(credentialID),
      user_id: userId,
      public_key: toBase64Url(credentialPublicKey),
      counter,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: JSON.stringify(response.response?.transports ?? []),
    })
    await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, challengeId))
    await db.insert(auditLog).values({ user_id: userId, action: 'passkey_registered', entity_type: 'user', entity_id: userId })
    return res.json({ success: true })
  } catch (err) {
    console.error('Passkey register verify error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// ─── passkey — authentication (public) ────────────────────────────────────────

// POST /auth/passkey/auth/options
router.post('/passkey/auth/options', async (req: Request, res: Response) => {
  try {
    await purgeExpiredChallenges()
    const { email } = req.body
    let allowCredentials: { id: Buffer; type: 'public-key' }[] = []
    let userId: string | null = null
    if (email) {
      const [user] = await db.select().from(users).where(eq(users.email, email))
      if (user) {
        userId = user.id
        const creds = await db.select({ id: passkeyCredentials.id }).from(passkeyCredentials).where(eq(passkeyCredentials.user_id, user.id))
        allowCredentials = creds.map(c => ({ id: fromBase64Url(c.id), type: 'public-key' as const }))
      }
    }
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
    })
    const challengeId = crypto.randomUUID()
    await db.insert(passkeyChallenges).values({
      id: challengeId,
      challenge: options.challenge,
      user_id: userId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    return res.json({ success: true, data: { options, challengeId } })
  } catch (err) {
    console.error('Passkey auth options error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// POST /auth/passkey/auth/verify
router.post('/passkey/auth/verify', async (req: Request, res: Response) => {
  try {
    const { response, challengeId } = req.body
    if (!response?.id || !challengeId) {
      return res.status(400).json({ success: false, error: 'Missing response or challengeId', error_code: 'VALIDATION_FAILED' })
    }
    const [challengeRow] = await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.id, challengeId))
    if (!challengeRow || new Date(challengeRow.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Challenge expired', error_code: 'PASSKEY_CHALLENGE_INVALID' })
    }
    const [cred] = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.id, response.id))
    if (!cred) return res.status(401).json({ success: false, error: 'Passkey not registered', error_code: 'AUTH_INVALID' })
    const [user] = await db.select().from(users).where(eq(users.id, cred.user_id))
    if (!user || !user.is_active) return res.status(401).json({ success: false, error: 'User not found or inactive', error_code: 'AUTH_INVALID' })
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: RP_ORIGINS,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: fromBase64Url(cred.id),
        credentialPublicKey: fromBase64Url(cred.public_key),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
    })
    if (!verification.verified) {
      return res.status(401).json({ success: false, error: 'Passkey authentication failed', error_code: 'AUTH_INVALID' })
    }
    await db.update(passkeyCredentials)
      .set({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .where(eq(passkeyCredentials.id, cred.id))
    await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, challengeId))
    await db.update(users).set({ last_login: new Date().toISOString() }).where(eq(users.id, user.id))
    const token = issueToken(user)
    const { password_hash: _ph, ...profile } = user
    return res.json({ success: true, data: { token, user: profile } })
  } catch (err) {
    console.error('Passkey auth verify error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

export { router }
