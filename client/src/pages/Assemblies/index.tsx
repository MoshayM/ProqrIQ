import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Eye, Trash2, ChevronLeft, Loader2, X, Layers, Package, Link2, ShoppingCart, Download, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface Quotation {
  id: string;
  status: string;
  quote_type: 'individual'|'assembly'|'component';
  confidence_score: number | null;
  cost_eur: number | null;
  created_at: string;
  part: { id:string; name:string; part_number:string|null; commodity_type:string; };
}

interface CostLine {
  id: string;
  category: string;
  label: string;
  value_eur: number;
  source_tier: number;
  notes: string | null;
}

interface AssemblyRollup {
  total_cost_eur: number;
  component_costs: Array<{ part_name:string; cost_eur:number; quantity:number; subtotal_eur:number; }>;
  assembly_ops_cost_eur: number;
  confidence_min: number;
  confidence_avg: number;
}

interface AssemblyComponent {
  id: string;
  component_type: string;
  quantity: number;
  notes: string | null;
  child_quotation: Quotation | null;
  child_part: { id:string; name:string; part_number:string|null; } | null;
}

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  sub_assembly: 'bg-purple-100 text-purple-700',
  machined_part: 'bg-blue-100 text-blue-700',
  purchased_standard: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  submitted: 'bg-indigo-100 text-indigo-700',
};

