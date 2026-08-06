import { AlertTriangle } from 'lucide-react'
import { CostNumber } from '../common/CostNumber'
import { TierChip } from '../common/TierChip'
import { cn } from '../../lib/utils'
import type { MaterialBreakdown } from '@shared/types'

/** Threshold at which we show a divergence warning */
const DIVERGENCE_THRESHOLD = 15

interface MaterialRow extends MaterialBreakdown {
  /** Optional: divergence from reference price, as a percentage */
  divergence_pct?: number | null
}

interface Props {
  materials: MaterialRow[]
  currency?: string
}

function formatKg(val: number | null): string {
  if (val == null) return '—'
  return `${val.toFixed(3)} kg`
}

function formatPct(val: number | null): string {
  if (val == null) return '—'
  return `${val.toFixed(1)}%`
}

export function MaterialsTable({ materials, currency = 'EUR' }: Props) {
  const totalCost = materials.reduce((s, m) => s + (m.total_cost_eur ?? 0), 0)

  const hasDivergence = materials.some(
    (m) => m.divergence_pct != null && Math.abs(m.divergence_pct) > DIVERGENCE_THRESHOLD,
  )

  return (
    <div className="space-y-3">
      {/* Divergence alert banner */}
      {hasDivergence && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            One or more materials have a price divergence greater than {DIVERGENCE_THRESHOLD}% from
            reference — review the highlighted rows below.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e2d4e] text-white">
              <th className="px-4 py-3 text-left font-semibold">Material</th>
              <th className="px-4 py-3 text-left font-semibold">Grade</th>
              <th className="px-4 py-3 text-right font-semibold">Qty (kg)</th>
              <th className="px-4 py-3 text-right font-semibold">Price / kg</th>
              <th className="px-4 py-3 text-right font-semibold">Scrap %</th>
              <th className="px-4 py-3 text-right font-semibold">Total Cost</th>
              <th className="px-4 py-3 text-center font-semibold">Divergence</th>
              <th className="px-4 py-3 text-center font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m, i) => {
              const isDiverging =
                m.divergence_pct != null && Math.abs(m.divergence_pct) > DIVERGENCE_THRESHOLD

              return (
                <tr
                  key={m.id}
                  className={cn(
                    'border-t border-gray-100',
                    isDiverging
                      ? 'bg-amber-50'
                      : i % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50',
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <div className="flex items-center gap-1.5">
                      {isDiverging && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      {m.material_name}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {m.material_grade ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-gray-700">
                    {formatKg(m.quantity_kg)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <CostNumber value={m.price_per_kg_eur} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-gray-600">
                    {formatPct(m.scrap_pct)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <CostNumber value={m.total_cost_eur} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {m.divergence_pct != null ? (
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium font-mono tabular-nums',
                          Math.abs(m.divergence_pct) > DIVERGENCE_THRESHOLD
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {m.divergence_pct > 0 ? '+' : ''}
                        {m.divergence_pct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <TierChip tier={m.source_tier} />
                  </td>
                </tr>
              )
            })}

            {materials.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No material breakdowns available
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[#e85c1a] text-white font-bold">
              <td colSpan={5} className="px-4 py-3 text-sm">TOTAL MATERIAL COST</td>
              <td className="px-4 py-3 text-right">
                <CostNumber value={totalCost} currency={currency} className="text-white font-bold" />
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
