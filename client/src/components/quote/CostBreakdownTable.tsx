import { Fragment } from 'react'
import { TierChip } from '../common/TierChip'
import { CostNumber } from '../common/CostNumber'
import { cn } from '../../lib/utils'
import type { CostLineCategory, SourceTier } from '@shared/types'

interface CostLine {
  id: string
  category: CostLineCategory
  sub_item: string
  cost_eur: number | null
  pct_of_total: number | null
  source_tier: SourceTier
  source_label?: string | null
}

const CATEGORY_ORDER: CostLineCategory[] = [
  'material',
  'manufacturing',
  'special_direct',
  'overheads',
  'assembly',
  'component',
]

const CAT_LABELS: Record<CostLineCategory, string> = {
  material:       'Material',
  manufacturing:  'Manufacturing',
  special_direct: 'Special Direct',
  overheads:      'Overheads',
  assembly:       'Assembly Ops',
  component:      'Components',
}

interface Props {
  lines: CostLine[]
  overallCost?: number | null
  currency?: string
}

export function CostBreakdownTable({ lines, overallCost, currency = 'EUR' }: Props) {
  // Group lines by category, preserving display order
  const grouped = CATEGORY_ORDER.reduce<Record<string, CostLine[]>>((acc, cat) => {
    const items = lines.filter((l) => l.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  // Any categories not in CATEGORY_ORDER go at the end
  const extraCats = [...new Set(lines.map((l) => l.category))].filter(
    (c) => !CATEGORY_ORDER.includes(c as CostLineCategory),
  )
  extraCats.forEach((cat) => {
    const items = lines.filter((l) => l.category === cat)
    if (items.length) grouped[cat] = items
  })

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1e2d4e] text-white">
            <th className="px-4 py-3 text-left font-semibold">Item</th>
            <th className="px-4 py-3 text-right font-semibold">Cost ({currency})</th>
            <th className="px-4 py-3 text-right font-semibold">% of Total</th>
            <th className="px-4 py-3 text-center font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([cat, items]) => (
            <Fragment key={`group-${cat}`}>
              {/* Category header row */}
              <tr className="bg-[#1e2d4e]/8">
                <td
                  colSpan={4}
                  className="px-4 py-2 font-semibold text-[#1e2d4e] text-xs uppercase tracking-wide bg-slate-50 border-t border-gray-200"
                >
                  {CAT_LABELS[cat as CostLineCategory] ?? cat}
                </td>
              </tr>
              {/* Data rows */}
              {items.map((l, i) => (
                <tr
                  key={l.id}
                  className={cn(
                    'border-t border-gray-100',
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
                  )}
                >
                  <td className="px-4 py-2.5 text-gray-700">{l.sub_item}</td>
                  <td className="px-4 py-2.5 text-right">
                    <CostNumber value={l.cost_eur} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {l.pct_of_total != null ? `${l.pct_of_total.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <TierChip tier={l.source_tier} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}

          {lines.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">
                No cost lines available
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-[#e85c1a] text-white font-bold">
            <td className="px-4 py-3 text-sm">TOTAL</td>
            <td className="px-4 py-3 text-right">
              <CostNumber value={overallCost} currency={currency} className="text-white font-bold" />
            </td>
            <td className="px-4 py-3 text-right text-sm">100%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
