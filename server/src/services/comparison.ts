// ─── Deterministic supplier-comparison logic ──────────────────────────────────
// NO AI in this module. All maths are deterministic.
// AI is used only for talking points (see suppliers route).

const DIVERGENCE_THRESHOLD_PCT = 15

const COST_CATEGORIES = ['material', 'manufacturing', 'special_direct', 'overheads'] as const
type CostCategory = (typeof COST_CATEGORIES)[number]

export interface ComparisonCostLine {
  category: string
  label: string
  cost_eur: number
}

export interface ComparisonSupplierLine {
  category: string
  label: string
  value_eur: number
}

export interface ComparisonCategoryResult {
  category: string
  our_total: number
  supplier_total: number
  delta_eur: number         // our_total - supplier_total (positive = supplier cheaper)
  delta_pct: number         // delta_eur / our_total * 100 (0 if our_total === 0)
  diverges: boolean         // |delta_pct| > DIVERGENCE_THRESHOLD_PCT
}

export interface ComparisonResult {
  our_lines: ComparisonCostLine[]
  supplier_lines: ComparisonSupplierLine[]
  by_category: ComparisonCategoryResult[]
  our_total: number
  supplier_total: number
  total_gap_eur: number     // our_total - supplier_total (positive = supplier cheaper)
  divergence_flag: boolean  // true if any category diverges > ±15%
}

/**
 * Deterministically compare our cost_lines against supplier_quote_lines.
 * Groups both sides by the 4 cost categories, sums each, computes deltas.
 * NO AI is involved anywhere in this function.
 */
export function compareQuoteToSupplier(
  costLines: ComparisonCostLine[],
  supplierLines: ComparisonSupplierLine[],
): ComparisonResult {
  const byCategory: ComparisonCategoryResult[] = COST_CATEGORIES.map((cat) => {
    const ourTotal = costLines
      .filter((l) => l.category === cat)
      .reduce((sum, l) => sum + (l.cost_eur ?? 0), 0)

    const supplierTotal = supplierLines
      .filter((l) => l.category === cat)
      .reduce((sum, l) => sum + (l.value_eur ?? 0), 0)

    const deltaEur = ourTotal - supplierTotal
    const deltaPct = ourTotal !== 0 ? (deltaEur / ourTotal) * 100 : 0

    return {
      category: cat,
      our_total: ourTotal,
      supplier_total: supplierTotal,
      delta_eur: deltaEur,
      delta_pct: deltaPct,
      diverges: Math.abs(deltaPct) > DIVERGENCE_THRESHOLD_PCT,
    }
  })

  const ourTotal = byCategory.reduce((sum, c) => sum + c.our_total, 0)
  const supplierTotal = byCategory.reduce((sum, c) => sum + c.supplier_total, 0)
  const totalGapEur = ourTotal - supplierTotal
  const divergenceFlag = byCategory.some((c) => c.diverges)

  return {
    our_lines: costLines,
    supplier_lines: supplierLines,
    by_category: byCategory,
    our_total: ourTotal,
    supplier_total: supplierTotal,
    total_gap_eur: totalGapEur,
    divergence_flag: divergenceFlag,
  }
}
