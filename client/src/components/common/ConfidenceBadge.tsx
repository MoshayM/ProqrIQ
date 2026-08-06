import { cn } from '../../lib/utils'

export function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>

  const cls =
    score >= 95
      ? 'bg-green-100 text-green-800'
      : score >= 70
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
        cls,
      )}
    >
      {score.toFixed(1)}%
    </span>
  )
}
