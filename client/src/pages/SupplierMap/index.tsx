import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MapPin, Search, Loader2, Building2, Globe, TrendingDown, Plus,
  Star, ChevronRight, X, Upload, BarChart3, MessageSquare, RefreshCw,
  CheckCircle, Zap, AlertTriangle, Users, Trash2, Filter,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../lib/api'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { useSubscription } from '../../hooks/useSubscription'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { SupplierEmptyIllustration } from '../../components/ui/illustrations'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import MapView from './MapView'

import 'leaflet/dist/leaflet.css'

// Local error boundary: if react-leaflet crashes (known Vite prod compat issue)
// the map degrades to a plain message and the rest of the page stays up.
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) {
      return (
        <div className="h-full flex items-center justify-center bg-surface-2 rounded-xl">
          <p className="text-xs text-[#9aa3b2]">Map unavailable — use the supplier list below.</p>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const COUNTRY_COORDS: Record<string, [number, number]> = {
  DE: [51.165,  10.452], CN: [35.861, 104.195], IN: [20.594,  78.963],
  PL: [51.920,  19.145], CZ: [49.818,  15.473], MX: [23.635, -102.553],
  US: [37.090, -95.713], FR: [46.228,   2.214], IT: [41.873,  12.568],
  TR: [38.964,  35.243], JP: [36.205, 138.252], KR: [35.908, 127.767],
  TW: [23.697, 120.960], VN: [14.059, 108.278], TH: [15.870, 100.993],
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', CN: 'China', IN: 'India', PL: 'Poland', CZ: 'Czech Republic',
  MX: 'Mexico', US: 'United States', FR: 'France', IT: 'Italy', TR: 'Turkey',
  JP: 'Japan', KR: 'South Korea', TW: 'Taiwan', VN: 'Vietnam', TH: 'Thailand',
}

const COMMODITY_TYPES = [
  'cnc_machining', 'sheet_metal', 'turning', 'stamping',
  'injection_moulding', 'die_casting', 'forging', 'extrusion',
]

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#f1f3f7] text-[#4a5568]',
  received: 'bg-blue-50 text-blue-700',
  compared: 'bg-purple-50 text-purple-700',
  negotiating: 'bg-amber-50 text-amber-700',
  accepted: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string
  name: string
  country_code: string
  city: string | null
  capabilities: string | null  // JSON array
  tier_rating: number | null
  origin: 'manual' | 'ai_suggested' | 'external_api'
  source_tier: number
  is_active: boolean
  notes: string | null
  contact_name: string | null
  contact_email: string | null
}

interface SupplierQuote {
  id: string
  supplier_id: string
  quotation_id: string
  status: string
  total_price_eur: number | null
  currency: string | null
  extraction_method: string
  received_date: string | null
  notes: string | null
  supplier?: Supplier
}

interface SupplierCustomer {
  id: string
  supplier_id: string
  customer_name: string
  business_share_pct: number | null
  notes: string | null
  created_at: string
}

type RightPanelTab = 'info' | 'quotes' | 'compare' | 'negotiate' | 'customers'

// ─── TIER STARS ──────────────────────────────────────────────────────────────

function TierStars({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span className="text-xs text-[#9aa3b2]">—</span>
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={cn('w-3 h-3', i < rating ? 'fill-amber-400 text-amber-400' : 'text-[#e5e8ef]')} />
      ))}
    </div>
  )
}

// ─── ADD QUOTE MODAL ─────────────────────────────────────────────────────────

