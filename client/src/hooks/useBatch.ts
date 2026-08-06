import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const TERMINAL = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])

export function useBatches(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['batches', params],
    queryFn: () => api.bulk.list(params),
    staleTime: 30_000,
  })
}

export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: ['batch', id],
    queryFn: () => api.bulk.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.batch?.status
      return s && !TERMINAL.has(s) ? 2000 : false
    },
  })
}

export function useRetryBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) =>
      api.bulk.retry(id, data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['batch', v.id] }),
  })
}

export function useCancelBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.bulk.cancel(id),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: ['batch', id] }),
  })
}
