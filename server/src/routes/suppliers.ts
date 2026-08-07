import { Router, Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { requirePlan } from '../middleware/plan'
import {
  db,
  quotations,
  costLines,
  auditLog,
  suppliers,
  supplierQuotes,
  supplierQuoteLines,
  negotiationReports,
} from '../db/index'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { searchKB } from '../services/kb'
import { parseAIJSON } from '../lib/parseAIJSON'
import { completeWithRouter } from '../services/ai/aiRouter'
import { compareQuoteToSupplier } from '../services/comparison'

const router = Router()

// All routes require authentication + pro plan
router.use(requireAuth, requirePlan('pro'))

// ─── Roles ────────────────────────────────────────────────────────────────────

const WRITE_ROLES   = ['engineer', 'admin', 'cost_analyst', 'ceo', 'developer', 'owner']
const ADMIN_ROLES   = ['admin']

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSupplierSchema = z.object({
  name:          z.string().min(1),
  country_code:  z.string().min(1).max(3),
  city:          z.string().optional(),
  contact_name:  z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  capabilities:  z.array(z.string()).optional(),
  tier_rating:   z.number().int().min(1).max(5).optional(),
  notes:         z.string().optional(),
})

const updateSupplierSchema = createSupplierSchema.partial()

const createQuoteSchema = z.object({
  quotation_id:         z.string().min(1),
  supplier_id:          z.string().min(1),
  status:               z.enum(['draft', 'received', 'compared', 'negotiating', 'accepted', 'rejected']).optional(),
  received_date:        z.string().optional(),
  valid_until_date:     z.string().optional(),
  total_price_eur:      z.number().optional(),
  currency:             z.string().optional(),
  exchange_rate_to_eur: z.number().optional(),
  extraction_method:    z.enum(['manual', 'ai_extracted']).optional(),
  raw_text:             z.string().optional(),
  notes:                z.string().optional(),
})

const updateQuoteSchema = createQuoteSchema.omit({ quotation_id: true, supplier_id: true }).partial()

const suggestSchema = z.object({
  commodity_type: z.string().min(1),
  country:        z.string().optional(),
})

const extractQuoteSchema = z.object({
  supplier_quote_id: z.string().min(1),
  raw_text:          z.string().min(1),
  commodity_type:    z.string().min(1),
})

const compareSchema = z.object({
  quotation_id:      z.string().min(1),
  supplier_quote_id: z.string().min(1),
})

const negotiateSchema = z.object({
  quotation_id:      z.string().min(1),
  supplier_quote_id: z.string().min(1),
})

// ─── GET /api/suppliers ───────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.is_active, true))

    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('List suppliers error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers ──────────────────────────────────────────────────────

router.post('/', requireRole(WRITE_ROLES), validate(createSupplierSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const body = req.body as z.infer<typeof createSupplierSchema>

    const [row] = await db
      .insert(suppliers)
      .values({
        name:          body.name,
        country_code:  body.country_code,
        city:          body.city,
        contact_name:  body.contact_name,
        contact_email: body.contact_email,
        contact_phone: body.contact_phone,
        capabilities:  body.capabilities ? JSON.stringify(body.capabilities) : undefined,
        tier_rating:   body.tier_rating,
        origin:        'manual',
        source_tier:   3,
        is_active:     true,
        notes:         body.notes,
        created_by:    userId,
      })
      .returning()

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_created',
      entity_type: 'supplier',
      entity_id:   row.id,
      details:     JSON.stringify({ name: row.name }),
    })

    return res.status(201).json({ success: true, data: row })
  } catch (err) {
    console.error('Create supplier error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── PATCH /api/suppliers/:id ─────────────────────────────────────────────────

router.patch('/:id', requireRole(WRITE_ROLES), validate(updateSupplierSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params
    const body = req.body as z.infer<typeof updateSupplierSchema>

    const existing = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.is_active, true)))

    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Supplier not found' })
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (body.name          !== undefined) updatePayload.name          = body.name
    if (body.country_code  !== undefined) updatePayload.country_code  = body.country_code
    if (body.city          !== undefined) updatePayload.city          = body.city
    if (body.contact_name  !== undefined) updatePayload.contact_name  = body.contact_name
    if (body.contact_email !== undefined) updatePayload.contact_email = body.contact_email
    if (body.contact_phone !== undefined) updatePayload.contact_phone = body.contact_phone
    if (body.capabilities  !== undefined) updatePayload.capabilities  = JSON.stringify(body.capabilities)
    if (body.tier_rating   !== undefined) updatePayload.tier_rating   = body.tier_rating
    if (body.notes         !== undefined) updatePayload.notes         = body.notes

    const [row] = await db
      .update(suppliers)
      .set(updatePayload as any)
      .where(eq(suppliers.id, id))
      .returning()

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_updated',
      entity_type: 'supplier',
      entity_id:   id,
      details:     JSON.stringify(body),
    })

    return res.json({ success: true, data: row })
  } catch (err) {
    console.error('Update supplier error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── DELETE /api/suppliers/:id — soft delete (admin only) ────────────────────

router.delete('/:id', requireRole(ADMIN_ROLES), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    const existing = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, id))

    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Supplier not found' })
    }

    await db
      .update(suppliers)
      .set({ is_active: false, updated_at: new Date().toISOString() })
      .where(eq(suppliers.id, id))

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_deactivated',
      entity_type: 'supplier',
      entity_id:   id,
      details:     JSON.stringify({ soft_deleted: true }),
    })

    return res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('Delete supplier error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── GET /api/suppliers/for-quote/:quoteId ────────────────────────────────────

router.get('/for-quote/:quoteId', async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params

    const rows = await db
      .select()
      .from(supplierQuotes)
      .where(and(eq(supplierQuotes.quotation_id, quoteId), eq(supplierQuotes.is_active, true)))

    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('List supplier quotes error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers/quote ────────────────────────────────────────────────

router.post('/quote', requireRole(WRITE_ROLES), validate(createQuoteSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const body = req.body as z.infer<typeof createQuoteSchema>

    // Verify quotation exists and is not soft-deleted
    const [quote] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, body.quotation_id), isNull(quotations.deleted_at)))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found' })
    }

    // Verify supplier exists and is active
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, body.supplier_id), eq(suppliers.is_active, true)))

    if (!supplier) {
      return res.status(404).json({ success: false, error: 'Supplier not found' })
    }

    const [row] = await db
      .insert(supplierQuotes)
      .values({
        quotation_id:         body.quotation_id,
        supplier_id:          body.supplier_id,
        status:               body.status ?? 'draft',
        received_date:        body.received_date,
        valid_until_date:     body.valid_until_date,
        total_price_eur:      body.total_price_eur,
        currency:             body.currency,
        exchange_rate_to_eur: body.exchange_rate_to_eur,
        extraction_method:    body.extraction_method ?? 'manual',
        raw_text:             body.raw_text,
        notes:                body.notes,
        is_active:            true,
        created_by:           userId,
      })
      .returning()

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_quote_created',
      entity_type: 'supplier_quote',
      entity_id:   row.id,
      details:     JSON.stringify({ quotation_id: body.quotation_id, supplier_id: body.supplier_id }),
    })

    return res.status(201).json({ success: true, data: row })
  } catch (err) {
    console.error('Create supplier quote error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── PATCH /api/suppliers/quote/:id ──────────────────────────────────────────

router.patch('/quote/:id', requireRole(WRITE_ROLES), validate(updateQuoteSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params
    const body = req.body as z.infer<typeof updateQuoteSchema>

    const existing = await db
      .select()
      .from(supplierQuotes)
      .where(and(eq(supplierQuotes.id, id), eq(supplierQuotes.is_active, true)))

    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Supplier quote not found' })
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    const fields: (keyof typeof body)[] = [
      'status', 'received_date', 'valid_until_date', 'total_price_eur',
      'currency', 'exchange_rate_to_eur', 'extraction_method', 'raw_text', 'notes',
    ]
    for (const f of fields) {
      if (body[f] !== undefined) updatePayload[f] = body[f]
    }

    const [row] = await db
      .update(supplierQuotes)
      .set(updatePayload as any)
      .where(eq(supplierQuotes.id, id))
      .returning()

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_quote_updated',
      entity_type: 'supplier_quote',
      entity_id:   id,
      details:     JSON.stringify(body),
    })

    return res.json({ success: true, data: row })
  } catch (err) {
    console.error('Update supplier quote error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── DELETE /api/suppliers/quote/:id — soft delete ───────────────────────────

router.delete('/quote/:id', requireRole(WRITE_ROLES), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    const existing = await db
      .select()
      .from(supplierQuotes)
      .where(eq(supplierQuotes.id, id))

    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Supplier quote not found' })
    }

    await db
      .update(supplierQuotes)
      .set({ is_active: false, updated_at: new Date().toISOString() })
      .where(eq(supplierQuotes.id, id))

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_quote_deactivated',
      entity_type: 'supplier_quote',
      entity_id:   id,
      details:     JSON.stringify({ soft_deleted: true }),
    })

    return res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('Delete supplier quote error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers/suggest — AI suggest suppliers (KB-first) ────────────

router.post('/suggest', requireRole(WRITE_ROLES), requirePlan('pro'), validate(suggestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { commodity_type, country } = req.body as z.infer<typeof suggestSchema>

    // KB-FIRST: search before Anthropic
    const kbResults = await searchKB(`supplier ${commodity_type} ${country ?? ''}`, commodity_type, 5)
    const kbContext = kbResults.map((r) => r.content).join('\n\n')

    const prompt = `You are a manufacturing supplier discovery expert.

Knowledge base context:
${kbContext}

Task: Suggest 3–5 feasible suppliers for the following requirements:
- Commodity type: ${commodity_type}
${country ? `- Preferred country/region: ${country}` : ''}

Output ONLY valid JSON. No markdown fences. No preamble. No trailing text.

{
  "suppliers": [
    {
      "name": "string",
      "country_code": "ISO 2-letter code",
      "city": "string or null",
      "tier_rating": integer 1-5,
      "capabilities": ["commodity type strings"],
      "reasoning": "brief explanation of why this supplier is a good fit"
    }
  ]
}`

    const raw = await completeWithRouter({
      task:    'supplier_suggest',
      request: {
        systemPrompt: 'You are a manufacturing supplier discovery expert. Output ONLY valid JSON. No markdown fences. No preamble.',
        userPrompt:   prompt,
      },
      userId,
    })

    const parsed = parseAIJSON<{ suppliers: Array<{
      name: string
      country_code: string
      city?: string
      tier_rating?: number
      capabilities?: string[]
      reasoning?: string
    }> }>(raw)

    if (!Array.isArray(parsed.suppliers)) {
      return res.status(500).json({ success: false, error: 'AI_INVALID_RESPONSE: missing suppliers array' })
    }

    // Save each suggested supplier with origin='ai_suggested', source_tier=5
    const saved = []
    for (const s of parsed.suppliers) {
      const [row] = await db
        .insert(suppliers)
        .values({
          name:         s.name,
          country_code: s.country_code ?? 'XX',
          city:         s.city,
          capabilities: s.capabilities ? JSON.stringify(s.capabilities) : undefined,
          tier_rating:  s.tier_rating,
          origin:       'ai_suggested',
          source_tier:  5,
          is_active:    true,
          created_by:   userId,
        })
        .returning()

      saved.push({ ...row, reasoning: s.reasoning })
    }

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_suggest',
      entity_type: 'supplier',
      entity_id:   null,
      details:     JSON.stringify({ commodity_type, country, count: saved.length }),
    })

    return res.json({ success: true, data: saved })
  } catch (err) {
    console.error('Suggest suppliers error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers/extract-quote — AI extract quote lines (KB-first) ────

router.post('/extract-quote', requireRole(WRITE_ROLES), validate(extractQuoteSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { supplier_quote_id, raw_text, commodity_type } = req.body as z.infer<typeof extractQuoteSchema>

    // Verify supplier quote exists and is active
    const [sqRow] = await db
      .select()
      .from(supplierQuotes)
      .where(and(eq(supplierQuotes.id, supplier_quote_id), eq(supplierQuotes.is_active, true)))

    if (!sqRow) {
      return res.status(404).json({ success: false, error: 'Supplier quote not found' })
    }

    // KB-FIRST
    const kbResults = await searchKB(`cost breakdown ${commodity_type}`, commodity_type, 5)
    const kbContext = kbResults.map((r) => r.content).join('\n\n')

    const prompt = `You are a cost engineering expert specialised in parsing supplier quotes.

Knowledge base context:
${kbContext}

Raw supplier quote text:
"""
${raw_text}
"""

Extract all cost line items from the quote above. Assign each to one of these categories:
- material
- manufacturing
- special_direct
- overheads

IMPORTANT RULES:
- Every line MUST have a source_tier (integer 1–5). Assign 5 for AI-extracted data.
- Do NOT omit source_tier from any line.

Output ONLY valid JSON. No markdown fences. No preamble. No trailing text.

{
  "lines": [
    {
      "category": "material|manufacturing|special_direct|overheads",
      "label": "string describing this line",
      "value_eur": number,
      "source_tier": 5,
      "notes": "string or null"
    }
  ]
}`

    const raw2 = await completeWithRouter({
      task:    'extraction',
      request: {
        systemPrompt: 'You are a cost engineering expert. Output ONLY valid JSON. No markdown fences. No preamble.',
        userPrompt:   prompt,
      },
      userId,
    })

    const parsed = parseAIJSON<{ lines: Array<{
      category: string
      label: string
      value_eur: number
      source_tier: number
      notes?: string
    }> }>(raw2)

    if (!Array.isArray(parsed.lines)) {
      return res.status(500).json({ success: false, error: 'AI_INVALID_RESPONSE: missing lines array' })
    }

    // Validate and reject lines missing source_tier
    const invalidLines = parsed.lines.filter(
      (l) => typeof l.source_tier !== 'number' || l.source_tier < 1 || l.source_tier > 5,
    )
    if (invalidLines.length > 0) {
      return res.status(422).json({
        success: false,
        error: `AI_MISSING_SOURCE_TIER: ${invalidLines.length} line(s) missing valid source_tier`,
        invalid_lines: invalidLines,
      })
    }

    const validCategories = ['material', 'manufacturing', 'special_direct', 'overheads']
    const invalidCats = parsed.lines.filter((l) => !validCategories.includes(l.category))
    if (invalidCats.length > 0) {
      return res.status(422).json({
        success: false,
        error: `AI_INVALID_CATEGORY: ${invalidCats.length} line(s) have an invalid category`,
        invalid_lines: invalidCats,
      })
    }

    // Insert all lines
    const inserted = []
    for (const line of parsed.lines) {
      const [row] = await db
        .insert(supplierQuoteLines)
        .values({
          supplier_quote_id: supplier_quote_id,
          category:          line.category as any,
          label:             line.label,
          value_eur:         line.value_eur,
          source_tier:       line.source_tier,
          notes:             line.notes,
        })
        .returning()
      inserted.push(row)
    }

    // Update extraction_method on the parent supplier_quote
    await db
      .update(supplierQuotes)
      .set({ extraction_method: 'ai_extracted', updated_at: new Date().toISOString() })
      .where(eq(supplierQuotes.id, supplier_quote_id))

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_quote_extracted',
      entity_type: 'supplier_quote',
      entity_id:   supplier_quote_id,
      details:     JSON.stringify({ lines_count: inserted.length, commodity_type }),
    })

    return res.json({ success: true, data: inserted })
  } catch (err) {
    console.error('Extract supplier quote error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers/compare — DETERMINISTIC comparison (no AI) ───────────

router.post('/compare', requireRole(WRITE_ROLES), validate(compareSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { quotation_id, supplier_quote_id } = req.body as z.infer<typeof compareSchema>

    // Verify quotation
    const [quote] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, quotation_id), isNull(quotations.deleted_at)))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found' })
    }

    // Verify supplier quote
    const [sq] = await db
      .select()
      .from(supplierQuotes)
      .where(and(eq(supplierQuotes.id, supplier_quote_id), eq(supplierQuotes.is_active, true)))

    if (!sq) {
      return res.status(404).json({ success: false, error: 'Supplier quote not found' })
    }

    // Load our cost_lines for this quotation
    const ourLines = await db
      .select()
      .from(costLines)
      .where(eq(costLines.quotation_id, quotation_id))

    if (!ourLines.length) {
      return res.status(422).json({ success: false, error: 'No cost lines found for this quotation' })
    }

    // Load supplier quote lines
    const sqLines = await db
      .select()
      .from(supplierQuoteLines)
      .where(eq(supplierQuoteLines.supplier_quote_id, supplier_quote_id))

    if (!sqLines.length) {
      return res.status(422).json({ success: false, error: 'No supplier quote lines found — run extract-quote first' })
    }

    // Map to comparison types
    const ourMapped = ourLines.map((l) => ({
      category: l.category,
      label:    l.sub_item,
      cost_eur: l.cost_eur ?? 0,
    }))

    const supplierMapped = sqLines.map((l) => ({
      category:  l.category,
      label:     l.label,
      value_eur: l.value_eur,
    }))

    // DETERMINISTIC comparison — no AI
    const result = compareQuoteToSupplier(ourMapped, supplierMapped)

    // Upsert negotiation_report for this quotation/supplier_quote pair
    const existing = await db
      .select()
      .from(negotiationReports)
      .where(
        and(
          eq(negotiationReports.quotation_id, quotation_id),
          eq(negotiationReports.supplier_quote_id, supplier_quote_id),
          eq(negotiationReports.is_active, true),
        ),
      )

    let reportId: string

    if (existing.length > 0) {
      reportId = existing[0].id
      await db
        .update(negotiationReports)
        .set({
          comparison_json: JSON.stringify(result),
          total_gap_eur:   result.total_gap_eur,
          updated_at:      new Date().toISOString(),
        })
        .where(eq(negotiationReports.id, reportId))
    } else {
      const [newReport] = await db
        .insert(negotiationReports)
        .values({
          quotation_id:      quotation_id,
          supplier_quote_id: supplier_quote_id,
          comparison_json:   JSON.stringify(result),
          total_gap_eur:     result.total_gap_eur,
          status:            'draft',
          is_active:         true,
          created_by:        userId,
        })
        .returning()
      reportId = newReport.id
    }

    // Update supplier_quote status to 'compared'
    await db
      .update(supplierQuotes)
      .set({ status: 'compared', updated_at: new Date().toISOString() })
      .where(eq(supplierQuotes.id, supplier_quote_id))

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'supplier_quote_compared',
      entity_type: 'negotiation_report',
      entity_id:   reportId,
      details:     JSON.stringify({ quotation_id, supplier_quote_id, total_gap_eur: result.total_gap_eur }),
    })

    return res.json({ success: true, data: { report_id: reportId, comparison: result } })
  } catch (err) {
    console.error('Compare supplier error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── POST /api/suppliers/negotiate — AI negotiation talking points (KB-first) ─

router.post('/negotiate', requireRole(WRITE_ROLES), requirePlan('pro'), validate(negotiateSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { quotation_id, supplier_quote_id } = req.body as z.infer<typeof negotiateSchema>

    // Verify quotation
    const [quote] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, quotation_id), isNull(quotations.deleted_at)))

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quotation not found' })
    }

    // Load negotiation report (must exist — run /compare first)
    const [report] = await db
      .select()
      .from(negotiationReports)
      .where(
        and(
          eq(negotiationReports.quotation_id, quotation_id),
          eq(negotiationReports.supplier_quote_id, supplier_quote_id),
          eq(negotiationReports.is_active, true),
        ),
      )

    if (!report) {
      return res.status(422).json({
        success: false,
        error: 'No comparison found — run /compare before /negotiate',
      })
    }

    if (!report.comparison_json) {
      return res.status(422).json({ success: false, error: 'Comparison result is empty' })
    }

    const comparison = JSON.parse(report.comparison_json)
    const ourShouldCost = quote.overall_cost_eur ?? 0

    // Load our cost lines for context
    const ourLines = await db
      .select()
      .from(costLines)
      .where(eq(costLines.quotation_id, quotation_id))

    // KB-FIRST
    const commodityContext = ourLines.length > 0
      ? `Cost engineering for quotation on ${quotation_id}`
      : 'manufacturing cost negotiation'

    const kbResults = await searchKB(
      `negotiation talking points ${commodityContext}`,
      commodityContext,
      5,
    )
    const kbContext = kbResults.map((r) => r.content).join('\n\n')

    const prompt = `You are a cost engineering negotiation expert for Pepperl+Fuchs (P+F).

Knowledge base context:
${kbContext}

Should-cost summary (our internal estimate):
${JSON.stringify(comparison.our_lines, null, 2)}

Supplier quote summary:
${JSON.stringify(comparison.supplier_lines, null, 2)}

Category comparison:
${JSON.stringify(comparison.by_category, null, 2)}

Our total should-cost: €${ourShouldCost.toFixed(2)}
Supplier total: €${comparison.supplier_total.toFixed(2)}
Gap (our - supplier): €${comparison.total_gap_eur.toFixed(2)}

Generate negotiation talking points and a recommended target price.

IMPORTANT: recommended_target_eur must be >= ${ourShouldCost.toFixed(2)} (never below our should-cost).

Output ONLY valid JSON. No markdown fences. No preamble. No trailing text.

{
  "talking_points": ["string", "string", ...],
  "recommended_target_eur": number
}`

    const raw = await completeWithRouter({
      task:    'negotiation',
      request: {
        systemPrompt: 'You are a cost engineering negotiation expert. Output ONLY valid JSON. No markdown fences. No preamble.',
        userPrompt:   prompt,
      },
      userId,
      quoteId: quotation_id,
    })

    const parsed = parseAIJSON<{
      talking_points: string[]
      recommended_target_eur: number
    }>(raw)

    if (!Array.isArray(parsed.talking_points)) {
      return res.status(500).json({ success: false, error: 'AI_INVALID_RESPONSE: missing talking_points array' })
    }

    // Floor recommended_target_eur at our should-cost
    const recommendedTarget = Math.max(parsed.recommended_target_eur ?? ourShouldCost, ourShouldCost)

    await db
      .update(negotiationReports)
      .set({
        talking_points_json:    JSON.stringify(parsed.talking_points),
        recommended_target_eur: recommendedTarget,
        updated_at:             new Date().toISOString(),
      })
      .where(eq(negotiationReports.id, report.id))

    // Update supplier_quote status to 'negotiating'
    await db
      .update(supplierQuotes)
      .set({ status: 'negotiating', updated_at: new Date().toISOString() })
      .where(eq(supplierQuotes.id, supplier_quote_id))

    await db.insert(auditLog).values({
      user_id:     userId,
      action:      'negotiation_report_generated',
      entity_type: 'negotiation_report',
      entity_id:   report.id,
      details:     JSON.stringify({
        quotation_id,
        supplier_quote_id,
        recommended_target_eur: recommendedTarget,
        talking_points_count: parsed.talking_points.length,
      }),
    })

    return res.json({
      success: true,
      data: {
        report_id:              report.id,
        talking_points:         parsed.talking_points,
        recommended_target_eur: recommendedTarget,
      },
    })
  } catch (err) {
    console.error('Negotiate error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

// ─── GET /api/suppliers/negotiation/:quoteId ──────────────────────────────────

router.get('/negotiation/:quoteId', async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params

    const rows = await db
      .select()
      .from(negotiationReports)
      .where(and(eq(negotiationReports.quotation_id, quoteId), eq(negotiationReports.is_active, true)))

    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Get negotiation error:', err)
    return res.status(500).json({ success: false, error: String(err) })
  }
})

export { router }
