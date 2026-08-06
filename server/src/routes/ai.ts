import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth, requireRole } from '../middleware/auth'
import { db, quotations, auditLog } from '../db/index'
import { eq, isNull, and } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { analyseDrawing, costOnePart, estimateAssemblyOps, queryOnQuote, regenerateQuote } from '../services/ai'
import { CONFIDENCE_GATE } from '../config'

const router = Router()

// 10 interactive AI calls per user per hour
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: 'AI call limit (10/hr) exceeded',
    error_code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// All AI routes: requireAuth + engineer/admin + aiLimiter
router.use(requireAuth, requireRole(['engineer', 'admin']), aiLimiter)

// ─── Schemas ─────────────────────────────────────────────────────────────────

const analyseDrawingSchema = z.object({
  file_path: z.string().min(1),
  file_type: z.enum(['pdf', 'image', 'step', 'iges', 'dxf']),
  file_name: z.string().min(1),
})

const estimateCostSchema = z.object({
  quotation_id: z.string().min(1),
  part: z.object({
    id: z.string(),
    part_name: z.string(),
    part_number: z.string().nullable().optional(),
    drawing_number: z.string().nullable().optional(),
    commodity_type: z.string().nullable().optional(),
    material_grade: z.string().nullable().optional(),
    dimensions_json: z.record(z.any()).nullable().optional(),
    net_weight_g: z.number().nullable().optional(),
    surface_finish: z.string().nullable().optional(),
    tolerance_class: z.string().nullable().optional(),
  }),
  production: z.object({
    supplier_country: z.string(),
    supplier_currency: z.string(),
    annual_volume: z.number(),
    lot_size: z.number(),
    lots_per_year: z.number(),
    shifts_per_day: z.number(),
    annual_production_hours: z.number(),
    procurement_type: z.enum(['purchased', 'in_house', 'sub_contracted']),
    current_cart_price: z.number().nullable().optional(),
    target_cart_price: z.number().nullable().optional(),
  }),
  drawing_analysis: z.record(z.any()).nullable().optional(),
  modified_process_steps: z.array(z.object({
    step_number: z.number(),
    process_name: z.string(),
    machine_model: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).nullable().optional(),
  exchange_rate: z.number(),
  exchange_rate_source: z.string(),
  force_regenerate: z.boolean().optional().default(false),
})

const estimateAssemblySchema = z.object({
  assembly_quotation_id: z.string().min(1),
  components: z.array(z.object({
    name: z.string(),
    commodity_type: z.string().nullable().optional(),
    qty: z.number(),
  })),
  joining_notes: z.string().nullable().optional(),
})

const querySchema = z.object({
  quotation_id: z.string().min(1),
  question: z.string().min(1).max(500),
})

const regenerateSchema = z.object({
  quotation_id: z.string().min(1),
  instructions: z.string().min(1).max(1000),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /ai/analyse-drawing
router.post('/analyse-drawing', validate(analyseDrawingSchema), async (req: Request, res: Response) => {
  try {
    const result = await analyseDrawing(req.body.file_path, req.body.file_type, req.body.file_name)
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('Analyse drawing error:', err)
    return res.status(500).json({
      success: false,
      error: String(err),
      error_code: 'AI_ANALYSE_FAILED',
    })
  }
})

// POST /ai/estimate-cost
router.post('/estimate-cost', validate(estimateCostSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const userId = (req as any).user!.id

    // Verify quotation exists and is not soft-deleted
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, body.quotation_id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found',
        error_code: 'QUOTE_NOT_FOUND',
      })
    }

    const result = await costOnePart({
      quotation_id: body.quotation_id,
      part: body.part,
      production: body.production,
      drawing_analysis: body.drawing_analysis ?? null,
      modified_process_steps: body.modified_process_steps ?? null,
      exchange_rate: body.exchange_rate,
      exchange_rate_source: body.exchange_rate_source,
      force_regenerate: body.force_regenerate ?? false,
    })

    // Confidence gate: below threshold → return questions only, no cost data
    if (result.confidence_score < CONFIDENCE_GATE) {
      return res.json({
        success: true,
        data: {
          confidence_score: result.confidence_score,
          clarification_questions: result.clarification_questions ?? [],
        },
        warning: 'CONFIDENCE_TOO_LOW',
      })
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: body.quotation_id,
      details: JSON.stringify({ action: 'estimate_cost', confidence_score: result.confidence_score }),
      created_at: new Date().toISOString(),
    })

    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('Estimate cost error:', err)
    return res.status(500).json({
      success: false,
      error: String(err),
      error_code: 'AI_ESTIMATE_FAILED',
    })
  }
})

// POST /ai/estimate-assembly
router.post('/estimate-assembly', validate(estimateAssemblySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const userId = (req as any).user!.id

    // Verify assembly quotation exists
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, body.assembly_quotation_id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'Assembly quotation not found',
        error_code: 'QUOTE_NOT_FOUND',
      })
    }

    const result = await estimateAssemblyOps({
      assembly_quotation_id: body.assembly_quotation_id,
      components: body.components,
      joining_notes: body.joining_notes ?? null,
    })

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: body.assembly_quotation_id,
      details: JSON.stringify({ action: 'estimate_assembly_ops' }),
      created_at: new Date().toISOString(),
    })

    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('Estimate assembly error:', err)
    return res.status(500).json({
      success: false,
      error: String(err),
      error_code: 'AI_ESTIMATE_FAILED',
    })
  }
})

// POST /ai/query
router.post('/query', validate(querySchema), async (req: Request, res: Response) => {
  try {
    const { quotation_id, question } = req.body

    // Quote must not be soft-deleted
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, quotation_id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found or has been deleted',
        error_code: 'QUOTE_NOT_FOUND',
      })
    }

    const result = await queryOnQuote(quotation_id, question)
    return res.json({ success: true, data: { answer: result.answer } })
  } catch (err) {
    console.error('AI query error:', err)
    return res.status(500).json({
      success: false,
      error: String(err),
      error_code: 'AI_QUERY_FAILED',
    })
  }
})

// POST /ai/regenerate
router.post('/regenerate', validate(regenerateSchema), async (req: Request, res: Response) => {
  try {
    const { quotation_id, instructions } = req.body
    const userId = (req as any).user!.id

    // Quote must not be soft-deleted
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, quotation_id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found',
        error_code: 'QUOTE_NOT_FOUND',
      })
    }

    const result = await regenerateQuote(quotation_id, instructions)

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: quotation_id,
      details: JSON.stringify({ action: 'regenerate', instructions }),
      created_at: new Date().toISOString(),
    })

    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('Regenerate quote error:', err)
    return res.status(500).json({
      success: false,
      error: String(err),
      error_code: 'AI_REGENERATE_FAILED',
    })
  }
})

export { router }
