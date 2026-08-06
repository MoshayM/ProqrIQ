import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, XCircle } from 'lucide-react'
import { useBatch } from '../../hooks/useBatch'
import { BatchItemRow } from './BatchItemRow'
import { StatusBadge } from '../common/StatusBadge'
import { Button } from '../ui/button'
import { TableSkeleton } from '../skeletons/TableSkeleton'
import { api } from '../../lib/api'
import { downloadBlob } from '../../lib/utils'
import type { BatchItemStatus, BatchItem } from '@shared/types'

interface Props {
  batchId: string
  /** Map of part_id → part name for display purposes */
  partNames?: Record<string, string>
  onAnswerClarification?: (itemId: string) => void
}

const DONE_STATUSES: BatchItemStatus[] = ['completed', 'failed', 'needs_clarification']

export function BatchProgressTable({ batchId, partNames = {}, onAnswerClarification }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useBatch(batchId)

  const retryMutation = useMutation({
    mutationFn: ({ id, itemIds }: { id: string; itemIds?: string[] }) =>
      api.bulk.retry(id, { item_ids: itemIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', batchId] }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.bulk.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch', batchId] }),
  })

  const exportMutation = useMutation({
    mutationFn: (id: string) => api.bulk.exportExcel(id),
    onSuccess: (blob) => downloadBlob(blob, `batch-${batchId}.xlsx`),
  })

  if (isLoading) return <TableSkeleton rows={6} />
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Failed to load batch data.
      </div>
    )
  }

  const batch = data.batch ?? data
  const items = data.items ?? []

  const total     = batch.total_items ?? items.length
  const completed = batch.completed_items ?? items.filter((i: BatchItem) => DONE_STATUSES.includes(i.status)).length
  const failed    = batch.failed_items ?? items.filter((i: BatchItem) => i.status === 'failed').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(batch.status)
  const canCancel  = !isTerminal
  const canExport  = ['completed', 'completed_with_errors'].includes(batch.status)

  const handleRetryItem = (itemId: string) => {
    retryMutation.mutate({ id: batchId, itemIds: [itemId] })
  }

  return (
    <div className="space-y-4">
      {/* ── Batch header card ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{batch.name}</h3>
              <StatusBadge status={batch.status} />
            </div>
            <p className="text-xs text-gray-500">
              {completed} of {total} items processed
              {failed > 0 && (
                <span className="ml-2 text-red-600 font-medium">({failed} failed)</span>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {canExport && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportMutation.mutate(batchId)}
                disabled={exportMutation.isPending}
              >
                <Download className="w-3.5 h-3.5" />
                Export Excel
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => cancelMutation.mutate(batchId)}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span className="font-mono tabular-nums font-semibold text-gray-700">{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#e85c1a] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Items table ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e2d4e] text-white">
              <th className="px-4 py-3 text-left font-semibold">File / Part</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-center font-semibold">Confidence</th>
              <th className="px-4 py-3 text-left font-semibold">Details</th>
              <th className="px-4 py-3 text-center font-semibold">Retries</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: BatchItem) => (
              <BatchItemRow
                key={item.id}
                item={item}
                partName={partNames[item.part_id] ?? item.part_id}
                onRetry={handleRetryItem}
                onAnswerClarification={onAnswerClarification}
              />
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No items in this batch yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
