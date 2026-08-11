import axios from 'axios'

const client = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL
    ? `${(import.meta as any).env.VITE_API_URL}/api`
    : '/api',
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

/** Extract the friendliest possible error message from an Axios/API error. */
export function extractApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const axiosErr = err as { response?: { data?: { error?: string } }; message?: string }
  return axiosErr?.response?.data?.error ?? axiosErr?.message ?? fallback
}

// Helper: unwrap paginated list envelope { success, data: { data: T[], total } } → T[]
const pl = <T = any>(res: { data: { data: { data: T[] } } }): T[] => res.data.data.data

export const api = {
  auth: {
    register:      (email: string, password: string, full_name: string, plan?: string, billing?: string) =>
      client.post('/auth/register', { email, password, full_name, plan, billing }).then(d),
    login:         (email: string, password: string) => client.post('/auth/login', { email, password }).then(d),
    me:            ()                                => client.get('/auth/me').then(d),
    logout:        ()                                => client.post('/auth/logout').then(d),
    updateProfile: (data: unknown)                   => client.patch('/auth/profile', data).then(d),
    changePassword:(data: unknown)                   => client.patch('/auth/password', data).then(d),
    uploadAvatar:       (formData: FormData)              => client.post('/auth/avatar', formData).then(d),
    deleteAccount:      (password: string)                => client.post('/auth/delete-account', { password }).then(d),
    deleteAccountNow:   (password: string)                => client.post('/auth/delete-account/immediate', { password }).then(d),
    restoreAccount:     ()                                => client.post('/auth/restore-account').then(d),
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
    exportExcel:          (id: string)  => client.get(`/bulk-batches/${id}/export-excel`, { responseType: 'blob' }).then(r => r.data as Blob),
    createFromSpreadsheet:(file: File) => { const fd = new FormData(); fd.append('file', file); return client.post('/bulk-batches/from-spreadsheet', fd).then(d) },
    analyzeDrawings: (files: File[]) => { const fd = new FormData(); files.forEach(f => fd.append('files', f)); return client.post('/bulk-batches/analyze-drawings', fd).then(d) },
    parseManifest:  (file: File)  => { const fd = new FormData(); fd.append('file', file); return client.post('/bulk-batches/parse-manifest', fd).then(d) },
    editItem:       (batchId: string, itemId: string, data: unknown) => client.patch(`/bulk-batches/${batchId}/items/${itemId}`, data).then(d),
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
    search:          (q: string)               => client.get(`/kb/search?q=${encodeURIComponent(q)}`).then(d),
    rates:           ()                        => client.get('/kb/regional-rates').then(d),
    createRate:      (u: unknown)              => client.post('/kb/regional-rates', u).then(d),
    updateRate:      (id: string, u: unknown)  => client.patch(`/kb/regional-rates/${id}`, u).then(d),
  },
  notifications: {
    list:    ()           => client.get('/notifications').then(d),
    read:    (id: string) => client.patch(`/notifications/${id}/read`).then(d),
    readAll: ()           => client.patch('/notifications/read-all').then(d),
  },
  admin: {
    getAiConfig:     ()                           => client.get('/admin/ai-config').then(d),
    patchAiConfig:   (data: unknown)              => client.patch('/admin/ai-config', data).then(d),
    resetAiConfig:   ()                           => client.post('/admin/ai-config/reset').then(d),
    getAiUsage:      ()                           => client.get('/admin/ai-usage').then(d),
    getProviders:    ()                           => client.get('/admin/providers').then(d),
    getRoutes:       ()                           => client.get('/admin/routes').then(d),
    setRoute:        (task: string, data: unknown) => client.put(`/admin/routes/${task}`, data).then(d),
    deleteRoute:     (task: string)               => client.delete(`/admin/routes/${task}`).then(d),
    getOllamaModels: ()                           => client.get('/admin/ollama/models').then(d),
    testOllama:      (model?: string)             => client.post('/admin/ollama/test', { model }).then(d),
    ollamaPullBase:  ()                           => (client.defaults.baseURL ?? '/api'),
    getLlmKeys:      ()                           => client.get('/admin/llm-keys').then(d),
    saveLlmKey:      (provider: string, data: { api_key: string; model?: string }) => client.post(`/admin/llm-keys/${provider}`, data).then(d),
    removeLlmKey:    (provider: string)           => client.delete(`/admin/llm-keys/${provider}`).then(d),
    toggleLlmKey:    (provider: string, enabled: boolean) => client.patch(`/admin/llm-keys/${provider}/enabled`, { enabled }).then(d),
    testLlmKey:      (provider: string, api_key?: string) => client.post(`/admin/llm-keys/${provider}/test`, { api_key }).then(d),
    getLlmPreference:()                           => client.get('/admin/llm-preference').then(d),
    setLlmPreference:(preferred_provider: string) => client.post('/admin/llm-preference', { preferred_provider }).then(d),
  },
  passkey: {
    authOptions:     (email?: string) => client.post('/auth/passkey/auth/options', { email }).then(d),
    authVerify:      (body: unknown)  => client.post('/auth/passkey/auth/verify', body).then(d),
    registerOptions: ()               => client.post('/auth/passkey/register/options').then(d),
    registerVerify:  (body: unknown)  => client.post('/auth/passkey/register/verify', body).then(d),
    credentials:     ()               => client.get('/auth/passkey/credentials').then(d),
  },
  suppliers: {
    list:           ()                          => client.get('/suppliers').then(d),
    getById:        (id: string)               => client.get(`/suppliers/${id}`).then(d),
    create:         (body: unknown)             => client.post('/suppliers', body).then(d),
    update:         (id: string, body: unknown) => client.patch(`/suppliers/${id}`, body).then(d),
    softDelete:     (id: string)                => client.delete(`/suppliers/${id}`).then(d),
    forQuote:             (quoteId: string)    => client.get(`/suppliers/for-quote/${quoteId}`).then(d),
    getQuotesBySupplier:  (supplierId: string) => client.get(`/suppliers/${supplierId}/quotes`).then(d),
    createQuote:    (body: unknown)             => client.post('/suppliers/quote', body).then(d),
    updateQuote:    (id: string, body: unknown) => client.patch(`/suppliers/quote/${id}`, body).then(d),
    deleteQuote:    (id: string)                => client.delete(`/suppliers/quote/${id}`).then(d),
    suggest:        (body: unknown)             => client.post('/suppliers/suggest', body).then(d),
    extractQuote:   (body: unknown)             => client.post('/suppliers/extract-quote', body).then(d),
    compare:        (body: unknown)             => client.post('/suppliers/compare', body).then(d),
    negotiate:      (body: unknown)             => client.post('/suppliers/negotiate', body).then(d),
    getNegotiation:  (quoteId: string)                    => client.get(`/suppliers/negotiation/${quoteId}`).then(d),
    getCustomers:    (supplierId: string)                  => client.get(`/suppliers/${supplierId}/customers`).then(d),
    addCustomer:     (supplierId: string, body: unknown)   => client.post(`/suppliers/${supplierId}/customers`, body).then(d),
    deleteCustomer:  (supplierId: string, customerId: string) => client.delete(`/suppliers/${supplierId}/customers/${customerId}`).then(d),
    composeEmail:    (supplierId: string, body: { purpose: string; context_notes?: string; quotation_id?: string }) =>
      client.post(`/suppliers/${supplierId}/compose-email`, body).then(d) as Promise<{ subject: string; body: string; supplier_email: string | null }>,
    getConversations: (supplierId: string) =>
      client.get(`/suppliers/${supplierId}/conversations`).then(d) as Promise<Array<{ id: string; sent_by: string; message: string; created_at: string }>>,
    addConversation: (supplierId: string, body: { message: string; sent_by: 'us' | 'supplier' }) =>
      client.post(`/suppliers/${supplierId}/conversations`, body).then(d) as Promise<{ id: string; sent_by: string; message: string; created_at: string }>,
  },
  subscription: {
    get:                 ()              => client.get('/subscription').then(d),
    paymentMethods:      ()              => client.get('/subscription/payment-methods').then(d) as Promise<{ razorpay: boolean; stripe: boolean }>,
    checkout:            (body: unknown) => client.post('/subscription/checkout', body).then(d),
    portal:              ()              => client.post('/subscription/portal', {}).then(d),
    cancel:              ()              => client.post('/subscription/cancel', {}).then(d),
    razorpayCheckout:    (body: unknown) => client.post('/subscription/razorpay/checkout', body).then(d),
    razorpayVerify:      (body: unknown) => client.post('/subscription/razorpay/verify', body).then(d),
    razorpayCreateOrder: (body: unknown) => client.post('/subscription/razorpay/create-order', body).then(d) as
      Promise<{ order_id: string; amount: number; currency: string; key_id: string }>,
    razorpayVerifyOrder: (body: unknown) => client.post('/subscription/razorpay/verify-order', body).then(d),
  },
  organization: {
    get:          ()                => client.get('/organization').then(d),
    invite:       (body: unknown)   => client.post('/organization/invite', body).then(d),
    removeMember: (id: string)      => client.delete(`/organization/members/${id}`).then(d),
  },
  search: {
    query: (q: string, limit = 20) => client.get(`/search?q=${encodeURIComponent(q)}&limit=${limit}`).then(d),
  },
  help: {
    chat: (body: { message: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }) =>
      client.post('/help/chat', body).then(d) as Promise<{ reply: string }>,
  },
}
