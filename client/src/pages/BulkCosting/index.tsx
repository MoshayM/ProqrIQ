import React, { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Upload, RefreshCw, X, Play, Eye, Trash2, ChevronLeft, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

type BatchStatus = 'queued'|'processing'|'completed'|'completed_with_errors'|'failed'|'cancelled';
type BatchItemStatus = 'queued'|'processing'|'completed'|'failed'|'skipped'|'cancelled'|'needs_clarification';

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
  queued: 'bg-gray-100 text-gray-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  completed_with_errors: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const ITEM_STATUS_COLORS: Record<BatchItemStatus, string> = {
  queued: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  needs_clarification: 'bg-amber-100 text-amber-700',
};

function progressBarColor(status: BatchStatus): string {
  switch (status) {
    case 'processing': return 'bg-blue-500';
    case 'completed': return 'bg-green-500';
    case 'failed': return 'bg-red-500';
    case 'completed_with_errors': return 'bg-amber-400';
    default: return 'bg-gray-400';
  }
}

function ProgressBar({ processed, total, status }: { processed: number; total: number; status: BatchStatus }) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${progressBarColor(status)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#e85c1a]" />
      </div>
    );
  }

  if (isError || !batch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-600">
        <AlertCircle className="w-10 h-10" />
        <p>Failed to load batch details.</p>
        <Button variant="outline" onClick={() => navigate('/bulk')}>Go Back</Button>
      </div>
    );
  }

  const pct = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0;
  const canRetry = batch.status === 'failed' || batch.status === 'completed_with_errors';
  const canCancel = batch.status === 'processing' || batch.status === 'queued';

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/bulk')} className="flex items-center gap-1 text-gray-600">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#1e2d4e]">Batch #{id.slice(0, 8)}</h1>
              {batch.completed_at && (
                <p className="text-sm text-gray-500 mt-1">
                  Completed {format(new Date(batch.completed_at), 'dd MMM yyyy HH:mm')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize ${BATCH_STATUS_COLORS[batch.status]}`}>
                {batch.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            {batch.processed_items} / {batch.total_items} items processed
            {batch.failed_items > 0 && (
              <span className="text-red-600 ml-2">• {batch.failed_items} failed</span>
            )}
          </p>
          <div className="space-y-1">
            <ProgressBar processed={batch.processed_items} total={batch.total_items} status={batch.status} />
            <p className="text-xs text-gray-400 text-right">{pct}%</p>
          </div>
          <div className="flex gap-2">
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                className="flex items-center gap-1 text-red-600 border-red-300 hover:bg-red-50"
              >
                {cancelMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                Cancel
              </Button>
            )}
            {canRetry && (
              <Button
                size="sm"
                onClick={() => retryMut.mutate()}
                disabled={retryMut.isPending}
                className="flex items-center gap-1 bg-[#e85c1a] hover:bg-[#d04e14] text-white"
              >
                {retryMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Retry Failed
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Batch Items</h2>
        </CardHeader>
        <CardContent>
          {batch.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <Clock className="w-8 h-8" />
              <p>No items yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="pb-3 pr-4 font-medium">Part Name</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Error</th>
                    <th className="pb-3 font-medium">Quote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batch.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium text-[#1e2d4e]">{item.part_name}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ITEM_STATUS_COLORS[item.status]}`}>
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 max-w-xs">
                        {item.error_message ? (
                          <span
                            className="text-red-600 text-xs truncate block max-w-[200px]"
                            title={item.error_message}
                          >
                            {item.error_message}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {item.quotation_id ? (
                          <Link
                            to={`/quotes/${item.quotation_id}`}
                            className="inline-flex items-center gap-1 text-[#e85c1a] hover:underline text-xs font-medium"
                          >
                            <Eye className="w-3 h-3" /> View
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
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
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-[#e85c1a] bg-orange-50' : 'border-gray-300 hover:border-[#e85c1a] hover:bg-orange-50/30'
        }`}
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
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-red-500 hover:underline mt-1"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-10 h-10 text-gray-400" />
            <p className="font-medium">Drop your file here or click to browse</p>
            <p className="text-sm">Accepts .xlsx or .csv</p>
          </div>
        )}
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Country</label>
          <select
            value={params.supplier_country}
            onChange={(e) => setParams((p) => ({ ...p, supplier_country: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
          >
            {SUPPLIER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
          <select
            value={params.supplier_currency}
            onChange={(e) => setParams((p) => ({ ...p, supplier_currency: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Procurement Type</label>
          <select
            value={params.procurement_type}
            onChange={(e) => setParams((p) => ({ ...p, procurement_type: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
          >
            {PROCUREMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Annual Volume</label>
          <input
            type="number"
            min={1}
            value={params.annual_volume}
            onChange={(e) => setParams((p) => ({ ...p, annual_volume: Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Lot Size</label>
          <input
            type="number"
            min={1}
            value={params.lot_size}
            onChange={(e) => setParams((p) => ({ ...p, lot_size: Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={createMut.isPending || !file}
        className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
      >
        {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Start Batch Costing
      </Button>
    </form>
  );
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
      return hasActive ? 5000 : false;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <Clock className="w-12 h-12" />
        <p className="text-lg font-medium">No batch jobs yet</p>
        <p className="text-sm">Upload a file to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="pb-3 pr-4 font-medium">Batch ID</th>
            <th className="pb-3 pr-4 font-medium">Type</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium w-40">Progress</th>
            <th className="pb-3 pr-4 font-medium">Items</th>
            <th className="pb-3 pr-4 font-medium">Created</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batches.map((batch) => {
            const pct = batch.total_items > 0 ? Math.round((batch.processed_items / batch.total_items) * 100) : 0;
            const canRetry = batch.status === 'failed' || batch.status === 'completed_with_errors';
            const canCancel = batch.status === 'processing' || batch.status === 'queued';
            const canDelete = batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled';
            return (
              <tr key={batch.id} className="hover:bg-gray-50">
                <td className="py-3 pr-4 font-mono text-xs text-[#1e2d4e] font-semibold">
                  #{batch.id.slice(0, 8)}
                </td>
                <td className="py-3 pr-4 capitalize text-gray-600">
                  {batch.batch_type.replace(/_/g, ' ')}
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${BATCH_STATUS_COLORS[batch.status]}`}>
                    {batch.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="space-y-1">
                    <ProgressBar processed={batch.processed_items} total={batch.total_items} status={batch.status} />
                    <p className="text-xs text-gray-400">{pct}%</p>
                  </div>
                </td>
                <td className="py-3 pr-4 text-gray-600">
                  {batch.processed_items}/{batch.total_items}
                  {batch.failed_items > 0 && (
                    <span className="text-red-500 ml-1">({batch.failed_items} err)</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                  {format(new Date(batch.created_at), 'dd MMM yy HH:mm')}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/bulk/${batch.id}`)}
                      className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                      title="View details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canRetry && (
                      <button
                        onClick={() => retryMut.mutate(batch.id)}
                        disabled={retryMut.isPending}
                        className="p-1.5 rounded hover:bg-orange-50 text-[#e85c1a]"
                        title="Retry"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => cancelMut.mutate(batch.id)}
                        disabled={cancelMut.isPending}
                        className="p-1.5 rounded hover:bg-red-50 text-red-500"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => deleteMut.mutate(batch.id)}
                        disabled={deleteMut.isPending}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BulkCostingList() {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2d4e]">Bulk Costing</h1>
          <p className="text-sm text-gray-500 mt-1">Upload a spreadsheet to cost multiple parts at once</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Tab Header */}
          <div className="flex border-b border-gray-200">
            {(['new', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-[#e85c1a] text-[#e85c1a]'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab === 'new' ? 'New Batch' : 'History'}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'new' ? <NewBatchTab /> : <HistoryTab />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function BulkCosting() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <BatchDetail id={id} />;
  return <BulkCostingList />;
}
