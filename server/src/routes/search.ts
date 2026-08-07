import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { db } from '../db/index'
import { quotations, parts, costingBatches, suppliers, assemblyComponents } from '../db/schema'
import { and, isNull, like, or, eq } from 'drizzle-orm'

export const router = Router()

router.use(requireAuth)

// GET /api/search?q=<query>&limit=<n>
// Searches quotations, suppliers, batches — grouped results
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim()
    const limit = Math.min(Number(req.query.limit ?? 20), 50)

    if (!q || q.length < 2) {
      return res.json({ success: true, data: { quotations: [], suppliers: [], batches: [] } })
    }

    const pattern = `%${q}%`

    // Search parts → quotations
    const matchedParts = await db
      .select({
        part_id: parts.id,
        part_name: parts.part_name,
        part_number: parts.part_number,
        commodity_type: parts.commodity_type,
      })
      .from(parts)
      .where(
        or(
          like(parts.part_name, pattern),
          like(parts.part_number, pattern),
          like(parts.commodity_type, pattern),
        )
      )
      .limit(limit)

    const partIds = matchedParts.map(p => p.part_id)

    const quoteResults = partIds.length > 0
      ? await db
          .select({
            id: quotations.id,
            status: quotations.status,
            quote_type: quotations.quote_type,
            confidence_score: quotations.confidence_score,
            overall_cost_eur: quotations.overall_cost_eur,
            created_at: quotations.created_at,
            part_id: quotations.part_id,
          })
          .from(quotations)
          .where(
            and(
              isNull(quotations.deleted_at),
            )
          )
          .limit(limit)
      : []

    // Attach part info to quotes
    const partMap = Object.fromEntries(matchedParts.map(p => [p.part_id, p]))
    const quoteResultsMapped = quoteResults
      .filter(q => q.part_id && partMap[q.part_id])
      .map(q => ({
        ...q,
        part: partMap[q.part_id!],
      }))

    // Search suppliers
    const supplierResults = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        country_code: suppliers.country_code,
        city: suppliers.city,
        origin: suppliers.origin,
        tier_rating: suppliers.tier_rating,
      })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.is_active, true),
          or(
            like(suppliers.name, pattern),
            like(suppliers.city, pattern),
            like(suppliers.country_code, pattern),
          )
        )
      )
      .limit(limit)

    // Search batches
    const batchResults = await db
      .select({
        id: costingBatches.id,
        name: costingBatches.name,
        batch_type: costingBatches.batch_type,
        status: costingBatches.status,
        total_items: costingBatches.total_items,
        processed_items: costingBatches.completed_items,
        created_at: costingBatches.created_at,
      })
      .from(costingBatches)
      .where(
        and(
          isNull(costingBatches.deleted_at),
          like(costingBatches.name, pattern),
        )
      )
      .limit(10)

    res.json({
      success: true,
      data: {
        quotations: quoteResultsMapped.slice(0, limit),
        suppliers: supplierResults,
        batches: batchResults,
        query: q,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})
