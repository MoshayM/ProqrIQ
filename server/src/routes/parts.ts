import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { db, parts, auditLog } from '../db/index'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'

const router = Router()

const createPartSchema = z.object({
  part_name: z.string().min(1),
  part_number: z.string().nullable().optional(),
  drawing_number: z.string().nullable().optional(),
  commodity_type: z.enum([
    'sheet_metal', 'plastic_injection', 'die_casting', 'forging',
    'cnc_machining', 'pcb_rigid', 'pcba', 'flex_pcb', 'optical_lens',
    'membrane_switch', 'packaging', 'wood_press', 'software_it', 'other',
  ]),
  material_grade: z.string().nullable().optional(),
  dimensions_json: z.record(z.any()).nullable().optional(),
  net_weight_g: z.number().nullable().optional(),
  surface_finish: z.string().nullable().optional(),
  tolerance_class: z.string().nullable().optional(),
  drawing_path: z.string().nullable().optional(),
  manufacturing_process: z.string().nullable().optional(),
})

const updatePartSchema = createPartSchema.partial().extend({
  is_active: z.boolean().optional(),
})

// GET /parts
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const allParts = await db.select().from(parts).orderBy(desc(parts.created_at))
    // Parse dimensions_json from string
    const parsed = allParts.map(p => ({
      ...p,
      dimensions_json: p.dimensions_json ? JSON.parse(p.dimensions_json as string) : null,
      ai_inference_json: p.ai_inference_json ? JSON.parse(p.ai_inference_json as string) : null,
    }))
    return res.json({ success: true, data: parsed })
  } catch (err) {
    console.error('List parts error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /parts
router.post('/', requireAuth, requireRole(['engineer', 'admin', 'developer']), validate(createPartSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = (req as any).user.id

    await db.insert(parts).values({
      id,
      part_name: body.part_name,
      part_number: body.part_number ?? null,
      drawing_number: body.drawing_number ?? null,
      commodity_type: body.commodity_type,
      material_grade: body.material_grade ?? null,
      dimensions_json: body.dimensions_json ? JSON.stringify(body.dimensions_json) : null,
      net_weight_g: body.net_weight_g ?? null,
      surface_finish: body.surface_finish ?? null,
      tolerance_class: body.tolerance_class ?? null,
      drawing_path: body.drawing_path ?? null,
      manufacturing_process: body.manufacturing_process ?? null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    })

    // Audit log
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'INSERT',
      entity_type: 'parts',
      entity_id: id,
      details: JSON.stringify({ part_name: body.part_name }),
      created_at: now,
    })

    const [part] = await db.select().from(parts).where(eq(parts.id, id))
    return res.status(201).json({
      success: true,
      data: {
        ...part,
        dimensions_json: part?.dimensions_json ? JSON.parse(part.dimensions_json as string) : null,
      },
    })
  } catch (err) {
    console.error('Create part error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// GET /parts/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [part] = await db.select().from(parts).where(eq(parts.id, req.params.id))
    if (!part) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
        error_code: 'PART_NOT_FOUND',
      })
    }
    return res.json({
      success: true,
      data: {
        ...part,
        dimensions_json: part.dimensions_json ? JSON.parse(part.dimensions_json as string) : null,
        ai_inference_json: part.ai_inference_json ? JSON.parse(part.ai_inference_json as string) : null,
      },
    })
  } catch (err) {
    console.error('Get part error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /parts/:id
router.patch('/:id', requireAuth, requireRole(['engineer', 'admin', 'developer']), validate(updatePartSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [part] = await db.select().from(parts).where(eq(parts.id, id))
    if (!part) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
        error_code: 'PART_NOT_FOUND',
      })
    }

    const body = req.body
    const updates: Record<string, any> = { ...body, updated_at: new Date().toISOString() }
    if (body.dimensions_json !== undefined) {
      updates.dimensions_json = body.dimensions_json ? JSON.stringify(body.dimensions_json) : null
    }

    await db.update(parts).set(updates).where(eq(parts.id, id))

    // Audit log
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user.id,
      action: 'UPDATE',
      entity_type: 'parts',
      entity_id: id,
      details: JSON.stringify({ updates: body }),
      created_at: new Date().toISOString(),
    })

    const [updated] = await db.select().from(parts).where(eq(parts.id, id))
    return res.json({
      success: true,
      data: {
        ...updated,
        dimensions_json: updated?.dimensions_json ? JSON.parse(updated.dimensions_json as string) : null,
        ai_inference_json: updated?.ai_inference_json ? JSON.parse(updated.ai_inference_json as string) : null,
      },
    })
  } catch (err) {
    console.error('Update part error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

export { router }
