import { ExternalLink, RefreshCw, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '../common/StatusBadge'
import { ConfidenceBadge } from '../common/ConfidenceBadge'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { BatchItem, BatchItemStatus } from '@shared/types'

interface Props {
  item: BatchItem
  /** Human-readable file/part name — resolved by the parent from part data */
  partName: string
  onRetry?: (itemId: string) => void
  onAnswerClarification?: (itemId: string) => void
}

/** Row background tint per status */
const rowTint: Partial<Record<BatchItemStatus, string>> = {
  failed:               'bg-red-50',
  needs_clarification:  'bg-amber-50',
  completed:            'bg-white',
}

export function BatchItemRow({ item, partName, onRetry, onAnswerClarification }: Props) {
  const navigate = useNavigate()
  const bg = rowTint[item.status] ?? 'bg-white'

  return (
    <tr className={cn('border-t border-gray-100', bg)}>
      {/* Part / file name */}
      <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-[220px] truncate">
        {partName}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={item.status} />
      </td>

      {/* Confidence (only meaningful when completed) */}
      <td className="px-4 py-3 text-center">
        {item.status === 'completed' && item.quotation_id ? (
          <ConfidenceBadge score={null} />
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Error / clarification hint */}
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[260px]">
        {item.status === 'needs_clarification' && item.clarification_questions?.length ? (
          <span className="text-amber-700">{item.clarification_questions[0]}</span>
        ) : item.status === 'failed' && item.error_message ? (
          <span className="text-red-600 line-clamp-2">{item.error_message}</span>
        ) : null}
      </td>

      {/* Retry count */}
      <td className="px-4 py-3 text-center text-xs font-mono text-gray-400">
        {item.retry_count > 0 ? `×${item.retry_count}` : '—'}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-right">
        {item.status === 'completed' && item.quotation_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/quotes/${item.quotation_id}`)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Quote
          </Button>
        )}
        {item.status === 'failed' && onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRetry(item.id)}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        )}
        {item.status === 'needs_clarification' && onAnswerClarification && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAnswerClarification(item.id)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Answer
          </Button>
        )}
      </td>
    </tr>
  )
}
