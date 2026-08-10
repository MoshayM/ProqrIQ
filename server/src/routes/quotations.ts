import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import {
  db,
  quotations,
  costLines,
  cycleTimeSteps,
  materialBreakdowns,
  assumptions,
  valueEngineering,
  quoteVersions,
  users,
  notifications,
  auditLog,
  assemblyComponents,
  parts,
} from '../db/index'
import { eq, isNull, and, desc, ne, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { exportQuoteToExcel } from '../services/excelExport'

const router = Router()

const createQuotationSchema = z.object({
  part_id: z.string().nullable().optional(),
  quote_type: z.enum(['individual', 'assembly', 'component']).optional().default('individual'),
  supplier_country: z.string().nullable().optional(),
  supplier_currency: z.string().nullable().optional(),
  annual_volume: z.number().int().positive().nullable().optional(),
  lot_size: z.number().int().positive().nullable().optional(),
  lots_per_year: z.number().int().positive().nullable().optional(),
  shifts_per_day: z.number().int().positive().nullable().optional(),
  annual_production_hours: z.number().positive().nullable().optional(),
  procurement_type: z.enum(['purchased', 'in_house', 'sub_contracted']).nullable().optional(),
  current_cart_price: z.number().nullable().optional(),
  target_cart_price: z.number().nullable().optional(),
  exchange_rate: z.number().nullable().optional(),
  exchange_rate_source: z.string().nullable().optional(),
  batch_id: z.string().nullable().optional(),
  batch_item_id: z.string().nullable().optional(),
  parent_quotation_id: z.string().nullable().optional(),
})

const updateQuotationSchema = createQuotationSchema.partial().extend({
  status: z.enum(['draft', 'in_review', 'pending_approval', 'approved', 'archived']).optional(),
  overall_cost_eur: z.number().nullable().optional(),
  final_price_eur: z.number().nullable().optional(),
  one_time_cost_eur: z.number().nullable().optional(),
  confidence_score: z.number().nullable().optional(),
  kb_coverage_pct: z.number().nullable().optional(),
  routing_path: z.string().nullable().optional(),
  ai_reasoning_json: z.string().nullable().optional(),
  margin_pct: z.number().nullable().optional(),
})

const rejectSchema = z.object({
  notes: z.string().min(1),
})

const softDeleteSchema = z.object({
  deletion_reason: z.string().optional(),
})

// Helper: create notification for all users with given roles
async function notifyRoles(roles: string[], payload: {
  type: string
  title: string
  message: string
  related_quote_id?: string
}) {
  const targetUsers = await db.select().from(users)
    .where(inArray(users.role, roles as any))

  for (const u of targetUsers) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      user_id: u.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      related_quote_id: payload.related_quote_id ?? null,
      read: false,
      created_at: new Date().toISOString(),
    })
  }
}

async function notifyUser(userId: string, payload: {
  type: string
  title: string
  message: string
  related_quote_id?: string
}) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    related_quote_id: payload.related_quote_id ?? null,
    read: false,
    created_at: new Date().toISOString(),
  })
}

