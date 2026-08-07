import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Eye, Trash2, ChevronLeft, Loader2, X, Layers, Package, Link2, ShoppingCart, Download, Zap } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { AssemblyEmptyIllustration, ComponentsEmptyIllustration, AssemblyOpsEmptyIllustration } from '../../components/ui/illustrations'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { useSubscription } from '../../hooks/useSubscription'

interface Quotation {
  id: string
  status: string
  quote_type: 'individual' | 'assembly' | 'component'
  confidence_score: number | null
  cost_eur: number | null
  created_at: string
  part: { id: string; name: string; part_number: string | null; commodity_type: string }
}

interface CostLine {
  id: string
  category: string
  label: string
  value_eur: number
  source_tier: number
  notes: string | null
}

interface AssemblyRollup {
  total_cost_eur: number
  component_costs: Array<{ part_name: string; cost_eur: number; quantity: number; subtotal_eur: number }>
  assembly_ops_cost_eur: number
  confidence_min: number
  confidence_avg: number
}

interface AssemblyComponent {
  id: string
  component_type: string
  quantity: number
  notes: string | null
  child_quotation: Quotation | null
  child_part: { id: string; name: string; part_number: string | null } | null
}

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  sub_assembly:       'bg-purple-50 text-purple-700',
  machined_part:      'bg-blue-50 text-blue-700',
  purchased_standard: 'bg-green-50 text-green-700',
}

const STATUS_COLORS: Record<string, string> = {
  draft:      'bg-[#f1f3f7] text-[#4a5568]',
  pending:    'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700',
  completed:  'bg-green-50 text-green-700',
  failed:     'bg-red-50 text-red-700',
  submitted:  'bg-indigo-50 text-indigo-700',
}

const INPUT_CLS = 'w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors'
const LABEL_CLS = 'block text-xs font-medium text-[#4a5568] mb-1'

