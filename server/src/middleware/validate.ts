import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(422).json({ success: false, error: 'Validation failed', error_code: 'VALIDATION_FAILED', details: result.error.flatten() })
    }
    req.body = result.data
    next()
  }
}
