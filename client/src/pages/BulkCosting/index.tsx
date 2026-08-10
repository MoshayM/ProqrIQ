import React, { useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format, differenceInSeconds } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, RefreshCw, X, Play, Eye, Trash2, ChevronLeft, AlertCircle, CheckCircle, Clock, Zap, AlertTriangle, Download } from 'lucide-react'
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

type BatchStatus = 'queued'|'processing'|'completed'|'completed_with_errors'|'failed'|'cancelled';
type BatchItemStatus = 'queued'|'processing'|'analysing'|'searching_kb'|'estimating'|'completed'|'failed'|'skipped'|'cancelled'|'needs_clarification';

interface CostingBatch {
  id: string;
  batch_type: 'bulk'|'assembly_children';
  status: BatchStatus;
  total_items: number;
  processed_items: number;
  failed_items: number;
  created_at: string;
  completed_at: string | null;
}

interface BatchItem {
  id: string;
  batch_id: string;
  part_name: string;
  status: BatchItemStatus;
  error_message: string | null;
  quotation_id: string | null;
}

interface CostingBatchWithItems extends CostingBatch {
  items: BatchItem[];
}

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

function batchProgressVariant(status: BatchStatus): 'brand' | 'success' | 'danger' | 'warning' | 'navy' {
  switch (status) {
    case 'processing':            return 'brand'
    case 'completed':             return 'success'
    case 'failed':                return 'danger'
    case 'completed_with_errors': return 'warning'
    default:                      return 'navy'
  }
}

// ─── DETAIL VIEW ────────────────────────────────────────────────────────────

function BatchDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: batch, isLoading, isError } = useQuery<CostingBatchWithItems>({
    queryKey: ['batch', id],
    queryFn: () => api.bulk.get(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.status === 'processing' || data.status === 'queued' ? 3000 : false;
    },
  });

  const retryMut = useMutation({
    mutationFn: () => api.bulk.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', id] });
      toast.success('Batch retry started');
    },
    onError: () => toast.error('Failed to retry batch'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.bulk.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', id] });
      toast.success('Batch cancelled');
    },
    onError: () => toast.error('Failed to cancel batch'),
  });

  const [isExporting, setIsExporting] = useState(false)
  const { canUse } = useSubscription()

  async function handleExport() {
    setIsExporting(true)
    try {
      const blob = await api.bulk.exportExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `batch-${id}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Failed to export') }
    finally { setIsExporting(false) }
  }

  if (isLoading) {
    return (
      <div className="page-content space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton variant="line" height="28px" width="160px" />
          <Skeleton variant="rect" height="36px" width="120px" className="rounded-lg" />
        </div>
        {/* Status cards row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-2">
              <Skeleton variant="line" height="11px" width="60%" />
              <Skeleton variant="line" height="24px" width="40%" />
            </div>
          ))}
        </div>
        {/* Batch cards */}
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton variant="line" height="16px" width="180px" />
                  <Skeleton variant="line" height="12px" width="120px" />
                </div>
                <Skeleton variant="rect" height="24px" width="72px" className="rounded-full" />
              </div>
              <Skeleton variant="rect" height="6px" className="rounded-full" />
              <div className="flex gap-2">
                <Skeleton variant="line" height="12px" width="80px" />
                <Skeleton variant="line" height="12px" width="60px" />
              </div>
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

  const pct = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0
  const canRetry = batch.status === 'failed' || batch.status === 'completed_with_errors';
  const canCancel = batch.status === 'processing' || batch.status === 'queued';
  // Warn if the batch has been processing for >20 min — runner likely timed out
  const isStuck = batch.status === 'processing' &&
    (Date.now() - new Date(batch.created_at).getTime()) > 20 * 60 * 1000

  // 7D.6 — Performance timing for completed batches
  const batchDuration = batch.completed_at
    ? differenceInSeconds(new Date(batch.completed_at), new Date(batch.created_at))
    : null
  const batchTimingLabel = batchDuration !== null && batch.total_items > 0
    ? (() => {
        const m = Math.floor(batchDuration / 60)
        const s = batchDuration % 60
        const durStr = m > 0 ? `${m}m ${s}s` : `${s}s`
        const avg = (batchDuration / batch.total_items).toFixed(1)
        return `${batch.total_items} part${batch.total_items !== 1 ? 's' : ''} estimated in ${durStr} (avg ${avg}s/part)`
      })()
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Header */}
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
            {batch.failed_items > 0 && (
              <span className="text-red-600 ml-2">• {batch.failed_items} failed</span>
            )}
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
          <div className="flex gap-2">
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
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors',
                      item.status === 'processing' ? 'border-blue-200 bg-blue-50/40' :
                      item.status === 'completed'   ? 'border-green-100 bg-green-50/30' :
                      item.status === 'failed'      ? 'border-red-100 bg-red-50/20' :
                      'border-transparent hover:bg-surface-2',
                    )}
                  >
                    {/* Status dot / icon */}
                    <div className="flex-shrink-0">
                      {item.status === 'processing' ? (
                        <div className="relative w-5 h-5">
                          <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" style={{ animationDuration: '1.2s' }} />
                          <span className="absolute inset-1 rounded-full bg-blue-500" />
                        </div>
                      ) : item.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : item.status === 'failed' ? (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      ) : item.status === 'needs_clarification' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : item.status === 'queued' ? (
                        <div className="w-4 h-4 rounded-full border-2 border-[#c8cdd8] border-t-amber-400 animate-spin" style={{ animationDuration: '1s' }} />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-[#e5e8ef]" />
                      )}
                    </div>

                    {/* Part name */}
                    <p className="flex-1 min-w-0 text-sm font-medium text-[#0f1729] truncate">
                      {item.part_name}
                    </p>

                    {/* Status badge */}
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize flex-shrink-0', ITEM_STATUS_COLORS[item.status])}>
                      {item.status.replace(/_/g, ' ')}
                    </span>

                    {/* Error or quote link */}
                    {item.error_message ? (
                      <span className="text-red-500 text-xs truncate max-w-[180px] flex-shrink-0" title={item.error_message}>
                        {item.error_message}
                      </span>
                    ) : item.quotation_id ? (
                      <Link
                        to={`/quotes/${item.quotation_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-brand hover:underline text-xs font-medium flex-shrink-0"
                      >
                        <Eye className="w-3 h-3" /> View
                      </Link>
                    ) : null}
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

// ─── LIST VIEW ───────────────────────────────────────────────────────────────

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
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY', 'INR', 'PLN', 'CZK', 'MXN', 'TRY'];
const PROCUREMENT_TYPES = ['make', 'buy', 'make_or_buy'];

interface SharedParams {
  supplier_country: string;
  supplier_currency: string;
  annual_volume: number;
  lot_size: number;
  procurement_type: string;
}

function NewBatchTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [params, setParams] = useState<SharedParams>({
    supplier_country: 'DE',
    supplier_currency: 'EUR',
    annual_volume: 1000,
    lot_size: 100,
    procurement_type: 'make',
  });

  const createMut = useMutation({
    mutationFn: (formData: FormData) => api.bulk.create(formData as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch created successfully');
      setFile(null);
    },
    onError: () => toast.error('Failed to create batch'),
  });

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith('.xlsx') || dropped.name.endsWith('.csv'))) {
      setFile(dropped);
    } else {
      toast.error('Only .xlsx or .csv files are accepted');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error('Please select a file'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('shared_params', JSON.stringify(params));
    createMut.mutate(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          isDragging ? 'border-brand bg-brand/5' : 'border-[#c8cdd8] hover:border-brand hover:bg-brand/5',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="font-medium text-[#0f1729]">{file.name}</p>
            <p className="text-sm text-[#9aa3b2]">{(file.size / 1024).toFixed(1)} KB</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-red-500 hover:underline mt-1"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#9aa3b2]">
            <Upload className="w-10 h-10 text-[#c8cdd8]" />
            <p className="font-medium text-[#4a5568]">Drop your file here or click to browse</p>
            <p className="text-sm">Accepts .xlsx or .csv</p>
          </div>
        )}
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Supplier Country</label>
          <select
            value={params.supplier_country}
            onChange={(e) => setParams((p) => ({ ...p, supplier_country: e.target.value }))}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          >
            {SUPPLIER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Currency</label>
          <select
            value={params.supplier_currency}
            onChange={(e) => setParams((p) => ({ ...p, supplier_currency: e.target.value }))}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Procurement Type</label>
          <select
            value={params.procurement_type}
            onChange={(e) => setParams((p) => ({ ...p, procurement_type: e.target.value }))}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          >
            {PROCUREMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Annual Volume</label>
          <input
            type="number"
            min={1}
            value={params.annual_volume}
            onChange={(e) => setParams((p) => ({ ...p, annual_volume: Number(e.target.value) }))}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Lot Size</label>
          <input
            type="number"
            min={1}
            value={params.lot_size}
            onChange={(e) => setParams((p) => ({ ...p, lot_size: Number(e.target.value) }))}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
          />
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!file}
        loading={createMut.isPending}
        iconLeft={<Play className="w-4 h-4" />}
        className="w-full"
      >
        Start Batch Costing
      </Button>
    </form>
  );
}

