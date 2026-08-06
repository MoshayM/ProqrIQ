import { cn } from '../../lib/utils'

interface Props {
  /** Confidence score 0–100 */
  score: number | null | undefined
  /** Reference target line (default 98) */
  target?: number
  /** Show the numeric score label (default true) */
  showLabel?: boolean
  /** Height of the bar track in px (default 12) */
  barHeight?: number
  className?: string
}

function getBarColor(score: number): string {
  if (score >= 95) return 'bg-green-500'
  if (score >= 70) return 'bg-amber-400'
  return 'bg-red-500'
}

function getTextColor(score: number): string {
  if (score >= 95) return 'text-green-700'
  if (score >= 70) return 'text-amber-700'
  return 'text-red-700'
}

export function ConfidenceBar({
  score,
  target = 98,
  showLabel = true,
  barHeight = 12,
  className,
}: Props) {
  if (score == null) {
    return (
      <div className={cn('space-y-1', className)}>
        {showLabel && <p className="text-xs text-gray-400">Confidence: —</p>}
        <div
          className="w-full rounded-full bg-gray-100"
          style={{ height: barHeight }}
        />
      </div>
    )
  }

  const clampedScore = Math.min(100, Math.max(0, score))
  const barColor     = getBarColor(clampedScore)
  const textColor    = getTextColor(clampedScore)
  const targetLeft   = `${Math.min(target, 100)}%`

  return (
    <div className={cn('space-y-1', className)}>
      {/* Label row */}
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Confidence</span>
          <span className={cn('text-xs font-bold font-mono tabular-nums', textColor)}>
            {clampedScore.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Bar track */}
      <div
        className="relative w-full rounded-full bg-gray-100 overflow-visible"
        style={{ height: barHeight }}
      >
        {/* Fill */}
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', barColor)}
          style={{ width: `${clampedScore}%` }}
        />

        {/* Target line */}
        <div
          className="absolute inset-y-0 w-0.5 bg-gray-600 opacity-60"
          style={{ left: targetLeft }}
          title={`Target: ${target}%`}
        >
          {/* Target label — shown above the bar */}
          <span
            className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap select-none"
          >
            {target}%
          </span>
        </div>
      </div>

      {/* Range labels */}
      <div className="flex justify-between text-[10px] text-gray-400 select-none">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  )
}
