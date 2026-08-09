import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import { kbUpload, saveUploadedFile } from '../middleware/upload'
import {
  db,
  kbDocuments,
  kbChunks,
  kbEntries,
  regionalRates,
  auditLog,
} from '../db/index'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { ingestDocument } from '../services/kb'

const router = Router()

router.use(requireAuth, requirePlan('organization'))

// ─── Schemas ─────────────────────────────────────────────────────────────────

const kbEntrySchema = z.object({
  material_name: z.string().min(1),
  commodity_type: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  value_min: z.number().nullable().optional(),
  value_max: z.number().nullable().optional(),
  value_typical: z.number().nullable().optional(),
  unit: z.string().min(1),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
})

const kbEntryUpdateSchema = kbEntrySchema.partial()

const regionalRateSchema = z.object({
  country_code: z.string().min(1).max(10),
  country_name: z.string().min(1),
  labour_rate_usd_hr: z.number().nonnegative(),
  machine_overhead_pct: z.number().nonnegative(),
  electricity_cost_kwh: z.number().nonnegative(),
  factory_space_usd_m2_yr: z.number().nonnegative(),
  effective_date: z.string().min(1),
  is_active: z.boolean().optional().default(true),
})

const regionalRateUpdateSchema = regionalRateSchema.partial()

// ─── KB Documents ─────────────────────────────────────────────────────────────

// GET /kb/documents — metadata only (no chunk content)
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const docs = await db.select({
      id: kbDocuments.id,
      filename: kbDocuments.filename,
      original_name: kbDocuments.original_name,
      file_path: kbDocuments.file_path,
      file_size_bytes: kbDocuments.file_size_bytes,
      mime_type: kbDocuments.mime_type,
      chunk_count: kbDocuments.chunk_count,
      is_active: kbDocuments.is_active,
      description: kbDocuments.description,
      commodity_tags: kbDocuments.commodity_tags,
      ingested_at: kbDocuments.ingested_at,
      ingested_by: kbDocuments.ingested_by,
      created_at: kbDocuments.created_at,
    }).from(kbDocuments)

    const parsed = docs.map(d => ({
      ...d,
      commodity_tags: d.commodity_tags ? JSON.parse(d.commodity_tags as string) : [],
    }))

    return res.json({ success: true, data: parsed })
  } catch (err) {
    console.error('List KB docs error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /kb/documents/upload — admin only; kbUpload middleware handles single PDF
router.post(
  '/documents/upload',
  requireRole(['admin', 'developer']),
  kbUpload,
  async (req: Request, res: Response) => {
    try {
      const file = req.file
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          error_code: 'FILE_MISSING',
        })
      }

      const userId = (req as any).user!.id
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const commodityTags = req.body.commodity_tags
        ? JSON.parse(req.body.commodity_tags)
        : []

      const savedPath = await saveUploadedFile(file, 'kb')

      await db.insert(kbDocuments).values({
        id,
        filename: savedPath.split('/').pop() ?? file.originalname,
        original_name: file.originalname,
        file_path: savedPath,
        file_size_bytes: file.size,
        mime_type: file.mimetype,
        chunk_count: 0,
        is_active: true,
        description: req.body.description ?? null,
        commodity_tags: JSON.stringify(commodityTags),
        ingested_by: userId,
        created_at: now,
      })

      // Fire-and-forget ingestion
      ingestDocument(id, savedPath, commodityTags).catch(err => {
        console.error(`KB ingestion failed for doc ${id}:`, err)
      })

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        user_id: userId,
        action: 'INSERT',
        entity_type: 'kb_documents',
        entity_id: id,
        details: JSON.stringify({ original_name: file.originalname }),
        created_at: now,
      })

      const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id))
      return res.status(201).json({
        success: true,
        data: {
          ...doc,
          commodity_tags: doc?.commodity_tags ? JSON.parse(doc.commodity_tags as string) : [],
        },
      })
    } catch (err) {
      console.error('KB upload error:', err)
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      })
    }
  },
)

