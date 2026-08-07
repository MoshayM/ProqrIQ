import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'brand' | 'navy' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
  animated?: boolean
  className?: string
}

const trackSizes = { sm: 'h-1', md: 'h-2', lg: 'h-3' }
const fillColors: Record<string, string> = {
  brand:   'bg-brand',
  navy:    'bg-navy',
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  danger:  'bg-red-500',
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'brand',
  showLabel = false,
  animated = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-[#4a5568]" />
          <span className="text-xs font-medium text-[#0f1729] font-mono">{Math.round(pct)}%</span>
        </div>
      )}
      <div className={cn('w-full bg-[#e8ebf2] rounded-full overflow-hidden', trackSizes[size])}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            fillColors[variant],
            animated && 'animate-pulse-soft',
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  )
}
