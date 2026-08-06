import { CostNumber } from '../common/CostNumber'
import { TierChip } from '../common/TierChip'
import { cn } from '../../lib/utils'
import type { CycleTimeStep } from '@shared/types'

interface Props {
  steps: CycleTimeStep[]
  currency?: string
}

function formatSeconds(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec.toFixed(1)} s`
  return `${(sec / 60).toFixed(2)} min`
}

function formatMinutes(min: number | null): string {
  if (min == null) return '—'
  return `${min.toFixed(1)} min`
}

export function CycleTimeTable({ steps, currency = 'EUR' }: Props) {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number)

  const totalMachineCost = steps.reduce((s, r) => s + (r.machine_cost_eur ?? 0), 0)
  const totalLabourCost  = steps.reduce((s, r) => s + (r.labour_cost_eur ?? 0), 0)
  const totalCost        = totalMachineCost + totalLabourCost

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1e2d4e] text-white">
            <th className="px-4 py-3 text-left font-semibold w-8">#</th>
            <th className="px-4 py-3 text-left font-semibold">Process</th>
            <th className="px-4 py-3 text-left font-semibold">Machine</th>
            <th className="px-4 py-3 text-right font-semibold">Cycle CT</th>
            <th className="px-4 py-3 text-right font-semibold">Setup</th>
            <th className="px-4 py-3 text-right font-semibold">Machine Cost</th>
            <th className="px-4 py-3 text-right font-semibold">Labour Cost</th>
            <th className="px-4 py-3 text-center font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((step, i) => (
            <tr
              key={step.id}
              className={cn(
                'border-t border-gray-100',
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              )}
            >
              <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                {step.step_number}
              </td>
              <td className="px-4 py-2.5 text-gray-800 font-medium">
                {step.process_name}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {step.machine_model ?? <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-gray-700">
                {formatSeconds(step.cycle_time_sec)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-gray-700">
                {formatMinutes(step.setup_time_min)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <CostNumber value={step.machine_cost_eur} currency={currency} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <CostNumber value={step.labour_cost_eur} currency={currency} />
              </td>
              <td className="px-4 py-2.5 text-center">
                <TierChip tier={step.source_tier} />
              </td>
            </tr>
          ))}

          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                No cycle time steps recorded
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-[#e85c1a] text-white font-bold">
            <td colSpan={5} className="px-4 py-3 text-sm">TOTAL</td>
            <td className="px-4 py-3 text-right">
              <CostNumber value={totalMachineCost} currency={currency} className="text-white font-bold" />
            </td>
            <td className="px-4 py-3 text-right">
              <CostNumber value={totalLabourCost} currency={currency} className="text-white font-bold" />
            </td>
            <td className="px-4 py-3 text-right">
              <CostNumber value={totalCost} currency={currency} className="text-white font-bold" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
