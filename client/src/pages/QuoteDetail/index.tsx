import React, { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Send,
  Archive,
  RotateCcw,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import Tab1Overview from './tabs/Tab1Overview';
import Tab2Process from './tabs/Tab2Process';
import Tab3Logistics from './tabs/Tab3Logistics';
import Tab4Assumptions from './tabs/Tab4Assumptions';
import Tab5History from './tabs/Tab5History';

// ─── Types ─────────────────────────────────────────────────────────────────────

type QuoteStatus = 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'archived';
type QuoteType = 'individual' | 'assembly' | 'component';

interface Quotation {
  id: string;
  status: QuoteStatus;
  quote_type: QuoteType;
  confidence_score: number | null;
  cost_eur: number | null;
  final_price_eur: number | null;
  margin_pct: number | null;
  one_time_cost_eur: number | null;
  created_at: string;
  updated_at: string;
  part: {
    id: string;
    name: string;
    part_number: string | null;
    commodity_type: string;
    material: string | null;
    primary_process: string | null;
    dimensions: Record<string, number> | null;
    weight_kg: number | null;
  };
  kb_coverage_pct: number | null;
  ai_reasoning: string | null;
  routing_path: string[] | null;
  volume_sensitivity: Record<string, number> | null;
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'draft':            return 'Draft';
    case 'in_review':        return 'In Review';
    case 'pending_approval': return 'Pending Approval';
    case 'approved':         return 'Approved';
    case 'archived':         return 'Archived';
  }
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

function statusVariant(status: QuoteStatus): BadgeVariant {
  switch (status) {
    case 'draft':            return 'default';
    case 'in_review':        return 'info';
    case 'pending_approval': return 'warning';
    case 'approved':         return 'success';
    case 'archived':         return 'default';
  }
}

function confidenceVariant(score: number | null): BadgeVariant {
  if (score === null) return 'default';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Process', 'Logistics', 'Assumptions', 'History'] as const;

// ─── ApproveModal ─────────────────────────────────────────────────────────────

interface ApproveModalProps {
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function ApproveModal({ onConfirm, onCancel, loading }: ApproveModalProps) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Approve Quote</h2>
        <p className="text-sm text-gray-500 mb-4">
          This quote will be marked as approved. You can add a note below.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note (optional)"
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] resize-none mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(notes)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── RejectModal ──────────────────────────────────────────────────────────────

interface RejectModalProps {
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectModal({ onConfirm, onCancel, loading }: RejectModalProps) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Reject Quote</h2>
        <p className="text-sm text-gray-500 mb-4">
          This quote will be rejected and the team notified. Please provide a reason.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note (optional)"
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a] resize-none mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(notes)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── QuoteDetail ──────────────────────────────────────────────────────────────

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState(0);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const downloadAnchorRef = useRef<HTMLAnchorElement>(null);

  // ── Data fetch ────────────────────────────────────────────────────────────
  const {
    data: quotation,
    isLoading,
    isError,
  } = useQuery<Quotation>({
    queryKey: ['quote', id],
    queryFn: () => api.quotes.get(id!),
    enabled: !!id,
    retry: false,
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#e85c1a]" />
      </div>
    );
  }

  // ── Error / not found ─────────────────────────────────────────────────────
  if (isError || !quotation) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-sm w-full text-center shadow-sm">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Quote not found</h2>
          <p className="text-sm text-gray-500 mb-6">
            This quote may have been deleted or you don't have permission to view it.
          </p>
          <Link to="/quotes">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to All Quotes
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const role = user?.role;
  const isArchived = quotation.status === 'archived';

  async function invalidateQueries() {
    await queryClient.invalidateQueries({ queryKey: ['quote', id] });
    await queryClient.invalidateQueries({ queryKey: ['quotes'] });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await api.quotes.submit(id!);
      await invalidateQueries();
      toast.success('Quote submitted for review.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to submit quote.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApproveConfirm(notes: string) {
    setIsApproving(true);
    try {
      await api.quotes.approve(id!, { notes });
      await invalidateQueries();
      toast.success('Quote approved.');
      setShowApproveModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to approve quote.');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRejectConfirm(notes: string) {
    setIsRejecting(true);
    try {
      await api.quotes.reject(id!, { notes });
      await invalidateQueries();
      toast.error('Quote rejected.');
      setShowRejectModal(false);
      navigate('/quotes');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to reject quote.');
    } finally {
      setIsRejecting(false);
    }
  }

  async function handleArchive() {
    setIsArchiving(true);
    try {
      await api.quotes.softDelete(id!);
      await invalidateQueries();
      toast.success('Quote archived.');
      navigate('/quotes');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to archive quote.');
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    try {
      await api.quotes.restore(id!);
      await invalidateQueries();
      toast.success('Quote restored.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to restore quote.');
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const blob = await api.quotes.exportExcel(id!);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quote-${id}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Excel export downloaded.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to export Excel.');
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportPdf() {
    toast.info('PDF export coming soon');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Hidden anchor for programmatic downloads */}
      <a ref={downloadAnchorRef} className="hidden" aria-hidden="true" />

      {/* Header */}
      <div className="space-y-3">
        {/* Back link */}
        <Link
          to="/quotes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Quotes
        </Link>

        {/* Part name + number */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{quotation.part.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {quotation.part.part_number ?? 'No part number'}
          </p>
        </div>

        {/* Badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(quotation.status)}>
            {statusLabel(quotation.status)}
          </Badge>
          {quotation.confidence_score !== null ? (
            <Badge variant={confidenceVariant(quotation.confidence_score)}>
              {quotation.confidence_score.toFixed(1)}% confidence
            </Badge>
          ) : (
            <Badge variant="default">Confidence N/A</Badge>
          )}
          <Badge variant="default" className="capitalize">
            {quotation.quote_type}
          </Badge>
        </div>

        {/* Cost display */}
        <div>
          {quotation.cost_eur !== null ? (
            <span className="font-mono text-3xl font-bold text-gray-900">
              €{' '}
              {new Intl.NumberFormat('de-DE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(quotation.cost_eur)}
            </span>
          ) : (
            <span className="text-xl font-medium text-gray-400">Not estimated</span>
          )}
          {quotation.created_at && (
            <p className="text-xs text-gray-400 mt-1">
              Created {format(new Date(quotation.created_at), 'dd MMM yyyy, HH:mm')}
              {' · '}Updated {format(new Date(quotation.updated_at), 'dd MMM yyyy, HH:mm')}
            </p>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Submit */}
        {quotation.status === 'draft' &&
          (role === 'engineer' || role === 'cost_analyst') && (
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit for Review
            </Button>
          )}

        {/* Approve */}
        {quotation.status === 'pending_approval' &&
          (role === 'ceo' || role === 'admin') && (
            <Button
              variant="primary"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setShowApproveModal(true)}
              disabled={isApproving}
            >
              {isApproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Approve
            </Button>
          )}

        {/* Reject */}
        {quotation.status === 'pending_approval' &&
          (role === 'ceo' || role === 'admin') && (
            <Button
              variant="danger"
              onClick={() => setShowRejectModal(true)}
              disabled={isRejecting}
            >
              {isRejecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject
            </Button>
          )}

        {/* Archive */}
        {!isArchived && role === 'admin' && (
          <Button variant="secondary" onClick={handleArchive} disabled={isArchiving}>
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Archive
          </Button>
        )}

        {/* Restore */}
        {isArchived && role === 'admin' && (
          <Button variant="secondary" onClick={handleRestore} disabled={isRestoring}>
            {isRestoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Restore
          </Button>
        )}

        {/* Export Excel */}
        <Button variant="ghost" onClick={handleExportExcel} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export Excel
        </Button>

        {/* Export PDF */}
        <Button variant="ghost" onClick={handleExportPdf}>
          <FileText className="h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map((tab, index) => (
            <button
              key={tab}
              onClick={() => setActiveTab(index)}
              className={[
                'px-4 py-2 text-sm font-medium cursor-pointer transition-colors whitespace-nowrap',
                activeTab === index
                  ? 'border-b-2 border-[#e85c1a] text-[#e85c1a]'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 0 && (
            <Tab1Overview quotation={quotation} quotationId={id!} />
          )}
          {activeTab === 1 && (
            <Tab2Process quotation={quotation} quotationId={id!} />
          )}
          {activeTab === 2 && (
            <Tab3Logistics quotation={quotation} quotationId={id!} />
          )}
          {activeTab === 3 && (
            <Tab4Assumptions quotation={quotation} quotationId={id!} />
          )}
          {activeTab === 4 && (
            <Tab5History quotation={quotation} quotationId={id!} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showApproveModal && (
        <ApproveModal
          onConfirm={handleApproveConfirm}
          onCancel={() => setShowApproveModal(false)}
          loading={isApproving}
        />
      )}
      {showRejectModal && (
        <RejectModal
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowRejectModal(false)}
          loading={isRejecting}
        />
      )}
    </div>
  );
}
