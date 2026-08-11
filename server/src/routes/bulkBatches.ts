import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { bulkDrawingUpload, saveUploadedFile, spreadsheetUpload } from '../middleware/upload'
import ExcelJS from 'exceljs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { parseAIJSON } from '../lib/parseAIJSON'

const MODEL = 'claude-sonnet-4-20250514'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

router.use(requireAuth, requireRole(['engineer', 'admin', 'developer']), requirePlan('pro'))

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

// ─── POST /bulk-batches/analyze-drawings ─────────────────────────────────────
// Vision-AI analysis: extracts part metadata from each drawing file.
// Must be registered BEFORE the /:id route group.
router.post(
  '/analyze-drawings',
  bulkDrawingUpload,
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? []
      if (!files.length) {
        return res.status(400).json({ success: false, error: 'No files provided', error_code: 'VALIDATION_FAILED' })
      }

      const VISION_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
        'image/png':  'image/png',
        'image/jpeg': 'image/jpeg',
        'image/jpg':  'image/jpeg',
        'image/webp': 'image/webp',
      }

      const PROMPT = `You are analyzing an engineering drawing or technical document.
Extract part metadata from it. Output ONLY valid JSON. No markdown fences. No preamble.

Format: {"part_name":"...","description":"...","material":"...","drawing_number":"...","confidence":0.85}

Rules:
- part_name: the main part identifier or title (required; derive from drawing if possible)
- description: one-sentence description of the part function or geometry (or "")
- material: material specification from title block or BOM notes (or "")
- drawing_number: drawing or document number from title block (or "")
- confidence: 0.0–1.0 how confident you are in the extraction`

      type AIResult = { part_name: string; description: string; material: string; drawing_number: string; confidence: number }

      const results = await Promise.allSettled(files.map(async (file) => {
        try {
          type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: string } }
          type TextBlock  = { type: 'text'; text: string }

          let contentBlocks: Array<ImageBlock | TextBlock>
          if (file.mimetype === 'application/pdf') {
            // PDF: extract text with pdf-parse then send as text block
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
            const { text } = await pdfParse(file.buffer)
            contentBlocks = [
              { type: 'text', text: `Engineering document text (filename: ${file.originalname}):\n${text.slice(0, 5000)}` },
              { type: 'text', text: PROMPT },
            ]
          } else {
            const mt = VISION_MIME[file.mimetype] ?? 'image/jpeg'
            contentBlocks = [
              { type: 'image', source: { type: 'base64', media_type: mt, data: file.buffer.toString('base64') } },
              { type: 'text', text: PROMPT },
            ]
          }

          const msg = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 300,
            messages: [{ role: 'user', content: contentBlocks as any[] }],
          })

          const textBlock = msg.content[0]
          if (textBlock.type !== 'text') throw new Error('Unexpected response type')
          const parsed = parseAIJSON<AIResult>(textBlock.text)
          if (!parsed.part_name?.trim()) {
            parsed.part_name = file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
          }
          return { filename: file.originalname, part_name: parsed.part_name, description: parsed.description ?? '', material: parsed.material ?? '', drawing_number: parsed.drawing_number ?? '', confidence: parsed.confidence ?? 0, error: null }
        } catch (err) {
          const fallback = file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
          return { filename: file.originalname, part_name: fallback, description: '', material: '', drawing_number: '', confidence: 0, error: (err as Error).message }
        }
      }))

      const parts = results.map(r =>
        r.status === 'fulfilled' ? r.value
          : { filename: 'unknown', part_name: 'unknown', description: '', material: '', drawing_number: '', confidence: 0, error: 'Analysis failed' },
      )

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: (req as any).user!.id,
        action: 'READ',
        entity_type: 'drawing_analysis',
        entity_id: 'batch',
        details: JSON.stringify({ file_count: files.length }),
        created_at: new Date().toISOString(),
      })

      return res.json({ success: true, data: { parts } })
    } catch (err) {
      console.error('Analyze drawings error:', err)
      return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
    }
  },
)

