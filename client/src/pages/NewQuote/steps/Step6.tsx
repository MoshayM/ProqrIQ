import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileDown, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useQuoteContext } from '../../../contexts/QuoteContext';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

const formatEur = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

const formatNum = (value: number) =>
  new Intl.NumberFormat('de-DE').format(Math.round(value));

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  manufacturing: 'Manufacturing',
  special_direct: 'Special Direct',
  overheads: 'Overheads',
  assembly: 'Assembly',
  component: 'Components',
};

const TIER_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: 'KB', className: 'bg-green-100 text-green-800' },
  2: { label: 'User', className: 'bg-blue-100 text-blue-800' },
  3: { label: 'Std', className: 'bg-purple-100 text-purple-800' },
  4: { label: 'Bench', className: 'bg-amber-100 text-amber-800' },
  5: { label: 'Assumed', className: 'bg-red-100 text-red-800' },
};

export default function Step6() {
  const context = useQuoteContext();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const da = context.drawingAnalysis;
  const pp = context.productionParams;
  const estimate = context.costEstimate;

  const groupedLines = estimate?.cost_lines.reduce<Record<string, typeof estimate.cost_lines>>(
    (acc, line) => {
      const cat = line.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(line);
      return acc;
    },
    {}
  ) ?? {};

  const materialCost = estimate?.cost_lines
    .filter((l) => l.category === 'material')
    .reduce((sum, l) => sum + l.value_eur, 0) ?? 0;

  const labourCost = estimate?.cost_lines
    .filter((l) => l.category === 'manufacturing')
    .reduce((sum, l) => sum + l.value_eur, 0) ?? 0;

  const baseTotal = estimate?.overall_cost_eur ?? 0;
  const annualVol = pp.annual_volume ?? 0;

  const handleExportExcel = async () => {
    if (!context.quotationId) return;
    setIsExportingExcel(true);
    try {
      const blob = await api.quotes.exportExcel(context.quotationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-export-${context.quotationId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Excel export downloaded!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleSubmit = async () => {
    if (!context.quotationId) return;
    setIsSubmitting(true);
    try {
      await api.quotes.submit(context.quotationId);
      toast.success('Quote submitted for approval!');
      navigate('/quotes');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit quote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !estimate || estimate.confidence_score >= 70;

  // Derive weight in kg from net_weight_g (grams)
  const weightKg = da?.net_weight_g != null ? da.net_weight_g / 1000 : null;

  // Dimensions subfields from dimensions_json
  const dims = da?.dimensions_json ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1e2d4e]">Review & Submit</h2>
        <p className="text-gray-500 mt-1">Review the complete quote before submitting for approval.</p>
      </div>

      {/* Total cost hero */}
      {estimate && (
        <div className="bg-[#1e2d4e] rounded-2xl p-6 text-white">
          <p className="text-sm text-blue-200 mb-1">Total Estimated Cost</p>
          <p className="text-4xl font-bold mb-2">{formatEur(estimate.overall_cost_eur)}</p>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              estimate.confidence_score >= 80
                ? 'bg-green-400/20 text-green-200'
                : estimate.confidence_score >= 70
                ? 'bg-yellow-400/20 text-yellow-200'
                : 'bg-red-400/20 text-red-200'
            }`}>
              {estimate.confidence_score}% confidence
            </span>
            <span className="text-blue-200 text-sm">{estimate.kb_coverage_pct}% KB coverage</span>
          </div>
        </div>
      )}

      {/* Part Info */}
      {da && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-4">Part Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <div>
                <span className="text-gray-500">Part Name</span>
                <p className="font-medium text-gray-900">{da.part_name}</p>
              </div>
              {da.part_number && (
                <div>
                  <span className="text-gray-500">Part Number</span>
                  <p className="font-medium text-gray-900">{da.part_number}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Commodity Type</span>
                <p className="font-medium text-gray-900 capitalize">{da.commodity_type?.replace(/_/g, ' ') ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Material</span>
                <p className="font-medium text-gray-900">{da.material_grade || '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Primary Process</span>
                <p className="font-medium text-gray-900">{da.manufacturing_process || '—'}</p>
              </div>
              {weightKg != null && (
                <div>
                  <span className="text-gray-500">Weight</span>
                  <p className="font-medium text-gray-900">{weightKg.toFixed(3)} kg</p>
                </div>
              )}
            </div>

            {dims && Object.values(dims).some((v) => v != null) && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Dimensions</p>
                <div className="flex flex-wrap gap-2">
                  {dims.l_mm != null && (
                    <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-mono">
                      L: {dims.l_mm}mm
                    </span>
                  )}
                  {dims.w_mm != null && (
                    <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-mono">
                      W: {dims.w_mm}mm
                    </span>
                  )}
                  {dims.h_mm != null && (
                    <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-mono">
                      H: {dims.h_mm}mm
                    </span>
                  )}
                  {dims.diameter_mm != null && (
                    <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-mono">
                      Dia: {dims.diameter_mm}mm
                    </span>
                  )}
                  {dims.thickness_mm != null && (
                    <span className="px-2.5 py-1 bg-gray-100 rounded text-xs font-mono">
                      Thickness: {dims.thickness_mm}mm
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown */}
      {estimate && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-4">Cost Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left text-gray-500 font-medium">Description</th>
                    <th className="py-2 px-3 text-right text-gray-500 font-medium">Cost (EUR)</th>
                    <th className="py-2 px-3 text-center text-gray-500 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedLines).map(([category, lines]) => (
                    <React.Fragment key={category}>
                      <tr className="bg-gray-50">
                        <td colSpan={3} className="py-2 px-3 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                          {CATEGORY_LABELS[category] || category}
                        </td>
                      </tr>
                      {lines.map((line, idx) => {
                        const tier = TIER_CONFIG[line.source_tier] || { label: `T${line.source_tier}`, className: 'bg-gray-100 text-gray-700' };
                        return (
                          <tr key={idx} className="border-b border-gray-50">
                            <td className="py-2 px-3 text-gray-700">
                              {line.label}
                              {line.notes && <span className="text-gray-400 text-xs ml-1 italic">({line.notes})</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{formatEur(line.value_eur)}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${tier.className}`}>
                                {tier.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-3 px-3 font-bold text-[#1e2d4e] text-base">Total Cost</td>
                    <td className="py-3 px-3 text-right font-bold font-mono text-[#1e2d4e] text-base">
                      {formatEur(estimate.overall_cost_eur)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process Overview */}
      {da && da.inferred_process_steps.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-4">Process Overview</h3>
            <ol className="space-y-2">
              {da.inferred_process_steps.map((step) => (
                <li key={step.step_number} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1e2d4e] text-white text-xs flex items-center justify-center font-semibold mt-0.5">
                    {step.step_number}
                  </span>
                  <div>
                    <span className="font-medium text-gray-800">{step.process_name}</span>
                    {step.machine_model && <span className="text-gray-500 text-sm ml-2">— {step.machine_model}</span>}
                    {step.notes && <p className="text-xs text-gray-400 italic">{step.notes}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Supply Chain Route */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold text-[#1e2d4e] mb-4">Supply Chain Route</h3>
          <div className="flex items-center flex-wrap gap-2">
            <div className="px-3 py-1.5 rounded-lg border-2 border-green-500 bg-green-100 text-green-800 text-sm font-medium">
              Supplier
              {pp.supplier_country ? ` (${pp.supplier_country})` : ''}
            </div>
            <span className="text-gray-400 font-bold">→</span>
            <div className="px-3 py-1.5 rounded-lg border-2 border-gray-400 bg-gray-100 text-gray-700 text-sm font-medium">
              {da?.manufacturing_process || 'Manufacturer'}
            </div>
            {pp.procurement_type === 'sub_contracted' && (
              <>
                <span className="text-gray-400 font-bold">→</span>
                <div className="px-3 py-1.5 rounded-lg border-2 border-gray-400 bg-gray-100 text-gray-700 text-sm font-medium">
                  Sub-Contractor
                </div>
              </>
            )}
            <span className="text-gray-400 font-bold">→</span>
            <div className="px-3 py-1.5 rounded-lg border-2 border-blue-500 bg-blue-100 text-blue-800 text-sm font-medium">
              Customer
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Volume Sensitivity */}
      {estimate && annualVol > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-[#1e2d4e] mb-1">Volume Sensitivity</h3>
            <p className="text-xs text-gray-400 mb-4">
              * Labour scales at 85% of volume change due to fixed setup components
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left text-gray-500 font-sans font-medium">Metric</th>
                    <th className="py-2 px-3 text-right text-red-600 font-sans font-medium">−20%</th>
                    <th className="py-2 px-3 text-right text-gray-700 font-sans font-medium">Baseline</th>
                    <th className="py-2 px-3 text-right text-green-600 font-sans font-medium">+20%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 px-3 font-sans text-gray-700">Annual Volume</td>
                    <td className="py-2 px-3 text-right text-red-600">{formatNum(annualVol * 0.8)}</td>
                    <td className="py-2 px-3 text-right">{formatNum(annualVol)}</td>
                    <td className="py-2 px-3 text-right text-green-600">{formatNum(annualVol * 1.2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-gray-700">Material Cost (EUR)</td>
                    <td className="py-2 px-3 text-right text-red-600">{formatEur(materialCost * 0.8)}</td>
                    <td className="py-2 px-3 text-right">{formatEur(materialCost)}</td>
                    <td className="py-2 px-3 text-right text-green-600">{formatEur(materialCost * 1.2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-gray-700">Labour Cost * (EUR)</td>
                    <td className="py-2 px-3 text-right text-red-600">{formatEur(labourCost * 0.85)}</td>
                    <td className="py-2 px-3 text-right">{formatEur(labourCost)}</td>
                    <td className="py-2 px-3 text-right text-green-600">{formatEur(labourCost * 1.15)}</td>
                  </tr>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-2 px-3 font-sans text-gray-800">Total Cost (EUR)</td>
                    <td className="py-2 px-3 text-right text-red-600">
                      {formatEur(baseTotal - (materialCost * 0.2) - (labourCost * 0.15))}
                    </td>
                    <td className="py-2 px-3 text-right">{formatEur(baseTotal)}</td>
                    <td className="py-2 px-3 text-right text-green-600">
                      {formatEur(baseTotal + (materialCost * 0.2) + (labourCost * 0.15))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => toast.info('PDF export coming soon. Use Excel for now.')}
          className="flex-1"
        >
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
        <Button
          variant="outline"
          onClick={handleExportExcel}
          disabled={isExportingExcel || !context.quotationId}
          className="flex-1"
        >
          {isExportingExcel ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4 mr-2" />
              Export Excel
            </>
          )}
        </Button>
      </div>

      {/* Submit */}
      <div className="space-y-2">
        {!canSubmit && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-800">
              Confidence must be ≥70% to submit. Current: {estimate?.confidence_score}%
            </p>
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
          className="w-full bg-[#e85c1a] hover:bg-[#d14e0f] text-white h-12 text-base font-semibold disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Submit for Approval
            </>
          )}
        </Button>

        <div className="text-center">
          <button
            onClick={() => navigate('/quotes')}
            className="text-gray-500 text-sm underline hover:text-gray-700"
          >
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}