function fmt(n: number | null) {
  if (n === null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

function AddComponentModal({
  assemblyId,
  onClose,
}: {
  assemblyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'choose'|'link'|'new_part'|'purchased'>('choose');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [partName, setPartName] = useState('');
  const [commodityType, setCommodityType] = useState('cnc_machining');
  const [unitCost, setUnitCost] = useState(0);
  const [purchasedName, setPurchasedName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: quotes = [] } = useQuery<Quotation[]>({
    queryKey: ['assemblies-list'],
    queryFn: () => api.quotes.list().then((qs) => qs.filter((q: Quotation) => q.quote_type !== 'assembly')),
    enabled: step === 'link',
  });

  async function handleLinkExisting() {
    if (!selectedQuoteId) { toast.error('Select a quote'); return; }
    setIsSubmitting(true);
    try {
      await api.assemblies.addComponent(assemblyId, {
        component_type: 'sub_assembly',
        child_quotation_id: selectedQuoteId,
        quantity,
      });
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] });
      toast.success('Component linked');
      onClose();
    } catch { toast.error('Failed to add component'); }
    finally { setIsSubmitting(false); }
  }

  async function handleNewPart() {
    if (!partName.trim()) { toast.error('Part name required'); return; }
    setIsSubmitting(true);
    try {
      const part = await api.parts.create({ name: partName, commodity_type: commodityType });
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' });
      await api.assemblies.addComponent(assemblyId, {
        component_type: 'machined_part',
        child_quotation_id: quote.id,
        quantity,
      });
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] });
      toast.success('Part created and added');
      onClose();
    } catch { toast.error('Failed to add part'); }
    finally { setIsSubmitting(false); }
  }

  async function handlePurchased() {
    if (!purchasedName.trim()) { toast.error('Name required'); return; }
    setIsSubmitting(true);
    try {
      await api.assemblies.addComponent(assemblyId, {
        component_type: 'purchased_standard',
        unit_cost_eur: unitCost,
        quantity,
        notes: purchasedName,
      });
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] });
      toast.success('Purchased standard added');
      onClose();
    } catch { toast.error('Failed to add component'); }
    finally { setIsSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Add Component</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {step === 'choose' && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'link', icon: Link2, label: 'Link Existing Quote', color: 'blue' },
                { key: 'new_part', icon: Plus, label: 'New Part', color: 'orange' },
                { key: 'purchased', icon: ShoppingCart, label: 'Purchased Standard', color: 'green' },
              ].map(({ key, icon: Icon, label, color }) => (
                <button
                  key={key}
                  onClick={() => setStep(key as any)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:border-${color}-400 hover:bg-${color}-50`}
                >
                  <Icon className={`w-7 h-7 text-${color}-500`} />
                  <span className="text-sm font-medium text-gray-700 text-center">{label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'link' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"><ChevronLeft className="w-3 h-3" />Back</button>
              <p className="text-sm font-medium text-gray-700">Select an existing quotation:</p>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {quotes.map((q) => (
                  <label key={q.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="quote" value={q.id} checked={selectedQuoteId === q.id} onChange={() => setSelectedQuoteId(q.id)} />
                    <div>
                      <p className="text-sm font-medium">{q.part?.name ?? 'Unnamed'}</p>
                      <p className="text-xs text-gray-400">{q.part?.part_number ?? 'No part number'} · {q.status}</p>
                    </div>
                    {q.cost_eur != null && <span className="ml-auto text-xs text-gray-600">{fmt(q.cost_eur)}</span>}
                  </label>
                ))}
                {quotes.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No existing quotes found.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <Button onClick={handleLinkExisting} disabled={isSubmitting || !selectedQuoteId} className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link Component'}
              </Button>
            </div>
          )}

          {step === 'new_part' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"><ChevronLeft className="w-3 h-3" />Back</button>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Part Name *</label>
                <input value={partName} onChange={(e) => setPartName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Bracket Housing" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commodity Type</label>
                <select value={commodityType} onChange={(e) => setCommodityType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {['cnc_machining','sheet_metal','turning','stamping','injection_moulding','die_casting','other'].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <Button onClick={handleNewPart} disabled={isSubmitting || !partName.trim()} className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & Add Part'}
              </Button>
            </div>
          )}

          {step === 'purchased' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"><ChevronLeft className="w-3 h-3" />Back</button>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                <input value={purchasedName} onChange={(e) => setPurchasedName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. M6 Bolt DIN 933" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Cost (EUR)</label>
                <input type="number" min={0} step={0.01} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <Button onClick={handlePurchased} disabled={isSubmitting || !purchasedName.trim()} className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Purchased Standard'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL VIEW ─────────────────────────────────────────────────────────────

function AssemblyDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'bom'|'rollup'|'assembly_ops'|'export'>('bom');
  const [showAddModal, setShowAddModal] = useState(false);
  const [rollupData, setRollupData] = useState<AssemblyRollup | null>(null);
  const [isRollingUp, setIsRollingUp] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isCostingChildren, setIsCostingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: quotation } = useQuery<Quotation>({
    queryKey: ['quote', id],
    queryFn: () => api.quotes.get(id),
  });

  const { data: components = [] } = useQuery<AssemblyComponent[]>({
    queryKey: ['assembly-components', id],
    queryFn: () => api.assemblies.get(id),
  });

  const { data: costLines = [] } = useQuery<CostLine[]>({
    queryKey: ['cost-lines', id],
    queryFn: () => api.costLines(id).list(),
    enabled: activeTab === 'assembly_ops',
  });

  const assemblyOps = costLines.filter((cl) => cl.category === 'assembly');

  async function handleCostChildren() {
    setIsCostingChildren(true);
    try {
      const batch = await api.assemblies.costChildren(id);
      toast.success('Batch costing started');
      navigate(`/bulk/${batch.id}`);
    } catch { toast.error('Failed to start batch costing'); }
    finally { setIsCostingChildren(false); }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await api.quotes.submit(id);
      queryClient.invalidateQueries({ queryKey: ['quote', id] });
      toast.success('Assembly submitted successfully');
    } catch { toast.error('Failed to submit assembly'); }
    finally { setIsSubmitting(false); }
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const blob = await api.assemblies.exportExcel(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assembly-${id.slice(0,8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
    finally { setIsExporting(false); }
  }

  async function handleRollup() {
    setIsRollingUp(true);
    try {
      const result = await api.assemblies.rollup(id);
      setRollupData(result);
      toast.success('Rollup calculated');
    } catch { toast.error('Rollup failed'); }
    finally { setIsRollingUp(false); }
  }

  async function handleEstimateOps() {
    setIsEstimating(true);
    try {
      await api.ai.estimateAssembly(id);
      queryClient.invalidateQueries({ queryKey: ['cost-lines', id] });
      toast.success('Assembly ops estimated');
    } catch { toast.error('Estimation failed'); }
    finally { setIsEstimating(false); }
  }

  const removeComponentMut = useMutation({
    mutationFn: (componentId: string) => api.assemblies.removeComponent(id, componentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembly-components', id] });
      toast.success('Component removed');
    },
    onError: () => toast.error('Failed to remove component'),
  });

  const hasLowConfidence = components.some(
    (c) => c.child_quotation?.confidence_score != null && c.child_quotation.confidence_score < 0.6
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/assemblies')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="w-4 h-4" /> Back to Assemblies
        </button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#1e2d4e]">{quotation?.part?.name ?? 'Assembly'}</h1>
              {quotation?.part?.part_number && (
                <p className="text-sm text-gray-500 mt-0.5">PN: {quotation.part.part_number}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {quotation?.cost_eur != null && (
                <span className="text-xl font-bold text-[#e85c1a]">{fmt(quotation.cost_eur)}</span>
              )}
              {quotation?.status && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[quotation.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {quotation.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              onClick={handleCostChildren}
              disabled={isCostingChildren}
              className="bg-[#1e2d4e] hover:bg-[#162540] text-white flex items-center gap-2"
            >
              {isCostingChildren ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Cost All Children
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || quotation?.status === 'submitted'}
              title={hasLowConfidence ? 'Some children have low confidence scores' : undefined}
              className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {hasLowConfidence ? '⚠ Submit Assembly' : 'Submit Assembly'}
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Excel
            </Button>
          </div>
          {hasLowConfidence && (
            <p className="text-xs text-amber-600 mt-2">⚠ One or more child components have low confidence scores (&lt;60%).</p>
          )}
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <div className="flex border-b border-gray-200">
            {(['bom', 'rollup', 'assembly_ops', 'export'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-[#e85c1a] text-[#e85c1a]'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab === 'bom' ? 'BOM' : tab === 'assembly_ops' ? 'Assembly Ops' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* BOM TAB */}
            {activeTab === 'bom' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button onClick={() => setShowAddModal(true)} className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Component
                  </Button>
                </div>
                {components.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <Layers className="w-10 h-10" />
                    <p>No components yet. Add the first one.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="pb-3 pr-4 font-medium">Component</th>
                          <th className="pb-3 pr-4 font-medium">Type</th>
                          <th className="pb-3 pr-4 font-medium">Qty</th>
                          <th className="pb-3 pr-4 font-medium">Status</th>
                          <th className="pb-3 pr-4 font-medium">Cost EUR</th>
                          <th className="pb-3 pr-4 font-medium">Confidence</th>
                          <th className="pb-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {components.map((comp) => {
                          const name = comp.child_quotation?.part?.name ?? comp.child_part?.name ?? comp.notes ?? 'Unnamed';
                          const status = comp.child_quotation?.status ?? '—';
                          const cost = comp.child_quotation?.cost_eur ?? null;
                          const confidence = comp.child_quotation?.confidence_score;
                          return (
                            <tr key={comp.id} className="hover:bg-gray-50">
                              <td className="py-3 pr-4 font-medium text-[#1e2d4e]">
                                {comp.child_quotation ? (
                                  <Link to={`/quotes/${comp.child_quotation.id}`} className="hover:underline text-[#1e2d4e]">
                                    {name}
                                  </Link>
                                ) : name}
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${COMPONENT_TYPE_COLORS[comp.component_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {comp.component_type.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-gray-600">{comp.quantity}</td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-gray-700">{fmt(cost)}</td>
                              <td className="py-3 pr-4">
                                {confidence != null ? (
                                  <span className={`text-sm font-medium ${confidence >= 0.8 ? 'text-green-600' : confidence >= 0.6 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {Math.round(confidence * 100)}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-3">
                                <button
                                  onClick={() => removeComponentMut.mutate(comp.id)}
                                  disabled={removeComponentMut.isPending}
                                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                                  title="Remove component"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ROLLUP TAB */}
            {activeTab === 'rollup' && (
              <div className="space-y-6">
                <Button
                  onClick={handleRollup}
                  disabled={isRollingUp}
                  className="w-full py-4 text-lg bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  {isRollingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                  Calculate Rollup
                </Button>

                {rollupData && (
                  <div className="space-y-6">
                    <div className="text-center py-6 bg-orange-50 rounded-xl">
                      <p className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">Total Assembly Cost</p>
                      <p className="text-4xl font-bold text-[#e85c1a]">{fmt(rollupData.total_cost_eur)}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Component Costs</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                            <th className="pb-2 pr-4 font-medium">Part Name</th>
                            <th className="pb-2 pr-4 font-medium">Qty</th>
                            <th className="pb-2 pr-4 font-medium">Unit Cost</th>
                            <th className="pb-2 font-medium">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rollupData.component_costs.map((cc, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="py-2 pr-4 font-medium text-[#1e2d4e]">{cc.part_name}</td>
                              <td className="py-2 pr-4 text-gray-600">{cc.quantity}</td>
                              <td className="py-2 pr-4 text-gray-600">{fmt(cc.cost_eur)}</td>
                              <td className="py-2 font-semibold text-gray-800">{fmt(cc.subtotal_eur)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-6 p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-xs text-gray-500">Assembly Operations</p>
                        <p className="text-lg font-semibold text-[#1e2d4e]">{fmt(rollupData.assembly_ops_cost_eur)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Confidence Range</p>
                        <p className="text-lg font-semibold text-[#1e2d4e]">
                          {Math.round(rollupData.confidence_min * 100)}% – {Math.round(rollupData.confidence_avg * 100)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ASSEMBLY OPS TAB */}
            {activeTab === 'assembly_ops' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={handleEstimateOps}
                    disabled={isEstimating}
                    className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
                  >
                    {isEstimating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Estimate Assembly Ops
                  </Button>
                </div>

                {assemblyOps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <Package className="w-10 h-10" />
                    <p>No assembly operations yet. Click "Estimate Assembly Ops" to generate.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="pb-3 pr-4 font-medium">Label</th>
                        <th className="pb-3 pr-4 font-medium">Value (EUR)</th>
                        <th className="pb-3 pr-4 font-medium">Source Tier</th>
                        <th className="pb-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assemblyOps.map((cl) => (
                        <tr key={cl.id} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-medium text-[#1e2d4e]">{cl.label}</td>
                          <td className="py-3 pr-4 text-gray-700">{fmt(cl.value_eur)}</td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cl.source_tier === 1 ? 'bg-green-100 text-green-700' : cl.source_tier === 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              Tier {cl.source_tier}
                            </span>
                          </td>
                          <td className="py-3 text-gray-500 text-xs">{cl.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
              <div className="space-y-6">
                <p className="text-sm text-gray-600">
                  Download the full assembly package. The Excel export includes the complete BOM tree, rollup summary, and assembly operations breakdown.
                </p>
                <div className="flex flex-wrap justify-center gap-4 py-8">
                  <Button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 px-6 py-3 text-base"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast.info('PDF export coming soon')}
                    className="flex items-center gap-2 px-6 py-3 text-base text-gray-500"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </Button>
                </div>
                <p className="text-xs text-gray-400 text-center">
                  PDF export is coming in a future release. Use Excel for full data fidelity.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showAddModal && (
        <AddComponentModal assemblyId={id} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

// ─── LIST VIEW ───────────────────────────────────────────────────────────────

function AssembliesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewModal, setShowNewModal] = useState(false);
  const [assemblyName, setAssemblyName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [annualVolume, setAnnualVolume] = useState(1000);
  const [lotSize, setLotSize] = useState(100);
  const [isCreating, setIsCreating] = useState(false);

  const { data: assemblies = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ['assemblies'],
    queryFn: () => api.quotes.list().then((qs) => qs.filter((q: Quotation) => q.quote_type === 'assembly')),
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!assemblyName.trim()) { toast.error('Assembly name is required'); return; }
    setIsCreating(true);
    try {
      const result = await api.assemblies.create({
        name: assemblyName,
        part_number: partNumber || undefined,
        annual_volume: annualVolume,
        lot_size: lotSize,
      });
      queryClient.invalidateQueries({ queryKey: ['assemblies'] });
      toast.success('Assembly created');
      setShowNewModal(false);
      navigate(`/assemblies/${result.id}`);
    } catch { toast.error('Failed to create assembly'); }
    finally { setIsCreating(false); }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2d4e]">Assemblies</h1>
          <p className="text-sm text-gray-500 mt-1">Manage multi-level assembly costing</p>
        </div>
        <Button
          onClick={() => setShowNewModal(true)}
          className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Assembly
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" />
            </div>
          ) : assemblies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <Layers className="w-12 h-12" />
              <p className="text-lg font-medium">No assemblies yet</p>
              <p className="text-sm">Create your first assembly to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Part No</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Cost EUR</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assemblies.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-semibold text-[#1e2d4e]">{a.part?.name ?? 'Unnamed'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{a.part?.part_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmt(a.cost_eur)}</td>
                      <td className="px-4 py-3">
                        {a.confidence_score != null ? (
                          <span className={`font-medium ${a.confidence_score >= 0.8 ? 'text-green-600' : a.confidence_score >= 0.6 ? 'text-amber-600' : 'text-red-600'}`}>
                            {Math.round(a.confidence_score * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {format(new Date(a.created_at), 'dd MMM yy')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/assemblies/${a.id}`)}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                          title="Open"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Assembly Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1e2d4e]">New Assembly</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assembly Name *</label>
                <input
                  value={assemblyName}
                  onChange={(e) => setAssemblyName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  placeholder="e.g. Gearbox Assembly"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Part Number</label>
                <input
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40"
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Volume</label>
                  <input
                    type="number"
                    min={1}
                    value={annualVolume}
                    onChange={(e) => setAnnualVolume(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lot Size</label>
                  <input
                    type="number"
                    min={1}
                    value={lotSize}
                    onChange={(e) => setLotSize(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isCreating || !assemblyName.trim()}
                className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Assembly
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function Assemblies() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <AssemblyDetail id={id} />;
  return <AssembliesList />;
}
