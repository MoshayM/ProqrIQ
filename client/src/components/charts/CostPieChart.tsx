import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { CostLineCategory } from '@shared/types'
import { formatCost } from '../../lib/utils'

interface CategoryTotal {
  category: CostLineCategory
  total: number
}

interface Props {
  data: CategoryTotal[]
  currency?: string
  /** Height in px (default 320) */
  height?: number
}

const CATEGORY_COLORS: Record<CostLineCategory, string> = {
  material:       '#3b82f6', // blue-500
  manufacturing:  '#1e2d4e', // navy
  special_direct: '#7c3aed', // purple-600
  overheads:      '#6b7280', // gray-500
  assembly:       '#e85c1a', // brand orange
  component:      '#0ea5e9', // sky-500
}

const CATEGORY_LABELS: Record<CostLineCategory, string> = {
  material:       'Material',
  manufacturing:  'Manufacturing',
  special_direct: 'Special Direct',
  overheads:      'Overheads',
  assembly:       'Assembly Ops',
  component:      'Components',
}

interface TooltipPayloadEntry {
  name: string
  value: number
  payload: { category: CostLineCategory; total: number; pct: number }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  currency?: string
}

function CustomTooltip({ active, payload, currency = 'EUR' }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{entry.name}</p>
      <p className="font-mono tabular-nums text-gray-700">
        {formatCost(entry.value, currency)}
      </p>
      <p className="text-gray-500 text-xs">{entry.payload.pct.toFixed(1)}%</p>
    </div>
  )
}

export function CostPieChart({ data, currency = 'EUR', height = 320 }: Props) {
  const total = data.reduce((s, d) => s + d.total, 0)

  if (data.length === 0 || total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400 text-sm"
        style={{ height }}
      >
        No cost data to display
      </div>
    )
  }

  const chartData = data.map((d) => ({
    name:     CATEGORY_LABELS[d.category] ?? d.category,
    category: d.category,
    total:    d.total,
    pct:      total > 0 ? (d.total / total) * 100 : 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius="38%"
          outerRadius="62%"
          paddingAngle={2}
          dataKey="total"
          nameKey="name"
          label={({ name, pct }: { name: string; pct: number }) =>
            pct > 4 ? `${pct.toFixed(0)}%` : ''
          }
          labelLine={false}
        >
          {chartData.map((entry) => (
            <Cell
              key={entry.category}
              fill={CATEGORY_COLORS[entry.category as CostLineCategory] ?? '#9ca3af'}
            />
          ))}
        </Pie>
        <Tooltip
          content={<CustomTooltip currency={currency} />}
        />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs text-gray-700">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
