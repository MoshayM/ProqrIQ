import { cn } from '../../lib/utils'

const map: Record<string, string> = {
  draft:                   'bg-gray-100 text-gray-700',
  in_review:               'bg-blue-100 text-blue-700',
  pending_approval:        'bg-amber-100 text-amber-700',
  approved:                'bg-green-100 text-green-700',
  archived:                'bg-red-100 text-red-700',
  queued:                  'bg-gray-100 text-gray-600',
  processing:              'bg-blue-100 text-blue-700',
  completed:               'bg-green-100 text-green-700',
  completed_with_errors:   'bg-amber-100 text-amber-700',
  failed:                  'bg-red-100 text-red-700',
  cancelled:               'bg-gray-100 text-gray-500',
  analysing:               'bg-blue-100 text-blue-600',
  searching_kb:            'bg-purple-100 text-purple-700',
  estimating:              'bg-indigo-100 text-indigo-700',
  needs_clarification:     'bg-amber-100 text-amber-800',
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        map[status] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
