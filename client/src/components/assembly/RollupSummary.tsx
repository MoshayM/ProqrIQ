import { useMutation } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { CostNumber } from '../common/CostNumber'
import { ConfidenceBadge } from '../common/ConfidenceBadge'
import { Button } from '../ui/button'
import { Card, CardHeader, CardContent } from '../ui/card'
import { api } from '../../lib/api'
import { downloadBlob } from '../../lib/utils'
import type { AssemblyRollup } from '@shared/types'

interface Props {
  assemblyId: string
  rollup: AssemblyRollup
  /** Margin percentage to apply (0–100). Caller controls this. */
  marginPct?: number
  currency?: string
  onRollupRefresh?: () => void
}

interface CostRow {
  label: string
  value: number | null
  bold?: boolean
}

export function RollupSummary({
  assemblyId,
  rollup,
  marginPct = 0,
  currency = 'EUR',
  onRollupRefresh,
}: Props) {
  const exportMutation = useMutation({
    mutationFn: () => api.assemblies.exportExcel(assemblyId),
    onSuccess: (blob) => downloadBlob(blob, `assembly-${assemblyId}.xlsx`),
  })

  const rollupMutation = useMutation({
    mutationFn: () => api.assemblies.rollup(assemblyId),
    onSuccess: () => onRollupRefresh?.(),
  })

  const preMargincost  = rollup.overall_cost_eur
  const marginAmount   = preMargincost * (marginPct / 100)
  const finalPrice     = preMargincost + marginAmount

  const costRows: CostRow[] = [
    { label: 'Component costs (in-house)',  value: rollup.subtotal_component_cost_eur },
    { label: 'Purchased standard parts',   value: rollup.subtotal_purchased_cost_eur },
    { label: 'Assembly ops + overhead',    value: preMargincost - rollup.subtotal_component_cost_eur - rollup.subtotal_purchased_cost_eur },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Assembly Rollup</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => rollupMutation.mutate()}
              disabled={rollupMutation.isPending}
              title="Recalculate rollup"
            >
              <RefreshCw className={`w-4 h-4 ${rollupMutation.isPending ? 'animate-spin' : ''}`} />
              Recalculate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              <Download className="w-4 h-4" />
              Export Excel
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Component counts ────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            { label: 'Total',      value: rollup.total_components },
            { label: 'Costed',     value: rollup.costed_components,    color: 'text-green-700' },
            { label: 'Purchased',  value: rollup.purchased_components, color: 'text-blue-700' },
            { label: 'Uncosted',   value: rollup.uncosted_components,  color: rollup.uncosted_components > 0 ? 'text-amber-700' : 'text-gray-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className={`text-xl font-bold font-mono tabular-nums ${color ?? 'text-gray-800'}`}>
                {value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Cost breakdown ──────────────────────────────────────────────── */}
        <div className="space-y-1">
          {costRows.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-600">{label}</span>
              <CostNumber value={value} currency={currency} />
            </div>
          ))}

          {/* Pre-margin subtotal */}
          <div className="flex items-center justify-between py-2 mt-1 border-t-2 border-gray-200">
            <span className="text-sm font-semibold text-gray-800">Pre-margin total</span>
            <CostNumber value={preMargincost} currency={currency} className="font-semibold" />
          </div>

          {/* Margin */}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-600">
              Margin ({marginPct.toFixed(1)}%)
            </span>
            <CostNumber value={marginAmount} currency={currency} />
          </div>
        </div>

        {/* ── Final price highlight ───────────────────────────────────────── */}
        <div className="rounded-lg bg-[#e85c1a] text-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wide">Final Price</span>
          <span className="font-mono text-lg tabular-nums font-bold">
            <CostNumber value={finalPrice} currency={currency} className="text-white text-lg font-bold" />
          </span>
        </div>

        {/* ── Confidence ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Cost-weighted confidence</span>
          <ConfidenceBadge score={rollup.average_confidence_score} />
        </div>

        {rollup.uncosted_components > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
            {rollup.uncosted_components} component{rollup.uncosted_components > 1 ? 's' : ''} not yet costed — final price is partial.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