// GET /quotations
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const page = Math.max(0, parseInt(String(req.query.page ?? '0'), 10))
    const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize ?? '25'), 10)))
    const showDeleted = req.query.showDeleted === 'true' && user.role === 'admin'
    const includeComponents = req.query.includeComponents === 'true'

    const conditions: any[] = []
    if (!showDeleted) {
      conditions.push(isNull(quotations.deleted_at))
    }
    if (!includeComponents) {
      conditions.push(ne(quotations.quote_type, 'component'))
    }
    // admin + developer see all quotes; everyone else sees only their own
    const GLOBAL_ROLES = ['admin', 'developer', 'ceo', 'owner']
    if (!GLOBAL_ROLES.includes(user.role)) {
      conditions.push(eq(quotations.created_by, user.id))
    }

    const allRows = await db
      .select({ q: quotations, p: parts })
      .from(quotations)
      .leftJoin(parts, eq(quotations.part_id, parts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(quotations.created_at))

    const total = allRows.length
    const data = allRows.slice(page * pageSize, page * pageSize + pageSize).map(({ q, p }) => ({
      ...q,
      cost_eur: q.overall_cost_eur,
      rollup_json: q.rollup_json ? JSON.parse(q.rollup_json as string) : null,
      part: p ? {
        id: p.id,
        name: p.part_name,
        part_number: p.part_number ?? null,
        commodity_type: p.commodity_type,
        material: p.material_grade ?? null,
        primary_process: p.manufacturing_process ?? null,
        dimensions: p.dimensions_json ? JSON.parse(p.dimensions_json as string) : null,
        weight_kg: p.net_weight_g != null ? p.net_weight_g / 1000 : null,
      } : null,
    }))

    return res.json({ success: true, data: { data, total } })
  } catch (err) {
    console.error('List quotations error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations
router.post('/', requireAuth, requireRole(['engineer', 'admin', 'developer']), validate(createQuotationSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = (req as any).user.id

    await db.insert(quotations).values({
      id,
      part_id: body.part_id ?? null,
      quote_type: body.quote_type ?? 'individual',
      status: 'draft',
      supplier_country: body.supplier_country ?? null,
      supplier_currency: body.supplier_currency ?? null,
      annual_volume: body.annual_volume ?? null,
      lot_size: body.lot_size ?? null,
      lots_per_year: body.lots_per_year ?? null,
      shifts_per_day: body.shifts_per_day ?? null,
      annual_production_hours: body.annual_production_hours ?? null,
      procurement_type: body.procurement_type ?? null,
      current_cart_price: body.current_cart_price ?? null,
      target_cart_price: body.target_cart_price ?? null,
      exchange_rate: body.exchange_rate ?? null,
      exchange_rate_source: body.exchange_rate_source ?? null,
      batch_id: body.batch_id ?? null,
      parent_quotation_id: body.parent_quotation_id ?? null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    })

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'INSERT',
      entity_type: 'quotations',
      entity_id: id,
      details: JSON.stringify({ quote_type: body.quote_type ?? 'individual' }),
      created_at: now,
    })

    const [quote] = await db.select().from(quotations).where(eq(quotations.id, id))
    return res.status(201).json({ success: true, data: quote })
  } catch (err) {
    console.error('Create quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// GET /quotations/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    // If deleted, only admin can view
    if (quote.deleted_at && user.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const lines = await db.select().from(costLines).where(eq(costLines.quotation_id, quote.id))
    const steps = await db.select().from(cycleTimeSteps).where(eq(cycleTimeSteps.quotation_id, quote.id))
    const materials = await db.select().from(materialBreakdowns).where(eq(materialBreakdowns.quotation_id, quote.id))
    const assums = await db.select().from(assumptions).where(eq(assumptions.quotation_id, quote.id))
    const ve = await db.select().from(valueEngineering).where(eq(valueEngineering.quotation_id, quote.id))

    const result: any = {
      ...quote,
      rollup_json: quote.rollup_json ? JSON.parse(quote.rollup_json as string) : null,
      cost_lines: lines,
      cycle_time_steps: steps,
      material_breakdowns: materials,
      assumptions: assums,
      value_engineering: ve,
    }

    // If assembly, include components
    if (quote.quote_type === 'assembly') {
      const components = await db.select().from(assemblyComponents)
        .where(eq(assemblyComponents.assembly_quotation_id, quote.id))
        .orderBy(assemblyComponents.sort_order)
      result.components = components
      result.rollup = quote.rollup_json ? JSON.parse(quote.rollup_json as string) : null
    }

    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('Get quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /quotations/:id
router.patch('/:id', requireAuth, requireRole(['engineer', 'admin', 'developer']), validate(updateQuotationSchema), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }
    if (quote.deleted_at) {
      return res.status(403).json({ success: false, error: 'Quotation is deleted', error_code: 'QUOTE_ALREADY_DELETED' })
    }
    if (quote.ceo_approved && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'CEO-approved quotation cannot be edited', error_code: 'QUOTE_APPROVED_IMMUTABLE' })
    }

    const now = new Date().toISOString()
    const updates = { ...req.body, updated_at: now }

    await db.update(quotations).set(updates).where(eq(quotations.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ updates: req.body }),
      created_at: now,
    })

    const [updated] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Update quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations/:id/submit
router.post('/:id/submit', requireAuth, requireRole(['engineer', 'admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }
    if (quote.quote_type === 'component') {
      return res.status(403).json({
        success: false,
        error: 'Components cannot be submitted individually — submit the parent assembly',
        error_code: 'COMPONENT_NOT_SUBMITTABLE',
      })
    }

    // For assemblies, check all children have confidence >= 70
    if (quote.quote_type === 'assembly') {
      const childEdges = await db.select().from(assemblyComponents)
        .where(and(
          eq(assemblyComponents.assembly_quotation_id, quote.id),
          eq(assemblyComponents.is_purchased_standard, false),
        ))

      for (const edge of childEdges) {
        if (!edge.component_quotation_id) continue
        const [child] = await db.select().from(quotations)
          .where(eq(quotations.id, edge.component_quotation_id))
        if (child && (child.confidence_score == null || child.confidence_score < 70)) {
          return res.status(409).json({
            success: false,
            error: 'One or more assembly components have confidence below 70%. Cost all children first.',
            error_code: 'ASSEMBLY_CHILD_CONFIDENCE_LOW',
          })
        }
      }
    }

    const now = new Date().toISOString()
    await db.update(quotations).set({
      status: 'pending_approval',
      updated_at: now,
    }).where(eq(quotations.id, req.params.id))

    // Notify admin + ceo
    await notifyRoles(['admin', 'ceo'], {
      type: 'quote_submitted',
      title: 'Quotation Submitted for Approval',
      message: `Quotation ${req.params.id} has been submitted for approval.`,
      related_quote_id: req.params.id,
    })

    const [updated] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Submit quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations/:id/approve
router.post('/:id/approve', requireAuth, requireRole(['ceo', 'admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const now = new Date().toISOString()
    const userId = (req as any).user.id
    const notes = req.body?.notes ?? null

    await db.update(quotations).set({
      ceo_approved: true,
      status: 'approved',
      approved_at: now,
      ceo_notes: notes,
      updated_at: now,
    }).where(eq(quotations.id, req.params.id))

    // If assembly, cascade ceo_approved to all component children
    if (quote.quote_type === 'assembly') {
      const childEdges = await db.select().from(assemblyComponents)
        .where(and(
          eq(assemblyComponents.assembly_quotation_id, quote.id),
          eq(assemblyComponents.is_purchased_standard, false),
        ))

      for (const edge of childEdges) {
        if (edge.component_quotation_id) {
          await db.update(quotations).set({
            ceo_approved: true,
            approved_at: now,
            updated_at: now,
          }).where(eq(quotations.id, edge.component_quotation_id))
        }
      }
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'approve', notes }),
      created_at: now,
    })

    // Notify creator
    if (quote.created_by) {
      await notifyUser(quote.created_by, {
        type: 'quote_approved',
        title: 'Quotation Approved',
        message: `Your quotation ${req.params.id} has been approved.`,
        related_quote_id: req.params.id,
      })
    }

    const [updated] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Approve quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations/:id/reject
router.post('/:id/reject', requireAuth, requireRole(['ceo', 'admin', 'developer']), validate(rejectSchema), async (req: Request, res: Response) => {
  try {
    const [quote] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const now = new Date().toISOString()
    const userId = (req as any).user.id
    const { notes } = req.body

    await db.update(quotations).set({
      status: 'in_review',
      ceo_approved: false,
      ceo_notes: notes,
      updated_at: now,
    }).where(eq(quotations.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'reject', notes }),
      created_at: now,
    })

    // Notify creator
    if (quote.created_by) {
      await notifyUser(quote.created_by, {
        type: 'quote_rejected',
        title: 'Quotation Returned for Review',
        message: `Your quotation ${req.params.id} was returned for review. Notes: ${notes}`,
        related_quote_id: req.params.id,
      })
    }

    const [updated] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Reject quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations/:id/soft-delete
router.post('/:id/soft-delete', requireAuth, validate(softDeleteSchema), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }
    if (quote.deleted_at) {
      return res.status(409).json({ success: false, error: 'Quotation already deleted', error_code: 'QUOTE_ALREADY_DELETED' })
    }
    if (quote.ceo_approved) {
      return res.status(403).json({ success: false, error: 'Cannot delete a CEO-approved quotation', error_code: 'QUOTE_APPROVED_IMMUTABLE' })
    }

    // Engineer: can only delete own drafts
    if (user.role === 'engineer') {
      if (quote.created_by !== user.id) {
        return res.status(403).json({ success: false, error: 'You can only delete your own quotations', error_code: 'QUOTE_NOT_OWNER' })
      }
      if (quote.status !== 'draft') {
        return res.status(403).json({ success: false, error: 'Engineers can only delete draft quotations', error_code: 'QUOTE_NOT_DRAFT' })
      }
    }

    const now = new Date().toISOString()

    await db.update(quotations).set({
      deleted_at: now,
      deleted_by: user.id,
      deletion_reason: req.body.deletion_reason ?? null,
      status: 'archived',
      updated_at: now,
    }).where(eq(quotations.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'DELETE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'soft_delete', deletion_reason: req.body.deletion_reason }),
      created_at: now,
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Soft delete quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /quotations/:id/restore
router.post('/:id/restore', requireAuth, requireRole(['admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }
    if (!quote.deleted_at) {
      return res.status(409).json({ success: false, error: 'Quotation is not deleted', error_code: 'QUOTE_NOT_DELETED' })
    }

    const now = new Date().toISOString()

    await db.update(quotations).set({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      status: 'draft',
      updated_at: now,
    }).where(eq(quotations.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user.id,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'restore' }),
      created_at: now,
    })

    // Notify creator
    if (quote.created_by) {
      await notifyUser(quote.created_by, {
        type: 'quote_restored',
        title: 'Quotation Restored',
        message: `Quotation ${req.params.id} has been restored from archive.`,
        related_quote_id: req.params.id,
      })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('Restore quotation error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// GET /quotations/:id/versions
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    let versionsQuery = db.select().from(quoteVersions)
      .where(eq(quoteVersions.quotation_id, req.params.id))

    const versions = await versionsQuery.orderBy(desc(quoteVersions.version_number))

    // Non-admin: filter out hidden versions
    const filtered = user.role === 'admin'
      ? versions
      : versions.filter(v => !v.hidden_at)

    const parsed = filtered.map(v => ({
      ...v,
      snapshot_json: v.snapshot_json ? JSON.parse(v.snapshot_json as string) : null,
      diff_json: v.diff_json ? JSON.parse(v.diff_json as string) : null,
    }))

    return res.json({ success: true, data: parsed })
  } catch (err) {
    console.error('Get versions error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// GET /quotations/:id/export-excel
router.get('/:id/export-excel', requireAuth, requirePlan('pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }
    if (quote.deleted_at && user.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const buffer = await exportQuoteToExcel(req.params.id)
    const filename = `quote-${req.params.id.slice(0, 8)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(buffer)
  } catch (err) {
    console.error('Export excel error:', err)
    return res.status(500).json({
      success: false,
      error: 'Export failed',
      error_code: 'EXPORT_FAILED',
    })
  }
})

// GET /quotations/:id/cost-lines
router.get('/:id/cost-lines', requireAuth, async (req: Request, res: Response) => {
  try {
    const lines = await db.select().from(costLines).where(eq(costLines.quotation_id, req.params.id))
    return res.json({ success: true, data: lines })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// GET /quotations/:id/cycle-time-steps
router.get('/:id/cycle-time-steps', requireAuth, async (req: Request, res: Response) => {
  try {
    const steps = await db.select().from(cycleTimeSteps).where(eq(cycleTimeSteps.quotation_id, req.params.id))
    return res.json({ success: true, data: steps })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// GET /quotations/:id/material-breakdowns
router.get('/:id/material-breakdowns', requireAuth, async (req: Request, res: Response) => {
  try {
    const mats = await db.select().from(materialBreakdowns).where(eq(materialBreakdowns.quotation_id, req.params.id))
    return res.json({ success: true, data: mats })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// GET /quotations/:id/assumptions
router.get('/:id/assumptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const assums = await db.select().from(assumptions).where(eq(assumptions.quotation_id, req.params.id))
    return res.json({ success: true, data: assums })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

// PATCH /assumptions/:assumptionId/confirm  (mounted at /quotations level via server index)
// This is handled via a separate mount in server/src/index.ts: /api/assumptions
// but we can also handle it here for convenience
router.patch('/assumptions/:assumptionId/confirm', requireAuth, requireRole(['engineer', 'admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const { value } = req.body
    const now = new Date().toISOString()
    const userId = (req as any).user.id
    await db.update(assumptions).set({
      status: 'confirmed',
      confirmed_by: userId,
      confirmed_at: now,
      ...(value !== undefined ? { override_value: String(value) } : {}),
    }).where(eq(assumptions.id, req.params.assumptionId))
    const [updated] = await db.select().from(assumptions).where(eq(assumptions.id, req.params.assumptionId))
    return res.json({ success: true, data: updated })
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
  }
})

export { router }
