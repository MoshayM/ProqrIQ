import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useQuotations(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['quotations', params],
    queryFn: () => api.quotes.list(params),
    staleTime: 2 * 60 * 1000,
  })
}

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.quotes.get(id!),
    enabled: !!id,
  })
}

export function useSubmitQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.quotes.submit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  })
}

export function useApproveQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      api.quotes.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  })
}

export function useRejectQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      api.quotes.reject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  })
}