function fmt(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

function AddComponentModal({ assemblyId, onClose }: { assemblyId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'choose' | 'link' | 'new_part' | 'purchased'>('choose')
  const [selectedQuoteId, setSelectedQuoteId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [partName, setPartName] = useState('')
  const [commodityType, setCommodityType] = useState('cnc_machining')
  const [unitCost, setUnitCost] = useState(0)
  const [purchasedName, setPurchasedName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: quotes = [] } = useQuery<Quotation[]>({
    queryKey: ['assemblies-list'],
    queryFn: () => api.quotes.list().then((qs) => qs.filter((q: Quotation) => q.quote_type !== 'assembly')),
    enabled: step === 'link',
  })

  async function handleLinkExisting() {
    if (!selectedQuoteId) { toast.error('Select a quote'); return }
    setIsSubmitting(true)
    try {
      await api.assemblies.addComponent(assemblyId, { component_type: 'sub_assembly', child_quotation_id: selectedQuoteId, quantity })
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] })
      toast.success('Component linked')
      onClose()
    } catch { toast.error('Failed to add component') }
    finally { setIsSubmitting(false) }
  }

  async function handleNewPart() {
    if (!partName.trim()) { toast.error('Part name required'); return }
    setIsSubmitting(true)
    try {
      const part = await api.parts.create({ name: partName, commodity_type: commodityType })
      const quote = await api.quotes.create({ part_id: part.id, quote_type: 'individual' })
      await api.assemblies.addComponent(assemblyId, { component_type: 'machined_part', child_quotation_id: quote.id, quantity })
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] })
      toast.success('Part created and added')
      onClose()
    } catch { toast.error('Failed to add part') }
    finally { setIsSubmitting(false) }
  }

  async function handlePurchased() {
    if (!purchasedName.trim()) { toast.error('Name required'); return }
    setIsSubmitting(true)
    try {
      await api.assemblies.addComponent(assemblyId, { component_type: 'purchased_standard', unit_cost_eur: unitCost, quantity, notes: purchasedName })
      queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] })
      toast.success('Purchased standard added')
      onClose()
    } catch { toast.error('Failed to add component') }
    finally { setIsSubmitting(false) }
  }

  const STEPS = [
    { key: 'link',      icon: Link2,       label: 'Link Existing', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400 hover:bg-blue-50' },
    { key: 'new_part',  icon: Plus,        label: 'New Part',      color: 'bg-brand/5 text-brand border-brand/20 hover:border-brand/60 hover:bg-brand/10' },
    { key: 'purchased', icon: ShoppingCart, label: 'Purchased Std', color: 'bg-green-50 text-green-600 border-green-200 hover:border-green-400 hover:bg-green-50' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#e5e8ef]">
          <h2 className="text-lg font-semibold text-[#0f1729]">Add Component</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors">
            <X className="w-4 h-4 text-[#9aa3b2]" />
          </button>
        </div>

        <div className="p-5">
          {step === 'choose' && (
            <div className="grid grid-cols-3 gap-3">
              {STEPS.map(({ key, icon: Icon, label, color }) => (
                <button
                  key={key}
                  onClick={() => setStep(key as any)}
                  className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all', color)}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-medium text-center">{label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'link' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-[#9aa3b2] hover:text-[#4a5568] flex items-center gap-1 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <p className="text-sm font-medium text-[#4a5568]">Select an existing quotation:</p>
              <div className="max-h-48 overflow-y-auto border border-[#e5e8ef] rounded-lg divide-y divide-[#e5e8ef]">
                {quotes.map((q) => (
                  <label key={q.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 cursor-pointer transition-colors">
                    <input type="radio" name="quote" value={q.id} checked={selectedQuoteId === q.id} onChange={() => setSelectedQuoteId(q.id)} className="accent-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0f1729] truncate">{q.part?.name ?? 'Unnamed'}</p>
                      <p className="text-xs text-[#9aa3b2]">{q.part?.part_number ?? 'No part number'} · {q.status}</p>
                    </div>
                    {q.cost_eur != null && <span className="text-xs text-[#4a5568] font-mono">{fmt(q.cost_eur)}</span>}
                  </label>
                ))}
                {quotes.length === 0 && <p className="px-3 py-4 text-sm text-[#9aa3b2] text-center">No existing quotes found.</p>}
              </div>
              <div>
                <label className={LABEL_CLS}>Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <Button variant="primary" onClick={handleLinkExisting} loading={isSubmitting} disabled={!selectedQuoteId} className="w-full">
                Link Component
              </Button>
            </div>
          )}

          {step === 'new_part' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-[#9aa3b2] hover:text-[#4a5568] flex items-center gap-1 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <div>
                <label className={LABEL_CLS}>Part Name *</label>
                <input value={partName} onChange={(e) => setPartName(e.target.value)} className={INPUT_CLS} placeholder="e.g. Bracket Housing" />
              </div>
              <div>
                <label className={LABEL_CLS}>Commodity Type</label>
                <select value={commodityType} onChange={(e) => setCommodityType(e.target.value)} className={INPUT_CLS}>
                  {['cnc_machining', 'sheet_metal', 'turning', 'stamping', 'injection_moulding', 'die_casting', 'other'].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <Button variant="primary" onClick={handleNewPart} loading={isSubmitting} disabled={!partName.trim()} className="w-full">
                Create &amp; Add Part
              </Button>
            </div>
          )}

          {step === 'purchased' && (
            <div className="space-y-4">
              <button onClick={() => setStep('choose')} className="text-xs text-[#9aa3b2] hover:text-[#4a5568] flex items-center gap-1 transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <div>
                <label className={LABEL_CLS}>Description *</label>
                <input value={purchasedName} onChange={(e) => setPurchasedName(e.target.value)} className={INPUT_CLS} placeholder="e.g. M6 Bolt DIN 933" />
              </div>
              <div>
                <label className={LABEL_CLS}>Unit Cost (EUR)</label>
                <input type="number" min={0} step={0.01} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <Button variant="primary" onClick={handlePurchased} loading={isSubmitting} disabled={!purchasedName.trim()} className="w-full">
                Add Purchased Standard
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── BOM TREE ────────────────────────────────────────────────────────────────

const TYPE_ORDER = ['sub_assembly', 'machined_part', 'purchased_standard']

function BomTree({ components, onRemove, removing }: {
  components: AssemblyComponent[]
  onRemove: (id: string) => void
  removing: boolean
}) {
  const sorted = [...components].sort((a, b) =>
    TYPE_ORDER.indexOf(a.component_type) - TYPE_ORDER.indexOf(b.component_type)
  )

  const totalCost = sorted.reduce((sum, c) => sum + ((c.child_quotation?.cost_eur ?? 0) * c.quantity), 0)

  return (
    <div className="space-y-2">
      {/* Tree header */}
      <div className="grid grid-cols-12 gap-2 px-3 pb-1 text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider border-b border-[#e5e8ef]">
        <div className="col-span-5">Component</div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">Unit Cost</div>
        <div className="col-span-2 text-right">Subtotal</div>
        <div className="col-span-1" />
      </div>

      {/* Grouped rows */}
      {TYPE_ORDER.map(typeKey => {
        const group = sorted.filter(c => c.component_type === typeKey)
        if (group.length === 0) return null
        return (
          <div key={typeKey}>
            <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-widest px-3 pt-1 pb-0.5">
              {typeKey.replace(/_/g, ' ')}
            </p>
            {group.map((comp, i) => {
              const name = comp.child_quotation?.part?.name ?? comp.child_part?.name ?? comp.notes ?? 'Unnamed'
              const status = comp.child_quotation?.status
              const cost = comp.child_quotation?.cost_eur ?? null
              const confidence = comp.child_quotation?.confidence_score
              const subtotal = cost !== null ? cost * comp.quantity : null
              const isLast = i === group.length - 1

              return (
                <motion.div
                  key={comp.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-surface-2 group transition-colors"
                >
                  {/* Component name with tree connector */}
                  <div className="col-span-5 flex items-start gap-2 min-w-0">
                    <div className="flex flex-col items-center flex-shrink-0 mt-1.5">
                      <div className="w-3 h-px bg-[#c8cdd8]" />
                    </div>
                    <div className="min-w-0">
                      {comp.child_quotation ? (
                        <Link to={`/quotes/${comp.child_quotation.id}`} className="text-sm font-medium text-[#0f1729] hover:text-brand truncate block">
                          {name}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-[#4a5568] truncate">{name}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {status && (
                          <span className={cn('inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium capitalize', STATUS_COLORS[status] ?? 'bg-[#f1f3f7] text-[#9aa3b2]')}>
                            {status}
                          </span>
                        )}
                        {confidence != null && (
                          <span className={cn('text-[10px] font-semibold', confidence >= 0.8 ? 'text-emerald-600' : confidence >= 0.6 ? 'text-amber-600' : 'text-red-600')}>
                            {Math.round(confidence * 100)}% conf
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Qty */}
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-3 text-xs font-semibold text-[#4a5568]">
                      {comp.quantity}
                    </span>
                  </div>

                  {/* Unit cost */}
                  <div className="col-span-2 text-right font-mono text-xs text-[#4a5568]">
                    {cost !== null ? fmt(cost) : '—'}
                  </div>

                  {/* Subtotal */}
                  <div className="col-span-2 text-right font-mono text-xs font-semibold text-[#0f1729]">
                    {subtotal !== null ? fmt(subtotal) : '—'}
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => onRemove(comp.id)}
                      disabled={removing}
                      className="p-1 rounded-md hover:bg-red-50 text-[#c8cdd8] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )
      })}

      {/* Total row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2.5 border-t-2 border-[#e5e8ef] mt-1">
        <div className="col-span-9 text-xs font-semibold text-[#4a5568] uppercase tracking-wide text-right">
          Components Total
        </div>
        <div className="col-span-2 text-right font-mono text-sm font-bold text-[#0f1729]">
          {fmt(totalCost)}
        </div>
        <div className="col-span-1" />
      </div>
    </div>
  )
}

// ─── DETAIL VIEW ─────────────────────────────────────────────────────────────

function AssemblyDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'bom' | 'rollup' | 'assembly_ops' | 'export'>('bom')
  const [showAddModal, setShowAddModal] = useState(false)
  const [rollupData, setRollupData] = useState<AssemblyRollup | null>(null)
  const [isRollingUp, setIsRollingUp] = useState(false)
  const [isEstimating, setIsEstimating] = useState(false)
  const [isCostingChildren, setIsCostingChildren] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const { canUse } = useSubscription()

  const { data: quotation } = useQuery<Quotation>({ queryKey: ['quote', id], queryFn: () => api.quotes.get(id) })
  const { data: components = [] } = useQuery<AssemblyComponent[]>({
    queryKey: ['assembly-components', id],
    queryFn: () => api.assemblies.get(id),
  })
  const { data: costLines = [] } = useQuery<CostLine[]>({
    queryKey: ['cost-lines', id],
    queryFn: () => api.costLines(id).list(),
    enabled: activeTab === 'assembly_ops',
  })

  const assemblyOps = costLines.filter((cl) => cl.category === 'assembly')

  async function handleCostChildren() {
    setIsCostingChildren(true)
    try {
      const batch = await api.assemblies.costChildren(id)
      toast.success('Batch costing started')
      navigate(`/bulk/${batch.id}`)
    } catch { toast.error('Failed to start batch costing') }
    finally { setIsCostingChildren(false) }
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await api.quotes.submit(id)
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      toast.success('Assembly submitted successfully')
    } catch { toast.error('Failed to submit assembly') }
    finally { setIsSubmitting(false) }
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      const blob = await api.assemblies.exportExcel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `assembly-${id.slice(0, 8)}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch { toast.error('Export failed') }
    finally { setIsExporting(false) }
  }

  async function handleRollup() {
    setIsRollingUp(true)
    try {
      const result = await api.assemblies.rollup(id)
      setRollupData(result)
      toast.success('Rollup calculated')
    } catch { toast.error('Rollup failed') }
    finally { setIsRollingUp(false) }
  }

  async function handleEstimateOps() {
    setIsEstimating(true)
    try {
      await api.ai.estimateAssembly(id)
      queryClient.invalidateQueries({ queryKey: ['cost-lines', id] })
      toast.success('Assembly ops estimated')
    } catch { toast.error('Estimation failed') }
    finally { setIsEstimating(false) }
  }

  const removeComponentMut = useMutation({
    mutationFn: (componentId: string) => api.assemblies.removeComponent(id, componentId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assembly-components', id] }); toast.success('Component removed') },
    onError: () => toast.error('Failed to remove component'),
  })

  const hasLowConfidence = components.some(
    (c) => c.child_quotation?.confidence_score != null && c.child_quotation.confidence_score < 0.6
  )

  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: 'bom', label: 'BOM' },
    { id: 'rollup', label: 'Rollup' },
    { id: 'assembly_ops', label: 'Assembly Ops' },
    { id: 'export', label: 'Export' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      <Button variant="ghost" size="sm" onClick={() => navigate('/assemblies')} iconLeft={<ChevronLeft className="w-4 h-4" />}>
        Back to Assemblies
      </Button>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl">{quotation?.part?.name ?? 'Assembly'}</CardTitle>
              {quotation?.part?.part_number && (
                <p className="text-sm text-[#9aa3b2] mt-0.5">PN: {quotation.part.part_number}</p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {quotation?.cost_eur != null && (
                <span className="text-xl font-bold text-brand font-mono">{fmt(quotation.cost_eur)}</span>
              )}
              {quotation?.status && (
                <span className={cn('px-3 py-1 rounded-full text-sm font-medium capitalize', STATUS_COLORS[quotation.status] ?? 'bg-[#f1f3f7] text-[#4a5568]')}>
                  {quotation.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="navy" onClick={handleCostChildren} loading={isCostingChildren} iconLeft={<Zap className="w-4 h-4" />}>
              Cost All Children
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={quotation?.status === 'submitted'}
              title={hasLowConfidence ? 'Some children have low confidence scores' : undefined}
            >
              {hasLowConfidence ? '⚠ Submit Assembly' : 'Submit Assembly'}
            </Button>
            {canUse('excel_export') && (
              <Button variant="outline" onClick={handleExport} loading={isExporting} iconLeft={<Download className="w-4 h-4" />}>
                Export Excel
              </Button>
            )}
          </div>
          {hasLowConfidence && (
            <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
              ⚠ One or more child components have low confidence scores (&lt;60%).
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <div className="flex border-b border-[#e5e8ef] relative">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative px-5 py-3.5 text-sm font-medium transition-colors',
                  activeTab === tab.id ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]',
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="assembly-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* BOM TAB */}
            {activeTab === 'bom' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="primary" onClick={() => setShowAddModal(true)} iconLeft={<Plus className="w-4 h-4" />}>
                    Add Component
                  </Button>
                </div>
                {components.length === 0 ? (
                  <EmptyState illustration={<ComponentsEmptyIllustration />} title="No components yet" description="Add the first component to build your assembly BOM." />
                ) : (
                  <BomTree
                    components={components}
                    onRemove={(compId) => removeComponentMut.mutate(compId)}
                    removing={removeComponentMut.isPending}
                  />
                )}
              </div>
            )}

            {/* ROLLUP TAB */}
            {activeTab === 'rollup' && (
              <div className="space-y-6">
                <Button variant="primary" size="lg" onClick={handleRollup} loading={isRollingUp} iconLeft={<Zap className="w-5 h-5" />} className="w-full">
                  Calculate Rollup
                </Button>

                {rollupData && (
                  <div className="space-y-6">
                    <div className="text-center py-8 bg-brand/5 rounded-xl border border-brand/10">
                      <p className="text-xs text-[#9aa3b2] uppercase tracking-wider font-medium mb-2">Total Assembly Cost</p>
                      <p className="text-4xl font-bold text-brand font-mono">{fmt(rollupData.total_cost_eur)}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-[#4a5568] mb-3">Component Costs</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#e5e8ef] text-left text-xs uppercase tracking-wide text-[#9aa3b2]">
                            <th className="pb-2 pr-4 font-medium">Part Name</th>
                            <th className="pb-2 pr-4 font-medium">Qty</th>
                            <th className="pb-2 pr-4 font-medium">Unit Cost</th>
                            <th className="pb-2 font-medium">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e5e8ef]">
                          {rollupData.component_costs.map((cc, i) => (
                            <tr key={i} className="hover:bg-surface-2 transition-colors">
                              <td className="py-2.5 pr-4 font-medium text-[#0f1729]">{cc.part_name}</td>
                              <td className="py-2.5 pr-4 text-[#4a5568]">{cc.quantity}</td>
                              <td className="py-2.5 pr-4 text-[#4a5568] font-mono text-xs">{fmt(cc.cost_eur)}</td>
                              <td className="py-2.5 font-semibold text-[#0f1729] font-mono text-xs">{fmt(cc.subtotal_eur)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-6 p-4 bg-surface-2 rounded-xl border border-[#e5e8ef]">
                      <div>
                        <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Assembly Operations</p>
                        <p className="text-lg font-semibold text-[#0f1729] font-mono">{fmt(rollupData.assembly_ops_cost_eur)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Confidence Range</p>
                        <p className="text-lg font-semibold text-[#0f1729]">
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
                  <Button variant="primary" onClick={handleEstimateOps} loading={isEstimating} iconLeft={<Zap className="w-4 h-4" />}>
                    Estimate Assembly Ops
                  </Button>
                </div>

                {assemblyOps.length === 0 ? (
                  <EmptyState illustration={<AssemblyOpsEmptyIllustration />} title="No assembly operations" description='Click "Estimate Assembly Ops" to generate AI-powered operations.' />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e8ef] text-left text-xs uppercase tracking-wide text-[#9aa3b2]">
                        <th className="pb-3 pr-4 font-medium">Label</th>
                        <th className="pb-3 pr-4 font-medium">Value (EUR)</th>
                        <th className="pb-3 pr-4 font-medium">Source Tier</th>
                        <th className="pb-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5e8ef]">
                      {assemblyOps.map((cl) => (
                        <tr key={cl.id} className="hover:bg-surface-2 transition-colors">
                          <td className="py-3 pr-4 font-medium text-[#0f1729]">{cl.label}</td>
                          <td className="py-3 pr-4 text-[#4a5568] font-mono text-xs">{fmt(cl.value_eur)}</td>
                          <td className="py-3 pr-4">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                              cl.source_tier === 1 ? 'bg-green-50 text-green-700' :
                              cl.source_tier === 2 ? 'bg-blue-50 text-blue-700' :
                              'bg-[#f1f3f7] text-[#4a5568]'
                            )}>
                              Tier {cl.source_tier}
                            </span>
                          </td>
                          <td className="py-3 text-[#9aa3b2] text-xs">{cl.notes ?? '—'}</td>
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
                <p className="text-sm text-[#4a5568]">
                  Download the full assembly package. The Excel export includes the complete BOM tree, rollup summary, and assembly operations breakdown.
                </p>
                <div className="flex flex-wrap justify-center gap-4 py-8">
                  {canUse('excel_export') && (
                    <Button size="lg" onClick={handleExport} loading={isExporting} iconLeft={<Download className="w-4 h-4" />}
                      className="bg-green-600 hover:bg-green-700 text-white px-8">
                      Download Excel
                    </Button>
                  )}
                  <Button variant="outline" size="lg" onClick={() => toast.info('PDF export coming soon')}
                    iconLeft={<Download className="w-4 h-4" />} className="px-8 text-[#9aa3b2]">
                    Download PDF
                  </Button>
                </div>
                <p className="text-xs text-[#9aa3b2] text-center">
                  PDF export is coming in a future release. Use Excel for full data fidelity.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {showAddModal && (
          <AddComponentModal assemblyId={id} onClose={() => setShowAddModal(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── LIST VIEW ───────────────────────────────────────────────────────────────

function AssembliesList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showNewModal, setShowNewModal] = useState(false)
  const [assemblyName, setAssemblyName] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [annualVolume, setAnnualVolume] = useState(1000)
  const [lotSize, setLotSize] = useState(100)
  const [isCreating, setIsCreating] = useState(false)

  const { data: assemblies = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ['assemblies'],
    queryFn: () => api.quotes.list().then((qs) => qs.filter((q: Quotation) => q.quote_type === 'assembly')),
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!assemblyName.trim()) { toast.error('Assembly name is required'); return }
    setIsCreating(true)
    try {
      const result = await api.assemblies.create({ name: assemblyName, part_number: partNumber || undefined, annual_volume: annualVolume, lot_size: lotSize })
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      toast.success('Assembly created')
      setShowNewModal(false)
      navigate(`/assemblies/${result.id}`)
    } catch { toast.error('Failed to create assembly') }
    finally { setIsCreating(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Assemblies</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Manage multi-level assembly costing</p>
        </div>
        <Button variant="primary" onClick={() => setShowNewModal(true)} iconLeft={<Plus className="w-4 h-4" />}>
          New Assembly
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map(i => <Skeleton key={i} variant="rect" height="3.5rem" />)}
            </div>
          ) : assemblies.length === 0 ? (
            <div className="p-6">
              <EmptyState
                illustration={<AssemblyEmptyIllustration />}
                title="No assemblies yet"
                description="Create your first assembly to get started with multi-level costing."
                action={{ label: 'New Assembly', onClick: () => setShowNewModal(true) }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e5e8ef] text-left text-xs uppercase tracking-wide text-[#9aa3b2]">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Part No</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Cost EUR</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e8ef]">
                  {assemblies.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2 group transition-colors cursor-pointer" onClick={() => navigate(`/assemblies/${a.id}`)}>
                      <td className="px-6 py-3 font-semibold text-[#0f1729]">{a.part?.name ?? 'Unnamed'}</td>
                      <td className="px-4 py-3 text-[#9aa3b2] font-mono text-xs">{a.part?.part_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_COLORS[a.status] ?? 'bg-[#f1f3f7] text-[#4a5568]')}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#4a5568] font-mono text-xs">{fmt(a.cost_eur)}</td>
                      <td className="px-4 py-3">
                        {a.confidence_score != null ? (
                          <span className={cn('font-medium text-sm', a.confidence_score >= 0.8 ? 'text-green-600' : a.confidence_score >= 0.6 ? 'text-amber-600' : 'text-red-600')}>
                            {Math.round(a.confidence_score * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#9aa3b2] whitespace-nowrap">
                        {format(new Date(a.created_at), 'dd MMM yy')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/assemblies/${a.id}`) }}
                          className="p-1.5 rounded-md hover:bg-surface-3 text-[#4a5568] opacity-0 group-hover:opacity-100 transition-all"
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
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowNewModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-[#e5e8ef]">
                <h2 className="text-lg font-semibold text-[#0f1729]">New Assembly</h2>
                <button onClick={() => setShowNewModal(false)} className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors">
                  <X className="w-4 h-4 text-[#9aa3b2]" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <div>
                  <label className={LABEL_CLS}>Assembly Name *</label>
                  <input value={assemblyName} onChange={(e) => setAssemblyName(e.target.value)} className={INPUT_CLS} placeholder="e.g. Gearbox Assembly" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Part Number</label>
                  <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} className={INPUT_CLS} placeholder="Optional" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLS}>Annual Volume</label>
                    <input type="number" min={1} value={annualVolume} onChange={(e) => setAnnualVolume(Number(e.target.value))} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Lot Size</label>
                    <input type="number" min={1} value={lotSize} onChange={(e) => setLotSize(Number(e.target.value))} className={INPUT_CLS} />
                  </div>
                </div>
                <Button type="submit" variant="primary" loading={isCreating} disabled={!assemblyName.trim()} className="w-full">
                  Create Assembly
                </Button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function Assemblies() {
  usePageTitle('Assemblies')
  const { id } = useParams<{ id?: string }>()
  return (
    <UpgradeGate requiredPlan="pro" feature="Assemblies">
      {id ? <AssemblyDetail id={id} /> : <AssembliesList />}
    </UpgradeGate>
  )
}
