import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { bulkDrawingUpload, saveUploadedFile } from '../middleware/upload'
import {
  db,
  costingBatches,
  batchItems,
  parts,
  auditLog,
  notifications,
  users,
} from '../db/index'
import { eq, isNull, and, desc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { runBatch } from '../services/batchRunner'
import { exportBatchToExcel } from '../services/excelExport'
import { BULK_MAX_ITEMS } from '../config'

const router = Router()

router.use(requireAuth, requireRole(['engineer', 'admin']))

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sharedParamsSchema = z.object({
  supplier_country: z.string(),
  supplier_currency: z.string(),
  annual_volume: z.number(),
  lot_size: z.number(),
  lots_per_year: z.number(),
  shifts_per_day: z.number(),
  annual_production_hours: z.number(),
  procurement_type: z.enum(['purchased', 'in_house', 'sub_contracted']),
  exchange_rate: z.number(),
  exchange_rate_source: z.string(),
  current_cart_price: z.number().nullable().optional(),
  target_cart_price: z.number().nullable().optional(),
})

const jsonBatchSchema = z.object({
  name: z.string().min(1),
  part_ids: z.array(z.string()).min(1),
  shared_params: sharedParamsSchema,
  overrides: z.record(z.any()).optional(),
})

const retrySchema = z.object({
  item_ids: z.array(z.string()).optional(),
})

// Helper: notify creator
async function notifyCreator(userId: string, payload: {
  type: string
  title: string
  message: string
  related_batch_id?: string
}) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    related_quote_id: null,
    related_batch_id: payload.related_batch_id ?? null,
    read: false,
    created_at: new Date().toISOString(),
  })
}

