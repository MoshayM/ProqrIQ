import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { HelpTooltip } from '../../../components/ui/HelpTooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quotation {
  id: string;
  status: string;
  quote_type: string;
  confidence_score: number | null;
  cost_eur: number | null;
  final_price_eur: number | null;
  margin_pct: number | null;
  one_time_cost_eur: number | null;
  created_at: string;
  part: {
    id: string;
    name: string;
    part_number: string | null;
    commodity_type: string;
    material: string | null;
    primary_process: string | null;
    dimensions: Record<string, number> | null;
    weight_kg: number | null;
  } | null;
  kb_coverage_pct: number | null;
  ai_reasoning: string | null;
  routing_path: string[] | null;
  volume_sensitivity: Record<string, number> | null;
}

interface CostLine {
  id: string;
  category: string;
  label: string;
  value_eur: number;
  source_tier: number;
  notes: string | null;
}

interface TabProps {
  quotation: Quotation;
  quotationId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'material',
  'manufacturing',
  'special_direct',
  'overheads',
  'assembly',
  'component',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  manufacturing: 'Manufacturing',
  special_direct: 'Special Direct',
  overheads: 'Overheads & Profit',
  assembly: 'Assembly Ops',
  component: 'Components',
};

const CATEGORY_COLORS: Record<string, string> = {
  material: '#3b82f6',
  manufacturing: '#e85c1a',
  special_direct: '#f59e0b',
  overheads: '#6b7280',
  assembly: '#8b5cf6',
  component: '#10b981',
};

const TIER_CONFIG: Record<
  number,
  { bg: string; text: string; label: string }