function AddQuoteModal({ supplierId, quotationId, onClose }: {
  supplierId: string
  quotationId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [rawText, setRawText] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<'manual' | 'ai'>('ai')
  const [extractedLines, setExtractedLines] = useState<any[]>([])
  const [extractLoading, setExtractLoading] = useState(false)

  const createMut = useMutation({
    mutationFn: (body: unknown) => api.suppliers.createQuote(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-quotes', supplierId] })
      toast.success('Supplier quote saved')
      onClose()
    },
    onError: () => toast.error('Failed to save quote'),
  })

  async function handleExtract() {
    if (!rawText.trim()) return
    setExtractLoading(true)
    try {
      const res: any = await api.suppliers.extractQuote({ supplier_id: supplierId, raw_text: rawText, quotation_id: quotationId })
      setExtractedLines(res.lines ?? [])
      toast.success(`Extracted ${res.lines?.length ?? 0} line items`)
    } catch {
      toast.error('AI extraction failed')
    } finally {
      setExtractLoading(false)
    }
  }

  function handleSave() {
    createMut.mutate({
      supplier_id: supplierId,
      quotation_id: quotationId,
      extraction_method: mode,
      raw_text: rawText,
      notes,
      lines: extractedLines,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-[#e5e8ef] px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#0f1729]">Ingest Supplier Quote</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            {(['ai', 'manual'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', mode === m ? 'bg-brand text-white' : 'bg-surface-3 text-[#4a5568] hover:bg-surface-4')}>
                {m === 'ai' ? 'AI Extract' : 'Manual Entry'}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4a5568] mb-1">Paste Supplier Quote Text</label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={6}
              placeholder="Paste the supplier's quote email, PDF text, or price list here..."
              className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>

          {mode === 'ai' && (
            <Button variant="outline" size="sm" onClick={handleExtract} loading={extractLoading}
              disabled={!rawText.trim()} iconLeft={<Zap className="w-3.5 h-3.5" />}>
              Extract with AI
            </Button>
          )}

          {extractedLines.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#4a5568] mb-2">{extractedLines.length} extracted lines</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {extractedLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-surface-2 rounded-lg">
                    <span className="text-xs text-[#4a5568]">{l.label}</span>
                    <span className="font-mono text-xs font-semibold text-[#0f1729]">€{l.value_eur?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#4a5568] mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSave} loading={createMut.isPending}
              disabled={!rawText.trim()} className="flex-1">
              Save Quote
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── RIGHT PANEL ─────────────────────────────────────────────────────────────

function SupplierDetailPanel({ supplier, quotationId, onClose }: {
  supplier: Supplier
  quotationId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<RightPanelTab>('info')
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [compareResult, setCompareResult] = useState<any>(null)
  const [negotiation, setNegotiation] = useState<any>(null)
  const [comparing, setComparing] = useState(false)
  const [negotiating, setNegotiating] = useState(false)

  const caps: string[] = (() => {
    try { return JSON.parse(supplier.capabilities ?? '[]') } catch { return [] }
  })()

  const { data: quotes = [], isLoading: quotesLoading } = useQuery<SupplierQuote[]>({
    queryKey: ['supplier-quotes', supplier.id],
    queryFn: () => api.suppliers.forQuote(supplier.id) as Promise<SupplierQuote[]>,
  })

  async function handleCompare(quoteId: string) {
    if (!quotationId) { toast.error('Select a quotation first'); return }
    setComparing(true)
    try {
      const res = await api.suppliers.compare({ quotation_id: quotationId, supplier_quote_id: quoteId })
      setCompareResult(res)
      setTab('compare')
      toast.success('Comparison complete')
    } catch {
      toast.error('Comparison failed')
    } finally {
      setComparing(false)
    }
  }

  async function handleNegotiate(quoteId: string) {
    if (!quotationId) { toast.error('Select a quotation first'); return }
    setNegotiating(true)
    try {
      const res = await api.suppliers.negotiate({ quotation_id: quotationId, supplier_quote_id: quoteId })
      setNegotiation(res)
      setTab('negotiate')
      toast.success('Negotiation report ready')
    } catch {
      toast.error('Negotiation report failed')
    } finally {
      setNegotiating(false)
    }
  }

  // ── Customer market share state ────────────────────────────────────────────
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerShare, setNewCustomerShare] = useState('')

  const { data: customers = [], isLoading: customersLoading, refetch: refetchCustomers } = useQuery<SupplierCustomer[]>({
    queryKey: ['supplier-customers', supplier.id],
    queryFn: () => api.suppliers.getCustomers(supplier.id) as Promise<SupplierCustomer[]>,
    enabled: tab === 'customers',
  })

  const addCustomerMut = useMutation({
    mutationFn: (body: unknown) => api.suppliers.addCustomer(supplier.id, body),
    onSuccess: () => { refetchCustomers(); setNewCustomerName(''); setNewCustomerShare(''); toast.success('Customer added') },
    onError: () => toast.error('Failed to add customer'),
  })

  const delCustomerMut = useMutation({
    mutationFn: (customerId: string) => api.suppliers.deleteCustomer(supplier.id, customerId),
    onSuccess: () => { refetchCustomers(); toast.success('Customer removed') },
    onError: () => toast.error('Failed to remove customer'),
  })

  const totalShare = customers.reduce((s, c) => s + (c.business_share_pct ?? 0), 0)

  const TABS: { key: RightPanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'info',      label: 'Info',      icon: <Building2 className="w-3.5 h-3.5" /> },
    { key: 'quotes',    label: 'Quotes',    icon: <Upload className="w-3.5 h-3.5" /> },
    { key: 'customers', label: 'Customers', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'compare',  label: 'Compare',   icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'negotiate', label: 'Negotiate', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.25 }}
      className="h-full flex flex-col bg-white rounded-2xl border border-[#e5e8ef] shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-[#e5e8ef] flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-[#0f1729] truncate">{supplier.name}</h3>
            <p className="text-xs text-[#9aa3b2] mt-0.5">
              {COUNTRY_NAMES[supplier.country_code] ?? supplier.country_code}
              {supplier.city ? ` · ${supplier.city}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', supplier.origin === 'ai_suggested' ? 'bg-purple-50 text-purple-700' : supplier.origin === 'external_api' ? 'bg-blue-50 text-blue-700' : 'bg-[#f1f3f7] text-[#4a5568]')}>
              {supplier.origin.replace(/_/g, ' ')}
            </span>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-3 text-[#9aa3b2]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <TierStars rating={supplier.tier_rating} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e5e8ef] flex-shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors relative flex-1 justify-center', tab === t.key ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]')}>
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            {tab === t.key && <motion.div layoutId="supplier-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" transition={{ type: 'spring', stiffness: 380, damping: 35 }} />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'info' && (
          <div className="space-y-4">
            {caps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide mb-1.5">Capabilities</p>
                <div className="flex flex-wrap gap-1">
                  {caps.map(c => (
                    <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-medium capitalize">
                      {c.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {supplier.contact_name && (
              <div>
                <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide mb-1">Contact</p>
                <p className="text-sm text-[#0f1729]">{supplier.contact_name}</p>
                {supplier.contact_email && <p className="text-xs text-brand">{supplier.contact_email}</p>}
              </div>
            )}
            {supplier.notes && (
              <div>
                <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-[#4a5568]">{supplier.notes}</p>
              </div>
            )}
            <Button variant="primary" size="sm" className="w-full" iconLeft={<Upload className="w-3.5 h-3.5" />}
              onClick={() => { setShowAddQuote(true) }}>
              Ingest Supplier Quote
            </Button>
          </div>
        )}

        {tab === 'quotes' && (
          <div className="space-y-3">
            <Button variant="outline" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowAddQuote(true)} className="w-full">
              Add Supplier Quote
            </Button>
            {quotesLoading ? (
              <div className="space-y-2">{[0,1].map(i => <Skeleton key={i} variant="rect" height="3.5rem" />)}</div>
            ) : quotes.length === 0 ? (
              <p className="text-xs text-[#9aa3b2] text-center py-4">No quotes yet — ingest one above.</p>
            ) : (
              quotes.map(q => (
                <div key={q.id} className="rounded-xl border border-[#e5e8ef] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', QUOTE_STATUS_COLORS[q.status] ?? 'bg-[#f1f3f7] text-[#4a5568]')}>
                      {q.status}
                    </span>
                    {q.total_price_eur !== null && (
                      <span className="font-mono text-xs font-bold text-[#0f1729]">€{q.total_price_eur.toFixed(2)}</span>
                    )}
                  </div>
                  {q.received_date && <p className="text-[10px] text-[#9aa3b2]">Received {q.received_date}</p>}
                  <div className="flex gap-1.5">
                    <button onClick={() => handleCompare(q.id)} disabled={comparing}
                      className="flex-1 px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-medium hover:bg-purple-100 transition-colors flex items-center justify-center gap-1">
                      {comparing ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
                      Compare
                    </button>
                    <button onClick={() => handleNegotiate(q.id)} disabled={negotiating}
                      className="flex-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-medium hover:bg-amber-100 transition-colors flex items-center justify-center gap-1">
                      {negotiating ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                      Negotiate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-4">
            {/* Donut chart (4B.8) */}
            {customers.filter(c => c.business_share_pct != null).length > 0 && (() => {
              const COLORS = ['#e85c1a', '#1e2d4e', '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899']
              const chartData = customers
                .filter(c => c.business_share_pct != null)
                .map(c => ({ name: c.customer_name, value: c.business_share_pct! }))
              const remaining = Math.max(0, 100 - totalShare)
              if (remaining > 0) chartData.push({ name: 'Other / unallocated', value: remaining })
              return (
                <div className="flex flex-col items-center gap-2">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={62}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={i === chartData.length - 1 && remaining > 0 ? '#e5e8ef' : COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        formatter={(v: number) => [`${v.toFixed(1)}%`, 'Share']}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e8ef' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full flex flex-wrap justify-center gap-x-3 gap-y-1">
                    {chartData.map((d, i) => (
                      <span key={i} className="flex items-center gap-1 text-[10px] text-[#4a5568]">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: i === chartData.length - 1 && remaining > 0 ? '#e5e8ef' : COLORS[i % COLORS.length] }} />
                        {d.name} {d.value.toFixed(0)}%
                      </span>
                    ))}
                  </div>
                  {totalShare > 100 && (
                    <p className="text-xs text-red-500 font-medium">Total exceeds 100% — please review</p>
                  )}
                </div>
              )
            })()}

            {/* Customer list */}
            {customersLoading ? (
              <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} variant="rect" height="3rem" />)}</div>
            ) : customers.length === 0 ? (
              <p className="text-xs text-[#9aa3b2] text-center py-4">No customer relationships recorded yet.</p>
            ) : (
              customers.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#e5e8ef]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0f1729] truncate">{c.customer_name}</p>
                    {c.notes && <p className="text-xs text-[#9aa3b2] truncate">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.business_share_pct != null && (
                      <span className="font-mono text-xs font-semibold text-brand">{c.business_share_pct}%</span>
                    )}
                    <button
                      onClick={() => delCustomerMut.mutate(c.id)}
                      className="p-1 rounded hover:bg-red-50 text-[#9aa3b2] hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Add customer form */}
            <div className="pt-2 border-t border-[#e5e8ef] space-y-2">
              <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide">Add Customer</p>
              <input
                value={newCustomerName}
                onChange={e => setNewCustomerName(e.target.value)}
                placeholder="Customer / OEM name"
                className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newCustomerShare}
                  onChange={e => setNewCustomerShare(e.target.value)}
                  placeholder="Share % (optional)"
                  className="flex-1 border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!newCustomerName.trim() || addCustomerMut.isPending}
                  loading={addCustomerMut.isPending}
                  iconLeft={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => addCustomerMut.mutate({
                    customer_name: newCustomerName.trim(),
                    business_share_pct: newCustomerShare ? parseFloat(newCustomerShare) : undefined,
                  })}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {tab === 'compare' && (
          <div className="space-y-3">
            {!compareResult ? (
              <p className="text-xs text-[#9aa3b2] text-center py-6">Run a comparison from the Quotes tab first.</p>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2">
                  <div>
                    <p className="text-xs text-[#9aa3b2]">Total Gap</p>
                    <p className={cn('text-lg font-bold font-mono', compareResult.total_gap_eur > 0 ? 'text-green-600' : 'text-red-600')}>
                      {compareResult.total_gap_eur > 0 ? '+' : ''}€{compareResult.total_gap_eur?.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-[#9aa3b2]">{compareResult.total_gap_eur > 0 ? 'supplier cheaper' : 'supplier more expensive'}</p>
                  </div>
                  {compareResult.divergence_flag && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-[10px] text-amber-700 font-medium">Divergence &gt;15%</span>
                    </div>
                  )}
                </div>
                {compareResult.by_category?.map((cat: any) => (
                  <div key={cat.category} className={cn('p-2.5 rounded-lg border', cat.diverges ? 'border-amber-200 bg-amber-50/30' : 'border-[#e5e8ef]')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize text-[#4a5568]">{cat.category.replace(/_/g, ' ')}</span>
                      {cat.diverges && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                    </div>
                    <div className="flex gap-3 text-xs">
                      <div><p className="text-[#9aa3b2]">Ours</p><p className="font-mono font-semibold">€{cat.our_total?.toFixed(2)}</p></div>
                      <div><p className="text-[#9aa3b2]">Supplier</p><p className="font-mono font-semibold">€{cat.supplier_total?.toFixed(2)}</p></div>
                      <div><p className="text-[#9aa3b2]">Δ</p>
                        <p className={cn('font-mono font-semibold', cat.delta_eur > 0 ? 'text-green-600' : 'text-red-600')}>
                          {cat.delta_pct?.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'negotiate' && (
          <div className="space-y-3">
            {!negotiation ? (
              <p className="text-xs text-[#9aa3b2] text-center py-6">Run a comparison first, then generate a negotiation report from the Quotes tab.</p>
            ) : (
              <>
                {negotiation.recommended_target_eur && (
                  <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-xs text-green-700 font-medium">Recommended Target Price</p>
                    <p className="text-xl font-bold font-mono text-green-800">€{negotiation.recommended_target_eur?.toFixed(2)}</p>
                    <p className="text-[10px] text-green-600 mt-0.5">Floored at our should-cost</p>
                  </div>
                )}
                {negotiation.talking_points?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide mb-2">Talking Points</p>
                    <div className="space-y-2">
                      {(negotiation.talking_points as string[]).map((pt, i) => (
                        <div key={i} className="flex gap-2 p-2.5 rounded-lg bg-surface-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <p className="text-xs text-[#4a5568]">{pt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showAddQuote && (
        <AddQuoteModal supplierId={supplier.id} quotationId={quotationId} onClose={() => setShowAddQuote(false)} />
      )}
    </motion.div>
  )
}

// ─── SUPPLIER CARD ────────────────────────────────────────────────────────────

function SupplierCard({ supplier, selected, inCompare, onClick, onCompare }: {
  supplier: Supplier
  selected: boolean
  inCompare: boolean
  onClick: () => void
  onCompare: (e: React.MouseEvent) => void
}) {
  const caps: string[] = (() => {
    try { return JSON.parse(supplier.capabilities ?? '[]') } catch { return [] }
  })()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'w-full text-left p-3 rounded-xl border-2 transition-all bg-white',
        selected ? 'border-brand bg-brand/5' : inCompare ? 'border-purple-400 bg-purple-50/40' : 'border-[#e5e8ef] hover:border-brand/30',
      )}
    >
      <button className="w-full text-left" onClick={onClick}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-[#0f1729] truncate">{supplier.name}</p>
              {supplier.origin === 'ai_suggested' && (
                <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">AI</span>
              )}
            </div>
            <p className="text-xs text-[#9aa3b2] mt-0.5">
              {COUNTRY_NAMES[supplier.country_code] ?? supplier.country_code}
              {supplier.city ? ` · ${supplier.city}` : ''}
            </p>
            {caps.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {caps.slice(0, 2).map(c => (
                  <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand/10 text-brand font-medium capitalize">
                    {c.replace(/_/g, ' ')}
                  </span>
                ))}
                {caps.length > 2 && <span className="text-[9px] text-[#9aa3b2]">+{caps.length - 2}</span>}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <TierStars rating={supplier.tier_rating} />
            <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', selected ? 'text-brand rotate-90' : 'text-[#c8cdd8]')} />
          </div>
        </div>
      </button>
      {/* Compare toggle */}
      <button
        onClick={onCompare}
        className={cn(
          'mt-2 w-full text-[10px] font-medium py-1 rounded-lg border transition-all',
          inCompare
            ? 'border-purple-300 bg-purple-100 text-purple-700 hover:bg-purple-200'
            : 'border-[#e5e8ef] text-[#9aa3b2] hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'
        )}
      >
        {inCompare ? '✓ In comparison' : '+ Compare'}
      </button>
    </motion.div>
  )
}

// ─── COMPARE DRAWER ───────────────────────────────────────────────────────────

function CompareDrawer({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const FIELDS: { key: keyof Supplier; label: string }[] = [
    { key: 'country_code', label: 'Country' },
    { key: 'city',         label: 'City' },
    { key: 'tier_rating',  label: 'Tier Rating' },
    { key: 'capabilities', label: 'Capabilities' },
    { key: 'notes',        label: 'Notes' },
  ]

  function displayVal(supplier: Supplier, key: keyof Supplier): string {
    const v = supplier[key]
    if (key === 'country_code') return COUNTRY_NAMES[v as string] ?? (v as string) ?? '—'
    if (key === 'capabilities') {
      try { const arr = JSON.parse(v as string ?? '[]'); return (arr as string[]).join(', ') || '—' } catch { return String(v ?? '—') }
    }
    if (key === 'tier_rating') return v != null ? `${v} / 5` : '—'
    return String(v ?? '—')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e8ef]">
          <h2 className="text-lg font-bold text-[#0f1729]">Supplier Comparison</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2] hover:text-[#4a5568]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 border-b border-[#e5e8ef]">
              <tr>
                <th className="text-left py-3 px-6 text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide w-36">Field</th>
                {suppliers.map(s => (
                  <th key={s.id} className="text-left py-3 px-4 text-sm font-semibold text-[#0f1729]">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f3f7]">
              {FIELDS.map(({ key, label }) => (
                <tr key={key} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3 px-6 text-xs font-medium text-[#9aa3b2] uppercase tracking-wide">{label}</td>
                  {suppliers.map(s => (
                    <td key={s.id} className="py-3 px-4 text-[#0f1729]">{displayVal(s, key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const SUPPLIER_BYPASS_ROLES = ['admin', 'ceo', 'developer', 'owner']

export default function SupplierMap() {
  usePageTitle('Supplier Discovery')
  const { canUse, isLoading: subLoading } = useSubscription()
  const { user } = useAuth()
  const qc = useQueryClient()

  // All hooks must be declared before any conditional return to avoid
  // "rendered more hooks than previous render" when subscription loads.
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['DE', 'CN', 'PL'])
  const [commodityType, setCommodityType] = useState('cnc_machining')
  const [partDescription, setPartDescription] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null)
  const [filterMinTier, setFilterMinTier] = useState<number>(0)
  const [filterCapability, setFilterCapability] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompareDrawer, setShowCompareDrawer] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  function toggleCompare(id: string) {
    setCompareIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : (toast.error('Max 4 suppliers in comparison'), prev)
    )
  }

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.suppliers.list() as Promise<Supplier[]>,
  })

  const discoverMut = useMutation({
    mutationFn: () => api.suppliers.suggest({
      commodity_type: commodityType,
      description: partDescription,
      countries: selectedCountries,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Supplier suggestions saved')
    },
    onError: () => toast.error('Supplier discovery failed'),
  })

  function toggleCountry(code: string) {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const filteredSuppliers = useMemo(() => {
    let list = suppliers.filter(s => s.is_active)
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (COUNTRY_NAMES[s.country_code] ?? '').toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q)
      )
    }
    if (filterMinTier > 0) {
      list = list.filter(s => (s.tier_rating ?? 0) >= filterMinTier)
    }
    if (filterCapability.trim()) {
      const cap = filterCapability.trim().toLowerCase()
      list = list.filter(s => {
        const caps: string[] = typeof s.capabilities === 'string'
          ? (() => { try { return JSON.parse(s.capabilities as string) } catch { return [] } })()
          : (s.capabilities ?? [])
        return caps.some((c: string) => c.toLowerCase().includes(cap))
      })
    }
    return list
  }, [suppliers, searchText, filterMinTier, filterCapability])

  // Guard: bypass for admin/ceo/developer/owner regardless of plan or plan preview
  const isPrivilegedRole = user && SUPPLIER_BYPASS_ROLES.includes(user.role)
  if (!subLoading && !canUse('supplier_search') && !isPrivilegedRole) {
    return (
      <div className="page-content space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Supplier Discovery</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Find and evaluate global manufacturing suppliers</p>
        </div>
        <UpgradeGate requiredPlan="pro" feature="Supplier Discovery">
          <span />
        </UpgradeGate>
      </div>
    )
  }

  const mapPins = filteredSuppliers.map(s => ({
    code: s.country_code,
    coords: COUNTRY_COORDS[s.country_code] ?? [0, 0] as [number, number],
    label: s.name,
    supplier: { name: s.name, country: COUNTRY_NAMES[s.country_code] ?? s.country_code, country_code: s.country_code, specialisation: '', estimated_lead_time_days: 0, cost_index: s.tier_rating ?? 3, notes: s.notes ?? '' },
    selected: selectedSupplier?.id === s.id,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content h-[calc(100vh-4rem)] flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Supplier Discovery</h1>
          <p className="text-sm text-[#9aa3b2] mt-0.5">Find, manage, and negotiate with suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#9aa3b2]">{suppliers.filter(s => s.is_active).length} suppliers</span>
          {/* Mobile filter toggle */}
          <button
            onClick={() => setMobileFilterOpen(v => !v)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e5e8ef] rounded-xl bg-white hover:border-brand/30 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">

        {/* ── Panel 1: Filter + Discover ── */}
        <div className={cn('flex-col gap-3 overflow-y-auto', mobileFilterOpen ? 'flex' : 'hidden lg:flex')}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand" />
                AI Discovery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1">Commodity</label>
                <select value={commodityType} onChange={e => setCommodityType(e.target.value)}
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30">
                  {COMMODITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1">Description</label>
                <textarea value={partDescription} onChange={e => setPartDescription(e.target.value)} rows={2}
                  placeholder="e.g. Aluminium bracket, tight tolerances"
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3 h-3" /> Target Countries
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <button key={code} onClick={() => toggleCountry(code)}
                      className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all',
                        selectedCountries.includes(code) ? 'bg-brand text-white' : 'bg-surface-3 text-[#4a5568] hover:bg-surface-4')}>
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" className="w-full" onClick={() => discoverMut.mutate()}
                loading={discoverMut.isPending} disabled={selectedCountries.length === 0}
                iconLeft={<Search className="w-4 h-4" />}>
                Discover Suppliers
              </Button>
            </CardContent>
          </Card>

          {/* ── Supplier Filter ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#4a5568]" />
                Filter Suppliers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1">Min Tier Rating</label>
                <div className="flex gap-1">
                  {[0,1,2,3,4,5].map(t => (
                    <button key={t} onClick={() => setFilterMinTier(t)}
                      className={cn('flex-1 py-1 text-xs rounded-md transition-all border',
                        filterMinTier === t
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface-2 text-[#4a5568] border-[#e5e8ef] hover:border-brand/50')}>
                      {t === 0 ? 'All' : `${t}+`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1">Capability</label>
                <input
                  type="text"
                  value={filterCapability}
                  onChange={e => setFilterCapability(e.target.value)}
                  placeholder="e.g. CNC, casting, welding…"
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              {(filterMinTier > 0 || filterCapability.trim()) && (
                <button
                  onClick={() => { setFilterMinTier(0); setFilterCapability('') }}
                  className="text-xs text-brand hover:underline"
                >
                  Clear filters
                </button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Panel 2: Map + Supplier List ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* Map */}
          <Card className="overflow-hidden flex-shrink-0">
            <div className="h-56 relative">
              <MapErrorBoundary>
                <MapView
                  pins={mapPins}
                  onPinClick={(code) => {
                    const match = filteredSuppliers.find(s => s.country_code === code)
                    if (match) setSelectedSupplier(match === selectedSupplier ? null : match)
                  }}
                />
              </MapErrorBoundary>
            </div>
          </Card>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa3b2]" />
            <input
              type="text"
              placeholder="Search suppliers..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#e5e8ef] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          {/* Supplier list */}
          {suppliersLoading ? (
            <div className="space-y-2">
              {[0,1,2].map(i => <Skeleton key={i} variant="rect" height="4.5rem" />)}
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              illustration={<SupplierEmptyIllustration />}
              title="No suppliers yet"
              description="Use AI Discovery to find suppliers, or add one manually."
            />
          ) : (
            <div className="space-y-2 pb-20">
              <AnimatePresence>
                {filteredSuppliers.map(s => (
                  <SupplierCard
                    key={s.id}
                    supplier={s}
                    selected={selectedSupplier?.id === s.id}
                    inCompare={compareIds.includes(s.id)}
                    onClick={() => setSelectedSupplier(s === selectedSupplier ? null : s)}
                    onCompare={e => { e.stopPropagation(); toggleCompare(s.id) }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Panel 3: Detail ── */}
        <div className="min-h-0">
          <AnimatePresence mode="wait">
            {selectedSupplier ? (
              <SupplierDetailPanel
                key={selectedSupplier.id}
                supplier={selectedSupplier}
                quotationId={selectedQuotationId}
                onClose={() => setSelectedSupplier(null)}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center p-6 rounded-2xl border-2 border-dashed border-[#e5e8ef]"
              >
                <Building2 className="w-10 h-10 text-[#c8cdd8] mb-3" />
                <p className="text-sm font-medium text-[#4a5568]">Select a supplier</p>
                <p className="text-xs text-[#9aa3b2] mt-1">Click a supplier card or map pin to view details, manage quotes, and run comparisons.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── 4B.6 Compare bar (fixed bottom) ── */}
      <AnimatePresence>
        {compareIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[8000] flex items-center gap-3 bg-[#1e2d4e] text-white px-5 py-3 rounded-2xl shadow-xl"
          >
            <div className="flex items-center gap-2">
              {compareIds.map(id => {
                const s = suppliers.find(x => x.id === id)
                return s ? (
                  <div key={id} className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg">
                    <span className="text-xs font-medium truncate max-w-[96px]">{s.name}</span>
                    <button onClick={() => toggleCompare(id)} className="text-white/50 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null
              })}
              {compareIds.length < 4 && (
                <span className="text-xs text-white/40 ml-1">+{4 - compareIds.length} more</span>
              )}
            </div>
            <button
              onClick={() => setShowCompareDrawer(true)}
              className="flex-shrink-0 bg-[#e85c1a] hover:bg-[#d4511a] text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors"
            >
              Compare Now
            </button>
            <button onClick={() => setCompareIds([])} className="text-white/40 hover:text-white/70 ml-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compare drawer ── */}
      <AnimatePresence>
        {showCompareDrawer && (
          <CompareDrawer
            suppliers={suppliers.filter(s => compareIds.includes(s.id))}
            onClose={() => setShowCompareDrawer(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