// POST /kb/documents/:id/reindex — admin only
router.post('/documents/:id/reindex', requireRole(['admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, req.params.id))
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'KB document not found',
        error_code: 'DOCUMENT_NOT_FOUND',
      })
    }

    // Delete existing chunks
    await db.delete(kbChunks).where(eq(kbChunks.document_id, req.params.id))

    // Re-ingest synchronously so we can return the chunk count
    const commodityTags = doc.commodity_tags ? JSON.parse(doc.commodity_tags as string) : []
    const chunksCreated = await ingestDocument(req.params.id, doc.file_path, commodityTags)

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'kb_documents',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'reindex', chunks_created: chunksCreated }),
      created_at: new Date().toISOString(),
    })

    return res.json({ success: true, data: { chunks_created: chunksCreated } })
  } catch (err) {
    console.error('KB reindex error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// DELETE /kb/documents/:id — admin only (soft deactivate + delete chunks)
router.delete('/documents/:id', requireRole(['admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, req.params.id))
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'KB document not found',
        error_code: 'DOCUMENT_NOT_FOUND',
      })
    }

    await db.update(kbDocuments).set({ is_active: false }).where(eq(kbDocuments.id, req.params.id))
    await db.delete(kbChunks).where(eq(kbChunks.document_id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'DELETE',
      entity_type: 'kb_documents',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'deactivate_and_delete_chunks' }),
      created_at: new Date().toISOString(),
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('KB delete error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── KB Entries ───────────────────────────────────────────────────────────────

// GET /kb/entries — non-admin: mask value_min/max/typical as null
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!
    const entries = await db.select().from(kbEntries)

    const data = entries.map(e => {
      if (user.role === 'admin') return e
      return {
        ...e,
        value_min: null,
        value_max: null,
        value_typical: null,
      }
    })

    return res.json({ success: true, data })
  } catch (err) {
    console.error('List KB entries error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /kb/entries — admin only
router.post('/entries', requireRole(['admin', 'developer']), validate(kbEntrySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = (req as any).user!.id

    await db.insert(kbEntries).values({
      id,
      material_name: body.material_name,
      commodity_type: body.commodity_type ?? null,
      region: body.region ?? null,
      value_min: body.value_min ?? null,
      value_max: body.value_max ?? null,
      value_typical: body.value_typical ?? null,
      unit: body.unit,
      notes: body.notes ?? null,
      is_active: body.is_active ?? true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    })

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'INSERT',
      entity_type: 'kb_entries',
      entity_id: id,
      details: JSON.stringify({ material_name: body.material_name }),
      created_at: now,
    })

    const [entry] = await db.select().from(kbEntries).where(eq(kbEntries.id, id))
    return res.status(201).json({ success: true, data: entry })
  } catch (err) {
    console.error('Create KB entry error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /kb/entries/:id — admin only
router.patch('/entries/:id', requireRole(['admin', 'developer']), validate(kbEntryUpdateSchema), async (req: Request, res: Response) => {
  try {
    const [entry] = await db.select().from(kbEntries).where(eq(kbEntries.id, req.params.id))
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'KB entry not found',
        error_code: 'ENTRY_NOT_FOUND',
      })
    }

    const now = new Date().toISOString()
    await db.update(kbEntries)
      .set({ ...req.body, updated_at: now })
      .where(eq(kbEntries.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'kb_entries',
      entity_id: req.params.id,
      details: JSON.stringify({ updates: req.body }),
      created_at: now,
    })

    const [updated] = await db.select().from(kbEntries).where(eq(kbEntries.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Update KB entry error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /kb/entries/:id/deactivate — admin only
router.patch('/entries/:id/deactivate', requireRole(['admin', 'developer']), async (req: Request, res: Response) => {
  try {
    const [entry] = await db.select().from(kbEntries).where(eq(kbEntries.id, req.params.id))
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'KB entry not found',
        error_code: 'ENTRY_NOT_FOUND',
      })
    }

    const now = new Date().toISOString()
    await db.update(kbEntries)
      .set({ is_active: false, updated_at: now })
      .where(eq(kbEntries.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'kb_entries',
      entity_id: req.params.id,
      details: JSON.stringify({ action: 'deactivate' }),
      created_at: now,
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('Deactivate KB entry error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── Regional Rates ───────────────────────────────────────────────────────────

// GET /kb/regional-rates — all roles
router.get('/regional-rates', async (req: Request, res: Response) => {
  try {
    const rates = await db.select().from(regionalRates)
    return res.json({ success: true, data: rates })
  } catch (err) {
    console.error('List regional rates error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// POST /kb/regional-rates — admin only
router.post('/regional-rates', requireRole(['admin', 'developer']), validate(regionalRateSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const userId = (req as any).user!.id

    await db.insert(regionalRates).values({
      id,
      country_code: body.country_code,
      country_name: body.country_name,
      labour_rate_usd_hr: body.labour_rate_usd_hr,
      machine_overhead_pct: body.machine_overhead_pct,
      electricity_cost_kwh: body.electricity_cost_kwh,
      factory_space_usd_m2_yr: body.factory_space_usd_m2_yr,
      effective_date: body.effective_date,
      is_active: body.is_active ?? true,
      created_at: now,
      updated_at: now,
    })

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: userId,
      action: 'INSERT',
      entity_type: 'regional_rates',
      entity_id: id,
      details: JSON.stringify({ country_code: body.country_code }),
      created_at: now,
    })

    const [rate] = await db.select().from(regionalRates).where(eq(regionalRates.id, id))
    return res.status(201).json({ success: true, data: rate })
  } catch (err) {
    console.error('Create regional rate error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// PATCH /kb/regional-rates/:id — admin only
router.patch('/regional-rates/:id', requireRole(['admin', 'developer']), validate(regionalRateUpdateSchema), async (req: Request, res: Response) => {
  try {
    const [rate] = await db.select().from(regionalRates).where(eq(regionalRates.id, req.params.id))
    if (!rate) {
      return res.status(404).json({
        success: false,
        error: 'Regional rate not found',
        error_code: 'RATE_NOT_FOUND',
      })
    }

    const now = new Date().toISOString()
    await db.update(regionalRates)
      .set({ ...req.body, updated_at: now })
      .where(eq(regionalRates.id, req.params.id))

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      user_id: (req as any).user!.id,
      action: 'UPDATE',
      entity_type: 'regional_rates',
      entity_id: req.params.id,
      details: JSON.stringify({ updates: req.body }),
      created_at: now,
    })

    const [updated] = await db.select().from(regionalRates).where(eq(regionalRates.id, req.params.id))
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('Update regional rate error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    })
  }
})

// ─── GET /kb/search?q=... — live KB search preview ───────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (!q) return res.json({ success: true, data: [] })

    const { searchKB } = await import('../services/kb')
    // commodity type left empty for cross-commodity preview search; topK=5
    const results = await searchKB(q, '', 5)

    return res.json({
      success: true,
      data: results.map((r, i) => ({
        id:         i,
        content:    r.content.slice(0, 200),
        similarity: Number(r.similarity.toFixed(3)),
      })),
    })
  } catch (err) {
    console.error('KB search error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

export { router }
