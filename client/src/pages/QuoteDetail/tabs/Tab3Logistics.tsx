import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ArrowRight, Package, Truck } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';

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
  };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(v: number | null | undefined): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

// ─── Routing Node ─────────────────────────────────────────────────────────────

interface NodeStyle {
  container: string;
  icon?: React.ReactNode;
  label: string;
}

function getNodeStyle(node: string): NodeStyle {
  if (node === 'Supplier') {
    return {
      container:
        'rounded-lg px-4 py-2 border-2 font-medium text-sm bg-green-50 border-green-500 text-green-800',
      icon: <Package className="h-4 w-4 inline-block mr-1" />,
      label: node,
    };
  }
  if (node === 'Customer') {
    return {
      container:
        'rounded-lg px-4 py-2 border-2 font-medium text-sm bg-blue-50 border-blue-500 text-blue-800',
      icon: <MapPin className="h-4 w-4 inline-block mr-1" />,
      label: node,
    };
  }
  return {
    container:
      'rounded-lg px-4 py-2 border-2 font-medium text-sm bg-gray-50 border-gray-400 text-gray-700',
    icon: <Truck className="h-4 w-4 inline-block mr-1" />,
    label: node,
  };
}

// ─── Volume Sensitivity Row ───────────────────────────────────────────────────

interface SensitivityRow {
  label: string;
  minus20: number | null;
  baseline: number | null;
  plus20: number | null;
  isVolume?: boolean;
}

function SensitivityCell({
  value,
  variant,
  isVolume,
}: {
  value: number | null;
  variant: 'down' | 'base' | 'up';
  isVolume?: boolean;
}) {
  if (value == null || (isVolume && value === 0)) {
    return (
      <td className="px-4 py-3 text-right font-mono text-gray-400">N/A</td>
    );
  }

  const colorClass =
    variant === 'down'
      ? 'text-red-600'
      : variant === 'up'
        ? 'text-green-600'
        : 'font-medium text-gray-900';

  const display = isVolume
    ? value.toLocaleString('en-DE', { maximumFractionDigits: 0 })
    : `€ ${formatEur(value)}`;

  return (
    <td className={`px-4 py-3 text-right font-mono ${colorClass}`}>
      {display}
    </td>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Tab3Logistics({ quotation, quotationId }: TabProps) {
  // Fetch cost lines for volume sensitivity
  const { data: costLines, isLoading: costLinesLoading } = useQuery<CostLine[]>(
    {
      queryKey: ['cost-lines', quotationId],
      queryFn: () => api.costLines(quotationId).list(),
      staleTime: 30_000,
    },
  );

  // ── Routing nodes ────────────────────────────────────────────────────────
  const routingNodes = React.useMemo((): string[] => {
    return ['Supplier', ...(quotation.routing_path ?? []), 'Customer'];
  }, [quotation.routing_path]);

  // ── Volume sensitivity calculations ──────────────────────────────────────
  const { materialTotal, labourTotal, totalCost, annualVolume } =
    React.useMemo(() => {
      const matTotal =
        costLines
          ?.filter((l) => l.category === 'material')
          .reduce((s, l) => s + l.value_eur, 0) ?? 0;
      const labTotal =
        costLines
          ?.filter((l) => l.category === 'manufacturing')
          .reduce((s, l) => s + l.value_eur, 0) ?? 0;
      const total =
        quotation.cost_eur != null
          ? quotation.cost_eur
          : matTotal + labTotal;
      const vol = quotation.volume_sensitivity?.annual_volume ?? 0;
      return {
        materialTotal: matTotal,
        labourTotal: labTotal,
        totalCost: total,
        annualVolume: vol,
      };
    }, [costLines, quotation.cost_eur, quotation.volume_sensitivity]);

  const sensitivityRows: SensitivityRow[] = React.useMemo(() => {
    const vol = annualVolume;
    const mat = materialTotal;
    const lab = labourTotal;
    const total = totalCost;

    const matMinus = mat * 0.82;
    const matPlus = mat * 1.18;
    const labMinus = lab * 0.88;
    const labPlus = lab * 1.12;
    const totalMinus = matMinus + labMinus;
    const totalPlus = matPlus + labPlus;

    return [
      {
        label: 'Annual Volume (units)',
        minus20: vol > 0 ? vol * 0.8 : null,
        baseline: vol > 0 ? vol : null,
        plus20: vol > 0 ? vol * 1.2 : null,
        isVolume: true,
      },
      {
        label: 'Material Cost per unit',
        minus20: mat > 0 ? matMinus : null,
        baseline: mat > 0 ? mat : null,
        plus20: mat > 0 ? matPlus : null,
      },
      {
        label: 'Labour Cost per unit',
        minus20: lab > 0 ? labMinus : null,
        baseline: lab > 0 ? lab : null,
        plus20: lab > 0 ? labPlus : null,
      },
      {
        label: 'Total Cost per unit',
        minus20: total > 0 ? totalMinus : null,
        baseline: total > 0 ? total : null,
        plus20: total > 0 ? totalPlus : null,
      },
    ];
  }, [annualVolume, materialTotal, labourTotal, totalCost]);

  return (
    <div className="space-y-6">
      {/* ── Supply Chain Routing ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Supply Chain Routing</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <div className="flex flex-wrap items-center gap-0 min-w-max py-2">
              {routingNodes.map((node, idx) => {
                const style = getNodeStyle(node);
                return (
                  <React.Fragment key={`${node}-${idx}`}>
                    <div className={style.container}>
                      {style.icon}
                      {style.label}
                    </div>
                    {idx < routingNodes.length - 1 && (
                      <ArrowRight className="text-gray-400 mx-2 flex-shrink-0 h-5 w-5" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* P+F note */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              P+F Logistics Note
            </p>
            <p className="text-sm text-gray-600">
              Standard ASEAN → Singapore → Germany routing adds approximately
              3–5% logistics cost to the total part cost. DDP (Delivered Duty
              Paid) terms assumed.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Volume Sensitivity Analysis ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">
            Volume Sensitivity Analysis
          </h3>
        </CardHeader>
        <CardContent className="p-0">
          {costLinesLoading ? (
            <div className="px-4 py-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse flex gap-4 mb-3"
                >
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div
                      key={j}
                      className="h-4 bg-gray-200 rounded flex-1"
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        Cost Component
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-red-500">
                        −20% Volume
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">
                        Baseline
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-green-600">
                        +20% Volume
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`border-t border-gray-100 ${
                          idx === sensitivityRows.length - 1
                            ? 'bg-gray-50 font-semibold'
                            : 'hover:bg-gray-50/50'
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-800">{row.label}</td>
                        <SensitivityCell
                          value={row.minus20}
                          variant="down"
                          isVolume={row.isVolume}
                        />
                        <SensitivityCell
                          value={row.baseline}
                          variant="base"
                          isVolume={row.isVolume}
                        />
                        <SensitivityCell
                          value={row.plus20}
                          variant="up"
                          isVolume={row.isVolume}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
                * Labour costs scale at ~85% of volume change due to fixed setup
                and tooling components.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Logistics Note ────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-700">
            Logistics assumptions:{' '}
          </span>
          DDP pricing from supplier. Customs duties and VAT excluded. Transport:
          sea freight (standard). Incoterms: DDP Germany.
        </p>
      </div>
    </div>
  );
}