// ─── STATUS INDICATOR ────────────────────────────────────────────────────────

function BatchStatusIndicator({ status }: { status: BatchStatus }) {
  if (status === 'processing') {
    return (
      <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: '1.4s' }} />
        <span className="absolute inset-1.5 rounded-full bg-blue-400/30 animate-ping" style={{ animationDuration: '1.8s', animationDelay: '0.3s' }} />
        <Zap className="relative w-4 h-4 text-blue-600" />
      </div>
    )
  }
  if (status === 'queued') {
    return (
      <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: '2s' }} />
        <Clock className="relative w-4 h-4 text-amber-600" />
      </div>
    )
  }
  if (status === 'completed') {
    return <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><CheckCircle className="w-4 h-4 text-green-600" /></div>
  }
  if (status === 'completed_with_errors') {
    return <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
  }
  if (status === 'failed') {
    return <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-4 h-4 text-red-600" /></div>
  }
  return <div className="w-8 h-8 rounded-full bg-[#f1f3f7] flex items-center justify-center flex-shrink-0"><X className="w-4 h-4 text-[#9aa3b2]" /></div>
}

function HistoryTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: batches = [], isLoading } = useQuery<CostingBatch[]>({
    queryKey: ['batches'],
    queryFn: () => api.bulk.list(),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActive = data.some((b) => b.status === 'processing' || b.status === 'queued');
      return hasActive ? 3000 : false;
    },
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => api.bulk.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Retry started');
    },
    onError: () => toast.error('Failed to retry'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.bulk.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch cancelled');
    },
    onError: () => toast.error('Failed to cancel'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.bulk.softDelete(id),
    onMutate: async (id) => {
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
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-[#e5e8ef] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton variant="line" height="14px" width="200px" />
                <Skeleton variant="line" height="11px" width="120px" />
              </div>
              <Skeleton variant="rect" height="22px" width="64px" className="rounded-full" />
            </div>
            <Skeleton variant="rect" height="5px" className="rounded-full" />
            <div className="flex gap-3">
              <Skeleton variant="line" height="11px" width="60px" />
              <Skeleton variant="line" height="11px" width="80px" />
            </div>
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
        description="Upload a spreadsheet to cost multiple parts at once."
      />
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {batches.map((batch, i) => {
          const pct = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0
          const isActive = batch.status === 'processing' || batch.status === 'queued'
          const canRetry = batch.status === 'failed' || batch.status === 'completed_with_errors'
          const canCancel = isActive
          const canDelete = batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled'
          return (
            <motion.div
              key={batch.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
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
                      <span className="font-mono text-xs font-semibold text-[#1e2d4e]">
                        #{batch.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-[#9aa3b2] capitalize">
                        {batch.batch_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#9aa3b2]">
                        {batch.processed_items}/{batch.total_items} items
                        {batch.failed_items > 0 && <span className="text-red-500 ml-1">· {batch.failed_items} err</span>}
                      </span>
                      <span className="text-[#c8cdd8] text-xs">·</span>
                      <span className="text-xs text-[#9aa3b2]">
                        {format(new Date(batch.created_at), 'dd MMM HH:mm')}
                      </span>
                    </div>
                  </div>
                  {/* Animated progress bar */}
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
                {/* Actions */}
                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canRetry && (
                    <button onClick={() => retryMut.mutate(batch.id)} disabled={retryMut.isPending}
                      className="p-1.5 rounded-md hover:bg-brand/10 text-brand transition-colors" title="Retry">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => cancelMut.mutate(batch.id)} disabled={cancelMut.isPending}
                      className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors" title="Cancel">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDelete && (
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
  );
}

function BulkCostingList() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Bulk Costing</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Upload a spreadsheet to cost multiple parts at once</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Tab Header */}
          <div className="flex border-b border-[#e5e8ef] relative">
            {(['new', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative px-6 py-3.5 text-sm font-medium transition-colors',
                  activeTab === tab ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]',
                )}
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

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function BulkCosting() {
  usePageTitle('Bulk Costing')
  const { id } = useParams<{ id?: string }>();
  return (
    <UpgradeGate requiredPlan="pro" feature="Bulk Costing">
      {id ? <BatchDetail id={id} /> : <BulkCostingList />}
    </UpgradeGate>
  )
}
