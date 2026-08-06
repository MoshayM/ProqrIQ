import { cn } from '../../lib/utils'

interface TierConfig {
  bg: string
  label: string
}

const configs: Record<number, TierConfig> = {
  1: { bg: 'bg-green-100 text-green-800',   label: 'KB' },
  2: { bg: 'bg-blue-100 text-blue-800',     label: 'User' },
  3: { bg: 'bg-purple-100 text-purple-800', label: 'Std' },
  4: { bg: 'bg-amber-100 text-amber-800',   label: 'Bench' },
  5: { bg: 'bg-red-100 text-red-800',       label: 'Assumed' },
}

export function TierChip({ tier }: { tier: number | null | undefined }) {
  if (!tier) return <span className="text-gray-400 text-xs">—</span>

  const c: TierConfig = configs[tier] ?? { bg: 'bg-gray-100 text-gray-700', label: `T${tier}` }

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
        c.bg,
      )}
    >
      T{tier} {c.label}
    </span>
  )
}
