import { eq, and, isNull } from 'drizzle-orm'
import { db, quotations, assemblyComponents, costLines, parts } from '../db/index'
import { MARGIN_PCT, MAX_ASSEMBLY_DEPTH } from '../config'

import type { AssemblyRollup } from '../../../shared/types/assembly'

// ─── Error helpers ────────────────────────────────────────────────────────────

class AssemblyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AssemblyError'
  }
}

// ─── rollupAssembly ───────────────────────────────────────────────────────────

export async function rollupAssembly(assemblyId: string): Promise<AssemblyRollup> {
  // Load all edges for this assembly
  const edges = await db
    .select()
    .from(assemblyComponents)
    .where(eq(assemblyComponents.assembly_quotation_id, assemblyId))
    .orderBy(assemblyComponents.sort_order)

  let totalCost = 0
  let confNum = 0 // weighted confidence numerator
  let confDen = 0 // weighted confidence denominator

  let subtotalComponentCost = 0
  let subtotalPurchasedCost = 0
  let costedCount = 0
  let purchasedCount = 0
  let uncostedCount = 0

  const componentLines: Array<{
    label: string
    cost_eur: number
    source_tier: number
    component_quotation_id: string | null
    is_purchased_standard: boolean
  }> = []

  for (const edge of edges) {
    const qty = edge.quantity_per_assembly ?? 1

    if (edge.is_purchased_standard) {
      // Purchased standard: use provided unit cost
      if (edge.unit_cost_eur == null) {
        throw new AssemblyError(
          'PURCHASED_COMPONENT_NO_COST',
          `Assembly component (id=${edge.id}) is_purchased_standard=true but has no unit_cost_eur`,
          422,
        )
      }
      const lineCost = edge.unit_cost_eur * qty
      totalCost += lineCost
      subtotalPurchasedCost += lineCost
      purchasedCount++

      // Purchased components contribute to confidence with tier-based score
      const tier = edge.unit_cost_source_tier ?? 4
      const tierConfidence = tierToConfidence(tier)
      confNum += tierConfidence * lineCost
      confDen += lineCost

      componentLines.push({
        label: `Purchased component ×${qty}`,
        cost_eur: lineCost,
        source_tier: tier,
        component_quotation_id: null,
        is_purchased_standard: true,
      })
    } else {
      // Manufactured component: must have a linked quotation with a cost
      if (!edge.component_quotation_id) {
        uncostedCount++
        continue
      }

      const childQuote = await db.query.quotations.findFirst({
        where: and(
          eq(quotations.id, edge.component_quotation_id),
          isNull(quotations.deleted_at),
        ),
      })

      if (!childQuote) {
        uncostedCount++
        continue
      }

      if (childQuote.overall_cost_eur == null) {
        throw new AssemblyError(
          'COMPONENT_NOT_COSTED',
          `Child quotation ${edge.component_quotation_id} has no overall_cost_eur — run cost estimation first`,
          422,
        )
      }

      const lineCost = childQuote.overall_cost_eur * qty
      totalCost += lineCost
      subtotalComponentCost += lineCost
      costedCount++

      // Weighted confidence from child quote
      const childConf = childQuote.confidence_score ?? 50
      confNum += childConf * lineCost
      confDen += lineCost

      componentLines.push({
        label: `Component ×${qty} (quote ${edge.component_quotation_id})`,
        cost_eur: lineCost,
        source_tier: 1, // from actual quotation
        component_quotation_id: edge.component_quotation_id,
        is_purchased_standard: false,
      })
    }
  }

  // Add assembly-level cost_lines (category='assembly')
  const assemblyOpsLines = await db
    .select()
    .from(costLines)
    .where(
      and(
        eq(costLines.quotation_id, assemblyId),
        eq(costLines.category, 'assembly'),
      ),
    )

  for (const line of assemblyOpsLines) {
    const lineCost = line.cost_eur ?? 0
    totalCost += lineCost
    const lineConf = 75 // default confidence for assembly ops
    confNum += lineConf * lineCost
    confDen += lineCost
  }

  const overallCostEur = totalCost
  const confidence = confDen > 0 ? confNum / confDen : null

  // ── Margin applied ONCE at the assembly parent ────────────────────────────
  // Load the assembly quotation's margin_pct (fall back to global config)
  const assemblyQuotation = await db.query.quotations.findFirst({
    where: eq(quotations.id, assemblyId),
  })
  const marginPct = assemblyQuotation?.margin_pct ?? MARGIN_PCT
  const finalPriceEur = overallCostEur * (1 + marginPct / 100)

  // ── Save rollup to quotation ──────────────────────────────────────────────
  const rollupPayload: AssemblyRollup = {
    assembly_quotation_id: assemblyId,
    total_components: edges.length,
    costed_components: costedCount,
    purchased_components: purchasedCount,
    uncosted_components: uncostedCount,
    subtotal_component_cost_eur: subtotalComponentCost,
    subtotal_purchased_cost_eur: subtotalPurchasedCost,
    overall_cost_eur: overallCostEur,
    average_confidence_score: confidence,
    components: [], // populated below if needed by caller
  }

  await db
    .update(quotations)
    .set({
      overall_cost_eur: overallCostEur,
      confidence_score: confidence,
      final_price_eur: finalPriceEur,
      margin_applied: true,
      rollup_json: JSON.stringify(rollupPayload),
      updated_at: new Date().toISOString(),
    })
    .where(eq(quotations.id, assemblyId))

  // ── Recreate 'component' category cost_lines for this assembly ────────────
  await db
    .delete(costLines)
    .where(
      and(
        eq(costLines.quotation_id, assemblyId),
        eq(costLines.category, 'component'),
      ),
    )

  for (let i = 0; i < componentLines.length; i++) {
    const cl = componentLines[i]
    await db.insert(costLines).values({
      quotation_id: assemblyId,
      category: 'component',
      sub_item: cl.label,
      cost_eur: cl.cost_eur,
      source_tier: cl.source_tier,
      source_label: cl.is_purchased_standard ? 'Purchased standard' : 'Child quotation',
      component_quotation_id: cl.component_quotation_id,
      is_assumed: false,
      display_order: i + 1,
    })
  }

  return rollupPayload
}

