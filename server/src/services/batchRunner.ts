import { eq, and, sql } from 'drizzle-orm'
import { db, costingBatches, batchItems, parts, quotations } from '../db/index'
import { analyseDrawing, costOnePart, persistQuoteFromResult } from './ai'
import { notifyUsers, getUsersByRole } from './notifications'
import { BULK_CONCURRENCY } from '../config'

import type { CostInput } from '../../../shared/types/ai'
import type { SharedBatchParams } from '../../../shared/types/batch'

// ─── In-memory guard (prevents double-run within same process) ────────────────

const running = new Set<string>()

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function setItemStatus(
  itemId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(batchItems)
    .set({
      status,
      ...(status === 'analysing' || status === 'searching_kb' || status === 'estimating'
        ? { started_at: new Date().toISOString() }
        : {}),
      ...(status === 'completed' || status === 'failed' || status === 'needs_clarification'
        ? { completed_at: new Date().toISOString() }
        : {}),
      ...(extra as any),
    })
    .where(eq(batchItems.id, itemId))
}

async function setBatchStatus(
  batchId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(costingBatches)
    .set({
      status,
      ...(extra as any),
    })
    .where(eq(costingBatches.id, batchId))
}

async function bumpCounter(
  batchId: string,
  field: 'completed_items' | 'failed_items' | 'clarification_items',
): Promise<void> {
  await db
    .update(costingBatches)
    .set({
      [field]: sql`${costingBatches[field]} + 1`,
    })
    .where(eq(costingBatches.id, batchId))
}

async function getQueuedItems(batchId: string) {
  return db
    .select()
    .from(batchItems)
    .where(and(eq(batchItems.batch_id, batchId), eq(batchItems.status, 'queued')))
    .orderBy(batchItems.sort_order)
}

function buildCostInput(
  item: {
    id: string
    batch_id: string
    part_id: string | null
    part_name: string
    source_file_path: string | null
    overrides_json: string | null
  },
  sharedParams: SharedBatchParams,
  drawingAnalysis: Awaited<ReturnType<typeof analyseDrawing>> | null,
  quotationId: string,
  partData: {
    id: string
    part_name: string
    part_number: string | null
    drawing_number: string | null
    commodity_type: string | null
    material_grade: string | null
    dimensions_json: string | null
    net_weight_g: number | null
    surface_finish: string | null
    tolerance_class: string | null
  } | null,
): CostInput {
  // Merge shared params with per-item overrides
  const overrides: Partial<SharedBatchParams> = item.overrides_json
    ? JSON.parse(item.overrides_json)
    : {}
  const merged: SharedBatchParams = { ...sharedParams, ...overrides }

  const partObj = partData
    ? {
        id: partData.id,
        part_name: partData.part_name,
        part_number: partData.part_number,
        drawing_number: partData.drawing_number,
        commodity_type: (partData.commodity_type ?? drawingAnalysis?.commodity_type ?? null) as any,
        material_grade: partData.material_grade ?? drawingAnalysis?.material_grade ?? null,
        dimensions_json: partData.dimensions_json
          ? JSON.parse(partData.dimensions_json)
          : drawingAnalysis?.dimensions_json ?? null,
        net_weight_g: partData.net_weight_g ?? drawingAnalysis?.net_weight_g ?? null,
        surface_finish: partData.surface_finish ?? drawingAnalysis?.surface_finish ?? null,
        tolerance_class: partData.tolerance_class ?? drawingAnalysis?.tolerance_class ?? null,
      }
    : {
        id: item.part_id ?? item.id,
        part_name: item.part_name,
        part_number: null,
        drawing_number: null,
        commodity_type: drawingAnalysis?.commodity_type ?? null,
        material_grade: drawingAnalysis?.material_grade ?? null,
        dimensions_json: drawingAnalysis?.dimensions_json ?? null,
        net_weight_g: drawingAnalysis?.net_weight_g ?? null,
        surface_finish: drawingAnalysis?.surface_finish ?? null,
        tolerance_class: drawingAnalysis?.tolerance_class ?? null,
      }

  return {
    quotation_id: quotationId,
    part: partObj,
    production: {
      supplier_country: merged.supplier_country,
      supplier_currency: merged.supplier_currency,
      annual_volume: merged.annual_volume,
      lot_size: merged.lot_size,
      lots_per_year: merged.lots_per_year,
      shifts_per_day: merged.shifts_per_day,
      annual_production_hours: merged.annual_production_hours,
      procurement_type: merged.procurement_type,
      current_cart_price: merged.current_cart_price ?? null,
      target_cart_price: merged.target_cart_price ?? null,
    },
    drawing_analysis: drawingAnalysis,
    modified_process_steps: null,
    exchange_rate: merged.exchange_rate,
    exchange_rate_source: merged.exchange_rate_source,
  }
}

// ─── runBatch ─────────────────────────────────────────────────────────────────

