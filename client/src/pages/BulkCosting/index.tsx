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

const ACCEPTED_DRAWING_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'step', 'stp', 'iges', 'igs', 'stl', 'obj', 'dxf'])

const BULK_MAX = 50


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

// ─── UNIFIED UPLOAD MODE ─────────────────────────────────────────────────────

function UnifiedUploadMode({ onCreated }: { onCreated: () => void }) {
  const queryClient      = useQueryClient()
  const drawingInputRef  = useRef<HTMLInputElement>(null)
  const manifestInputRef = useRef<HTMLInputElement>(null)
  const rowFileRefs      = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Files ─────────────────────────────────────────────────────────────────
  const [drawingFiles, setDrawingFiles]     = useState<File[]>([])
  const [isDragging, setIsDragging]         = useState(false)
  const [manifestFile, setManifest]         = useState<File | null>(null)
  const [sheetRowCount, setSheetRowCount]   = useState<number | null>(null)
  const [step, setStep]                     = useState<'upload' | 'review'>('upload')

  // ── Drawing-path state ────────────────────────────────────────────────────
  const [defaults, setDefaults]   = useState<ItemParams>({ ...DEFAULT_PARAMS })
  const [itemParams, setItemParams] = useState<Record<string, ItemParams>>({})
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzed, setAnalyzed]   = useState<AnalyzedPart[] | null>(null)

  // ── Review-path state ─────────────────────────────────────────────────────
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [isParsing, setIsParsing]   = useState(false)

  const hasDrawings = drawingFiles.length > 0
  const hasManifest = manifestFile !== null
  const uploadMode  = hasDrawings && hasManifest ? 'both'
    : hasDrawings ? 'drawings'
    : hasManifest ? 'manifest'
    : 'empty'

  // ── Add drawings ──────────────────────────────────────────────────────────
  function addFiles(incoming: File[]) {
    const valid = incoming.filter(f =>
      ACCEPTED_DRAWING_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? ''))
    if (valid.length < incoming.length)
      toast.error('Some files skipped — accepted: PDF, PNG, JPG, STEP, STP, IGES, STL, DXF')
    if (!valid.length) return
    setDrawingFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const fresh = valid.filter(f => !existing.has(f.name))
      setItemParams(curr => {
        const next = { ...curr }
        fresh.forEach(f => { next[f.name] = { ...defaults } })
        return next
      })
      return [...prev, ...fresh]
    })
  }

  function removeFile(name: string) {
    setDrawingFiles(prev => prev.filter(f => f.name !== name))
    setItemParams(prev => { const { [name]: _, ...rest } = prev; return rest })
    setAnalyzed(prev => prev ? prev.filter(a => a.filename !== name) : null)
  }

  // ── Set manifest ──────────────────────────────────────────────────────────
  async function selectManifest(file: File) {
    setManifest(file)
    setSheetRowCount(null)
    if (file.name.endsWith('.csv')) {
      try {
        const text  = await file.text()
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        setSheetRowCount(Math.max(0, lines.length - 1))
      } catch { /* ignore */ }
    }
  }

  // ── Per-item params helpers ───────────────────────────────────────────────
  function setParam<K extends keyof ItemParams>(name: string, key: K, val: ItemParams[K]) {
    setItemParams(prev => ({ ...prev, [name]: { ...prev[name], [key]: val } }))
  }

  function applyDefaultsToAll() {
    setItemParams(curr => {
      const next = { ...curr }
      Object.keys(next).forEach(k => { next[k] = { ...defaults } })
      return next
    })
    toast.success('Defaults applied to all parts')
  }

  // ── AI analysis ───────────────────────────────────────────────────────────
  async function runAIAnalysis() {
    if (!drawingFiles.length) return
    setIsAnalyzing(true)
    try {
      const result: { parts: AnalyzedPart[] } = await api.bulk.analyzeDrawings(drawingFiles)
      setAnalyzed(result.parts)
      toast.success(`${result.parts.length} drawing${result.parts.length !== 1 ? 's' : ''} analyzed`)
    } catch {
      toast.error('AI analysis failed — you can still submit manually')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── Parse manifest + match drawings ───────────────────────────────────────
  async function parseAndMatch() {
    if (!manifestFile) return
    setIsParsing(true)
    try {
      type ManRow = {
        part_name: string; description: string; material: string
        supplier_country: string; supplier_currency: string
        annual_volume: number; lot_size: number; procurement_type: string
      }
      let rows: ManRow[] = []

      if (manifestFile.name.endsWith('.csv')) {
        const text    = await manifestFile.text()
        const csvLines = text.split(/\r?\n/).filter(l => l.trim())
        if (csvLines.length >= 2) {
          const headers = csvLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
          rows = csvLines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? '' })
            return {
              part_name:         obj.part_name ?? '',
              description:       obj.description ?? '',
              material:          obj.material ?? '',
              supplier_country:  obj.supplier_country ?? obj.country ?? 'DE',
              supplier_currency: obj.supplier_currency ?? obj.currency ?? 'EUR',
              annual_volume:     parseFloat(obj.annual_volume ?? '1000') || 1000,
              lot_size:          parseFloat(obj.lot_size ?? '100') || 100,
              procurement_type:  obj.procurement_type ?? 'in_house',
            }
          }).filter(r => !!r.part_name.trim())
        }
      } else {
        const res: { rows: Record<string, string>[] } = await api.bulk.parseManifest(manifestFile)
        rows = (res.rows ?? []).map(obj => ({
          part_name:         obj.part_name ?? '',
          description:       obj.description ?? '',
          material:          obj.material ?? '',
          supplier_country:  obj.supplier_country ?? obj.country ?? 'DE',
          supplier_currency: obj.supplier_currency ?? obj.currency ?? 'EUR',
          annual_volume:     parseFloat(obj.annual_volume ?? '1000') || 1000,
          lot_size:          parseFloat(obj.lot_size ?? '100') || 100,
          procurement_type:  obj.procurement_type ?? 'in_house',
        })).filter(r => !!r.part_name.trim())
      }

      if (!rows.length) { toast.error('No parts found in manifest'); setIsParsing(false); return }

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
          _id: crypto.randomUUID(), part_name: row.part_name,
          description: row.description, material: row.material,
          supplier_country: row.supplier_country, supplier_currency: row.supplier_currency,
          annual_volume: row.annual_volume, lot_size: row.lot_size,
          procurement_type: row.procurement_type,
          drawing_file: drawingFile, drawing_filename: drawingFile?.name ?? '',
          match_score: best?.score ?? 0,
          match_status: drawingFile ? 'auto' : 'missing',
        }
      })
      drawingFiles.filter(df => !matched.has(df.name)).forEach(df => {
        result.push({
          _id: crypto.randomUUID(),
          part_name: df.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          description: '', material: '',
          supplier_country: 'DE', supplier_currency: 'EUR',
          annual_volume: 1000, lot_size: 100, procurement_type: 'in_house',
          drawing_file: df, drawing_filename: df.name, match_score: 0, match_status: 'extra',
        })
      })
      setReviewRows(result)
      setStep('review')
    } catch {
      toast.error('Failed to parse manifest')
    } finally {
      setIsParsing(false)
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const batchMut = useMutation({
    mutationFn: (fd: FormData) => api.bulk.create(fd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success('Batch created — processing started')
      setDrawingFiles([]); setItemParams({}); setAnalyzed(null)
      onCreated()
    },
    onError: () => toast.error('Failed to create batch'),
  })

  const sheetMut = useMutation({
    mutationFn: (file: File) => api.bulk.createFromSpreadsheet(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      toast.success('Batch created — processing started')
      setManifest(null); setSheetRowCount(null)
      onCreated()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to create batch')
    },
  })

  // ── Submit: drawings only ─────────────────────────────────────────────────
  function submitDrawings(e: React.FormEvent) {
    e.preventDefault()
    if (!drawingFiles.length) return
    const fd = new FormData()
    drawingFiles.forEach(f => fd.append('files', f))
    const overrides: Record<string, unknown> = {}
    drawingFiles.forEach(f => {
      const base = itemParams[f.name] ?? defaults
      const ai   = analyzed?.find(a => a.filename === f.name)
      overrides[f.name] = {
        ...base,
        ...(ai?.description ? { part_description: ai.description } : {}),
        ...(ai?.material    ? { material: ai.material }            : {}),
      }
    })
    fd.append('overrides',     JSON.stringify(overrides))
    fd.append('shared_params', JSON.stringify({
      ...defaults, lots_per_year: 10, shifts_per_day: 2, annual_production_hours: 4000,
    }))
    batchMut.mutate(fd)
  }

  // ── Submit: review (manifest + drawings) ──────────────────────────────────
  function submitReview(e: React.FormEvent) {
    e.preventDefault()
    const valid = reviewRows.filter(r => r.part_name.trim())
    if (!valid.length) { toast.error('No valid parts to submit'); return }
    const fd        = new FormData()
    const overrides: Record<string, unknown> = {}
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
          ...(r.material    ? { material: r.material }            : {}),
        }
      }
    })
    fd.append('overrides',     JSON.stringify(overrides))
    fd.append('shared_params', JSON.stringify({
      supplier_country: 'DE', supplier_currency: 'EUR',
      annual_volume: 1000, lot_size: 100, procurement_type: 'in_house',
      lots_per_year: 10, shifts_per_day: 2, annual_production_hours: 4000,
    }))
    batchMut.mutate(fd)
  }

  // ── Review row helpers ────────────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setReviewRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r))
  }
  function removeRow(id: string) {
    setReviewRows(prev => prev.filter(r => r._id !== id))
  }
  function addManualRow() {
    setReviewRows(prev => [...prev, {
      _id: crypto.randomUUID(), part_name: '', description: '', material: '',
      supplier_country: 'DE', supplier_currency: 'EUR',
      annual_volume: 1000, lot_size: 100, procurement_type: 'in_house',
      drawing_file: null, drawing_filename: '', match_score: 0, match_status: 'missing',
    }])
  }
  function assignDrawingToRow(rowId: string, file: File) {
    setReviewRows(prev => prev.map(r =>
      r._id === rowId
        ? { ...r, drawing_file: file, drawing_filename: file.name, match_status: 'manual' }
        : r
    ))
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: REVIEW STEP
  // ────────────────────────────────────────────────────────────────────────────
  if (step === 'review') {
    const matched = reviewRows.filter(r => r.match_status === 'auto' || r.match_status === 'manual')
    const missing = reviewRows.filter(r => r.match_status === 'missing')
    const extra   = reviewRows.filter(r => r.match_status === 'extra')

    return (
      <form onSubmit={submitReview} className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0f1729]">Review &amp; Edit Parts</h3>
            <p className="text-xs text-[#9aa3b2] mt-0.5">
              {matched.length} matched · {missing.length} missing drawing · {extra.length} extra
            </p>
          </div>
          <button type="button" onClick={() => setStep('upload')}
            className="text-xs text-brand hover:underline flex items-center gap-1">
            <ChevronLeft className="w-3 h-3" /> Back
          </button>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {matched.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
              <CheckSquare className="w-3 h-3" />{matched.length} matched
            </span>
          )}
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
              <AlertTriangle className="w-3 h-3" />{missing.length} missing drawing
            </span>
          )}
          {extra.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
              <Plus className="w-3 h-3" />{extra.length} extra
            </span>
          )}
        </div>

        {/* Review table */}
        <div className="space-y-2">
          {reviewRows.map(row => {
            const statusColor =
              row.match_status === 'auto'   ? 'border-green-200 bg-green-50/20' :
              row.match_status === 'manual' ? 'border-blue-200 bg-blue-50/20' :
              row.match_status === 'extra'  ? 'border-indigo-200 bg-indigo-50/10' :
              'border-amber-200 bg-amber-50/20'
            return (
              <div key={row._id} className={cn('rounded-xl border p-3 space-y-2.5', statusColor)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <p className={LBL}>Part name *</p>
                      <input value={row.part_name}
                        onChange={e => updateRow(row._id, { part_name: e.target.value })}
                        className={INP} placeholder="Required" />
                    </div>
                    <div>
                      <p className={LBL}>Description</p>
                      <input value={row.description}
                        onChange={e => updateRow(row._id, { description: e.target.value })}
                        className={INP} placeholder="Optional" />
                    </div>
                    <div>
                      <p className={LBL}>Material</p>
                      <input value={row.material}
                        onChange={e => updateRow(row._id, { material: e.target.value })}
                        className={INP} placeholder="Optional" />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeRow(row._id)}
                    className="text-red-400 hover:text-red-600 mt-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Drawing assignment */}
                <div className="flex items-center gap-2 flex-wrap">
                  {row.drawing_file ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand/10 text-brand text-xs font-medium">
                      <FileText className="w-3 h-3" />{row.drawing_filename}
                      <button type="button"
                        onClick={() => updateRow(row._id, { drawing_file: null, drawing_filename: '', match_status: 'missing' })}
                        className="text-brand/60 hover:text-red-500 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-[#9aa3b2]">No drawing —</span>
                  )}
                  <button type="button"
                    onClick={() => rowFileRefs.current[row._id]?.click()}
                    className="text-xs text-brand hover:underline flex items-center gap-1">
                    <Upload className="w-3 h-3" />{row.drawing_file ? 'Change' : 'Attach drawing'}
                  </button>
                  <input
                    ref={el => { rowFileRefs.current[row._id] = el }}
                    type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.step,.stp,.iges,.igs,.stl,.obj,.dxf" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) assignDrawingToRow(row._id, f)
                      e.target.value = ''
                    }}
                  />
                </div>

                {/* Params row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <p className={LBL}>Country</p>
                    <input value={row.supplier_country}
                      onChange={e => updateRow(row._id, { supplier_country: e.target.value })}
                      className={INP} placeholder="DE" maxLength={3} />
                  </div>
                  <div>
                    <p className={LBL}>Annual volume</p>
                    <input type="number" min={1} value={row.annual_volume}
                      onChange={e => updateRow(row._id, { annual_volume: Number(e.target.value) || 1 })}
                      className={NUM} />
                  </div>
                  <div>
                    <p className={LBL}>Lot size</p>
                    <input type="number" min={1} value={row.lot_size}
                      onChange={e => updateRow(row._id, { lot_size: Number(e.target.value) || 1 })}
                      className={NUM} />
                  </div>
                  <div>
                    <p className={LBL}>Procurement</p>
                    <select value={row.procurement_type}
                      onChange={e => updateRow(row._id, { procurement_type: e.target.value })}
                      className={SEL}>
                      <option value="in_house">In-house</option>
                      <option value="purchased">Purchased</option>
                      <option value="sub_contracted">Sub-contracted</option>
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={addManualRow}
          className="text-xs text-brand hover:underline flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add part manually
        </button>

        <Button type="submit" variant="primary" size="lg" className="w-full"
          disabled={!reviewRows.some(r => r.part_name.trim())} loading={batchMut.isPending}
          iconLeft={<Play className="w-4 h-4" />}>
          Start Batch Costing — {reviewRows.filter(r => r.part_name.trim()).length} parts
        </Button>
      </form>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER: UPLOAD STEP
  // ────────────────────────────────────────────────────────────────────────────
  const hasAIData = analyzed && analyzed.some(a => !a.error)

  return (
    <div className="space-y-4">
      {/* ── Two drop zones ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Drawing files */}
        <div>
          <p className="text-xs font-semibold text-[#4a5568] mb-1.5">
            Drawing files <span className="font-normal text-[#9aa3b2]">PDF · PNG · JPG · STEP · IGES · STL · DXF</span>
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => drawingInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors min-h-[90px] flex flex-col items-center justify-center gap-1.5',
              isDragging  ? 'border-brand bg-brand/5' :
              hasDrawings ? 'border-brand/30 bg-brand/5' :
              'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
            )}
          >
            <input ref={drawingInputRef} type="file" multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.step,.stp,.iges,.igs,.stl,.obj,.dxf" className="hidden"
              onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
            {hasDrawings ? (
              <>
                <span className="inline-flex items-center gap-1.5 bg-brand/10 text-brand text-xs font-semibold px-3 py-1 rounded-full">
                  <Layers className="w-3 h-3" />
                  {drawingFiles.length} file{drawingFiles.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-[#9aa3b2]">Click to add more</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-[#c8cdd8]" />
                <p className="text-xs text-[#4a5568]">Drop drawings or click to browse</p>
              </>
            )}
          </div>
        </div>

        {/* Manifest / parts list */}
        <div>
          <p className="text-xs font-semibold text-[#4a5568] mb-1.5">
            Parts list / Manifest <span className="font-normal text-[#9aa3b2]">CSV · XLSX · PDF — optional</span>
          </p>
          <div
            onClick={() => manifestInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors min-h-[90px] flex flex-col items-center justify-center gap-1.5',
              hasManifest
                ? 'border-green-300 bg-green-50/40'
                : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
            )}
          >
            <input ref={manifestInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) selectManifest(f); e.target.value = '' }} />
            {hasManifest ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-xs font-medium text-[#0f1729]">{manifestFile!.name}</span>
                {sheetRowCount !== null && (
                  <span className="inline-flex items-center gap-1 bg-brand/10 text-brand text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    ~{sheetRowCount} parts
                  </span>
                )}
                {manifestFile!.name.endsWith('.pdf') && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    AI will extract parts
                  </span>
                )}
                <button type="button"
                  onClick={e => { e.stopPropagation(); setManifest(null); setSheetRowCount(null) }}
                  className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
              </>
            ) : (
              <>
                <FileText className="w-6 h-6 text-[#c8cdd8]" />
                <p className="text-xs text-[#4a5568]">Drop manifest or click to browse</p>
                <p className="text-[11px] text-[#9aa3b2]">AI auto-matches drawings to parts</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Drawings only: per-item params ── */}
      {uploadMode === 'drawings' && (
        <form onSubmit={submitDrawings} className="space-y-4">
          {hasAIData && analyzed && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-brand/5 border border-brand/10 text-xs">
              <Wand2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <p className="text-[#4a5568]">
                AI identified {analyzed.filter(a => !a.error).length} drawings — part names &amp; materials pre-filled
              </p>
            </div>
          )}

          {/* Defaults bar */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[#f8f9fb] border border-[#e5e8ef]">
            <span className="text-xs font-semibold text-[#4a5568] shrink-0">Batch defaults:</span>
            <select value={defaults.supplier_country}
              onChange={e => setDefaults(d => ({ ...d, supplier_country: e.target.value }))}
              className={cn(SEL, 'w-20')}>
              {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <select value={defaults.procurement_type}
              onChange={e => setDefaults(d => ({ ...d, procurement_type: e.target.value }))}
              className={cn(SEL, 'w-32')}>
              {PROCUREMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input type="number" min={1} value={defaults.annual_volume}
              onChange={e => setDefaults(d => ({ ...d, annual_volume: Number(e.target.value) || 1 }))}
              className={cn(NUM, 'w-24')} placeholder="Volume" />
            <input type="number" min={1} value={defaults.lot_size}
              onChange={e => setDefaults(d => ({ ...d, lot_size: Number(e.target.value) || 1 }))}
              className={cn(NUM, 'w-20')} placeholder="Lot" />
            <button type="button" onClick={applyDefaultsToAll}
              className="text-xs text-brand hover:underline shrink-0 ml-auto">
              Apply to all
            </button>
          </div>

          {/* Per-file rows */}
          <div className="space-y-2">
            {drawingFiles.map(f => {
              const p  = itemParams[f.name] ?? defaults
              const ai = analyzed?.find(a => a.filename === f.name)
              return (
                <div key={f.name} className="rounded-xl border border-[#e5e8ef] p-3 space-y-2 bg-white">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand shrink-0" />
                    <span className="text-xs font-medium text-[#0f1729] flex-1 truncate">{f.name}</span>
                    {ai && !ai.error && (
                      <span className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">
                        {Math.round(ai.confidence * 100)}%
                      </span>
                    )}
                    <button type="button" onClick={() => removeFile(f.name)}
                      className="text-[#c8cdd8] hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <p className={LBL}>Country</p>
                      <select value={p.supplier_country}
                        onChange={e => setParam(f.name, 'supplier_country', e.target.value)}
                        className={SEL}>
                        {SUPPLIER_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className={LBL}>Procurement</p>
                      <select value={p.procurement_type}
                        onChange={e => setParam(f.name, 'procurement_type', e.target.value)}
                        className={SEL}>
                        {PROCUREMENT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className={LBL}>Annual volume</p>
                      <input type="number" min={1} value={p.annual_volume}
                        onChange={e => setParam(f.name, 'annual_volume', Number(e.target.value) || 1)}
                        className={NUM} />
                    </div>
                    <div>
                      <p className={LBL}>Lot size</p>
                      <input type="number" min={1} value={p.lot_size}
                        onChange={e => setParam(f.name, 'lot_size', Number(e.target.value) || 1)}
                        className={NUM} />
                    </div>
                  </div>
                  {ai && !ai.error && (
                    <p className="text-[11px] text-[#9aa3b2]">
                      AI: <span className="text-[#0f1729]">{ai.part_name}</span>
                      {ai.material && <> · {ai.material}</>}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md"
              onClick={runAIAnalysis} loading={isAnalyzing}
              disabled={!drawingFiles.length}
              iconLeft={<Wand2 className="w-4 h-4" />}>
              Identify with AI
            </Button>
            <Button type="submit" variant="primary" size="md" className="flex-1"
              disabled={!drawingFiles.length} loading={batchMut.isPending}
              iconLeft={<Play className="w-4 h-4" />}>
              Start Batch — {drawingFiles.length} drawing{drawingFiles.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </form>
      )}

      {/* ── Manifest only ── */}
      {uploadMode === 'manifest' && (
        <Button type="button" variant="primary" size="lg" className="w-full"
          onClick={() => manifestFile && sheetMut.mutate(manifestFile)}
          disabled={!manifestFile} loading={sheetMut.isPending}
          iconLeft={<Play className="w-4 h-4" />}>
          {sheetRowCount !== null
            ? `Start Batch Costing — ~${sheetRowCount} parts`
            : 'Start Batch Costing'}
        </Button>
      )}

      {/* ── Both: parse & match ── */}
      {uploadMode === 'both' && (
        <Button type="button" variant="primary" size="lg" className="w-full"
          onClick={parseAndMatch} loading={isParsing}
          iconLeft={<ScanSearch className="w-4 h-4" />}>
          {isParsing ? 'Parsing & Matching…' : 'Parse Manifest & Match Drawings →'}
        </Button>
      )}

      {/* ── Empty hint ── */}
      {uploadMode === 'empty' && (
        <p className="text-center text-xs text-[#9aa3b2] py-1">
          Drop drawings, a manifest, or both — the form adapts automatically.
        </p>
      )}

      {/* CSV template */}
      <div className="flex items-center justify-between text-xs text-[#9aa3b2]">
        <span>Need a manifest template?</span>
        <button type="button" onClick={downloadCSVTemplate}
          className="text-brand hover:underline flex items-center gap-1">
          <Download className="w-3 h-3" /> Download CSV template
        </button>
      </div>
    </div>
  )
}

// ─── NEW BATCH TAB ────────────────────────────────────────────────────────────

function NewBatchTab() {
  const queryClient = useQueryClient()
  return (
    <UnifiedUploadMode
      onCreated={() => queryClient.invalidateQueries({ queryKey: ['batches'] })}
    />
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