// ─── validateAssemblyAdd ──────────────────────────────────────────────────────

export async function validateAssemblyAdd(
  assemblyId: string,
  componentId: string,
): Promise<void> {
  // Check for circular reference: walk ancestors of assemblyId
  const visited = new Set<string>()
  await checkCircular(assemblyId, componentId, visited)

  // Check assembly depth: load the assembly quotation
  const assemblyQuote = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, assemblyId), isNull(quotations.deleted_at)),
  })
  if (!assemblyQuote) throw new AssemblyError('ASSEMBLY_NOT_FOUND', `Assembly ${assemblyId} not found`, 404)

  const currentDepth = assemblyQuote.assembly_level ?? 0
  if (currentDepth + 1 > MAX_ASSEMBLY_DEPTH) {
    throw new AssemblyError(
      'ASSEMBLY_DEPTH_EXCEEDED',
      `Adding this component would exceed the maximum assembly depth of ${MAX_ASSEMBLY_DEPTH}`,
      400,
    )
  }
}

async function checkCircular(
  assemblyId: string,
  incomingComponentId: string,
  visited: Set<string>,
): Promise<void> {
  if (visited.has(assemblyId)) return
  visited.add(assemblyId)

  if (assemblyId === incomingComponentId) {
    throw new AssemblyError(
      'ASSEMBLY_CIRCULAR_REF',
      `Adding component ${incomingComponentId} would create a circular reference`,
      422,
    )
  }

  // Find parents of assemblyId (assemblies that contain assemblyId as a component)
  const parentEdges = await db
    .select({ parent_id: assemblyComponents.assembly_quotation_id })
    .from(assemblyComponents)
    .where(eq(assemblyComponents.component_quotation_id, assemblyId))

  for (const edge of parentEdges) {
    await checkCircular(edge.parent_id, incomingComponentId, visited)
  }
}

// ─── getAssemblyTree ──────────────────────────────────────────────────────────

export async function getAssemblyTree(assemblyId: string, depth = 0): Promise<AssemblyTreeNode> {
  const quote = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, assemblyId), isNull(quotations.deleted_at)),
  })

  if (!quote) throw new AssemblyError('ASSEMBLY_NOT_FOUND', `Assembly ${assemblyId} not found`, 404)

  const edges = await db
    .select()
    .from(assemblyComponents)
    .where(eq(assemblyComponents.assembly_quotation_id, assemblyId))
    .orderBy(assemblyComponents.sort_order)

  const children: AssemblyTreeNode[] = []

  if (depth < 3) {
    for (const edge of edges) {
      if (edge.is_purchased_standard) {
        children.push({
          quotation_id: null,
          part_id: edge.component_part_id ?? null,
          is_purchased_standard: true,
          quantity: edge.quantity_per_assembly ?? 1,
          unit_cost_eur: edge.unit_cost_eur ?? null,
          children: [],
          quote_type: 'component',
          overall_cost_eur: edge.unit_cost_eur ?? null,
          confidence_score: null,
          status: 'purchased',
        })
      } else if (edge.component_quotation_id) {
        const child = await db.query.quotations.findFirst({
          where: and(
            eq(quotations.id, edge.component_quotation_id),
            isNull(quotations.deleted_at),
          ),
        })
        if (child) {
          let childNode: AssemblyTreeNode
          if (child.quote_type === 'assembly') {
            childNode = await getAssemblyTree(child.id, depth + 1)
          } else {
            childNode = {
              quotation_id: child.id,
              part_id: child.part_id ?? null,
              is_purchased_standard: false,
              quantity: edge.quantity_per_assembly ?? 1,
              unit_cost_eur: child.overall_cost_eur ?? null,
              children: [],
              quote_type: child.quote_type,
              overall_cost_eur: child.overall_cost_eur ?? null,
              confidence_score: child.confidence_score ?? null,
              status: child.status,
            }
          }
          children.push(childNode)
        }
      }
    }
  }

  return {
    quotation_id: quote.id,
    part_id: quote.part_id ?? null,
    is_purchased_standard: false,
    quantity: 1,
    unit_cost_eur: quote.overall_cost_eur ?? null,
    children,
    quote_type: quote.quote_type,
    overall_cost_eur: quote.overall_cost_eur ?? null,
    confidence_score: quote.confidence_score ?? null,
    status: quote.status,
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface AssemblyTreeNode {
  quotation_id: string | null
  part_id: string | null
  is_purchased_standard: boolean
  quantity: number
  unit_cost_eur: number | null
  children: AssemblyTreeNode[]
  quote_type: string
  overall_cost_eur: number | null
  confidence_score: number | null
  status: string
}

// ─── Utility: convert source tier to a confidence percentage ─────────────────

function tierToConfidence(tier: number): number {
  switch (tier) {
    case 1: return 95
    case 2: return 85
    case 3: return 75
    case 4: return 65
    case 5: return 50
    default: return 50
  }
}
