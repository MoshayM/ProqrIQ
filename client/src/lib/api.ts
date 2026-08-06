import axios from 'axios'

const client = axios.create({
  baseURL: `${(import.meta as any).env?.VITE_API_URL || 'http://localhost:3099'}/api`,
})

// Attach bearer token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('aq_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 clear token and redirect (skip auth endpoints so login errors surface normally)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
      localStorage.removeItem('aq_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

// Helper: unwrap server envelope { success, data }
const d = <T = any>(res: { data: { data: T } }): T => res.data.data

// Helper: unwrap paginated list envelope { success, data: { data: T[], total } } → T[]
const pl = <T = any>(res: { data: { data: { data: T[] } } }): T[] => res.data.data.data

export const api = {
  auth: {
    login:  (email: string, password: string) => client.post('/auth/login', { email, password }).then(d),
    me:     ()                                => client.get('/auth/me').then(d),
    logout: ()                                => client.post('/auth/logout').then(d),
  },
  users: {
    list:   ()                          => client.get('/users').then(d),
    create: (data: unknown)             => client.post('/users', data).then(d),
    update: (id: string, data: unknown) => client.patch(`/users/${id}`, data).then(d),
  },
  parts: {
    list:   ()                       => client.get('/parts').then(d),
    get:    (id: string)             => client.get(`/parts/${id}`).then(d),
    create: (data: unknown)          => client.post('/parts', data).then(d),
    update: (id: string, u: unknown) => client.patch(`/parts/${id}`, u).then(d),
  },
  quotes: {
    list:       (params?: Record<string, unknown>) => client.get('/quotations', { params }).then(pl),
    get:        (id: string)                       => client.get(`/quotations/${id}`).then(d),
    create:     (data: unknown)                    => client.post('/quotations', data).then(d),
    update:     (id: string, u: unknown)           => client.patch(`/quotations/${id}`, u).then(d),
    submit:     (id: string)                       => client.post(`/quotations/${id}/submit`).then(d),
    approve:    (id: string, u: unknown)           => client.post(`/quotations/${id}/approve`, u).then(d),
    reject:     (id: string, u: unknown)           => client.post(`/quotations/${id}/reject`, u).then(d),
    softDelete: (id: string, u?: unknown)          => client.post(`/quotations/${id}/soft-delete`, u).then(d),
    restore:    (id: string)                       => client.post(`/quotations/${id}/restore`).then(d),
    versions:   (id: string)                       => client.get(`/quotations/${id}/versions`).then(d),
    exportExcel:(id: string)                       => client.get(`/quotations/${id}/export-excel`, { responseType: 'blob' }).then(r => r.data as Blob),
  },
  costLines:   (id: string) => ({ list: () => client.get(`/quotations/${id}/cost-lines`).then(d) }),
  cycleTime:   (id: string) => ({ list: () => client.get(`/quotations/${id}/cycle-time-steps`).then(d) }),
  materials:   (id: string) => ({ list: () => client.get(`/quotations/${id}/material-breakdowns`).then(d) }),
  assumptions: {
    list:    (id: string)                         => client.get(`/quotations/${id}/assumptions`).then(d),
    confirm: (assumptionId: string, u?: unknown)  => client.patch(`/assumptions/${assumptionId}/confirm`, u).then(d),
  },
  bulk: {
    create:     (data: FormData | unknown)         => client.post('/bulk-batches', data).then(d),
    list:       (params?: Record<string, unknown>) => client.get('/bulk-batches', { params }).then(pl),
    get:        (id: string)                       => client.get(`/bulk-batches/${id}`).then(d),
    retry:      (id: string, u?: unknown)          => client.post(`/bulk-batches/${id}/retry`, u).then(d),
    cancel:     (id: string)                       => client.post(`/bulk-batches/${id}/cancel`).then(d),
    softDelete: (id: string)                       => client.post(`/bulk-batches/${id}/soft-delete`).then(d),
    exportExcel:(id: string)                       => client.get(`/bulk-batches/${id}/export-excel`, { responseType: 'blob' }).then(r => r.data as Blob),
  },
  assemblies: {
    create:          (u: unknown)                           => client.post('/assemblies', u).then(d),
    get:             (id: string)                           => client.get(`/assemblies/${id}`).then(d),
    addComponent:    (id: string, u: unknown)               => client.post(`/assemblies/${id}/components`, u).then(d),
    updateComponent: (id: string, cid: string, u: unknown)  => client.patch(`/assemblies/${id}/components/${cid}`, u).then(d),
    removeComponent: (id: string, cid: string)              => client.delete(`/assemblies/${id}/components/${cid}`).then(d),
    costChildren:    (id: string)                           => client.post(`/assemblies/${id}/cost-children`).then(d),
    rollup:          (id: string)                           => client.post(`/assemblies/${id}/rollup`).then(d),
    exportExcel:     (id: string)                           => client.get(`/assemblies/${id}/export-excel`, { responseType: 'blob' }).then(r => r.data as Blob),
  },
  ai: {
    analyseDrawing:   (u: unknown) => client.post('/ai/analyse-drawing', u).then(d),
    estimateCost:     (u: unknown) => client.post('/ai/estimate-cost', u).then(d),
    estimateAssembly: (id: string) => client.post(`/assemblies/${id}/estimate-assembly`).then(d),
    query:            (u: unknown) => client.post('/ai/query', u).then(d),
    regenerate:       (u: unknown) => client.post('/ai/regenerate', u).then(d),
  },
  kb: {
    documents:       ()                        => client.get('/kb/documents').then(d),
    uploadDoc:       (f: FormData)             => client.post('/kb/documents/upload', f).then(d),
    reindexDoc:      (id: string)              => client.post(`/kb/documents/${id}/reindex`).then(d),
    deleteDoc:       (id: string)              => client.delete(`/kb/documents/${id}`).then(d),
    entries:         ()                        => client.get('/kb/entries').then(d),
    createEntry:     (u: unknown)              => client.post('/kb/entries', u).then(d),
    updateEntry:     (id: string, u: unknown)  => client.patch(`/kb/entries/${id}`, u).then(d),
    deactivateEntry: (id: string)              => client.patch(`/kb/entries/${id}/deactivate`).then(d),
    rates:           ()                        => client.get('/kb/regional-rates').then(d),
    createRate:      (u: unknown)              => client.post('/kb/regional-rates', u).then(d),
    updateRate:      (id: string, u: unknown)  => client.patch(`/kb/regional-rates/${id}`, u).then(d),
  },
  notifications: {
    list:    ()           => client.get('/notifications').then(d),
    read:    (id: string) => client.patch(`/notifications/${id}/read`).then(d),
    readAll: ()           => client.patch('/notifications/read-all').then(d),
  },
}
