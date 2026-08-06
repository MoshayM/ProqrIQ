import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, FileText, Clock, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quotation {
  id: string;
  status: 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'archived';
  quote_type: 'individual' | 'assembly' | 'component';
  confidence_score: number | null;
  cost_eur: number | null;
  created_at: string;
  part: {
    id: string;
    name: string;
    part_number: string | null;
    commodity_type: string;
  };
}

interface CostingBatch {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
  total_items: number;
  processed_items: number;
  created_at: string;
}

// ─── Static chart data ────────────────────────────────────────────────────────

const monthlyData = [
  { month: 'Jan', quotes: 12 },
  { month: 'Feb', quotes: 18 },
  { month: 'Mar', quotes: 9 },
  { month: 'Apr', quotes: 24 },
  { month: 'May', quotes: 31 },
  { month: 'Jun', quotes: 19 },
];

// ─── Badge helpers ────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

function statusVariant(status: Quotation['status']): BadgeVariant {
  switch (status) {
    case 'draft':             return 'default';
    case 'in_review':         return 'info';
    case 'pending_approval':  return 'warning';
    case 'approved':          return 'success';
    case 'archived':          return 'default';
  }
}

function statusLabel(status: Quotation['status']): string {
  switch (status) {
    case 'draft':             return 'Draft';
    case 'in_review':         return 'In Review';
    case 'pending_approval':  return 'Pending Approval';
    case 'approved':          return 'Approved';
    case 'archived':          return 'Archived';
  }
}

function confidenceVariant(score: number | null): BadgeVariant {
  if (score === null) return 'default';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: quotesRaw,
    isLoading: quotesLoading,
    isError: quotesError,
  } = useQuery<Quotation[]>({
    queryKey: ['quotes'],
    queryFn: () => api.quotes.list(),
  });

  const {
    data: batchesRaw,
    isLoading: batchesLoading,
    isError: batchesError,
  } = useQuery<CostingBatch[]>({
    queryKey: ['batches'],
    queryFn: () => api.bulk.list(),
  });

  const quotes = quotesRaw ?? [];
  const batches = batchesRaw ?? [];

  // ── KPI computations ───────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const monthStart = startOfMonth(new Date());

    const quotesThisMonth = quotes.filter(
      (q) => new Date(q.created_at) >= monthStart,
    ).length;

    const scoresWithValue = quotes
      .map((q) => q.confidence_score)
      .filter((s): s is number => s !== null);
    const avgConfidence =
      scoresWithValue.length > 0
        ? scoresWithValue.reduce((a, b) => a + b, 0) / scoresWithValue.length
        : null;

    const pendingApprovals = quotes.filter(
      (q) => q.status === 'pending_approval',
    ).length;

    const activeBatches = batches.filter(
      (b) => b.status === 'processing' || b.status === 'queued',
    ).length;

    return { quotesThisMonth, avgConfidence, pendingApprovals, activeBatches };
  }, [quotes, batches]);

  // ── Recent quotes ──────────────────────────────────────────────────────────

  const recentQuotes = useMemo(
    () =>
      [...quotes]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 10),
    [quotes],
  );

  // ── Pending approval list ──────────────────────────────────────────────────

  const pendingList = useMemo(
    () => quotes.filter((q) => q.status === 'pending_approval'),
    [quotes],
  );

  const canApprove =
    user?.role === 'ceo' || user?.role === 'admin';

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleApprove(id: string) {
    try {
      await api.quotes.approve(id, {});
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote approved successfully.');
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Failed to approve quote.',
      );
    }
  }

  async function handleReject(id: string) {
    try {
      await api.quotes.reject(id, {});
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.error('Quote rejected.');
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? 'Failed to reject quote.',
      );
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <span className="text-sm text-gray-500">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quotes This Month */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-gray-500 text-sm">Quotes This Month</p>
              {quotesLoading ? (
                <p className="text-2xl font-bold text-gray-400">—</p>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {kpis.quotesThisMonth}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        {/* Avg Confidence */}
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-gray-500 text-sm">Avg Confidence</p>
              {quotesLoading ? (
                <p className="text-2xl font-bold text-gray-400">—</p>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {kpis.avgConfidence !== null
                    ? `${kpis.avgConfidence.toFixed(1)}%`
                    : 'N/A'}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-gray-500 text-sm">Pending Approvals</p>
              {quotesLoading ? (
                <p className="text-2xl font-bold text-gray-400">—</p>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {kpis.pendingApprovals}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        {/* Active Batches */}
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-gray-500 text-sm">Active Batches</p>
              {batchesLoading ? (
                <p className="text-2xl font-bold text-gray-400">—</p>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {kpis.activeBatches}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100">
              <Layers className="h-5 w-5 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Quote Volume chart */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-800">
            Monthly Quote Volume
          </h2>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={monthlyData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="quotes" fill="#1e2d4e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Quotes table */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-800">Recent Quotes</h2>
        </CardHeader>
        <CardContent className="p-0">
          {quotesLoading ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              Loading…
            </div>
          ) : quotesError ? (
            <div className="px-6 py-8 text-center text-red-500 text-sm">
              Failed to load quotes.
            </div>
          ) : recentQuotes.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              No quotes yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Part Name', 'Status', 'Confidence', 'Cost (EUR)', 'Created', 'Actions'].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {recentQuotes.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-900 font-medium max-w-[200px] truncate">
                        {q.part.name}
                        {q.part.part_number && (
                          <span className="block text-xs text-gray-400 font-normal">
                            {q.part.part_number}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={statusVariant(q.status)}>
                          {statusLabel(q.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {q.confidence_score === null ? (
                          <Badge variant="default">N/A</Badge>
                        ) : (
                          <Badge variant={confidenceVariant(q.confidence_score)}>
                            {q.confidence_score.toFixed(1)}%
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-gray-700">
                        {q.cost_eur === null
                          ? '—'
                          : new Intl.NumberFormat('en-DE', {
                              style: 'currency',
                              currency: 'EUR',
                              minimumFractionDigits: 2,
                            }).format(q.cost_eur)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {format(new Date(q.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-3">
                        <Link to={`/quotes/${q.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals panel — CEO / Admin only */}
      {canApprove && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-800">
              Pending Approvals
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {quotesLoading ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                Loading…
              </div>
            ) : quotesError ? (
              <div className="px-6 py-8 text-center text-red-500 text-sm">
                Failed to load.
              </div>
            ) : pendingList.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">
                No quotes awaiting approval.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Part Name', 'Cost EUR', 'Created', 'Actions'].map((col) => (
                        <th
                          key={col}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {pendingList.map((q) => (
                      <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-900 font-medium">
                          {q.part.name}
                          {q.part.part_number && (
                            <span className="block text-xs text-gray-400 font-normal">
                              {q.part.part_number}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm font-mono text-gray-700">
                          {q.cost_eur === null
                            ? '—'
                            : new Intl.NumberFormat('en-DE', {
                                style: 'currency',
                                currency: 'EUR',
                                minimumFractionDigits: 2,
                              }).format(q.cost_eur)}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">
                          {format(new Date(q.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleApprove(q.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleReject(q.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
