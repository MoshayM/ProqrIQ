import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

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

interface MaterialBreakdown {
  id: string;
  material_name: string;
  spec: string | null;
  unit: string;
  quantity: number;
  unit_cost_eur: number;
  total_cost_eur: number;
  source_tier: number;
  benchmark_divergence_pct: number | null;
}

interface CycleTimeStep {
  id: string;
  step_number: number;
  process_name: string;
  machine_time_min: number | null;
  labour_time_min: number | null;
  setup_time_min: number | null;
  notes: string | null;
}

interface RegionalRate {
  id: string;
  country_code: string;
  country_name: string;
  currency: string;
  machine_rate_eur_hr: number;
  labour_rate_eur_hr: number;
  overhead_pct: number;
  updated_at: string;
}

interface TabProps {
  quotation: Quotation;
  quotationId: string;
}

type SubTab = 'material' | 'cycletime' | 'machine';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<number, { bg: string; text: string; label: string }> =
  {
    1: { bg: 'bg-green-100', text: 'text-green-800', label: 'KB' },
    2: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'User' },
    3: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Std' },
    4: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Bench' },
    5: { bg: 'bg-red-100', text: 'text-red-800', label: 'Assumed' },
  };

const COUNTRY_BORDER: Record<string, string> = {
  DE: 'border-l-4 border-l-blue-500',
  CN: 'border-l-4 border-l-red-500',
  IN: 'border-l-4 border-l-orange-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(v: number) {
  return new Intl.NumberFormat('en-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
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

function SkeletonTable({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="animate-pulse border-t border-gray-100">
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-4 py-2">
                  <div className="h-4 bg-gray-200 rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Material Sub-Tab ─────────────────────────────────────────────────────────

function MaterialTab({ quotationId }: { quotationId: string }) {
  const { data: materials, isLoading, isError } = useQuery<MaterialBreakdown[]>(
    {
      queryKey: ['materials', quotationId],
      queryFn: () => api.materials(quotationId).list(),
      staleTime: 30_000,
    },
  );

  const hasDivergence = materials?.some(
    (m) => m.benchmark_divergence_pct != null && m.benchmark_divergence_pct > 15,
  );

  const totalCost = materials?.reduce((s, m) => s + m.total_cost_eur, 0) ?? 0;

  function DivergenceCell({ pct }: { pct: number | null }) {
    if (pct == null) return <span className="text-gray-400">—</span>;
    if (pct > 10)
      return (
        <span className="text-red-600 font-medium">
          ↑ {pct.toFixed(1)}%
        </span>
      );
    if (pct >= 5)
      return (
        <span className="text-amber-600 font-medium">{pct.toFixed(1)}%</span>
      );
    return <span className="text-green-600">{pct.toFixed(1)}%</span>;
  }

  return (
    <div className="space-y-4">
      {hasDivergence && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <p className="text-sm text-amber-800">
            Some material costs show significant benchmark divergence (&gt;15%).
            Review highlighted rows.
          </p>
        </div>
      )}
      {/* Mobile cards (sm and below) */}
      <div className="md:hidden divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5 animate-pulse">
              <div className="h-3.5 bg-gray-200 rounded w-2/3" />
              <div className="flex justify-between">
                <div className="h-3 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-1/5" />
              </div>
            </div>
          ))
        ) : materials && materials.length > 0 ? (
          <>
            {materials.map((m) => (
              <div key={m.id} className={`px-4 py-3 space-y-1 ${m.benchmark_divergence_pct != null && m.benchmark_divergence_pct > 15 ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{m.material_name}</p>
                  <span className="text-sm font-mono font-semibold text-gray-900 flex-shrink-0">€ {formatEur(m.total_cost_eur)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  {m.spec && <span>{m.spec}</span>}
                  <span>{m.quantity} {m.unit}</span>
                  <span>@ € {formatEur(m.unit_cost_eur)}</span>
                  <TierBadge tier={m.source_tier} />
                </div>
              </div>
            ))}
            <div className="px-4 py-2.5 bg-gray-100 flex justify-between items-center border-t-2 border-gray-300">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-sm font-bold font-mono text-gray-900">€ {formatEur(totalCost)}</span>
            </div>
          </>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No material breakdown available.</p>
        )}
      </div>
      {/* Desktop table (md and above) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Material Name
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Spec
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Qty
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Unit
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Unit Cost (€)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Total (€)
              </th>
              <th className="px-4 py-2 font-medium text-gray-600">Tier</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Divergence
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-t border-gray-100">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-2">
                      <div className="h-4 bg-gray-200 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-red-600"
                >
                  Failed to load material data.
                </td>
              </tr>
            ) : !materials || materials.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No material breakdown available.
                </td>
              </tr>
            ) : (
              <>
                {materials.map((m) => {
                  const rowHighlight =
                    m.benchmark_divergence_pct != null &&
                    m.benchmark_divergence_pct > 15
                      ? 'bg-red-50'
                      : '';
                  return (
                    <tr
                      key={m.id}
                      className={`border-t border-gray-100 hover:bg-gray-50/50 ${rowHighlight}`}
                    >
                      <td className="px-4 py-2 text-gray-800 font-medium">
                        {m.material_name}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {m.spec ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {m.quantity}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{m.unit}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        € {formatEur(m.unit_cost_eur)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-medium">
                        € {formatEur(m.total_cost_eur)}
                      </td>
                      <td className="px-4 py-2">
                        <TierBadge tier={m.source_tier} />
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        <DivergenceCell pct={m.benchmark_divergence_pct} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td
                    colSpan={5}
                    className="px-4 py-3 font-bold text-gray-900"
                  >
                    Total Material Cost
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                    € {formatEur(totalCost)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



// ─── Cycle Time Sub-Tab ───────────────────────────────────────────────────────

function CycleTimeTab({ quotationId }: { quotationId: string }) {
  const { data: steps, isLoading, isError } = useQuery<CycleTimeStep[]>({
    queryKey: ['cycle-times', quotationId],
    queryFn: () => api.cycleTime(quotationId).list(),
    staleTime: 30_000,
  });

  const sortedSteps = React.useMemo(
    () => (steps ? [...steps].sort((a, b) => a.step_number - b.step_number) : []),
    [steps],
  );

  const totals = React.useMemo(() => {
    return sortedSteps.reduce(
      (acc, s) => ({
        machine: acc.machine + (s.machine_time_min ?? 0),
        labour: acc.labour + (s.labour_time_min ?? 0),
        setup: acc.setup + (s.setup_time_min ?? 0),
      }),
      { machine: 0, labour: 0, setup: 0 },
    );
  }, [sortedSteps]);

  const maxStepTotal = React.useMemo(() => {
    if (sortedSteps.length === 0) return 1;
    return Math.max(
      ...sortedSteps.map(
        (s) =>
          (s.machine_time_min ?? 0) +
          (s.labour_time_min ?? 0) +
          (s.setup_time_min ?? 0),
      ),
      1,
    );
  }, [sortedSteps]);

  return (
    <div className="space-y-6">
      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5 animate-pulse">
              <div className="h-3.5 bg-gray-200 rounded w-1/2" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-1/5" />
                <div className="h-3 bg-gray-200 rounded w-1/5" />
                <div className="h-3 bg-gray-200 rounded w-1/5" />
              </div>
            </div>
          ))
        ) : sortedSteps.length > 0 ? (
          <>
            {sortedSteps.map((s) => {
              const rowTotal = (s.machine_time_min ?? 0) + (s.labour_time_min ?? 0) + (s.setup_time_min ?? 0);
              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-800">{s.step_number}. {s.process_name}</p>
                    <span className="text-sm font-mono font-semibold text-gray-900">{rowTotal.toFixed(1)} min</span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    {s.machine_time_min != null && <span>M: {s.machine_time_min.toFixed(1)}</span>}
                    {s.labour_time_min != null && <span>L: {s.labour_time_min.toFixed(1)}</span>}
                    {s.setup_time_min != null && <span>S: {s.setup_time_min.toFixed(1)}</span>}
                  </div>
                  {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}
                </div>
              );
            })}
            <div className="px-4 py-2.5 bg-gray-100 flex justify-between border-t-2 border-gray-300">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-sm font-bold font-mono text-gray-900">{(totals.machine + totals.labour + totals.setup).toFixed(1)} min</span>
            </div>
          </>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No cycle time steps recorded.</p>
        )}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                #
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Process
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Machine (min)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Labour (min)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Setup (min)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Total (min)
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-t border-gray-100">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-2">
                      <div className="h-4 bg-gray-200 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-red-600"
                >
                  Failed to load cycle time data.
                </td>
              </tr>
            ) : sortedSteps.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No cycle time steps recorded.
                </td>
              </tr>
            ) : (
              <>
                {sortedSteps.map((s) => {
                  const rowTotal =
                    (s.machine_time_min ?? 0) +
                    (s.labour_time_min ?? 0) +
                    (s.setup_time_min ?? 0);
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-2 text-gray-500 font-mono">
                        {s.step_number}
                      </td>
                      <td className="px-4 py-2 text-gray-800 font-medium">
                        {s.process_name}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {s.machine_time_min?.toFixed(1) ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {s.labour_time_min?.toFixed(1) ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {s.setup_time_min?.toFixed(1) ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-medium">
                        {rowTotal.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {s.notes ?? '—'}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                  <td colSpan={2} className="px-4 py-3 text-gray-900">
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {totals.machine.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {totals.labour.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {totals.setup.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {(totals.machine + totals.labour + totals.setup).toFixed(1)}
                  </td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Timeline */}
      {!isLoading && sortedSteps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Process Timeline
          </h4>
          <div className="space-y-2">
            {sortedSteps.map((s) => {
              const machine = s.machine_time_min ?? 0;
              const labour = s.labour_time_min ?? 0;
              const setup = s.setup_time_min ?? 0;
              const machinePct = (machine / maxStepTotal) * 100;
              const labourPct = (labour / maxStepTotal) * 100;
              const setupPct = (setup / maxStepTotal) * 100;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-32 truncate text-xs text-gray-600 flex-shrink-0">
                    {s.process_name}
                  </span>
                  <div className="flex-1 flex h-5 rounded overflow-hidden bg-gray-100">
                    {machinePct > 0 && (
                      <div
                        className="bg-[#1e2d4e]"
                        style={{ width: `${machinePct}%` }}
                        title={`Machine: ${machine.toFixed(1)} min`}
                      />
                    )}
                    {labourPct > 0 && (
                      <div
                        className="bg-[#e85c1a]"
                        style={{ width: `${labourPct}%` }}
                        title={`Labour: ${labour.toFixed(1)} min`}
                      />
                    )}
                    {setupPct > 0 && (
                      <div
                        className="bg-gray-400"
                        style={{ width: `${setupPct}%` }}
                        title={`Setup: ${setup.toFixed(1)} min`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#1e2d4e]" />
              <span className="text-xs text-gray-600">Machine</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#e85c1a]" />
              <span className="text-xs text-gray-600">Labour</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-gray-400" />
              <span className="text-xs text-gray-600">Setup</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Machine & Labour Sub-Tab ─────────────────────────────────────────────────

function MachineTab() {
  const { data: rates, isLoading, isError } = useQuery<RegionalRate[]>({
    queryKey: ['regional-rates'],
    queryFn: api.kb.rates,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-700">
        Regional Manufacturing Rates
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Country
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Currency
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Machine (€/hr)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Labour (€/hr)
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">
                Overhead %
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-t border-gray-100">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-2">
                      <div className="h-4 bg-gray-200 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-red-600"
                >
                  Failed to load regional rates.
                </td>
              </tr>
            ) : !rates || rates.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No regional rates configured. Contact admin to add rates.
                </td>
              </tr>
            ) : (
              rates.map((r) => {
                const borderClass = COUNTRY_BORDER[r.country_code] ?? '';
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-gray-100 hover:bg-gray-50/50 ${borderClass}`}
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {r.country_name}{' '}
                      <span className="text-xs text-gray-500 font-normal">
                        ({r.country_code})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.currency}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      € {formatEur(r.machine_rate_eur_hr)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      € {formatEur(r.labour_rate_eur_hr)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.overhead_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {formatDate(r.updated_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Rates sourced from ProqrIQ knowledge base. Updated quarterly.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Tab2Process({ quotation, quotationId }: TabProps) {
  const [subTab, setSubTab] = useState<SubTab>('material');

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'material', label: 'Material' },
    { key: 'cycletime', label: 'Cycle Time' },
    { key: 'machine', label: 'Machine & Labour' },
  ];

  return (
    <Card>
      <CardHeader>
        {/* Sub-tab navigation */}
        <div className="flex gap-1 border-b border-gray-200 -mx-6 px-6 pb-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors focus:outline-none ${
                subTab === t.key
                  ? 'bg-white border border-b-white border-gray-200 text-[#e85c1a] -mb-px z-10'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {subTab === 'material' && <MaterialTab quotationId={quotationId} />}
        {subTab === 'cycletime' && <CycleTimeTab quotationId={quotationId} />}
        {subTab === 'machine' && <MachineTab />}
      </CardContent>
    </Card>
  );
}