export async function runBatch(batchId: string): Promise<void> {
  // Guard: prevent double-run
  if (running.has(batchId)) return
  running.add(batchId)

  try {
    // Load batch
    const batch = await db.query.costingBatches.findFirst({
      where: eq(costingBatches.id, batchId),
    })
    if (!batch) {
      running.delete(batchId)
      return
    }

    // Check it hasn't been cancelled
    if (batch.status === 'cancelled') {
      running.delete(batchId)
      return
    }

    // Set processing
    await setBatchStatus(batchId, 'processing', { started_at: new Date().toISOString() })

    // Load queued items
    const items = await getQueuedItems(batchId)

    const sharedParams: SharedBatchParams = batch.shared_params_json
      ? JSON.parse(batch.shared_params_json)
      : {
          supplier_country: 'CN',
          supplier_currency: 'CNY',
          annual_volume: 10000,
          lot_size: 1000,
          lots_per_year: 10,
          shifts_per_day: 2,
          annual_production_hours: 4000,
          procurement_type: 'in_house',
          exchange_rate: 7.8,
          exchange_rate_source: 'default',
        }

    // p-limit — ESM-only package, MUST use dynamic import
    const { default: pLimit } = await import('p-limit')
    const limit = pLimit(BULK_CONCURRENCY)

    const tasks = items.map((item) =>
      limit(async () => {
        // Create a draft quotation row so we have an ID for cost sub-rows
        const quotationInsert = await db
          .insert(quotations)
          .values({
            part_id: item.part_id ?? null,
            batch_id: batchId,
            quote_type: 'individual',
            status: 'draft',
            margin_applied: false,
          })
          .returning({ id: quotations.id })
        const quotationId = quotationInsert[0].id

        try {
          // ── Phase 1: analyse drawing ─────────────────────────────────────────
          await setItemStatus(item.id, 'analysing')

          let drawingAnalysis: Awaited<ReturnType<typeof analyseDrawing>> | null = null
          if (item.source_file_path) {
            const ext = item.source_file_path.split('.').pop()?.toLowerCase() ?? 'pdf'
            drawingAnalysis = await analyseDrawing(
              item.source_file_path,
              ext,
              item.source_file_name ?? item.source_file_path,
            )
          }

          // ── Phase 2: KB search (status update only — actual search is inside costOnePart) ─
          await setItemStatus(item.id, 'searching_kb')

          // ── Phase 3: estimate ────────────────────────────────────────────────
          await setItemStatus(item.id, 'estimating')

          // Load part data if available
          let partData = null
          if (item.part_id) {
            partData = await db.query.parts.findFirst({
              where: eq(parts.id, item.part_id),
            })
          }

          const costInput = buildCostInput(item, sharedParams, drawingAnalysis, quotationId, partData ?? null)
          const result = await costOnePart(costInput)

          if ((result.confidence_score ?? 0) < 70) {
            // Needs clarification
            await setItemStatus(item.id, 'needs_clarification', {
              confidence_score: result.confidence_score,
              clarification_json: JSON.stringify(result.clarification_questions ?? []),
              quotation_id: quotationId,
            })
            await bumpCounter(batchId, 'clarification_items')
          } else {
            // Success — link quotation
            await setItemStatus(item.id, 'completed', {
              quotation_id: quotationId,
              confidence_score: result.confidence_score,
            })
            await bumpCounter(batchId, 'completed_items')
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          const errCode = errMsg.startsWith('INVALID_SOURCE_TIER')
            ? 'INVALID_SOURCE_TIER'
            : errMsg.startsWith('AI_INVALID_JSON')
            ? 'AI_INVALID_JSON'
            : 'COST_ESTIMATION_ERROR'

          await setItemStatus(item.id, 'failed', {
            error_code: errCode,
            error_message: errMsg.slice(0, 1000),
          })
          await bumpCounter(batchId, 'failed_items')
        }
      }),
    )

    await Promise.all(tasks)

    // ── Finalise batch ────────────────────────────────────────────────────────
    // Re-read counters
    const finalBatch = await db.query.costingBatches.findFirst({
      where: eq(costingBatches.id, batchId),
    })

    if (!finalBatch) {
      running.delete(batchId)
      return
    }

    // Check for cancellation
    if (finalBatch.status === 'cancelled') {
      running.delete(batchId)
      return
    }

    const allItems = finalBatch.total_items ?? items.length
    const completed = finalBatch.completed_items ?? 0
    const failed = finalBatch.failed_items ?? 0
    const clarification = finalBatch.clarification_items ?? 0

    let finalStatus: string
    if (failed === 0 && clarification === 0 && completed === allItems) {
      finalStatus = 'completed'
    } else if (completed > 0 || failed > 0 || clarification > 0) {
      finalStatus = 'completed_with_errors'
    } else {
      finalStatus = 'failed'
    }

    await setBatchStatus(batchId, finalStatus, {
      completed_at: new Date().toISOString(),
    })

    // ── Notify batch creator ──────────────────────────────────────────────────
    if (finalBatch.created_by) {
      const adminIds = await getUsersByRole(['admin', 'cost_analyst'])
      const notifyIds = Array.from(
        new Set([finalBatch.created_by, ...adminIds]),
      )

      await notifyUsers(
        notifyIds,
        'batch_completed',
        `Batch "${finalBatch.name}" ${finalStatus}`,
        `Completed: ${completed}, Failed: ${failed}, Needs Clarification: ${clarification} / Total: ${allItems}`,
        { related_batch_id: batchId },
      )
    }
  } finally {
    running.delete(batchId)
  }
}

// ─── isBatchRunning (for health-check routes) ─────────────────────────────────

export function isBatchRunning(batchId: string): boolean {
  return running.has(batchId)
}