// ─── POST /bulk-batches/parse-manifest ───────────────────────────────────────
// Parse a manifest file and return rows without creating a batch.
// Supports the same formats as from-spreadsheet.
router.post(
  '/parse-manifest',
  spreadsheetUpload,
  async (req: Request, res: Response) => {
    try {
      const file = req.file
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided', error_code: 'VALIDATION_FAILED' })
      }
      const rows = await parseSpreadsheet(file)
      return res.json({ success: true, data: { rows, filename: file.originalname } })
    } catch (err) {
      console.error('Parse manifest error:', err)
      return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
    }
  },
)

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
      runBatch(batchId).catch(async err => {
        console.error(`Batch runner failed for ${batchId}:`, err)
        try {
          await db.update(costingBatches)
            .set({ status: 'failed', completed_at: new Date().toISOString() })
            .where(eq(costingBatches.id, batchId))
        } catch { /* best-effort */ }
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

// ─── Spreadsheet parser ───────────────────────────────────────────────────────

type SpreadsheetRow = Record<string, string>

async function parseSpreadsheet(file: Express.Multer.File): Promise<SpreadsheetRow[]> {
  const ext = path.extname(file.originalname).toLowerCase()

  // PDF: extract text with pdf-parse, then use AI to pull structured rows
  if (ext === '.pdf' || file.mimetype === 'application/pdf') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const { text } = await pdfParse(file.buffer)
    const trimmed = text.trim()
    if (!trimmed) return []

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Extract a list of manufacturing parts from the following document text. Output ONLY valid JSON. No markdown fences. No preamble.

Format: {"rows":[{"part_name":"...","description":"...","material":"...","supplier_country":"DE","supplier_currency":"EUR","procurement_type":"in_house","annual_volume":"1000","lot_size":"100"}]}

Rules:
- Only include rows that are clearly distinct parts or components.
- "part_name" is required for each row; all other fields are optional (use empty string if unknown).
- procurement_type must be exactly one of: "in_house", "purchased", "sub_contracted".
- supplier_country must be an ISO 3166-1 alpha-2 code (e.g. "DE", "US", "CN"). Default to "DE" if not specified.
- supplier_currency must be an ISO 4217 currency code (e.g. "EUR", "USD", "CNY"). Default to "EUR" if not specified.
- annual_volume and lot_size must be numeric strings. Default to "1000" and "100" respectively.

Document text:
${trimmed.slice(0, 20000)}`,
      }],
    })
    const content = msg.content[0]
    if (content.type !== 'text') return []
    const result = parseAIJSON<{ rows: SpreadsheetRow[] }>(content.text)
    return (result.rows ?? []).filter(r => !!r.part_name?.trim())
  }

  if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'text/plain') {
    const lines = file.buffer.toString('utf-8').split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: SpreadsheetRow = {}
      headers.forEach((h, i) => { if (h) row[h] = values[i] ?? '' })
      return row
    }).filter(r => !!r.part_name?.trim())
  }

  // Excel (xlsx/xls)
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (wb.xlsx as any).load(file.buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const headers: string[] = []
  const rows: SpreadsheetRow[] = []
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? '').trim().toLowerCase()
      })
    } else {
      const obj: SpreadsheetRow = {}
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const h = headers[colNum - 1]
        if (h) obj[h] = String(cell.value ?? '').trim()
      })
      if (obj.part_name?.trim()) rows.push(obj)
    }
  })
  return rows
}

// ─── POST /bulk-batches/from-spreadsheet ──────────────────────────────────────
router.post(
  '/from-spreadsheet',
  spreadsheetUpload,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user!.id
      const file = req.file
      if (!file) {
        return res.status(400).json({ success: false, error: 'No spreadsheet file provided', error_code: 'VALIDATION_FAILED' })
      }

      const rows = await parseSpreadsheet(file)
      if (!rows.length) {
        return res.status(400).json({
          success: false,
          error: 'No valid rows found. Ensure the spreadsheet has a "part_name" column header in the first row.',
          error_code: 'VALIDATION_FAILED',
        })
      }
      if (rows.length > BULK_MAX_ITEMS) {
        return res.status(400).json({
          success: false,
          error: `Too many rows (${rows.length}). Maximum batch size is ${BULK_MAX_ITEMS}.`,
          error_code: 'BATCH_LIMIT_EXCEEDED',
        })
      }

      const now = new Date().toISOString()
      const batchId = crypto.randomUUID()
      const batchName = `${file.originalname.replace(/\.[^.]+$/, '')} — ${new Date().toLocaleDateString()}`

      await db.insert(costingBatches).values({
        id: batchId,
        name: batchName,
        batch_type: 'bulk',
        status: 'queued',
        total_items: rows.length,
        completed_items: 0,
        failed_items: 0,
        clarification_items: 0,
        shared_params_json: JSON.stringify({}),
        created_by: userId,
        created_at: now,
      })

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const overrides = {
          supplier_country:   row.supplier_country  || row.country  || 'DE',
          supplier_currency:  row.supplier_currency || row.currency || 'EUR',
          procurement_type:   row.procurement_type  || 'in_house',
          annual_volume:      parseFloat(row.annual_volume || row.volume || '1000') || 1000,
          lot_size:           parseFloat(row.lot_size      || row.lot    || '100')  || 100,
          ...(row.description ? { part_description: row.description } : {}),
          ...(row.material    ? { material: row.material } : {}),
        }
        await db.insert(batchItems).values({
          id:            crypto.randomUUID(),
          batch_id:      batchId,
          part_name:     row.part_name.trim(),
          status:        'queued',
          sort_order:    i,
          overrides_json: JSON.stringify(overrides),
          created_at:    now,
        })
      }

      await db.insert(auditLog).values({
        id:          crypto.randomUUID(),
        user_id:     userId,
        action:      'INSERT',
        entity_type: 'costing_batch',
        entity_id:   batchId,
        details:     JSON.stringify({ name: batchName, total_items: rows.length, source: 'spreadsheet', filename: file.originalname }),
        created_at:  now,
      })

      runBatch(batchId).catch(async err => {
        console.error(`Batch runner failed for ${batchId}:`, err)
        try {
          await db.update(costingBatches)
            .set({ status: 'failed', completed_at: new Date().toISOString() })
            .where(eq(costingBatches.id, batchId))
        } catch { /* best-effort */ }
      })

      const [batch] = await db.select().from(costingBatches).where(eq(costingBatches.id, batchId))
      return res.status(201).json({ success: true, data: batch })
    } catch (err) {
      console.error('Create batch from spreadsheet error:', err)
      return res.status(500).json({ success: false, error: 'Internal server error', error_code: 'INTERNAL_ERROR' })
    }
  },
)

// ─── GET /bulk-batches — paginated, filter deleted_at IS NULL ─────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(0, parseInt(String(req.query.page ?? '0'), 10))
    const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize ?? '25'), 10)))
    const showDeleted = req.query.showDeleted === 'true' && (req as any).user!.role === 'admin'

    const conditions: any[] = showDeleted ? [] : [isNull(costingBatches.deleted_at)]

    // admin + developer see all batches; everyone else sees only their own
    const GLOBAL_ROLES = ['admin', 'developer', 'ceo', 'owner']
    if (!GLOBAL_ROLES.includes((req as any).user!.role)) {
      conditions.push(eq(costingBatches.created_by, (req as any).user!.id))
    }

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

    // Auto-recover: if the batch has been processing for >25 min, the Vercel
    // function that ran the runner has been killed. Fail stuck items and close.
    if (batch.status === 'processing') {
      const ageMs = Date.now() - new Date(batch.created_at ?? 0).getTime()
      if (ageMs > 25 * 60 * 1000) {
        const IN_FLIGHT = ['queued', 'analysing', 'searching_kb', 'estimating', 'processing'] as any[]
        await db.update(batchItems)
          .set({ status: 'failed' as any, error_message: 'Batch runner timed out — Vercel function limit exceeded' })
          .where(and(eq(batchItems.batch_id, batch.id), inArray(batchItems.status as any, IN_FLIGHT)))
        await db.update(costingBatches)
          .set({ status: 'completed_with_errors', completed_at: new Date().toISOString() })
          .where(eq(costingBatches.id, batch.id))
        // Re-fetch the updated batch
        const [updated] = await db.select().from(costingBatches).where(eq(costingBatches.id, batch.id))
        if (updated) Object.assign(batch, updated)
      }
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
    runBatch(req.params.id).catch(async err => {
      console.error(`Batch retry runner failed for ${req.params.id}:`, err)
      try {
        await db.update(costingBatches)
          .set({ status: 'failed', completed_at: new Date().toISOString() })
          .where(eq(costingBatches.id, req.params.id))
      } catch { /* best-effort */ }
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

    // Cancel all non-terminal items (queued + any stuck in-flight states)
    await db.update(batchItems)
      .set({ status: 'cancelled' as any, error_message: 'Batch cancelled by user' })
      .where(and(
        eq(batchItems.batch_id, req.params.id),
        inArray(batchItems.status as any, ['queued', 'analysing', 'searching_kb', 'estimating', 'processing']),
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
router.get('/:id/export-excel', requirePlan('pro'), async (req: Request, res: Response) => {
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

// ─── PATCH /bulk-batches/:id/items/:itemId ───────────────────────────────────
const itemEditSchema = z.object({
  part_name:  z.string().min(1).optional(),
  overrides:  z.record(z.any()).optional(),
  rerun:      z.boolean().optional(),
})

router.patch('/:id/items/:itemId', validate(itemEditSchema), async (req: Request, res: Response) => {
  try {
    const [batch] = await db.select().from(costingBatches)
      .where(and(eq(costingBatches.id, req.params.id), isNull(costingBatches.deleted_at)))
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' })

    const [item] = await db.select().from(batchItems)
      .where(and(eq(batchItems.id, req.params.itemId), eq(batchItems.batch_id, req.params.id)))
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' })

    const LOCKED = ['analysing', 'searching_kb', 'estimating']
    if (LOCKED.includes(item.status)) {
      return res.status(409).json({ success: false, error: 'Cannot edit item while it is being processed' })
    }

    const { part_name, overrides, rerun } = req.body
    const updates: Record<string, unknown> = {}
    if (part_name !== undefined) updates.part_name = part_name
    if (overrides !== undefined) updates.overrides_json = JSON.stringify(overrides)
    if (rerun) {
      updates.status            = 'queued'
      updates.error_code        = null
      updates.error_message     = null
      updates.confidence_score  = null
      updates.clarification_json = null
      updates.started_at        = null
      updates.completed_at      = null
    }

    if (Object.keys(updates).length > 0) {
      await db.update(batchItems).set(updates as any).where(eq(batchItems.id, req.params.itemId))
    }

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'batch_item',
      entity_id: req.params.itemId,
      details: JSON.stringify({ action: rerun ? 'edit_rerun' : 'edit', batch_id: req.params.id }),
      created_at: new Date().toISOString(),
    })

    if (rerun) {
      await db.update(costingBatches)
        .set({ status: 'queued', completed_at: null })
        .where(eq(costingBatches.id, req.params.id))
      runBatch(req.params.id).catch(async err => {
        console.error(`Batch runner (item rerun) failed for ${req.params.id}:`, err)
        try {
          await db.update(costingBatches)
            .set({ status: 'failed', completed_at: new Date().toISOString() })
            .where(eq(costingBatches.id, req.params.id))
        } catch { /* best-effort */ }
      })
    }

    const [updated] = await db.select().from(batchItems).where(eq(batchItems.id, req.params.itemId))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Edit batch item error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export { router }
