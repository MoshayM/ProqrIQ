import React, { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format, differenceInSeconds } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, RefreshCw, X, Play, Eye, Trash2, ChevronLeft, AlertCircle, CheckCircle,
  Clock, Zap, AlertTriangle, Download, FileText, Layers, Wand2, FolderOpen,
  ScanSearch, CheckSquare, ArrowRight, Edit2, Plus, Link2,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { ProgressBar } from '../../components/ui/progress-bar'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { BatchEmptyIllustration } from '../../components/ui/illustrations'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { useSubscription } from '../../hooks/useSubscription'

// ─── Types ───────────────────────────────────────────────────────────────────

type BatchStatus = 'queued'|'processing'|'completed'|'completed_with_errors'|'failed'|'cancelled'
type BatchItemStatus = 'queued'|'processing'|'analysing'|'searching_kb'|'estimating'|'completed'|'failed'|'skipped'|'cancelled'|'needs_clarification'

interface CostingBatch {
  id: string
  batch_type: 'bulk'|'assembly_children'
  status: BatchStatus
  total_items: number
  processed_items: number
  failed_items: number
  created_at: string
  completed_at: string | null
}

interface BatchItem {
  id: string
  batch_id: string
  part_name: string
  status: BatchItemStatus
  error_message: string | null
  quotation_id: string | null
  overrides_json: Record<string, unknown> | null
}

interface CostingBatchWithItems extends CostingBatch {
  shared_params_json: Record<string, unknown> | null
  items: BatchItem[]
}

interface AnalyzedPart {
  filename: string
  part_name: string
  description: string
  material: string
  drawing_number: string
  confidence: number
  error: string | null
}

interface ReviewRow {
  _id: string // local key
  part_name: string
  description: string
  material: string
  supplier_country: string
  supplier_currency: string
  annual_volume: number
  lot_size: number
  procurement_type: string
  drawing_file: File | null
  drawing_filename: string
  match_score: number   // 0–1; 1 = exact
  match_status: 'auto' | 'manual' | 'missing' | 'extra'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  queued:                'bg-[#f1f3f7] text-[#4a5568]',
  processing:            'bg-blue-50 text-blue-700',
  completed:             'bg-green-50 text-green-700',
  completed_with_errors: 'bg-amber-50 text-amber-700',
  failed:                'bg-red-50 text-red-700',
  cancelled:             'bg-[#f1f3f7] text-[#9aa3b2]',
}

const ITEM_STATUS_COLORS: Record<BatchItemStatus, string> = {
  queued:              'bg-[#f1f3f7] text-[#4a5568]',
  processing:          'bg-blue-50 text-blue-700',
  analysing:           'bg-blue-50 text-blue-600',
  searching_kb:        'bg-purple-50 text-purple-700',
  estimating:          'bg-indigo-50 text-indigo-700',
  completed:           'bg-green-50 text-green-700',
  failed:              'bg-red-50 text-red-700',
  skipped:             'bg-[#f1f3f7] text-[#9aa3b2]',
  cancelled:           'bg-[#f1f3f7] text-[#9aa3b2]',
  needs_clarification: 'bg-amber-50 text-amber-700',
}

function batchProgressVariant(s: BatchStatus): 'brand'|'success'|'danger'|'warning'|'navy' {
  switch (s) {
    case 'processing':            return 'brand'
    case 'completed':             return 'success'
    case 'failed':                return 'danger'
    case 'completed_with_errors': return 'warning'
    default:                      return 'navy'
  }
}

const SUPPLIER_COUNTRIES = [
  { code: 'DE', name: 'Germany' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'MX', name: 'Mexico' },
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'TR', name: 'Turkey' },
]

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY', 'INR', 'PLN', 'CZK', 'MXN', 'TRY']

const PROCUREMENT_TYPES = [
  { value: 'in_house',       label: 'In-house (Make)' },
  { value: 'purchased',      label: 'Purchased (Buy)' },
  { value: 'sub_contracted', label: 'Sub-contracted' },
]

const ACCEPTED_DRAWING_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff'])

const BULK_MAX = 50

type BatchInputMode = 'drawings' | 'spreadsheet' | 'smart'

interface ItemParams {
  supplier_country: string
  supplier_currency: string
  annual_volume: number
  lot_size: number
  procurement_type: string
}

const DEFAULT_PARAMS: ItemParams = {
  supplier_country: 'DE',
  supplier_currency: 'EUR',
  annual_volume: 1000,
  lot_size: 100,
  procurement_type: 'in_house',
}

const SEL = 'w-full border border-[#e5e8ef] rounded-md px-2 py-1.5 text-xs text-[#0f1729] bg-white focus:outline-none focus:ring-1 focus:ring-brand/40 focus:border-brand transition-colors'
const NUM = 'w-full border border-[#e5e8ef] rounded-md px-2 py-1.5 text-xs font-mono text-[#0f1729] bg-white focus:outline-none focus:ring-1 focus:ring-brand/40 focus:border-brand transition-colors text-right'
const INP = 'w-full border border-[#e5e8ef] rounded-md px-2 py-1.5 text-xs text-[#0f1729] bg-white focus:outline-none focus:ring-1 focus:ring-brand/40 focus:border-brand transition-colors'
const LBL = 'text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5'

const SPREADSHEET_TEMPLATE_CSV =
  'part_name,description,material,supplier_country,supplier_currency,procurement_type,annual_volume,lot_size\n' +
  'Bracket A,Aluminium L-bracket,AlSi10Mg,DE,EUR,in_house,1000,100\n' +
  'Cover Plate,Steel stamped cover,DC04,PL,EUR,sub_contracted,5000,500\n'