// ─── POST /bulk-batches ───────────────────────────────────────────────────────
// Accepts multipart (files + JSON fields) OR JSON { name, part_ids, shared_params, overrides }
router.post(
  '/',
  (req: Request, res: Response, next) => {
    const ct = req.headers['content-type'] ?? ''
    if (ct.includes('multipart/form-data')) {
      bulkDrawingUpload(req, res, next)
    } else {
      next()
    }
  },
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user!.id
      const now = new Date().toISOString()
      const files = (req.files as Express.Multer.File[] | undefined) ?? []

      let batchName: string
      let sharedParams: any
      let overrides: Record<string, any> = {}
      let partIds: string[] = []
      let itemsFromFiles: Array<{ part_name: string; source_file_path: string; source_file_name: string }> = []

      const isMultipart = files.length > 0 || req.headers['content-type']?.includes('multipart/form-data')

      if (isMultipart) {
        // Multipart form: name + shared_params as JSON strings in body
        batchName = req.body.name ?? `Batch ${now}`
        sharedParams = req.body.shared_params ? JSON.parse(req.body.shared_params) : {}
        overrides = req.body.overrides ? JSON.parse(req.body.overrides) : {}
        itemsFromFiles = await Promise.all(files.map(async f => ({
          part_name: f.originalname.replace(/\.[^.]+$/, ''),
          source_file_path: await saveUploadedFile(f, 'drawings'),
          source_file_name: f.originalname,
        })))

        if (itemsFromFiles.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No drawing files provided',
            error_code: 'VALIDATION_FAILED',
          })
        }
      } else {
        // JSON body
        const parsed = jsonBatchSchema.safeParse(req.body)
        if (!parsed.success) {
          return res.status(422).json({
            success: false,
            error: 'Validation failed',
            error_code: 'VALIDATION_FAILED',
            details: parsed.error.flatten(),
          })
        }
        batchName = parsed.data.name
        sharedParams = parsed.data.shared_params
        overrides = parsed.data.overrides ?? {}
        partIds = parsed.data.part_ids
      }

      // Validate item count
      const totalItems = isMultipart ? itemsFromFiles.length : partIds.length
      if (totalItems > BULK_MAX_ITEMS) {
        return res.status(400).json({
          success: false,
          error: `Batch exceeds maximum of ${BULK_MAX_ITEMS} items`,
          error_code: 'BATCH_LIMIT_EXCEEDED',
        })
      }

      const batchId = crypto.randomUUID()

      await db.insert(costingBatches).values({
        id: batchId,
        name: batchName,
        batch_type: 'bulk',
        status: 'queued',
        total_items: totalItems,
        completed_items: 0,
        failed_items: 0,
        clarification_items: 0,
        shared_params_json: JSON.stringify(sharedParams),
        created_by: userId,
        created_at: now,
      })

      // Insert batch items
      if (isMultipart) {
        let sortOrder = 0
        for (const item of itemsFromFiles) {
          await db.insert(batchItems).values({
            id: crypto.randomUUID(),
            batch_id: batchId,
            part_name: item.part_name,
            source_file_path: item.source_file_path,
            source_file_name: item.source_file_name,
            status: 'queued',
            sort_order: sortOrder++,
            overrides_json: overrides[item.source_file_name] ? JSON.stringify(overrides[item.source_file_name]) : null,
            created_at: now,
          })
        }
      } else {
        let sortOrder = 0
        for (const partId of partIds) {
          const [part] = await db.select().from(parts).where(eq(parts.id, partId))
          await db.insert(batchItems).values({
            id: crypto.randomUUID(),
            batch_id: batchId,
            part_id: partId,
            part_name: part?.part_name ?? partId,
            status: 'queued',
            sort_order: sortOrder++,
            overrides_json: overrides[partId] ? JSON.stringify(overrides[partId]) : null,
            created_at: now,
          })
        }
      }

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: userId,
        action: 'INSERT',
        entity_type: 'costing_batch',
        entity_id: batchId,
        details: JSON.stringify({ name: batchName, total_items: totalItems }),
        created_at: now,
      })

      // Fire-and-forget batch runner
      runBatch(batchId).catch(err => {
        console.error(`Batch runner failed for ${batchId}:`, err)
      })

      const [batch] = await db.select().from(costingBatches).where(eq(costingBatches.id, batchId))
      return res.status(201).json({ success: true, data: batch })
    } catch (err) {
      console.error('Create bulk batch error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// ─── GET /bulk-batches — paginated, filter deleted_at IS NULL ─────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(0, parseInt(String(req.query.page ?? '0'), 10))
    const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize ?? '25'), 10)))
    const showDeleted = req.query.showDeleted === 'true' && (req as any).user!.role === 'admin'

    const conditions = showDeleted ? [] : [isNull(costingBatches.deleted_at)]

    const allBatches = await db.select().from(costingBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(costingBatches.created_at))

    const total = allBatches.length
    const data = allBatches.slice(page * pageSize, page * pageSize + pageSize).map(b => ({
      ...b,
      processed_items: b.completed_items,
      shared_params_json: b.shared_params_json ? JSON.parse(b.shared_params_json as string) : null,
    }))

    return res.json({ success: true, data: { data, total } })
  } catch (err) {
    console.error('List batches error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── GET /bulk-batches/:id — batch + items ordered by sort_order ──────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [batch] = await db.select().from(costingBatches)
      .where(and(
        eq(costingBatches.id, req.params.id),
        isNull(costingBatches.deleted_at),
      ))

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        error_code: 'BATCH_NOT_FOUND',
      })
    }

    const items = await db.select().from(batchItems)
      .where(eq(batchItems.batch_id, req.params.id))
      .orderBy(batchItems.sort_order)

    const parsedItems = items.map(i => ({
      ...i,
      overrides_json: i.overrides_json ? JSON.parse(i.overrides_json as string) : null,
      clarification_json: i.clarification_json ? JSON.parse(i.clarification_json as string) : null,
    }))

    return res.json({
      success: true,
      data: {
        ...batch,
        processed_items: batch.completed_items,
        shared_params_json: batch.shared_params_json ? JSON.parse(batch.shared_params_json as string) : null,
        items: parsedItems,
      },
    })
  } catch (err) {
    console.error('Get batch error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── POST /bulk-batches/:id/retry ─────────────────────────────────────────────
router.post('/:id/retry', validate(retrySchema), async (req: Request, res: Response) => {
  try {
    const [batch] = await db.select().from(costingBatches)
      .where(and(
        eq(costingBatches.id, req.params.id),
        isNull(costingBatches.deleted_at),
      ))

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        error_code: 'BATCH_NOT_FOUND',
      })
    }
    if (batch.status === 'processing') {
      return res.status(409).json({
        success: false,
        error: 'Batch is currently processing',
        error_code: 'BATCH_ALREADY_PROCESSING',
      })
    }

    const { item_ids } = req.body

    // Find failed (or needs_clarification) items to retry
    let failedItems = await db.select().from(batchItems)
      .where(and(
        eq(batchItems.batch_id, req.params.id),
        inArray(batchItems.status, ['failed', 'needs_clarification']),
      ))

    if (item_ids && item_ids.length > 0) {
      failedItems = failedItems.filter(i => item_ids.includes(i.id))
    }

    if (failedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No failed items to retry',
        error_code: 'NO_ITEMS_TO_RETRY',
      })
    }

    // Re-queue failed items
    for (const item of failedItems) {
      await db.update(batchItems).set({
        status: 'queued',
        error_code: null,
        error_message: null,
        confidence_score: null,
        clarification_json: null,
        started_at: null,
        completed_at: null,
      }).where(eq(batchItems.id, item.id))
    }

    // Reset batch status
    await db.update(costingBatches).set({ status: 'queued' }).where(eq(costingBatches.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'costing_batch',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'retry', items_requeued: failedItems.length }),
      created_at: new Date().toISOString(),
    })

    // Fire-and-forget batch runner
    runBatch(req.params.id).catch(err => {
      console.error(`Batch retry runner failed for ${req.params.id}:`, err)
    })

    const [updated] = await db.select().from(costingBatches).where(eq(costingBatches.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Retry batch error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── POST /bulk-batches/:id/cancel ────────────────────────────────────────────
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const [batch] = await db.select().from(costingBatches)
      .where(and(
        eq(costingBatches.id, req.params.id),
        isNull(costingBatches.deleted_at),
      ))

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        error_code: 'BATCH_NOT_FOUND',
      })
    }

    // Cancel all queued items; in-flight items finish naturally
    await db.update(batchItems)
      .set({ status: 'cancelled' as any })
      .where(and(
        eq(batchItems.batch_id, req.params.id),
        inArray(batchItems.status, ['queued']),
      ))

    await db.update(costingBatches)
      .set({ status: 'cancelled', completed_at: new Date().toISOString() })
      .where(eq(costingBatches.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'costing_batch',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'cancel' }),
      created_at: new Date().toISOString(),
    })

    const [updated] = await db.select().from(costingBatches).where(eq(costingBatches.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Cancel batch error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── POST /bulk-batches/:id/soft-delete ───────────────────────────────────────
router.post('/:id/soft-delete', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!
    const [batch] = await db.select().from(costingBatches)
      .where(and(
        eq(costingBatches.id, req.params.id),
        isNull(costingBatches.deleted_at),
      ))

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        error_code: 'BATCH_NOT_FOUND',
      })
    }

    // Engineer can only delete own batches
    if (user.role === 'engineer' && batch.created_by !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own batches',
        error_code: 'BATCH_NOT_OWNER',
      })
    }

    const now = new Date().toISOString()
    await db.update(costingBatches)
      .set({ deleted_at: now, deleted_by: user.id })
      .where(eq(costingBatches.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'DELETE',
      entity_type: 'costing_batch',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'soft_delete' }),
      created_at: now,
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Soft delete batch error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── GET /bulk-batches/:id/export-excel ───────────────────────────────────────
router.get('/:id/export-excel', async (req: Request, res: Response) => {
  try {
    const [batch] = await db.select().from(costingBatches)
      .where(and(
        eq(costingBatches.id, req.params.id),
        isNull(costingBatches.deleted_at),
      ))

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        error_code: 'BATCH_NOT_FOUND',
      })
    }

    const buffer = await exportBatchToExcel(req.params.id)
    const filename = `batch-${req.params.id.slice(0, 8)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(buffer)
  } catch (err) {
    console.error('Export batch excel error:', err)
    return res.status(500).json({
      success: false,
      error: 'Export failed',
      error_code: 'EXPORT_FAILED',
    })
  }
})

export { router }