> = {
  1: { bg: 'bg-green-100', text: 'text-green-800', label: 'KB' },
  2: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'User' },
  3: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Std' },
  4: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Bench' },
  5: { bg: 'bg-red-100', text: 'text-red-800', label: 'Assumed' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function TierBadge({ tier }: { tier: number }) {
  const cfg = TIER_CONFIG[tier] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: String(tier),
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  borderColor: string;
  tooltip?: string;
}

function KpiCard({ label, value, borderColor, tooltip }: KpiCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-1"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <span className="text-gray-500 text-sm flex items-center gap-1">
        {label}
        {tooltip && <HelpTooltip content={tooltip} />}
      </span>
      <span className="text-xl font-bold font-mono text-gray-900">{value}</span>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
      </td>
      <td className="px-4 py-2">
        <div className="h-4 bg-gray-200 rounded w-20 ml-auto" />
      </td>
      <td className="px-4 py-2">
        <div className="h-4 bg-gray-200 rounded w-12" />
      </td>
      <td className="px-4 py-2">
        <div className="h-4 bg-gray-200 rounded w-24" />
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Tab1Overview({ quotation, quotationId }: TabProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  const {
    data: costLines,
    isLoading,
    isError,
  } = useQuery<CostLine[]>({
    queryKey: ['cost-lines', quotationId],
    queryFn: () => api.costLines(quotationId).list(),
    staleTime: 30_000,
  });

  // ── Group cost lines by category ──────────────────────────────────────────
  const grouped = React.useMemo(() => {
    const map = new Map<string, CostLine[]>();
    if (!costLines) return map;
    for (const line of costLines) {
      if (!map.has(line.category)) map.set(line.category, []);
      map.get(line.category)!.push(line);
    }
    return map;
  }, [costLines]);

  const totalCost = React.useMemo(() => {
    if (!costLines) return 0;
    return costLines.reduce((s, l) => s + l.value_eur, 0);
  }, [costLines]);

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = React.useMemo(() => {
    return CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => ({
      name: CATEGORY_LABELS[cat] ?? cat,
      value: grouped.get(cat)!.reduce((s, l) => s + l.value_eur, 0),
      color: CATEGORY_COLORS[cat] ?? '#9ca3af',
    }));
  }, [grouped]);

  // ── Confidence badge ──────────────────────────────────────────────────────
  const confidenceBadge = React.useMemo(() => {
    const score = quotation.confidence_score;
    if (score == null)
      return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'N/A' };
    if (score >= 80)
      return { bg: 'bg-green-100', text: 'text-green-800', label: `${score}%` };
    if (score >= 60)
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        label: `${score}%`,
      };
    return { bg: 'bg-red-100', text: 'text-red-800', label: `${score}%` };
  }, [quotation.confidence_score]);

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Cost"
          value={
            quotation.cost_eur != null
              ? `€ ${formatEur(quotation.cost_eur)}`
              : 'Not estimated'
          }
          borderColor="#e85c1a"
        />
        <KpiCard
          label="Final Price"
          value={
            quotation.final_price_eur != null
              ? `€ ${formatEur(quotation.final_price_eur)}`
              : '—'
          }
          borderColor="#1e2d4e"
        />
        <KpiCard
          label="Margin"
          value={
            quotation.margin_pct != null
              ? `${quotation.margin_pct.toFixed(1)}%`
              : '—'
          }
          borderColor="#10b981"
          tooltip="Standard margin of 16%. Applied once at the parent level — individual components inside an assembly are stored pre-margin."
        />
        <KpiCard
          label="One-Time Cost"
          value={
            quotation.one_time_cost_eur != null
              ? `€ ${formatEur(quotation.one_time_cost_eur)}`
              : '—'
          }
          borderColor="#6b7280"
        />
      </div>

      {/* ── Confidence & KB Coverage ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${confidenceBadge.bg} ${confidenceBadge.text}`}
        >
          {confidenceBadge.label} Confident
        </span>
        {quotation.kb_coverage_pct != null && (
          <span className="text-sm text-gray-500">
            KB Coverage:{' '}
            <span className="font-medium text-gray-700">
              {quotation.kb_coverage_pct.toFixed(0)}%
            </span>
          </span>
        )}
      </div>

      {/* ── Cost Breakdown Table ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Cost Breakdown</h3>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <p className="px-4 py-6 text-sm text-red-600">
              Failed to load cost lines. Please try again.
            </p>
          ) : (
            <>
            {/* Mobile card list (sm and below) */}
            <div className="md:hidden divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 space-y-1.5 animate-pulse">
                    <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                    <div className="flex justify-between items-center">
                      <div className="h-3 bg-gray-200 rounded w-1/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/5" />
                    </div>
                  </div>
                ))
              ) : !costLines || costLines.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  No cost lines yet. Run the AI estimate to generate a breakdown.
                </p>
              ) : (
                <>
                  {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
                    const lines = grouped.get(cat)!;
                    return (
                      <React.Fragment key={cat}>
                        <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </div>
                        {lines.map((line) => (
                          <div key={line.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 truncate">{line.label}</p>
                              {line.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{line.notes}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <TierBadge tier={line.source_tier} />
                              <span className="text-sm font-mono font-medium text-gray-900">€ {formatEur(line.value_eur)}</span>
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  <div className="px-4 py-3 bg-gray-100 flex items-center justify-between border-t-2 border-gray-300">
                    <span className="text-sm font-bold text-gray-900">Total Cost</span>
                    <span className="text-sm font-bold font-mono text-gray-900">€ {formatEur(totalCost)}</span>
                  </div>
                </>
              )}
            </div>
            {/* Desktop table (md and above) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Label
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">
                      Value (EUR)
                    </th>
                    <th className="px-4 py-2 font-medium text-gray-600">
                      Tier
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))
                  ) : !costLines || costLines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No cost lines yet. Run the AI estimate to generate a
                        breakdown.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map(
                        (cat) => {
                          const lines = grouped.get(cat)!;
                          const catTotal = lines.reduce(
                            (s, l) => s + l.value_eur,
                            0,
                          );
                          return (
                            <React.Fragment key={cat}>
                              {/* Category header */}
                              <tr className="bg-gray-50">
                                <td
                                  colSpan={4}
                                  className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide"
                                >
                                  {CATEGORY_LABELS[cat] ?? cat} —{' '}
                                  <span className="font-mono normal-case tracking-normal font-normal text-gray-500">
                                    € {formatEur(catTotal)}
                                  </span>
                                </td>
                              </tr>
                              {/* Detail rows */}
                              {lines.map((line) => (
                                <tr
                                  key={line.id}
                                  className="border-t border-gray-100 hover:bg-gray-50/50"
                                >
                                  <td className="px-4 py-2 text-gray-800">
                                    {line.label}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-900">
                                    € {formatEur(line.value_eur)}
                                  </td>
                                  <td className="px-4 py-2">
                                    <TierBadge tier={line.source_tier} />
                                  </td>
                                  <td className="px-4 py-2 text-xs text-gray-500">
                                    {line.notes ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        },
                      )}
                      {/* Total row */}
                      <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td className="px-4 py-3 font-bold text-gray-900">
                          Total Cost
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                          € {formatEur(totalCost)}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Cost Distribution Pie ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Cost Distribution</h3>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#e85c1a] border-t-transparent" />
            </div>
          ) : pieData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No data to visualise yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label={({ percent }) =>
                    percent > 0.04
                      ? `${(percent * 100).toFixed(1)}%`
                      : undefined
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => [`€ ${formatEur(val)}`, 'Cost']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── AI Reasoning ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex w-full items-center justify-between cursor-pointer focus:outline-none"
            onClick={() => setShowReasoning((v) => !v)}
          >
            <h3 className="font-semibold text-gray-900">AI Reasoning</h3>
            {showReasoning ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
        </CardHeader>
        {showReasoning && (
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
              {quotation.ai_reasoning ?? 'No AI reasoning available.'}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