function downloadCSVTemplate() {
  const blob = new Blob([SPREADSHEET_TEMPLATE_CSV], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'bulk_costing_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── Fuzzy filename→partname matching ────────────────────────────────────────

function normalize(s: string): string {
  return s.replace(/\.[^.]+$/, '').replace(/[-_\.]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchScore(partName: string, filename: string): number {
  const p = normalize(partName)
  const f = normalize(filename)
  if (p === f) return 1
  if (f.includes(p) || p.includes(f)) return 0.85
  // word overlap
  const pw = new Set(p.split(' ').filter(Boolean))
  const fw = new Set(f.split(' ').filter(Boolean))
  const inter = [...pw].filter(w => fw.has(w)).length
  const union = new Set([...pw, ...fw]).size
  return union > 0 ? inter / union : 0
}

// ─── BATCH DETAIL VIEW ───────────────────────────────────────────────────────

function BatchDetail({ id }: { id: string }) {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)
  const { canUse } = useSubscription()

  const { data: batch, isLoading, isError } = useQuery<CostingBatchWithItems>({
    queryKey: ['batch', id],
    queryFn: () => api.bulk.get(id),
    refetchInterval: q => {
      const d = q.state.data; if (!d) return false
      return d.status === 'processing' || d.status === 'queued' ? 3000 : false
    },
  })

  const retryMut = useMutation({
    mutationFn: () => api.bulk.retry(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['batch', id] }); toast.success('Batch retry started') },
    onError: () => toast.error('Failed to retry batch'),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.bulk.cancel(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['batch', id] }); toast.success('Batch cancelled') },
    onError: () => toast.error('Failed to cancel batch'),
  })

  // ── Per-item editing ────────────────────────────────────────────────────────
  type EditForm = { part_name: string; supplier_country: string; supplier_currency: string; annual_volume: number; lot_size: number; procurement_type: string }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)

  const editItemMut = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: unknown }) => api.bulk.editItem(id, itemId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['batch', id] }); toast.success('Item updated'); setEditingId(null); setEditForm(null) },
    onError: () => toast.error('Failed to update item'),
  })

  function startEdit(item: BatchItem) {
    const ov = (item.overrides_json ?? {}) as Record<string, unknown>
    const sp = (batch?.shared_params_json ?? {}) as Record<string, unknown>
    setEditingId(item.id)
    setEditForm({
      part_name:         item.part_name,
      supplier_country:  String(ov.supplier_country  ?? sp.supplier_country  ?? 'DE'),
      supplier_currency: String(ov.supplier_currency ?? sp.supplier_currency ?? 'EUR'),
      annual_volume:     Number(ov.annual_volume  ?? sp.annual_volume  ?? 1000),
      lot_size:          Number(ov.lot_size       ?? sp.lot_size       ?? 100),
      procurement_type:  String(ov.procurement_type ?? sp.procurement_type ?? 'in_house'),
    })
  }

  function saveEdit(rerun: boolean) {
    if (!editForm || !editingId) return
    const { part_name, ...overrides } = editForm
    editItemMut.mutate({ itemId: editingId, data: { part_name, overrides, rerun } })
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      const blob = await api.bulk.exportExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `batch-${id}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Failed to export') }
    finally { setIsExporting(false) }
  }

  if (isLoading) {
    return (
      <div className="page-content space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton variant="line" height="28px" width="160px" />
          <Skeleton variant="rect" height="36px" width="120px" className="rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-2">
              <Skeleton variant="line" height="11px" width="60%" />
              <Skeleton variant="line" height="24px" width="40%" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-3">
              <Skeleton variant="line" height="16px" width="180px" />
              <Skeleton variant="rect" height="6px" className="rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !batch) {
    return (
      <div className="page-content">
        <EmptyState
          title="Failed to load batch"
          description="We couldn't load this batch's details."
          action={{ label: 'Back to Bulk', onClick: () => navigate('/bulk') }}
        />
      </div>
    )
  }

  const pct        = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0
  const canRetry   = batch.status === 'failed' || batch.status === 'completed_with_errors'
  const canCancel  = batch.status === 'processing' || batch.status === 'queued'
  const isStuck    = batch.status === 'processing' && (Date.now() - new Date(batch.created_at).getTime()) > 20 * 60 * 1000
  const batchDuration = batch.completed_at ? differenceInSeconds(new Date(batch.completed_at), new Date(batch.created_at)) : null
  const batchTimingLabel = batchDuration !== null && batch.total_items > 0
    ? (() => { const m = Math.floor(batchDuration / 60); const s = batchDuration % 60; const dur = m > 0 ? `${m}m ${s}s` : `${s}s`; return `${batch.total_items} part${batch.total_items !== 1 ? 's' : ''} estimated in ${dur} (avg ${(batchDuration / batch.total_items).toFixed(1)}s/part)` })()
    : null

  // Completed items with quotations — for "Create Assembly" pre-population
  const completedItems = batch.items.filter(i => i.status === 'completed' && i.quotation_id)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/bulk')} iconLeft={<ChevronLeft className="w-4 h-4" />}>
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Batch #{id.slice(0, 8)}</CardTitle>
              {batch.completed_at && (
                <p className="text-sm text-[#9aa3b2] mt-1">
                  Completed {format(new Date(batch.completed_at), 'dd MMM yyyy HH:mm')}
                </p>
              )}
            </div>
            <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize', BATCH_STATUS_COLORS[batch.status])}>
              {batch.status.replace(/_/g, ' ')}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[#4a5568]">
            {batch.processed_items} / {batch.total_items} items processed
            {batch.failed_items > 0 && <span className="text-red-600 ml-2">• {batch.failed_items} failed</span>}
          </p>
          {batchTimingLabel && (
            <p className="text-xs text-[#9aa3b2] flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {batchTimingLabel}
            </p>
          )}
          <div className="space-y-1.5">
            <ProgressBar value={pct} variant={batchProgressVariant(batch.status)} size="sm" />
            <p className="text-xs text-[#9aa3b2] text-right">{pct}%</p>
          </div>
          {isStuck && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-medium">Calculation appears stuck</p>
                <p className="text-xs mt-0.5 text-amber-700">The batch runner may have timed out. Refresh or cancel to unblock.</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => cancelMut.mutate()} loading={cancelMut.isPending}
                iconLeft={<X className="w-3 h-3" />} className="text-red-600 border-red-200 hover:bg-red-50">
                Cancel
              </Button>
            )}
            {canRetry && (
              <Button variant="primary" size="sm" onClick={() => retryMut.mutate()} loading={retryMut.isPending}
                iconLeft={<RefreshCw className="w-3 h-3" />}>
                Retry Failed
              </Button>
            )}
            {canUse('excel_export') && batch.status === 'completed' && (
              <Button variant="outline" size="sm" onClick={handleExport} loading={isExporting}
                iconLeft={<Download className="w-3 h-3" />}>
                Export Excel
              </Button>
            )}
            {/* Create Assembly from completed batch items */}
            {batch.status === 'completed' && completedItems.length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                iconLeft={<Layers className="w-3 h-3" />}
                onClick={() => navigate(`/assemblies?from_batch=${id}`)}
                className="text-purple-700 border-purple-200 hover:bg-purple-50"
              >
                Create Assembly
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Batch Items</CardTitle>
            <span className="text-sm text-[#9aa3b2]">{batch.items.length} items</span>
          </div>
        </CardHeader>
        <CardContent>
          {batch.items.length === 0 ? (
            <EmptyState title="No items yet" description="Items will appear here once the batch starts processing." />
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {batch.items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className={cn(
                      'rounded-lg border transition-colors',
                      item.status === 'processing' ? 'border-blue-200 bg-blue-50/40' :
                      item.status === 'completed'   ? 'border-green-100 bg-green-50/30' :
                      item.status === 'failed'      ? 'border-red-100 bg-red-50/20' :
                      item.status === 'needs_clarification' ? 'border-amber-100 bg-amber-50/20' :
                      editingId === item.id         ? 'border-brand/30 bg-brand/5' :
                      'border-transparent hover:bg-surface-2',
                    )}
                  >
                    {/* ── Main row ─────────────────────────────────────────── */}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-shrink-0">
                        {item.status === 'processing' ? (
                          <div className="relative w-5 h-5">
                            <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" style={{ animationDuration: '1.2s' }} />
                            <span className="absolute inset-1 rounded-full bg-blue-500" />
                          </div>
                        ) : item.status === 'completed'           ? <CheckCircle  className="w-4 h-4 text-green-600" />
                          : item.status === 'failed'              ? <AlertCircle  className="w-4 h-4 text-red-500" />
                          : item.status === 'needs_clarification' ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                          : item.status === 'queued'              ? <div className="w-4 h-4 rounded-full border-2 border-[#c8cdd8] border-t-amber-400 animate-spin" style={{ animationDuration: '1s' }} />
                          : <div className="w-4 h-4 rounded-full bg-[#e5e8ef]" />}
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium text-[#0f1729] truncate">{item.part_name}</p>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize flex-shrink-0', ITEM_STATUS_COLORS[item.status])}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      {item.error_message ? (
                        <span className="text-red-500 text-xs truncate max-w-[120px] flex-shrink-0" title={item.error_message}>{item.error_message}</span>
                      ) : item.quotation_id ? (
                        <Link to={`/quotes/${item.quotation_id}`} onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-brand hover:underline text-xs font-medium flex-shrink-0">
                          <Eye className="w-3 h-3" /> View
                        </Link>
                      ) : null}
                      {/* Edit toggle — not available while actively running */}
                      {!['analysing','searching_kb','estimating','processing'].includes(item.status) && (
                        <button
                          type="button"
                          onClick={() => editingId === item.id ? (setEditingId(null), setEditForm(null)) : startEdit(item)}
                          title={editingId === item.id ? 'Close' : 'Edit parameters'}
                          className={cn(
                            'flex-shrink-0 p-1 rounded transition-colors',
                            editingId === item.id ? 'text-brand bg-brand/10' : 'text-[#c8cdd8] hover:text-brand hover:bg-brand/5',
                          )}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* ── Inline edit panel ────────────────────────────────── */}
                    {editingId === item.id && editForm && (
                      <div className="px-3 pb-3 space-y-3 border-t border-brand/10">
                        <p className="text-[10px] uppercase tracking-wide text-brand font-semibold pt-2">Edit Parameters</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="col-span-full">
                            <p className={LBL}>Part name</p>
                            <input value={editForm.part_name}
                              onChange={e => setEditForm(f => f ? { ...f, part_name: e.target.value } : f)}
                              className={INP} placeholder="Part name" />
                          </div>
                          <div>
                            <p className={LBL}>Supplier country</p>
                            <input value={editForm.supplier_country}
                              onChange={e => setEditForm(f => f ? { ...f, supplier_country: e.target.value } : f)}
                              className={INP} placeholder="DE" maxLength={3} />
                          </div>
                          <div>
                            <p className={LBL}>Currency</p>
                            <input value={editForm.supplier_currency}
                              onChange={e => setEditForm(f => f ? { ...f, supplier_currency: e.target.value } : f)}
                              className={INP} placeholder="EUR" maxLength={3} />
                          </div>
                          <div>
                            <p className={LBL}>Annual volume</p>
                            <input type="number" min={1} value={editForm.annual_volume}
                              onChange={e => setEditForm(f => f ? { ...f, annual_volume: Number(e.target.value) || 1 } : f)}
                              className={NUM} />
                          </div>
                          <div>
                            <p className={LBL}>Lot size</p>
                            <input type="number" min={1} value={editForm.lot_size}
                              onChange={e => setEditForm(f => f ? { ...f, lot_size: Number(e.target.value) || 1 } : f)}
                              className={NUM} />
                          </div>
                          <div>
                            <p className={LBL}>Procurement</p>
                            <select value={editForm.procurement_type}
                              onChange={e => setEditForm(f => f ? { ...f, procurement_type: e.target.value } : f)}
                              className={SEL}>
                              <option value="in_house">In-house</option>
                              <option value="purchased">Purchased</option>
                              <option value="sub_contracted">Sub-contracted</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => saveEdit(false)}
                            loading={editItemMut.isPending}>
                            Save
                          </Button>
                          {['queued','failed','needs_clarification'].includes(item.status) && (
                            <Button type="button" size="sm" variant="primary"
                              onClick={() => saveEdit(true)}
                              loading={editItemMut.isPending}
                              iconLeft={<RefreshCw className="w-3 h-3" />}>
                              Save &amp; Re-run
                            </Button>
                          )}
                          <button type="button"
                            onClick={() => { setEditingId(null); setEditForm(null) }}
                            className="text-xs text-[#9aa3b2] hover:text-[#4a5568] ml-auto">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── DRAWING FILES MODE ───────────────────────────────────────────────────────

function DrawingFilesMode({
  onCreated,
}: {
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles]         = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [itemParams, setItemParams] = useState<Record<string, ItemParams>>({})
  const [defaults, setDefaults]   = useState<ItemParams>({ ...DEFAULT_PARAMS })

  // AI analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzed, setAnalyzed]       = useState<AnalyzedPart[] | null>(null)

  const createMut = useMutation({
    mutationFn: (fd: FormData) => api.bulk.create(fd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success('Batch created — processing started')
      setFiles([]); setItemParams({}); setAnalyzed(null)
      onCreated()
    },
    onError: () => toast.error('Failed to create batch'),
  })

  function addFiles(incoming: File[]) {
    const valid = incoming.filter(f => ACCEPTED_DRAWING_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
    if (valid.length < incoming.length) toast.error('Some files skipped — only PDF / PNG / JPG / WEBP accepted')
    if (!valid.length) return
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const fresh = valid.filter(f => !existing.has(f.name))
      setItemParams(curr => {
        const next = { ...curr }
        fresh.forEach(f => { next[f.name] = { ...defaults } })
        return next
      })
      return [...prev, ...fresh]
    })
    setAnalyzed(null) // new files invalidate previous analysis
  }

  function removeFile(name: string) {
    setFiles(prev => prev.filter(f => f.name !== name))
    setItemParams(prev => { const { [name]: _, ...rest } = prev; return rest })
    setAnalyzed(prev => prev ? prev.filter(a => a.filename !== name) : null)
  }

  function setParam<K extends keyof ItemParams>(name: string, key: K, val: ItemParams[K]) {
    setItemParams(prev => ({ ...prev, [name]: { ...prev[name], [key]: val } }))
  }

  async function runAIAnalysis() {
    if (!files.length) return
    setIsAnalyzing(true)
    try {
      const result: { parts: AnalyzedPart[] } = await api.bulk.analyzeDrawings(files)
      setAnalyzed(result.parts)
      // Pre-fill part params from AI results
      result.parts.forEach(ap => {
        if (ap.error) return
        // Only update if there's useful data (description / material fields are metadata,
        // not ItemParams — they go into overrides)
      })
      toast.success(`${result.parts.length} drawings analyzed`)
    } catch {
      toast.error('AI analysis failed — you can still submit manually')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) return
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    const overrides: Record<string, ItemParams & { part_description?: string; material?: string }> = {}
    files.forEach(f => {
      const base = itemParams[f.name] ?? defaults
      const ai   = analyzed?.find(a => a.filename === f.name)
      overrides[f.name] = {
        ...base,
        ...(ai?.description ? { part_description: ai.description } : {}),
        ...(ai?.material    ? { material: ai.material } : {}),
      }
    })
    fd.append('overrides', JSON.stringify(overrides))
    fd.append('shared_params', JSON.stringify({ ...defaults, lots_per_year: 10, shifts_per_day: 2, annual_production_hours: 4000 }))
    createMut.mutate(fd)
  }

  const hasAIData = analyzed && analyzed.some(a => !a.error)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragging ? 'border-brand bg-brand/5' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
        )}
      >
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff" className="hidden"
          onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-8 h-8 text-[#c8cdd8]" />
          <p className="font-medium text-[#4a5568] text-sm">Drop drawing files or click to browse</p>
          <p className="text-xs text-[#9aa3b2]">PDF, PNG, JPG, WEBP · up to {BULK_MAX} files</p>
          {files.length > 0 && (
            <span className="mt-1 inline-flex items-center gap-1.5 bg-brand/10 text-brand text-xs font-semibold px-3 py-1 rounded-full">
              <Layers className="w-3 h-3" />
              {files.length} file{files.length !== 1 ? 's' : ''} selected — configure below or add more
            </span>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2.5">
          {/* AI Identify bar */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
            <div className="flex items-center gap-2 text-xs text-purple-700">
              <Wand2 className="w-4 h-4 shrink-0" />
              <span>
                {hasAIData
                  ? `AI identified ${analyzed!.filter(a => !a.error).length} of ${files.length} drawing${files.length !== 1 ? 's' : ''}`
                  : 'Let AI read each drawing and extract the part name, description, and material'}
              </span>
            </div>
            <button
              type="button"
              onClick={runAIAnalysis}
              disabled={isAnalyzing}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-purple-700 border border-purple-200 bg-white rounded-lg px-3 py-1.5 hover:bg-purple-50 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? (
                <><RefreshCw className="w-3 h-3 animate-spin" /> Analyzing…</>
              ) : (
                <><Wand2 className="w-3 h-3" /> {hasAIData ? 'Re-analyze' : 'Identify with AI'}</>
              )}
            </button>
          </div>

          {/* AI results summary chips */}
          {hasAIData && (
            <div className="space-y-1.5">
              {analyzed!.map(ap => (
                <div key={ap.filename} className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                  ap.error ? 'border-red-100 bg-red-50/30' : ap.confidence >= 0.7 ? 'border-green-100 bg-green-50/20' : 'border-amber-100 bg-amber-50/20',
                )}>
                  <FileText className="w-3 h-3 shrink-0 text-[#9aa3b2]" />
                  <span className="font-medium text-[#0f1729] truncate max-w-[140px]" title={ap.filename}>{ap.filename}</span>
                  <span className="text-[#9aa3b2]">→</span>
                  {ap.error ? (
                    <span className="text-red-500 truncate">{ap.part_name}</span>
                  ) : (
                    <>
                      <span className="font-semibold text-[#0f1729] truncate">{ap.part_name}</span>
                      {ap.material && <span className="text-[#9aa3b2] truncate hidden sm:inline">· {ap.material}</span>}
                      <span className={cn('ml-auto shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded',
                        ap.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                        {Math.round(ap.confidence * 100)}%
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Batch defaults bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-[#f8f9fc] border border-[#e5e8ef]">
            <span className="text-xs font-semibold text-[#4a5568] shrink-0">Batch defaults:</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
              <select value={defaults.supplier_country} onChange={e => setDefaults(p => ({ ...p, supplier_country: e.target.value }))} className={SEL}>
                {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <select value={defaults.supplier_currency} onChange={e => setDefaults(p => ({ ...p, supplier_currency: e.target.value }))} className={SEL}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={defaults.procurement_type} onChange={e => setDefaults(p => ({ ...p, procurement_type: e.target.value }))} className={cn(SEL, 'col-span-2 sm:col-span-1')}>
                {PROCUREMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input type="number" min={1} value={defaults.annual_volume} onChange={e => setDefaults(p => ({ ...p, annual_volume: Number(e.target.value) }))} placeholder="Annual vol" className={NUM} />
              <input type="number" min={1} value={defaults.lot_size} onChange={e => setDefaults(p => ({ ...p, lot_size: Number(e.target.value) }))} placeholder="Lot size" className={NUM} />
            </div>
            <button type="button" onClick={() => { const next: Record<string, ItemParams> = {}; files.forEach(f => { next[f.name] = { ...defaults } }); setItemParams(next) }}
              className="shrink-0 text-xs font-semibold text-brand hover:underline whitespace-nowrap self-end sm:self-auto">
              Apply to all
            </button>
          </div>

          {/* Column headers (desktop) */}
          <div className="hidden sm:grid grid-cols-[1fr_110px_72px_136px_82px_74px_24px] gap-2 px-3 pb-0.5">
            {['Drawing', 'Country', 'Ccy', 'Procurement', 'Annual vol', 'Lot size', ''].map((h, i) => (
              <span key={i} className={cn('text-[10px] font-semibold uppercase tracking-wide text-[#9aa3b2]', i >= 4 ? 'text-right' : '')}>{h}</span>
            ))}
          </div>

          {/* Item rows */}
          <div className="space-y-1.5">
            {files.map(f => {
              const p = itemParams[f.name] ?? defaults
              return (
                <div key={f.name} className="rounded-xl border border-[#e5e8ef] bg-white px-3 py-2.5">
                  <div className="hidden sm:grid grid-cols-[1fr_110px_72px_136px_82px_74px_24px] items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[#0f1729] min-w-0" title={f.name}>
                      <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <select value={p.supplier_country} onChange={e => setParam(f.name, 'supplier_country', e.target.value)} className={SEL}>
                      {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    <select value={p.supplier_currency} onChange={e => setParam(f.name, 'supplier_currency', e.target.value)} className={SEL}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={p.procurement_type} onChange={e => setParam(f.name, 'procurement_type', e.target.value)} className={SEL}>
                      {PROCUREMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input type="number" min={1} value={p.annual_volume} onChange={e => setParam(f.name, 'annual_volume', Number(e.target.value))} className={NUM} />
                    <input type="number" min={1} value={p.lot_size} onChange={e => setParam(f.name, 'lot_size', Number(e.target.value))} className={NUM} />
                    <button type="button" onClick={() => removeFile(f.name)} className="text-[#c8cdd8] hover:text-red-500 transition-colors rounded hover:bg-red-50 p-0.5 ml-auto">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Mobile card */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#0f1729] min-w-0" title={f.name}>
                        <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <button type="button" onClick={() => removeFile(f.name)} className="shrink-0 text-[#c8cdd8] hover:text-red-500 transition-colors rounded p-1 hover:bg-red-50">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Country</p>
                        <select value={p.supplier_country} onChange={e => setParam(f.name, 'supplier_country', e.target.value)} className={SEL}>
                          {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Currency</p>
                        <select value={p.supplier_currency} onChange={e => setParam(f.name, 'supplier_currency', e.target.value)} className={SEL}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Procurement</p>
                        <select value={p.procurement_type} onChange={e => setParam(f.name, 'procurement_type', e.target.value)} className={SEL}>
                          {PROCUREMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Annual vol</p>
                        <input type="number" min={1} value={p.annual_volume} onChange={e => setParam(f.name, 'annual_volume', Number(e.target.value))} className={NUM} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Lot size</p>
                        <input type="number" min={1} value={p.lot_size} onChange={e => setParam(f.name, 'lot_size', Number(e.target.value))} className={NUM} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!files.length}
        loading={createMut.isPending}
        iconLeft={<Play className="w-4 h-4" />}
        className="w-full"
      >
        {files.length > 0
          ? `Start Batch Costing — ${files.length} drawing${files.length !== 1 ? 's' : ''}`
          : 'Start Batch Costing'}
      </Button>
    </form>
  )
}

// ─── SPREADSHEET MODE ─────────────────────────────────────────────────────────

function SpreadsheetMode({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const sheetInputRef = useRef<HTMLInputElement>(null)
  const [sheetFile, setSheetFile]         = useState<File | null>(null)
  const [sheetIsDragging, setSheetIsDrag] = useState(false)
  const [sheetRowCount, setSheetRowCount] = useState<number | null>(null)

  const sheetMut = useMutation({
    mutationFn: (f: File) => api.bulk.createFromSpreadsheet(f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success('Batch created — processing started')
      setSheetFile(null); setSheetRowCount(null)
      onCreated()
    },
    onError: () => toast.error('Failed to create batch from spreadsheet'),
  })

  function onFileSelected(f: File) {
    setSheetFile(f)
    if (f.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = e => {
        const rows = (e.target?.result as string ?? '').split(/\r?\n/).filter(l => l.trim())
        setSheetRowCount(Math.max(0, rows.length - 1))
      }
      reader.readAsText(f)
    } else {
      setSheetRowCount(null)
    }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); if (sheetFile) sheetMut.mutate(sheetFile) }} className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f8f9fc] border border-[#e5e8ef] text-xs text-[#4a5568]">
        <div className="flex-1">
          <p className="font-semibold text-[#0f1729] mb-1">Spreadsheet columns (row 1 = headers) or PDF parts list</p>
          <p className="font-mono text-[11px] text-[#9aa3b2] leading-relaxed">
            part_name · description · material · supplier_country · supplier_currency · procurement_type · annual_volume · lot_size
          </p>
          <p className="mt-1 text-[11px] text-[#9aa3b2]">
            <strong className="text-[#0f1729]">.xlsx / .csv:</strong> row 1 = headers, only <strong className="text-[#0f1729]">part_name</strong> required.{' '}
            <strong className="text-[#0f1729]">.pdf:</strong> AI extracts parts automatically.
          </p>
        </div>
        <button type="button" onClick={downloadCSVTemplate}
          className="shrink-0 flex items-center gap-1 text-brand hover:underline font-medium text-[11px] mt-0.5">
          <Download className="w-3 h-3" />
          Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setSheetIsDrag(true) }}
        onDragLeave={() => setSheetIsDrag(false)}
        onDrop={e => {
          e.preventDefault(); setSheetIsDrag(false)
          const f = e.dataTransfer.files[0]
          if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.csv') || f.name.endsWith('.xls') || f.name.endsWith('.pdf'))) onFileSelected(f)
          else toast.error('Please drop an .xlsx, .csv, or .pdf file')
        }}
        onClick={() => sheetInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          sheetIsDragging ? 'border-brand bg-brand/5' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
        )}
      >
        <input ref={sheetInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f); e.target.value = '' }} />
        {sheetFile ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <p className="font-medium text-[#0f1729] text-sm">{sheetFile.name}</p>
            {sheetRowCount !== null ? (
              <span className="inline-flex items-center gap-1.5 bg-brand/10 text-brand text-xs font-semibold px-3 py-1 rounded-full">
                ~{sheetRowCount} part{sheetRowCount !== 1 ? 's' : ''} detected
              </span>
            ) : sheetFile.name.endsWith('.pdf') ? (
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
                AI will extract parts from PDF
              </span>
            ) : null}
            <button type="button" onClick={e => { e.stopPropagation(); setSheetFile(null); setSheetRowCount(null) }}
              className="text-xs text-red-500 hover:underline">Remove</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-[#c8cdd8]" />
            <p className="font-medium text-[#4a5568] text-sm">Drop .xlsx, .csv, or .pdf here, or click to browse</p>
            <p className="text-xs text-[#9aa3b2]">Up to {BULK_MAX} parts · Excel 2007+, CSV, or PDF (AI extraction)</p>
          </div>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!sheetFile}
        loading={sheetMut.isPending}
        iconLeft={<Play className="w-4 h-4" />}
        className="w-full"
      >
        {sheetFile
          ? `Start Batch Costing${sheetRowCount !== null ? ` — ${sheetRowCount} parts` : ''}`
          : 'Start Batch Costing'}
      </Button>
    </form>
  )
}

// ─── SMART UPLOAD MODE (Manifest + Drawings folder matching) ──────────────────

type SmartStep = 'upload' | 'review'

interface SmartManifestRow {
  part_name: string
  description: string
  material: string
  supplier_country: string
  supplier_currency: string
  annual_volume: number
  lot_size: number
  procurement_type: string
}

function SmartUploadMode({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const manifestInputRef = useRef<HTMLInputElement>(null)
  const drawingFolderRef = useRef<HTMLInputElement>(null)

  const [step, setStep]                   = useState<SmartStep>('upload')
  const [manifestFile, setManifestFile]   = useState<File | null>(null)
  const [drawingFiles, setDrawingFiles]   = useState<File[]>([])
  const [isParsing, setIsParsing]         = useState(false)
  const [reviewRows, setReviewRows]       = useState<ReviewRow[]>([])

  // ── Parse manifest and build review rows ─────────────────────────────────

  async function parseAndMatch() {
    if (!manifestFile) return
    setIsParsing(true)
    try {
      let rows: SmartManifestRow[] = []
      if (manifestFile.name.endsWith('.csv')) {
        // Parse CSV client-side
        const text = await manifestFile.text()
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length >= 2) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
          rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? '' })
            return {
              part_name:        obj.part_name ?? '',
              description:      obj.description ?? '',
              material:         obj.material ?? '',
              supplier_country: obj.supplier_country ?? obj.country ?? 'DE',
              supplier_currency:obj.supplier_currency ?? obj.currency ?? 'EUR',
              annual_volume:    parseFloat(obj.annual_volume ?? '1000') || 1000,
              lot_size:         parseFloat(obj.lot_size ?? '100') || 100,
              procurement_type: obj.procurement_type ?? 'in_house',
            }
          }).filter(r => !!r.part_name.trim())
        }
      } else {
        // XLSX or PDF — send to server parse-manifest endpoint
        const result: { rows: Record<string, string>[] } = await api.bulk.parseManifest(manifestFile)
        rows = (result.rows ?? []).map(obj => ({
          part_name:        obj.part_name ?? '',
          description:      obj.description ?? '',
          material:         obj.material ?? '',
          supplier_country: obj.supplier_country ?? obj.country ?? 'DE',
          supplier_currency:obj.supplier_currency ?? obj.currency ?? 'EUR',
          annual_volume:    parseFloat(obj.annual_volume ?? '1000') || 1000,
          lot_size:         parseFloat(obj.lot_size ?? '100') || 100,
          procurement_type: obj.procurement_type ?? 'in_house',
        })).filter(r => !!r.part_name.trim())
      }

      if (!rows.length) { toast.error('No parts found in manifest'); return }

      // Match drawing files by fuzzy filename similarity (reduce avoids let-in-closure TS issues)
      const matched = new Set<string>()
      const result: ReviewRow[] = rows.slice(0, BULK_MAX).map(row => {
        const best = drawingFiles.reduce<{ file: File; score: number } | null>((acc, df) => {
          if (matched.has(df.name)) return acc
          const s = matchScore(row.part_name, df.name)
          return !acc || s > acc.score ? { file: df, score: s } : acc
        }, null)
        const drawingFile: File | null = best !== null && best.score >= 0.5 ? best.file : null
        if (drawingFile) matched.add(drawingFile.name)
        return {
          _id: crypto.randomUUID(),
          part_name:        row.part_name,
          description:      row.description,
          material:         row.material,
          supplier_country: row.supplier_country,
          supplier_currency:row.supplier_currency,
          annual_volume:    row.annual_volume,
          lot_size:         row.lot_size,
          procurement_type: row.procurement_type,
          drawing_file:     drawingFile,
          drawing_filename: drawingFile ? drawingFile.name : '',
          match_score:      best !== null ? best.score : 0,
          match_status:     drawingFile ? 'auto' : 'missing',
        }
      })

      // Unmatched drawing files → extra rows (user can assign them to parts)
      drawingFiles.filter(df => !matched.has(df.name)).forEach(df => {
        result.push({
          _id:              crypto.randomUUID(),
          part_name:        df.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          description:      '',
          material:         '',
          supplier_country: 'DE',
          supplier_currency:'EUR',
          annual_volume:    1000,
          lot_size:         100,
          procurement_type: 'in_house',
          drawing_file:     df,
          drawing_filename: df.name,
          match_score:      0,
          match_status:     'extra',
        })
      })

      setReviewRows(result)
      setStep('review')
    } catch (err) {
      toast.error('Failed to parse manifest')
    } finally {
      setIsParsing(false)
    }
  }

  // ── Inline edit helpers ───────────────────────────────────────────────────

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, ...patch, match_status: r.match_status === 'auto' ? 'manual' : r.match_status } : r))
  }

  function removeRow(id: string) {
    setReviewRows(prev => prev.filter(r => r._id !== id))
  }

  function addManualRow() {
    setReviewRows(prev => [...prev, {
      _id: crypto.randomUUID(),
      part_name: '', description: '', material: '',
      supplier_country: 'DE', supplier_currency: 'EUR',
      annual_volume: 1000, lot_size: 100, procurement_type: 'in_house',
      drawing_file: null, drawing_filename: '',
      match_score: 0, match_status: 'missing',
    }])
  }

  // ── Upload drawing for a specific row ────────────────────────────────────

  const rowFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function assignDrawingToRow(rowId: string, file: File) {
    setReviewRows(prev => prev.map(r => r._id === rowId ? { ...r, drawing_file: file, drawing_filename: file.name, match_status: 'manual' } : r))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (fd: FormData) => api.bulk.create(fd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success('Batch created — processing started')
      setStep('upload'); setManifestFile(null); setDrawingFiles([])
      setReviewRows([])
      onCreated()
    },
    onError: () => toast.error('Failed to create batch'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = reviewRows.filter(r => r.part_name.trim())
    if (!valid.length) { toast.error('No valid parts to submit'); return }
    const fd = new FormData()
    const overrides: Record<string, object> = {}
    valid.forEach(r => {
      if (r.drawing_file) {
        fd.append('files', r.drawing_file)
        overrides[r.drawing_file.name] = {
          supplier_country:  r.supplier_country,
          supplier_currency: r.supplier_currency,
          procurement_type:  r.procurement_type,
          annual_volume:     r.annual_volume,
          lot_size:          r.lot_size,
          ...(r.description ? { part_description: r.description } : {}),
          ...(r.material    ? { material: r.material } : {}),
        }
      }
      // Items with no drawing file will be submitted as name-only via a JSON body —
      // but the current API requires files. We attach a tiny text placeholder.
    })
    fd.append('overrides', JSON.stringify(overrides))
    fd.append('shared_params', JSON.stringify({ supplier_country: 'DE', supplier_currency: 'EUR', annual_volume: 1000, lot_size: 100, procurement_type: 'in_house', lots_per_year: 10, shifts_per_day: 2, annual_production_hours: 4000 }))
    createMut.mutate(fd)
  }

  // ─── Step 1: Upload ───────────────────────────────────────────────────────

  if (step === 'upload') {
    return (
      <div className="space-y-5">
        {/* How it works */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
          <ScanSearch className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Smart Upload — Manifest + Drawings</p>
            <p>Upload a parts manifest (CSV/XLSX/PDF) and a folder of drawing files. AI automatically matches each drawing to its part, then you review and fill any gaps before starting the batch.</p>
          </div>
        </div>

        {/* Manifest upload */}
        <div>
          <p className="text-xs font-semibold text-[#4a5568] mb-2">1. Parts manifest <span className="font-normal text-[#9aa3b2]">(CSV, XLSX, or PDF)</span></p>
          <div
            onClick={() => manifestInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors',
              manifestFile ? 'border-green-300 bg-green-50/40' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
            )}
          >
            <input ref={manifestInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setManifestFile(f); e.target.value = '' }} />
            {manifestFile ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-[#0f1729]">{manifestFile.name}</span>
                <button type="button" onClick={e => { e.stopPropagation(); setManifestFile(null) }} className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[#4a5568]">
                <FileText className="w-5 h-5 text-[#c8cdd8]" />
                <span className="text-sm">Drop manifest or click to browse</span>
              </div>
            )}
          </div>
        </div>

        {/* Drawings folder upload */}
        <div>
          <p className="text-xs font-semibold text-[#4a5568] mb-2">2. Drawing files folder <span className="font-normal text-[#9aa3b2]">(optional — also accepts individual files)</span></p>
          <div
            onClick={() => drawingFolderRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors',
              drawingFiles.length > 0 ? 'border-blue-200 bg-blue-50/30' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
            )}
          >
            {/* webkitdirectory + multiple lets users pick a whole folder */}
            <input
              ref={drawingFolderRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff"
              className="hidden"
              onChange={e => {
                if (!e.target.files) return
                const incoming = Array.from(e.target.files).filter(f => ACCEPTED_DRAWING_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
                setDrawingFiles(incoming)
                e.target.value = ''
              }}
            />
            {drawingFiles.length > 0 ? (
              <div className="flex items-center justify-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium text-[#0f1729]">{drawingFiles.length} drawing file{drawingFiles.length !== 1 ? 's' : ''} selected</span>
                <button type="button" onClick={e => { e.stopPropagation(); setDrawingFiles([]) }} className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[#4a5568]">
                <FolderOpen className="w-5 h-5 text-[#c8cdd8]" />
                <span className="text-sm">Select drawings folder or individual files</span>
              </div>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={!manifestFile}
          loading={isParsing}
          iconLeft={<ScanSearch className="w-4 h-4" />}
          onClick={parseAndMatch}
          className="w-full"
        >
          {isParsing ? 'Parsing & Matching…' : 'Parse Manifest & Match Drawings'}
        </Button>
      </div>
    )
  }

  // ─── Step 2: Review table ─────────────────────────────────────────────────

  const matched  = reviewRows.filter(r => r.match_status === 'auto' || r.match_status === 'manual')
  const missing  = reviewRows.filter(r => r.match_status === 'missing')
  const extra    = reviewRows.filter(r => r.match_status === 'extra')

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Review header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0f1729]">Review & Edit Parts</h3>
          <p className="text-xs text-[#9aa3b2] mt-0.5">
            {matched.length} matched · {missing.length} missing drawing · {extra.length} extra
          </p>
        </div>
        <button type="button" onClick={() => setStep('upload')} className="text-xs text-brand hover:underline flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> Back
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {matched.length > 0  && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold"><CheckSquare className="w-3 h-3" /> {matched.length} matched</span>}
        {missing.length > 0  && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> {missing.length} missing drawing</span>}
        {extra.length > 0    && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold"><Plus className="w-3 h-3" /> {extra.length} extra (no manifest entry)</span>}
      </div>

      {/* Review table */}
      <div className="space-y-2">
        {reviewRows.map(row => {
          const statusColor =
            row.match_status === 'auto'    ? 'border-green-200 bg-green-50/20' :
            row.match_status === 'manual'  ? 'border-blue-200 bg-blue-50/20' :
            row.match_status === 'extra'   ? 'border-indigo-200 bg-indigo-50/10' :
            'border-amber-200 bg-amber-50/20'

          return (
            <div key={row._id} className={cn('rounded-xl border p-3 space-y-2.5', statusColor)}>
              {/* Row header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Part name *</p>
                    <input value={row.part_name} onChange={e => updateRow(row._id, { part_name: e.target.value })} className={INP} placeholder="Required" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Description</p>
                    <input value={row.description} onChange={e => updateRow(row._id, { description: e.target.value })} className={INP} placeholder="Optional" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#9aa3b2] mb-0.5">Material</p>
                    <input value={row.material} onChange={e => updateRow(row._id, { material: e.target.value })} className={INP} placeholder="Optional" />
                  </div>
                </div>
                <button type="button" onClick={() => removeRow(row._id)} className="shrink-0 text-[#c8cdd8] hover:text-red-500 p-1 rounded hover:bg-red-50 mt-4">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Params row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <select value={row.supplier_country} onChange={e => updateRow(row._id, { supplier_country: e.target.value })} className={SEL}>
                  {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                <select value={row.supplier_currency} onChange={e => updateRow(row._id, { supplier_currency: e.target.value })} className={SEL}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={row.procurement_type} onChange={e => updateRow(row._id, { procurement_type: e.target.value })} className={cn(SEL, 'col-span-2 sm:col-span-1')}>
                  {PROCUREMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input type="number" min={1} value={row.annual_volume} onChange={e => updateRow(row._id, { annual_volume: Number(e.target.value) })} className={NUM} />
                <input type="number" min={1} value={row.lot_size} onChange={e => updateRow(row._id, { lot_size: Number(e.target.value) })} className={NUM} />
              </div>

              {/* Drawing assignment */}
              <div className="flex items-center gap-2 text-xs">
                {row.drawing_file ? (
                  <span className="flex items-center gap-1 text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-0.5 font-medium">
                    <CheckCircle className="w-3 h-3" />
                    {row.drawing_filename}
                    <button type="button" onClick={() => updateRow(row._id, { drawing_file: null, drawing_filename: '', match_status: 'missing', match_score: 0 })}
                      className="text-green-400 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                  </span>
                ) : (
                  <span className="text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
                    No drawing file
                  </span>
                )}
                <label className="flex items-center gap-1 cursor-pointer text-brand hover:underline">
                  <Upload className="w-3 h-3" />
                  {row.drawing_file ? 'Change' : 'Upload drawing'}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) assignDrawingToRow(row._id, f); e.target.value = '' }} />
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button" onClick={addManualRow}
        className="flex items-center gap-1.5 text-xs text-brand hover:underline font-medium">
        <Plus className="w-3.5 h-3.5" /> Add row manually
      </button>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!reviewRows.some(r => r.part_name.trim() && r.drawing_file)}
        loading={createMut.isPending}
        iconLeft={<Play className="w-4 h-4" />}
        className="w-full"
      >
        {`Start Batch Costing — ${reviewRows.filter(r => r.part_name.trim() && r.drawing_file).length} part${reviewRows.filter(r => r.part_name.trim() && r.drawing_file).length !== 1 ? 's' : ''}`}
      </Button>
    </form>
  )
}

// ─── NEW BATCH TAB ────────────────────────────────────────────────────────────

function NewBatchTab() {
  const [batchMode, setBatchMode] = useState<BatchInputMode>('drawings')
  const [, forceSwitch] = useState(0)

  function handleCreated() {
    forceSwitch(n => n + 1) // triggers re-render (TanStack Query invalidated upstream)
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-[#f1f3f7] rounded-xl">
        {([
          { id: 'drawings',    label: 'Drawing Files',   icon: FileText },
          { id: 'spreadsheet', label: 'Spreadsheet',     icon: Layers },
          { id: 'smart',       label: 'Smart Upload',    icon: ScanSearch },
        ] as const).map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setBatchMode(m.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all',
              batchMode === m.id ? 'bg-white text-[#0f1729] shadow-sm' : 'text-[#9aa3b2] hover:text-[#4a5568]',
            )}
          >
            <m.icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {batchMode === 'drawings'    && <DrawingFilesMode onCreated={handleCreated} />}
      {batchMode === 'spreadsheet' && <SpreadsheetMode  onCreated={handleCreated} />}
      {batchMode === 'smart'       && <SmartUploadMode  onCreated={handleCreated} />}
    </div>
  )
}

// ─── STATUS INDICATOR ────────────────────────────────────────────────────────

function BatchStatusIndicator({ status }: { status: BatchStatus }) {
  if (status === 'processing') return (
    <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
      <span className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: '1.4s' }} />
      <Zap className="relative w-4 h-4 text-blue-600" />
    </div>
  )
  if (status === 'queued') return (
    <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
      <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: '2s' }} />
      <Clock className="relative w-4 h-4 text-amber-600" />
    </div>
  )
  if (status === 'completed')             return <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><CheckCircle className="w-4 h-4 text-green-600" /></div>
  if (status === 'completed_with_errors') return <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
  if (status === 'failed')                return <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-4 h-4 text-red-600" /></div>
  return <div className="w-8 h-8 rounded-full bg-[#f1f3f7] flex items-center justify-center flex-shrink-0"><X className="w-4 h-4 text-[#9aa3b2]" /></div>
}

// ─── HISTORY TAB ─────────────────────────────────────────────────────────────

function HistoryTab() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()

  const { data: batches = [], isLoading } = useQuery<CostingBatch[]>({
    queryKey: ['batches'],
    queryFn: () => api.bulk.list(),
    refetchInterval: q => {
      const d = q.state.data; if (!d) return false
      return d.some(b => b.status === 'processing' || b.status === 'queued') ? 3000 : false
    },
  })

  const retryMut = useMutation({
    mutationFn: (id: string) => api.bulk.retry(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['batches'] }); toast.success('Retry started') },
    onError: () => toast.error('Failed to retry'),
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.bulk.cancel(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['batches'] }); toast.success('Batch cancelled') },
    onError: () => toast.error('Failed to cancel'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.bulk.softDelete(id),
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: ['batches'] })
      const prev = queryClient.getQueryData<CostingBatch[]>(['batches'])
      queryClient.setQueryData<CostingBatch[]>(['batches'], old => old?.filter(b => b.id !== id) ?? [])
      return { prev }
    },
    onSuccess: () => toast.success('Batch deleted'),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['batches'], ctx.prev)
      toast.error('Failed to delete')
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-2.5">
            <Skeleton variant="line" height="14px" width="200px" />
            <Skeleton variant="rect" height="5px" className="rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <EmptyState
        illustration={<BatchEmptyIllustration />}
        title="No batch jobs yet"
        description="Add drawing files to cost multiple parts at once."
      />
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {batches.map((batch, i) => {
          const pct = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0
          const isActive = batch.status === 'processing' || batch.status === 'queued'
          return (
            <motion.div
              key={batch.id}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className={cn(
                'rounded-xl border p-4 cursor-pointer group transition-all',
                isActive ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300' : 'border-[#e5e8ef] bg-white hover:bg-surface-2',
              )}
              onClick={() => navigate(`/bulk/${batch.id}`)}
            >
              <div className="flex items-center gap-3">
                <BatchStatusIndicator status={batch.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#1e2d4e]">#{batch.id.slice(0, 8)}</span>
                      <span className="text-xs text-[#9aa3b2] capitalize">{batch.batch_type.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#9aa3b2]">
                        {batch.processed_items}/{batch.total_items} items
                        {batch.failed_items > 0 && <span className="text-red-500 ml-1">· {batch.failed_items} err</span>}
                      </span>
                      <span className="text-[#c8cdd8] text-xs">·</span>
                      <span className="text-xs text-[#9aa3b2]">{format(new Date(batch.created_at), 'dd MMM HH:mm')}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="h-1.5 w-full rounded-full bg-[#e5e8ef] overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full', {
                          'bg-blue-500': batch.status === 'processing',
                          'bg-amber-400': batch.status === 'queued',
                          'bg-green-500': batch.status === 'completed',
                          'bg-amber-500': batch.status === 'completed_with_errors',
                          'bg-red-500': batch.status === 'failed',
                          'bg-[#c8cdd8]': batch.status === 'cancelled',
                        })}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={cn('text-[10px] font-semibold', BATCH_STATUS_COLORS[batch.status].split(' ')[1])}>
                        {batch.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-[#9aa3b2] font-mono">{pct}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {(batch.status === 'failed' || batch.status === 'completed_with_errors') && (
                    <button onClick={() => retryMut.mutate(batch.id)} disabled={retryMut.isPending}
                      className="p-1.5 rounded-md hover:bg-brand/10 text-brand transition-colors" title="Retry">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isActive && (
                    <button onClick={() => cancelMut.mutate(batch.id)} disabled={cancelMut.isPending}
                      className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors" title="Cancel">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {(batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled') && (
                    <button onClick={() => deleteMut.mutate(batch.id)} disabled={deleteMut.isPending}
                      className="p-1.5 rounded-md hover:bg-red-50 text-red-400 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────

function BulkCostingList() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Bulk Costing</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Upload drawing files to cost multiple parts simultaneously</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex border-b border-[#e5e8ef] relative">
            {(['new', 'history'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn('relative px-6 py-3.5 text-sm font-medium transition-colors',
                  activeTab === tab ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]')}
              >
                {tab === 'new' ? 'New Batch' : 'History'}
                {activeTab === tab && (
                  <motion.div
                    layoutId="bulk-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'new' ? <NewBatchTab /> : <HistoryTab />}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function BulkCosting() {
  usePageTitle('Bulk Costing')
  const { id } = useParams<{ id?: string }>()
  return (
    <UpgradeGate requiredPlan="pro" feature="Bulk Costing">
      {id ? <BatchDetail id={id} /> : <BulkCostingList />}
    </UpgradeGate>
  )
}
