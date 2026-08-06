import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useAssembly(id: string | undefined) {
  return useQuery({
    queryKey: ['assembly', id],
    queryFn: () => api.assemblies.get(id!).then((r) => r.data.data),
    enabled: !!id,
  })
}

export function useAddComponent(assemblyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => api.assemblies.addComponent(assemblyId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assembly', assemblyId] }),
  })
}

export function useRollup(assemblyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.assemblies.rollup(assemblyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assembly', assemblyId] }),
  })
}
