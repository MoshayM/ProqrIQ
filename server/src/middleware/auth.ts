import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config'

// ─── Extend Express Request type ─────────────────────────────────────────────

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id:        string
      email:     string
      role:      string
      full_name: string
    }
  }
}

// ─── requireAuth ─────────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success:    false,
      error:      'Authentication token missing',
      error_code: 'AUTH_MISSING',
    })
    return
  }

  const token = authHeader.slice(7) // remove "Bearer "

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      id:        string
      email:     string
      role:      string
      full_name: string
    }

    req.user = {
      id:        payload.id,
      email:     payload.email,
      role:      payload.role,
      full_name: payload.full_name,
    }

    next()
  } catch {
    res.status(401).json({
      success:    false,
      error:      'Invalid or expired authentication token',
      error_code: 'AUTH_INVALID',
    })
  }
}

// ─── requireRole ─────────────────────────────────────────────────────────────

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success:    false,
        error:      'Authentication token missing',
        error_code: 'AUTH_MISSING',
      })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success:    false,
        error:      `Access denied. Required role(s): ${roles.join(', ')}`,
        error_code: 'ROLE_INSUFFICIENT',
      })
      return
    }

    next()
  }
}
