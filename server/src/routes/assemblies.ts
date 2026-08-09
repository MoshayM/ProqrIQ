import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import {
  db,
  quotations,
  assemblyComponents,
  parts,
  costingBatches,
  batchItems,
  notifications,
  users,
  auditLog,
} from '../db/index'
import { eq, isNull, and, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { rollupAssembly, validateAssemblyAdd } from '../services/assembly'
import { runBatch } from '../services/batchRunner'
import { exportAssemblyToExcel } from '../services/excelExport'
import { MAX_ASSEMBLY_DEPTH } from '../config'

const router = Router()

router.use(requireAuth, requirePlan('pro'))

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createAssemblySchema = z.object({
  part_id: z.string().nullable().optional(),
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
  components: z.array(z.object({
    component_quotation_id: z.string().nullable().optional(),
    component_part_id: z.string().nullable().optional(),
    quantity_per_assembly: z.number().positive().default(1),
    is_purchased_standard: z.boolean().default(false),
    unit_cost_eur: z.number().nullable().optional(),
    unit_cost_source_tier: z.number().int().min(1).max(5).nullable().optional(),
    sort_order: z.number().int().nonnegative().default(0),
    notes: z.string().nullable().optional(),
  })).optional().default([]),
})

// Union of 3 add-component forms
const addComponentSchema = z.discriminatedUnion('variant', [
  // Form 1: link existing quotation
  z.object({
    variant: z.literal('link_existing'),
    component_quotation_id: z.string().min(1),
    quantity_per_assembly: z.number().positive().default(1),
    sort_order: z.number().int().nonnegative().optional().default(0),
    notes: z.string().nullable().optional(),
  }),
  // Form 2: new part (create part + draft quotation)
  z.object({
    variant: z.literal('new_part'),
    part_name: z.string().min(1),
    part_number: z.string().nullable().optional(),
    drawing_number: z.string().nullable().optional(),
    revision: z.string().nullable().optional(),
    commodity_type: z.string().nullable().optional(),
    material_grade: z.string().nullable().optional(),
    net_weight_g: z.number().nullable().optional(),
    drawing_url: z.string().nullable().optional(),
    quantity_per_assembly: z.number().positive().default(1),
    sort_order: z.number().int().nonnegative().optional().default(0),
    notes: z.string().nullable().optional(),
  }),
  // Form 3: purchased standard
  z.object({
    variant: z.literal('purchased_standard'),
    part_name: z.string().min(1),
    part_number: z.string().nullable().optional(),
    purchased_unit_cost_eur: z.number().nonnegative(),
    purchased_supplier: z.string().nullable().optional(),
    purchased_part_number: z.string().nullable().optional(),
    unit_cost_source_tier: z.number().int().min(1).max(5).optional().default(3),
    quantity_per_assembly: z.number().positive().default(1),
    sort_order: z.number().int().nonnegative().optional().default(0),
    notes: z.string().nullable().optional(),
  }),
])

const updateComponentSchema = z.object({
  quantity_per_assembly: z.number().positive().optional(),
  unit_cost_eur: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
})

// ─── POST /assemblies ─────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole(['engineer', 'admin', 'developer']),
  validate(createAssemblySchema),
  async (req: Request, res: Response) => {
    try {
      const body = req.body
      const userId = (req as any).user!.id
      const now = new Date().toISOString()
      const id = crypto.randomUUID()

      await db.insert(quotations).values({
        id,
        part_id: body.part_id ?? null,
        quote_type: 'assembly',
        status: 'draft',
        assembly_level: 0,
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
        margin_applied: true,
        created_by: userId,
        created_at: now,
        updated_at: now,
      })

      // Insert any initial components
      const initialComponents: any[] = body.components ?? []
      let sortOrder = 0
      for (const comp of initialComponents) {
        await db.insert(assemblyComponents).values({
          id: crypto.randomUUID(),
          assembly_quotation_id: id,
          component_quotation_id: comp.component_quotation_id ?? null,
          component_part_id: comp.component_part_id ?? null,
          quantity_per_assembly: comp.quantity_per_assembly ?? 1,
          is_purchased_standard: comp.is_purchased_standard ?? false,
          unit_cost_eur: comp.unit_cost_eur ?? null,
          unit_cost_source_tier: comp.unit_cost_source_tier ?? null,
          sort_order: comp.sort_order ?? sortOrder++,
          notes: comp.notes ?? null,
          created_at: now,
        })
      }

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: userId,
        action: 'INSERT',
        entity_type: 'quotations',
        entity_id: id,
        details: JSON.stringify({ quote_type: 'assembly', initial_components: initialComponents.length }),
        created_at: now,
      })

      const [assembly] = await db.select().from(quotations).where(eq(quotations.id, id))
      const components = await db.select().from(assemblyComponents)
        .where(eq(assemblyComponents.assembly_quotation_id, id))
        .orderBy(assemblyComponents.sort_order)

      return res.status(201).json({ success: true, data: { assembly, components } })
    } catch (err) {
      console.error('Create assembly error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── POST /quotations/:id/convert-to-assembly ─────────────────────────────────
// Mounted on the quotations router prefix in index.ts — here we handle it as a
// stand-alone path. The client calls POST /api/quotations/:id/convert-to-assembly.
// We export this handler so the main router can mount it under /quotations.
router.post(
  '/quotations/:id/convert-to-assembly',
  requireRole(['engineer', 'admin', 'developer']),
  async (req: Request, res: Response) => {
    try {
      const [quote] = await db.select().from(quotations).where(and(
        eq(quotations.id, req.params.id),
        isNull(quotations.deleted_at),
      ))

      if (!quote) {
        return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'QUOTE_NOT_FOUND' })
      }
      if (quote.ceo_approved) {
        return res.status(403).json({
          success: false,
          error: 'Cannot convert a CEO-approved quotation',
          error_code: 'QUOTE_APPROVED_IMMUTABLE',
        })
      }

      const now = new Date().toISOString()
      await db.update(quotations).set({
        quote_type: 'assembly',
        updated_at: now,
      }).where(eq(quotations.id, req.params.id))

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: (req as any).user!.id,
        action: 'UPDATE',
        entity_type: 'quotations',
        entity_id: req.params.id,
        details: JSON.stringify({ action: 'convert_to_assembly' }),
        created_at: now,
      })

      const [updated] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))
      return res.json({ success: true, data: updated })
    } catch (err) {
      console.error('Convert to assembly error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── GET /assemblies/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [assembly] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!assembly || assembly.quote_type !== 'assembly') {
      return res.status(404).json({ success: false, error: 'Assembly not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const edges = await db.select().from(assemblyComponents)
      .where(eq(assemblyComponents.assembly_quotation_id, req.params.id))
      .orderBy(assemblyComponents.sort_order)

    // Expand each edge with part + component quotation summary
    const components = await Promise.all(edges.map(async edge => {
      const part = edge.component_part_id
        ? (await db.select().from(parts).where(eq(parts.id, edge.component_part_id)))[0] ?? null
        : null

      const childQuote = edge.component_quotation_id
        ? (await db.select({
            id: quotations.id,
            overall_cost_eur: quotations.overall_cost_eur,
            final_price_eur: quotations.final_price_eur,
            confidence_score: quotations.confidence_score,
            status: quotations.status,
          }).from(quotations).where(eq(quotations.id, edge.component_quotation_id)))[0] ?? null
        : null

      return {
        ...edge,
        part: part ? { ...part, dimensions_json: part.dimensions_json ? JSON.parse(part.dimensions_json as string) : null } : null,
        component_quotation: childQuote ?? null,
      }
    }))

    const rollup = assembly.rollup_json ? JSON.parse(assembly.rollup_json as string) : null

    return res.json({
      success: true,
      data: {
        assembly: { ...assembly, rollup_json: rollup },
        components,
        rollup,
      },
    })
  } catch (err) {
    console.error('Get assembly error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── POST /assemblies/:id/components ─────────────────────────────────────────
router.post(
  '/:id/components',
  requireRole(['engineer', 'admin', 'developer']),
  validate(addComponentSchema),
  async (req: Request, res: Response) => {
    try {
      const [assembly] = await db.select().from(quotations).where(and(
        eq(quotations.id, req.params.id),
        isNull(quotations.deleted_at),
      ))

      if (!assembly || assembly.quote_type !== 'assembly') {
        return res.status(404).json({ success: false, error: 'Assembly not found', error_code: 'QUOTE_NOT_FOUND' })
      }

      const body = req.body
      const userId = (req as any).user!.id
      const now = new Date().toISOString()

      // Validate using assembly service (circular ref + depth check)
      if (body.variant === 'link_existing') {
        try {
          await validateAssemblyAdd(req.params.id, body.component_quotation_id)
        } catch (e: any) {
          return res.status(e.statusCode ?? 400).json({
            success: false,
            error: e.message,
            error_code: e.code ?? 'VALIDATION_ERROR',
          })
        }
      }

      const edgeId = crypto.randomUUID()
      let componentQuotationId: string | null = null
      let componentPartId: string | null = null

      if (body.variant === 'link_existing') {
        componentQuotationId = body.component_quotation_id

        // Set child quote_type to 'component', parent_quotation_id, margin_applied=false
        await db.update(quotations).set({
          quote_type: 'component',
          parent_quotation_id: req.params.id,
          margin_applied: false,
          assembly_level: (assembly.assembly_level ?? 0) + 1,
          updated_at: now,
        }).where(eq(quotations.id, componentQuotationId!))

        // Get part_id from child quote
        const [childQuote] = await db.select().from(quotations).where(eq(quotations.id, componentQuotationId!))
        componentPartId = childQuote?.part_id ?? null

      } else if (body.variant === 'new_part') {
        // Create a new part
        const partId = crypto.randomUUID()
        await db.insert(parts).values({
          id: partId,
          part_name: body.part_name,
          part_number: body.part_number ?? null,
          drawing_number: body.drawing_number ?? null,
          commodity_type: body.commodity_type ?? 'other',
          material_grade: body.material_grade ?? null,
          net_weight_g: body.net_weight_g ?? null,
          drawing_path: body.drawing_url ?? null,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
        componentPartId = partId

        // Create draft quotation for this new part
        const newQuoteId = crypto.randomUUID()
        await db.insert(quotations).values({
          id: newQuoteId,
          part_id: partId,
          quote_type: 'component',
          status: 'draft',
          parent_quotation_id: req.params.id,
          assembly_level: (assembly.assembly_level ?? 0) + 1,
          margin_applied: false,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
        componentQuotationId = newQuoteId

      } else if (body.variant === 'purchased_standard') {
        // Purchased standard: no child quotation needed
        componentPartId = null
        componentQuotationId = null
      }

      // Insert the assembly_components edge
      await db.insert(assemblyComponents).values({
        id: edgeId,
        assembly_quotation_id: req.params.id,
        component_quotation_id: componentQuotationId,
        component_part_id: componentPartId,
        quantity_per_assembly: body.quantity_per_assembly ?? 1,
        is_purchased_standard: body.variant === 'purchased_standard',
        unit_cost_eur: body.variant === 'purchased_standard' ? body.purchased_unit_cost_eur : null,
        unit_cost_source_tier: body.variant === 'purchased_standard' ? (body.unit_cost_source_tier ?? 3) : null,
        sort_order: body.sort_order ?? 0,
        notes: body.notes ?? null,
        created_at: now,
      })

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: userId,
        action: 'INSERT',
        entity_type: 'assembly_component',
        entity_id: edgeId,
        details: JSON.stringify({ assembly_id: req.params.id, variant: body.variant }),
        created_at: now,
      })

      // Return the edge with expanded data
      const [edge] = await db.select().from(assemblyComponents).where(eq(assemblyComponents.id, edgeId))
      const part = componentPartId
        ? (await db.select().from(parts).where(eq(parts.id, componentPartId)))[0] ?? null
        : null
      const childQuote = componentQuotationId
        ? (await db.select({
            id: quotations.id,
            overall_cost_eur: quotations.overall_cost_eur,
            final_price_eur: quotations.final_price_eur,
            confidence_score: quotations.confidence_score,
            status: quotations.status,
          }).from(quotations).where(eq(quotations.id, componentQuotationId)))[0] ?? null
        : null

      return res.status(201).json({
        success: true,
        data: {
          ...edge,
          part: part ? { ...part, dimensions_json: part.dimensions_json ? JSON.parse(part.dimensions_json as string) : null } : null,
          component_quotation: childQuote ?? null,
        },
      })
    } catch (err) {
      console.error('Add component error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── PATCH /assemblies/:id/components/:componentId ────────────────────────────
router.patch(
  '/:id/components/:componentId',
  requireRole(['engineer', 'admin', 'developer']),
  validate(updateComponentSchema),
  async (req: Request, res: Response) => {
    try {
      const [edge] = await db.select().from(assemblyComponents).where(and(
        eq(assemblyComponents.id, req.params.componentId),
        eq(assemblyComponents.assembly_quotation_id, req.params.id),
      ))

      if (!edge) {
        return res.status(404).json({
          success: false,
          error: 'Assembly component not found',
          error_code: 'COMPONENT_NOT_FOUND',
        })
      }

      await db.update(assemblyComponents).set(req.body).where(eq(assemblyComponents.id, req.params.componentId))

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: (req as any).user!.id,
        action: 'UPDATE',
        entity_type: 'assembly_component',
        entity_id: req.params.componentId,
        details: JSON.stringify({ updates: req.body }),
        created_at: new Date().toISOString(),
      })

      // Trigger rollup recompute (best-effort, don't block response)
      try {
        rollupAssembly(req.params.id)
      } catch (_) { /* rollup may fail if not all children costed */ }

      const [updated] = await db.select().from(assemblyComponents).where(eq(assemblyComponents.id, req.params.componentId))
      const part = updated?.component_part_id
        ? (await db.select().from(parts).where(eq(parts.id, updated.component_part_id)))[0] ?? null
        : null
      const childQuote = updated?.component_quotation_id
        ? (await db.select({
            id: quotations.id,
            overall_cost_eur: quotations.overall_cost_eur,
            final_price_eur: quotations.final_price_eur,
            confidence_score: quotations.confidence_score,
            status: quotations.status,
          }).from(quotations).where(eq(quotations.id, updated.component_quotation_id)))[0] ?? null
        : null

      return res.json({
        success: true,
        data: {
          ...updated,
          part: part ? { ...part, dimensions_json: part.dimensions_json ? JSON.parse(part.dimensions_json as string) : null } : null,
          component_quotation: childQuote ?? null,
        },
      })
    } catch (err) {
      console.error('Update component error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── DELETE /assemblies/:id/components/:componentId ───────────────────────────
router.delete(
  '/:id/components/:componentId',
  requireRole(['engineer', 'admin', 'developer']),
  async (req: Request, res: Response) => {
    try {
      const [edge] = await db.select().from(assemblyComponents).where(and(
        eq(assemblyComponents.id, req.params.componentId),
        eq(assemblyComponents.assembly_quotation_id, req.params.id),
      ))

      if (!edge) {
        return res.status(404).json({
          success: false,
          error: 'Assembly component not found',
          error_code: 'COMPONENT_NOT_FOUND',
        })
      }

      await db.delete(assemblyComponents).where(eq(assemblyComponents.id, req.params.componentId))

      // If child quote is no longer used by any assembly → revert to 'individual', margin_applied=true
      if (edge.component_quotation_id) {
        const otherEdges = await db.select().from(assemblyComponents)
          .where(eq(assemblyComponents.component_quotation_id, edge.component_quotation_id))

        if (otherEdges.length === 0) {
          await db.update(quotations).set({
            quote_type: 'individual',
            parent_quotation_id: null,
            margin_applied: true,
            assembly_level: 0,
            updated_at: new Date().toISOString(),
          }).where(eq(quotations.id, edge.component_quotation_id))
        }
      }

      // Trigger rollup recompute (best-effort)
      try {
        rollupAssembly(req.params.id)
      } catch (_) { /* ok */ }

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: (req as any).user!.id,
        action: 'DELETE',
        entity_type: 'assembly_component',
        entity_id: req.params.componentId,
        details: JSON.stringify({ assembly_id: req.params.id }),
        created_at: new Date().toISOString(),
      })

      return res.json({ success: true })
    } catch (err) {
      console.error('Delete component error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── POST /assemblies/:id/cost-children ───────────────────────────────────────
router.post('/:id/cost-children', requireRole(['engineer', 'admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [assembly] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!assembly || assembly.quote_type !== 'assembly') {
      return res.status(404).json({ success: false, error: 'Assembly not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    // Find uncosted non-purchased child quotations
    const edges = await db.select().from(assemblyComponents).where(and(
      eq(assemblyComponents.assembly_quotation_id, req.params.id),
      eq(assemblyComponents.is_purchased_standard, false),
    ))

    const uncostedEdges: typeof edges = []
    for (const e of edges) {
      if (!e.component_quotation_id) continue
      const [childQuote] = await db.select().from(quotations)
        .where(eq(quotations.id, e.component_quotation_id))
      if (childQuote && childQuote.overall_cost_eur == null) {
        uncostedEdges.push(e)
      }
    }

    if (uncostedEdges.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No uncosted children to cost',
        error_code: 'NO_UNCOSTED_CHILDREN',
      })
    }

    const userId = (req as any).user!.id
    const now = new Date().toISOString()
    const batchId = crypto.randomUUID()

    // Inherit production parameters from the parent assembly so children are
    // costed under the same country/currency/volume assumptions.
    const sharedParams = {
      supplier_country:        assembly.supplier_country        ?? 'DE',
      supplier_currency:       assembly.supplier_currency       ?? 'EUR',
      annual_volume:           assembly.annual_volume           ?? 5000,
      lot_size:                assembly.lot_size                ?? 500,
      lots_per_year:           assembly.lots_per_year           ?? 10,
      shifts_per_day:          assembly.shifts_per_day          ?? 2,
      annual_production_hours: assembly.annual_production_hours ?? 3500,
      procurement_type:        assembly.procurement_type        ?? 'in_house',
      exchange_rate:           assembly.exchange_rate           ?? 1.0,
      exchange_rate_source:    assembly.exchange_rate_source    ?? 'manual',
    }

    await db.insert(costingBatches).values({
      id: batchId,
      name: `Assembly Children – ${req.params.id}`,
      batch_type: 'assembly_children',
      assembly_quotation_id: req.params.id,
      status: 'queued',
      total_items: uncostedEdges.length,
      completed_items: 0,
      failed_items: 0,
      clarification_items: 0,
      shared_params_json: JSON.stringify(sharedParams),
      created_by: userId,
      created_at: now,
    })

    let sortOrder = 0
    for (const edge of uncostedEdges) {
      const [childQuote] = await db.select().from(quotations)
        .where(eq(quotations.id, edge.component_quotation_id!))

      let partName = 'Unknown Part'
      if (childQuote?.part_id) {
        const [part] = await db.select().from(parts).where(eq(parts.id, childQuote.part_id))
        partName = part?.part_name ?? partName
      }

      await db.insert(batchItems).values({
        id: crypto.randomUUID(),
        batch_id: batchId,
        quotation_id: edge.component_quotation_id,
        part_id: childQuote?.part_id ?? null,
        part_name: partName,
        status: 'queued',
        sort_order: sortOrder++,
        created_at: now,
      })
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'INSERT',
      entity_type: 'costing_batch',
      entity_id: batchId,
      details: JSON.stringify({ assembly_id: req.params.id, total_items: uncostedEdges.length }),
      created_at: now,
    })

    // Fire-and-forget
    runBatch(batchId).catch(err => {
      console.error(`Assembly batch runner failed for ${batchId}:`, err)
    })

    const [batch] = await db.select().from(costingBatches).where(eq(costingBatches.id, batchId))
    return res.status(201).json({ success: true, data: batch })
  } catch (err) {
    console.error('Cost children error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── POST /assemblies/:id/rollup ──────────────────────────────────────────────
router.post('/:id/rollup', requireRole(['engineer', 'admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [assembly] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!assembly || assembly.quote_type !== 'assembly') {
      return res.status(404).json({ success: false, error: 'Assembly not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const rollupResult = await rollupAssembly(req.params.id)

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'quotations',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'rollup', overall_cost_eur: rollupResult.overall_cost_eur }),
      created_at: new Date().toISOString(),
    })

    // Notify interested users about updated rollup
    const [updatedAssembly] = await db.select().from(quotations).where(eq(quotations.id, req.params.id))

    return res.json({
      success: true,
      data: {
        assembly: { ...updatedAssembly, rollup_json: updatedAssembly?.rollup_json ? JSON.parse(updatedAssembly.rollup_json as string) : null },
        rollup: rollupResult,
      },
    })
  } catch (err: any) {
    if (err?.code === 'COMPONENT_NOT_COSTED') {
      return res.status(409).json({
        success: false,
        error: 'One or more components are not yet costed',
        error_code: 'COMPONENT_NOT_COSTED',
      })
    }
    console.error('Rollup error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── GET /assemblies/:id/export-excel ────────────────────────────────────────
router.get('/:id/export-excel', requirePlan('pro'), async (req: Request, res: Response) => {
  try {
    const [assembly] = await db.select().from(quotations).where(and(
      eq(quotations.id, req.params.id),
      isNull(quotations.deleted_at),
    ))

    if (!assembly || assembly.quote_type !== 'assembly') {
      return res.status(404).json({ success: false, error: 'Assembly not found', error_code: 'QUOTE_NOT_FOUND' })
    }

    const buffer = await exportAssemblyToExcel(req.params.id)
    const filename = `assembly-${req.params.id.slice(0, 8)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(buffer)
  } catch (err) {
    console.error('Export assembly excel error:', err)
    return res.status(500).json({
      success: false,
      error: 'Export failed',
      error_code: 'EXPORT_FAILED',
    })
  }
})

export { router }
