import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  RotateCcw,
  Loader2,
  FileText,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'draft':            return 'Draft';
    case 'in_review':        return 'In Review';
    case 'pending_approval': return 'Pending Approval';
    case 'approved':         return 'Approved';
    case 'archived':         return 'Archived';
  }
}

function statusClassName(status: QuoteStatus): string {
  switch (status) {
    case 'draft':            return 'bg-gray-100 text-gray-700';
    case 'in_review':        return 'bg-blue-100 text-blue-700';
    case 'pending_approval': return 'bg-amber-100 text-amber-700';
    case 'approved':         return 'bg-green-100 text-green-700';
    case 'archived':         return 'bg-gray-200 text-gray-500';
  }
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';

function confidenceVariant(score: number | null): BadgeVariant {
  if (score === null) return 'default';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

const PAGE_SIZE = 25;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AllQuotes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<QuoteType | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Mutation tracking ─────────────────────────────────────────────────────
  const [mutating, setMutating] = useState<Set<string>>(new Set());

  function markMutating(id: string) {
    setMutating((prev) => new Set(prev).add(id));
  }
  function unmarkMutating(id: string) {
    setMutating((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  const {
    data: quotesRaw,
    isLoading,
    isError,
  } = useQuery<Quotation[]>({
    queryKey: ['quotes'],
    queryFn: () => api.quotes.list(),
  });

  const quotes = quotesRaw ?? [];

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredQuotes = useMemo(() => {
    const q = search.toLowerCase().trim();
    return quotes.filter((quote) => {
      // Archived visibility
      if (quote.status === 'archived') {
        if (user?.role !== 'admin') return false;
        if (!showArchived) return false;
      }

      // Search
      if (q) {
        const nameMatch = quote.part.name.toLowerCase().includes(q);
        const numMatch = (quote.part.part_number ?? '').toLowerCase().includes(q);
        if (!nameMatch && !numMatch) return false;
      }

      // Status filter
      if (statusFilter && quote.status !== statusFilter) return false;

      // Type filter
      if (typeFilter && quote.quote_type !== typeFilter) return false;

      return true;
    });
  }, [quotes, search, statusFilter, typeFilter, showArchived, user?.role]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredQuotes.length);
  const pageQuotes = filteredQuotes.slice(pageStart, pageEnd);

  // Reset to page 1 when filters change
  const handleSearchChange = (val: string) => { setSearch(val); setCurrentPage(1); };
  const handleStatusChange = (val: QuoteStatus | '') => { setStatusFilter(val); setCurrentPage(1); };
  const handleTypeChange = (val: QuoteType | '') => { setTypeFilter(val); setCurrentPage(1); };
  const handleShowArchivedChange = (val: boolean) => { setShowArchived(val); setCurrentPage(1); };

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSubmit(id: string) {
    markMutating(id);
    try {
      await api.quotes.submit(id);
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote submitted for review.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to submit quote.');
    } finally {
      unmarkMutating(id);
    }
  }

  async function handleApprove(id: string) {
    markMutating(id);
    try {
      await api.quotes.approve(id, {});
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote approved.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to approve quote.');
    } finally {
      unmarkMutating(id);
    }
  }

  async function handleReject(id: string) {
    markMutating(id);
    try {
      await api.quotes.reject(id, {});
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.error('Quote rejected.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to reject quote.');
    } finally {
      unmarkMutating(id);
    }
  }

  async function handleArchive(id: string) {
    markMutating(id);
    try {
      await api.quotes.softDelete(id);
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote archived.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to archive quote.');
    } finally {
      unmarkMutating(id);
    }
  }

  async function handleRestore(id: string) {
    markMutating(id);
    try {
      await api.quotes.restore(id);
      await queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote restored.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to restore quote.');
    } finally {
      unmarkMutating(id);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Quotes</h1>
        <Link to="/quotes/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            New Quote
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg border p-4 flex flex-wrap gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search part name or number…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e85c1a] focus:border-transparent"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value as QuoteStatus | '')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => handleTypeChange(e.target.value as QuoteType | '')}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]"
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="assembly">Assembly</option>
          <option value="component">Component</option>
        </select>

        {/* Show archived (admin only) */}
        {user?.role === 'admin' && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => handleShowArchivedChange(e.target.checked)}
              className="rounded border-gray-300 text-[#e85c1a] focus:ring-[#e85c1a]"
            />
            Show archived
          </label>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Failed to load quotes. Please refresh the page.
        </div>
      )}

      {/* Table card */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Part Name',
                    'Part No',
                    'Type',
                    'Status',
                    'Confidence',
                    'Cost (EUR)',
                    'Created',
                    'Actions',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                  <SkeletonRows />
                ) : pageQuotes.length === 0 ? null : (
                  pageQuotes.map((quote) => {
                    const isMutating = mutating.has(quote.id);
                    const isArchived = quote.status === 'archived';
                    const role = user?.role;

                    return (
                      <tr
                        key={quote.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Part Name */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {quote.part.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {quote.part.commodity_type}
                          </p>
                        </td>

                        {/* Part No */}
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                          {quote.part.part_number ?? '—'}
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3 text-sm text-gray-700 capitalize whitespace-nowrap">
                          {quote.quote_type}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClassName(quote.status)}`}
                          >
                            {statusLabel(quote.status)}
                          </span>
                        </td>

                        {/* Confidence */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {quote.confidence_score === null ? (
                            <span className="text-sm text-gray-400">—</span>
                          ) : (
                            <Badge variant={confidenceVariant(quote.confidence_score)}>
                              {quote.confidence_score.toFixed(1)}%
                            </Badge>
                          )}
                        </td>

                        {/* Cost */}
                        <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                          {quote.cost_eur === null
                            ? '—'
                            : new Intl.NumberFormat('de-DE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(quote.cost_eur)}
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {format(new Date(quote.created_at), 'dd MMM yyyy')}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* View */}
                            <Link to={`/quotes/${quote.id}`}>
                              <button
                                title="View"
                                className="p-1.5 rounded-md text-gray-500 hover:text-[#e85c1a] hover:bg-orange-50 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            </Link>

                            {/* Submit */}
                            {quote.status === 'draft' &&
                              (role === 'engineer' || role === 'cost_analyst') && (
                                <button
                                  title="Submit for review"
                                  disabled={isMutating}
                                  onClick={() => handleSubmit(quote.id)}
                                  className="p-1.5 rounded-md text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isMutating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </button>
                              )}

                            {/* Approve */}
                            {quote.status === 'pending_approval' &&
                              (role === 'ceo' || role === 'admin') && (
                                <button
                                  title="Approve"
                                  disabled={isMutating}
                                  onClick={() => handleApprove(quote.id)}
                                  className="p-1.5 rounded-md text-green-600 hover:text-green-800 hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isMutating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </button>
                              )}

                            {/* Reject */}
                            {quote.status === 'pending_approval' &&
                              (role === 'ceo' || role === 'admin') && (
                                <button
                                  title="Reject"
                                  disabled={isMutating}
                                  onClick={() => handleReject(quote.id)}
                                  className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isMutating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <XCircle className="h-4 w-4" />
                                  )}
                                </button>
                              )}

                            {/* Archive */}
                            {!isArchived && role === 'admin' && (
                              <button
                                title="Archive"
                                disabled={isMutating}
                                onClick={() => handleArchive(quote.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isMutating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Archive className="h-4 w-4" />
                                )}
                              </button>
                            )}

                            {/* Restore */}
                            {isArchived && role === 'admin' && (
                              <button
                                title="Restore"
                                disabled={isMutating}
                                onClick={() => handleRestore(quote.id)}
                                className="p-1.5 rounded-md text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isMutating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Empty state (inside table area for layout) */}
            {!isLoading && filteredQuotes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-base font-semibold text-gray-700 mb-1">
                  No quotes found
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  {search || statusFilter || typeFilter
                    ? 'Try adjusting your filters to see more results.'
                    : 'Get started by creating your first quote.'}
                </p>
                <Link to="/quotes/new">
                  <Button variant="primary" size="sm">
                    <Plus className="h-4 w-4" />
                    New Quote
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && filteredQuotes.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {pageStart + 1}–{pageEnd} of {filteredQuotes.length} quotes
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="px-2 text-gray-500">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
