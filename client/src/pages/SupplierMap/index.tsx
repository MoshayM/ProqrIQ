import React, { useState, useMemo, Suspense, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MapPin, Search, Loader2, Building2, Globe, TrendingDown, Plus,
  Star, ChevronRight, X, Upload, BarChart3, MessageSquare, RefreshCw,
  CheckCircle, Zap, AlertTriangle, Users, Trash2, Filter,
  Maximize2, Minimize2, Layers, MousePointer2, ScanLine,
  Mail, Phone, Link2, ExternalLink, Navigation,
} from 'lucide-react'
import type { TileStyle } from './MapView'
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
// Lazy-load the map: defers Leaflet module evaluation until after React is
// mounted, preventing the "r is not a function" context error in Vite prod.
const MapView = React.lazy(() => import('./MapView'))

import 'leaflet/dist/leaflet.css'

// Local error boundary: if react-leaflet crashes (known Vite prod compat issue)
// the map degrades to a plain message and the rest of the page stays up.
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 bg-surface-2 rounded-xl">
          <p className="text-xs text-[#9aa3b2]">Map unavailable — use the supplier list below.</p>
          <button
            className="text-xs text-brand hover:underline"
            onClick={() => this.setState({ failed: false })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── DRAG RESIZE ─────────────────────────────────────────────────────────────
// All resize hooks use pointer capture: events stay pinned to the handle element
// during drag so scroll containers never receive competing pointer events.
// A 4 px movement threshold prevents accidental drags on click.

function useDragResize(initialPx: number, min: number, max: number) {
  const [size, setSize] = useState(initialPx)
  const sizeRef = useRef(size)
  sizeRef.current = size

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startSize = sizeRef.current
    let active = false

    const onMove = (me: PointerEvent) => {
      const delta = me.clientY - startY
      if (!active && Math.abs(delta) < 4) return
      if (!active) { active = true; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none' }
      setSize(Math.max(min, Math.min(max, startSize + delta)))
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [min, max])

  return [size, onPointerDown] as const
}

// Thin 4 px in-flow separator. Forwards wheel events to the adjacent scrollable
// section so scroll is never dropped. Shows a ↕ icon badge on hover only.
function DragHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      onWheel={(e) => {
        e.stopPropagation()
        const h = e.currentTarget as HTMLElement
        const prev = h.previousElementSibling as HTMLElement | null
        const next = h.nextElementSibling as HTMLElement | null
        const target = e.deltaY < 0 ? prev : next
        if (target) target.scrollTop += e.deltaY
      }}
      className="flex-shrink-0 h-1 cursor-row-resize touch-none z-10 group flex items-center justify-center select-none relative overflow-visible"
      title="Drag to resize"
    >
      <div className="absolute inset-0 bg-[#e5e8ef] group-hover:bg-brand/20 transition-colors" />
      <div className="absolute opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-150 pointer-events-none z-30 bg-white rounded-lg border border-[#e5e8ef] shadow-md p-1.5">
        <svg width="12" height="22" viewBox="0 0 12 22" fill="none">
          <path d="M6 8V2M6 2L3 5M6 2L9 5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="1" y1="11" x2="11" y2="11" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6 14V20M6 20L3 17M6 20L9 17" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

function useWidthResize(initialPx: number, min: number, max: number, dir: 'right' | 'left' = 'right') {
  const [width, setWidth] = useState(initialPx)
  const widthRef = useRef(width)
  widthRef.current = width

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = widthRef.current
    let active = false

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX
      if (!active && Math.abs(dx) < 4) return
      if (!active) { active = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none' }
      setWidth(Math.max(min, Math.min(max, startW + (dir === 'right' ? dx : -dx))))
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [min, max, dir])

  return [width, onPointerDown] as const
}

// 4 px in-flow column splitter. Forwards wheel events to Panel 2 (the centre
// scrollable panel) so scroll is never dropped. Shows a ←|→ badge on hover.
function HorizontalDragHandle({ onPointerDown, side = 'right' }: {
  onPointerDown: (e: React.PointerEvent) => void
  side?: 'left' | 'right'
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onWheel={(e) => {
        e.stopPropagation()
        const h = e.currentTarget as HTMLElement
        // Panel 2 (centre, overflow-y-auto) is always the sibling toward centre
        const panel2 = side === 'right'
          ? h.nextElementSibling as HTMLElement | null
          : h.previousElementSibling as HTMLElement | null
        if (panel2) panel2.scrollTop += e.deltaY
      }}
      className="hidden lg:flex flex-shrink-0 w-1 items-center justify-center cursor-ew-resize touch-none z-10 group select-none relative overflow-visible"
      title="Drag to resize"
    >
      <div className="absolute inset-0 bg-[#e5e8ef] group-hover:bg-brand/20 transition-colors" />
      <div className="absolute opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-150 pointer-events-none z-30 bg-white rounded-lg border border-[#e5e8ef] shadow-md p-1.5">
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
          <path d="M8 6H2M2 6L5 3M2 6L5 9" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="11" y1="1" x2="11" y2="11" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M14 6H20M20 6L17 3M20 6L17 9" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

function useResizablePanel(defaultW = 900, defaultH = 600) {
  const [rect, setRect] = useState(() => {
    const w = Math.min(defaultW, window.innerWidth - 32)
    const h = Math.min(defaultH, window.innerHeight - 32)
    return { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2, w, h }
  })
  const rectRef = useRef(rect)
  rectRef.current = rect

  const onResize = useCallback((dir: ResizeDir) => (e: React.PointerEvent) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const s = { ...rectRef.current }
    const MIN_W = 360, MIN_H = 300
    let active = false

    const CURSORS: Record<ResizeDir, string> = {
      n: 'n-resize', ne: 'ne-resize', e: 'e-resize', se: 'se-resize',
      s: 's-resize', sw: 'sw-resize', w: 'w-resize', nw: 'nw-resize', move: 'move',
    }

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      const dist = (dir === 'n' || dir === 's') ? Math.abs(dy)
                 : (dir === 'e' || dir === 'w') ? Math.abs(dx)
                 : Math.max(Math.abs(dx), Math.abs(dy))
      if (!active && dist < 4) return
      if (!active) { active = true; document.body.style.cursor = CURSORS[dir]; document.body.style.userSelect = 'none' }

      const MAX_W = window.innerWidth - 8
      const MAX_H = window.innerHeight - 8
      let { x, y, w, h } = s

      if (dir === 'move') {
        setRect({ w, h, x: Math.max(0, Math.min(MAX_W - w, x + dx)), y: Math.max(0, Math.min(MAX_H - h, y + dy)) })
        return
      }
      if (dir === 'e'  || dir === 'ne' || dir === 'se') w = Math.max(MIN_W, Math.min(MAX_W - x, s.w + dx))
      if (dir === 'w'  || dir === 'nw' || dir === 'sw') { const nw = Math.max(MIN_W, s.w - dx); x = s.x + s.w - nw; w = nw }
      if (dir === 's'  || dir === 'se' || dir === 'sw') h = Math.max(MIN_H, Math.min(MAX_H - y, s.h + dy))
      if (dir === 'n'  || dir === 'ne' || dir === 'nw') { const nh = Math.max(MIN_H, s.h - dy); y = s.y + s.h - nh; h = nh }
      setRect({ x, y, w, h })
    }

    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [])

  return [rect, onResize] as const
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

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+']

function companyAgeFromYear(year: number | null): string | null {
  if (!year) return null
  const age = new Date().getFullYear() - year
  return `Est. ${year} · ${age} yr${age !== 1 ? 's' : ''} old`
}

function formatRevenue(usd: number | null): string | null {
  if (!usd) return null
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000)         return `$${(usd / 1_000).toFixed(0)}K`
  return `$${usd.toFixed(0)}`
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
  contact_name:       string | null
  contact_email:      string | null
  contact_phone:      string | null
  contact_department: string | null
  contact_title:      string | null
  website:            string | null
  full_address:       string | null
  founded_year:       number | null
  company_size:       string | null
  annual_revenue_usd: number | null
  licenses:           string | null
  lat:                number | null
  lng:                number | null
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

type RightPanelTab = 'quotes' | 'compare' | 'negotiate' | 'customers'
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'move'

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

function AddQuoteModal({ supplierId, onClose }: {
  supplierId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [rawText, setRawText] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState<'manual' | 'ai'>('ai')
  const [extractedLines, setExtractedLines] = useState<any[]>([])
  const [extractLoading, setExtractLoading] = useState(false)
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>('')

  // Fetch quotations for the picker
  const { data: quotationsList = [] } = useQuery<{ id: string; part_name: string; quote_number?: string }[]>({
    queryKey: ['quotations-list-for-supplier'],
    queryFn: () => api.quotes.list() as Promise<{ id: string; part_name: string; quote_number?: string }[]>,
  })

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
      const res: any = await api.suppliers.extractQuote({ raw_text: rawText, commodity_type: 'manufacturing' })
      setExtractedLines(res.lines ?? [])
      toast.success(`Extracted ${res.lines?.length ?? 0} line items`)
    } catch {
      toast.error('AI extraction failed')
    } finally {
      setExtractLoading(false)
    }
  }

  function handleSave() {
    if (!selectedQuotationId) { toast.error('Please select a quotation first'); return }
    createMut.mutate({
      supplier_id:       supplierId,
      quotation_id:      selectedQuotationId,
      extraction_method: mode === 'ai' && extractedLines.length > 0 ? 'ai_extracted' : 'manual',
      raw_text:          rawText,
      notes,
      lines:             extractedLines,
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
          {/* Quotation picker — required field */}
          <div>
            <label className="block text-xs font-medium text-[#4a5568] mb-1">Link to Quotation <span className="text-red-500">*</span></label>
            <select
              value={selectedQuotationId}
              onChange={e => setSelectedQuotationId(e.target.value)}
              className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Select a quotation…</option>
              {quotationsList.map((q: any) => (
                <option key={q.id} value={q.id}>
                  {q.quote_number ? `#${q.quote_number} — ` : ''}{q.part_name}
                </option>
              ))}
            </select>
          </div>

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
              disabled={!rawText.trim() || !selectedQuotationId} className="flex-1">
              Save Quote
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── SUPPLIER CONVERSATIONS ───────────────────────────────────────────────────

function SupplierConversations({ supplierId }: { supplierId: string }) {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')
  const [sentBy, setSentBy] = useState<'us' | 'supplier'>('us')
  const [adding, setAdding] = useState(false)

  const { data: convs = [], isLoading } = useQuery<Array<{ id: string; sent_by: string; message: string; created_at: string }>>({
    queryKey: ['supplier-conversations', supplierId],
    queryFn: () => api.suppliers.getConversations(supplierId),
  })

  async function send() {
    if (!msg.trim()) return
    setAdding(true)
    try {
      await api.suppliers.addConversation(supplierId, { message: msg.trim(), sent_by: sentBy })
      qc.invalidateQueries({ queryKey: ['supplier-conversations', supplierId] })
      setMsg('')
    } catch {
      toast.error('Failed to save message')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="pt-2 border-t border-[#e5e8ef] space-y-2">
      <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Conversation Log</p>
      {isLoading ? (
        <div className="space-y-1">{[0,1].map(i => <Skeleton key={i} variant="rect" height="2.5rem" />)}</div>
      ) : convs.length === 0 ? (
        <p className="text-xs text-[#9aa3b2] text-center py-2">No messages yet.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {convs.map(c => (
            <div key={c.id} className={cn('flex gap-2', c.sent_by === 'us' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'max-w-[80%] rounded-xl px-3 py-2 text-xs',
                c.sent_by === 'us'
                  ? 'bg-brand text-white rounded-tr-none'
                  : 'bg-surface-2 text-[#0f1729] rounded-tl-none border border-[#e5e8ef]',
              )}>
                <p className="whitespace-pre-wrap break-words">{c.message}</p>
                <p className={cn('text-[10px] mt-0.5', c.sent_by === 'us' ? 'text-white/60' : 'text-[#9aa3b2]')}>
                  {c.sent_by === 'us' ? 'Us' : 'Supplier'} · {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex gap-1">
          {(['us', 'supplier'] as const).map(s => (
            <button key={s} onClick={() => setSentBy(s)}
              className={cn('flex-1 py-1 text-xs rounded-lg font-medium border transition-all',
                sentBy === s ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-[#4a5568] border-[#e5e8ef]')}>
              {s === 'us' ? 'Our message' : 'Supplier reply'}
            </button>
          ))}
        </div>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          placeholder="Log a message or supplier reply…"
          className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-xs text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
        />
        <Button variant="outline" size="sm" className="w-full" onClick={send} loading={adding}
          iconLeft={<MessageSquare className="w-3.5 h-3.5" />}>
          Save Message
        </Button>
      </div>
    </div>
  )
}

// ─── COMPOSE EMAIL MODAL ─────────────────────────────────────────────────────

function ComposeEmailModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [purpose, setPurpose] = useState<string>('quote_request')
  const [contextNotes, setContextNotes] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  const PURPOSES = [
    { value: 'initial_inquiry', label: 'Initial Inquiry' },
    { value: 'quote_request',   label: 'Request for Quote (RFQ)' },
    { value: 'negotiate',       label: 'Price Negotiation' },
    { value: 'follow_up',       label: 'Follow-up' },
    { value: 'feedback',        label: 'Supplier Feedback' },
  ]

  async function generate() {
    setLoading(true)
    try {
      const res = await api.suppliers.composeEmail(supplier.id, {
        purpose,
        context_notes: contextNotes || undefined,
      })
      setSubject(res.subject)
      setBody(res.body)
      setGenerated(true)
    } catch {
      toast.error('Failed to generate email content')
    } finally {
      setLoading(false)
    }
  }

  function openMailto() {
    const mailto = `mailto:${encodeURIComponent(supplier.contact_email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, '_blank')
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full bg-white rounded-2xl border border-[#e5e8ef] shadow-sm overflow-hidden"
    >
      <div className="p-4 border-b border-[#e5e8ef] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-brand" />
          <h3 className="font-semibold text-[#0f1729] text-sm">Compose Email</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-3 text-[#9aa3b2]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-[#9aa3b2]">
          To: <span className="font-medium text-[#0f1729]">{supplier.contact_email}</span>
          {supplier.contact_name ? ` (${supplier.contact_name})` : ''}
        </p>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">Purpose</label>
          <select value={purpose} onChange={e => { setPurpose(e.target.value); setGenerated(false) }}
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30">
            {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5568] mb-1">
            Additional Context <span className="text-[#9aa3b2]">(optional)</span>
          </label>
          <textarea value={contextNotes} onChange={e => { setContextNotes(e.target.value); setGenerated(false) }} rows={2}
            placeholder="e.g. Requesting quote for 5000 units of AL bracket, lead time 8 weeks…"
            className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={generate} loading={loading}
          iconLeft={<Zap className="w-3.5 h-3.5" />}>
          {generated ? 'Regenerate with AI' : 'Generate Email with AI'}
        </Button>
        {generated && (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-[#4a5568] mb-1">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4a5568] mb-1">
                Body <span className="text-[#9aa3b2]">(editable)</span>
              </label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
                className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none font-mono text-xs" />
            </div>
          </div>
        )}
      </div>

      {generated && (
        <div className="p-4 border-t border-[#e5e8ef] flex-shrink-0 flex gap-2">
          <Button variant="primary" className="flex-1" iconLeft={<Mail className="w-3.5 h-3.5" />} onClick={openMailto}>
            Open in Email Client
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      )}
    </motion.div>
  )
}

// ─── RIGHT PANEL ─────────────────────────────────────────────────────────────

function SupplierDetailPanel({ supplier, quotationId, onClose, expanded, onToggleExpand }: {
  supplier: Supplier
  quotationId: string | null
  onClose: () => void
  expanded: boolean
  onToggleExpand: () => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<RightPanelTab>('quotes')
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [compareResult, setCompareResult] = useState<any>(null)
  const [negotiation, setNegotiation] = useState<any>(null)
  const [comparing, setComparing] = useState(false)
  const [negotiating, setNegotiating] = useState(false)

  const caps: string[] = (() => {
    try { return JSON.parse(supplier.capabilities ?? '[]') } catch { return [] }
  })()

  const [infoHeight, handleInfoDrag] = useDragResize(260, 100, 480)
  const [panelRect, onResize] = useResizablePanel(900, 600)

  const { data: quotes = [], isLoading: quotesLoading } = useQuery<SupplierQuote[]>({
    queryKey: ['supplier-quotes', supplier.id],
    queryFn: () => api.suppliers.getQuotesBySupplier(supplier.id) as Promise<SupplierQuote[]>,
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
    { key: 'quotes',    label: 'Quotes',    icon: <Upload className="w-3.5 h-3.5" /> },
    { key: 'customers', label: 'Customers', icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'compare',  label: 'Compare',   icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'negotiate', label: 'Negotiate', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ]

  if (showCompose) {
    return <ComposeEmailModal supplier={supplier} onClose={() => setShowCompose(false)} />
  }

  const panelContent = (
    <motion.div
      initial={{ opacity: 0, x: expanded ? 0 : 16, scale: expanded ? 0.98 : 1 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: expanded ? 0 : 16 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'flex flex-col bg-white border border-[#e5e8ef] shadow-sm overflow-hidden',
        expanded ? 'rounded-2xl h-full shadow-2xl' : 'h-full rounded-2xl',
      )}
    >
      {/* Header */}
      <div
        className={cn('p-4 border-b border-[#e5e8ef] flex-shrink-0', expanded && 'cursor-move select-none touch-none')}
        onPointerDown={expanded ? onResize('move') : undefined}
      >
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
            <button
              onClick={onToggleExpand}
              title={expanded ? 'Collapse' : 'Expand to full view'}
              className="p-1 rounded-md hover:bg-surface-3 text-[#9aa3b2] hover:text-brand transition-colors"
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-3 text-[#9aa3b2]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <TierStars rating={supplier.tier_rating} />
      </div>

      {/* ── Always-visible info section ─────────────────────────────────────── */}
      <div style={{ height: infoHeight }} className="flex-shrink-0 overflow-y-auto scroll-area p-4 space-y-3">
        {/* Capabilities */}
        {caps.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wide mb-1.5">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {caps.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-medium capitalize">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI recommendation reasoning */}
        {supplier.origin === 'ai_suggested' && supplier.notes && (
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
            <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-1">Why Recommended</p>
            <p className="text-xs text-[#4a5568] leading-relaxed">{supplier.notes}</p>
          </div>
        )}

        {/* Contact details */}
        <div className="rounded-xl border border-[#e5e8ef] p-3 space-y-2">
          <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Contact Details</p>
          {supplier.contact_name ? (
            <div className="flex items-start gap-2">
              <Building2 className="w-3.5 h-3.5 text-[#9aa3b2] mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0f1729]">{supplier.contact_name}</p>
                {(supplier.contact_title || supplier.contact_department) && (
                  <p className="text-xs text-[#9aa3b2]">
                    {[supplier.contact_title, supplier.contact_department].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#9aa3b2] italic">No contact person on file</p>
          )}
          {supplier.contact_email ? (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
              <a href={`mailto:${supplier.contact_email}`} className="text-xs text-brand hover:underline truncate">{supplier.contact_email}</a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-[#9aa3b2] italic">No email on file</span>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${supplier.name} ${supplier.city ?? ''} contact email`)}`}
                target="_blank" rel="noopener noreferrer"
                className="ml-auto text-[10px] text-brand hover:underline flex items-center gap-0.5 flex-shrink-0"
              >Find <ExternalLink className="w-2.5 h-2.5" /></a>
            </div>
          )}
          {supplier.contact_phone ? (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
              <a href={`tel:${supplier.contact_phone}`} className="text-xs text-[#0f1729] hover:underline">{supplier.contact_phone}</a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#e5e8ef] flex-shrink-0" />
              <span className="text-xs text-[#9aa3b2] italic">No phone on file</span>
            </div>
          )}
          {supplier.website && (
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
              <a href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand hover:underline truncate">{supplier.website}</a>
            </div>
          )}
          {(supplier.full_address || supplier.city) && (() => {
            const addrText = supplier.full_address || [supplier.city, COUNTRY_NAMES[supplier.country_code] ?? supplier.country_code].filter(Boolean).join(', ')
            const mapsQuery = supplier.lat && supplier.lng
              ? `${supplier.lat},${supplier.lng}`
              : encodeURIComponent(`${supplier.name} ${addrText}`)
            const mapsUrl      = supplier.lat && supplier.lng
              ? `https://www.google.com/maps?q=${mapsQuery}`
              : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
            const streetViewUrl = supplier.lat && supplier.lng
              ? `https://www.google.com/maps?q=${mapsQuery}&layer=c`
              : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
            return (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#9aa3b2] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-[#4a5568]">{addrText}</p>
                  <div className="flex gap-2.5 mt-1">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-brand hover:underline flex items-center gap-0.5">
                      <ExternalLink className="w-2.5 h-2.5" /> Maps
                    </a>
                    <a href={streetViewUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-brand hover:underline flex items-center gap-0.5">
                      <Navigation className="w-2.5 h-2.5" /> Street View
                    </a>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Company profile */}
        {(supplier.founded_year || supplier.company_size || supplier.annual_revenue_usd || supplier.licenses) && (
          <div className="rounded-xl border border-[#e5e8ef] p-3 space-y-2">
            <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wide">Company Profile</p>
            {supplier.founded_year && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9aa3b2]">📅</span>
                <p className="text-xs text-[#0f1729]">{companyAgeFromYear(supplier.founded_year)}</p>
              </div>
            )}
            {supplier.company_size && (
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
                <p className="text-xs text-[#0f1729]">{supplier.company_size} employees</p>
              </div>
            )}
            {supplier.annual_revenue_usd != null && (
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
                <p className="text-xs text-[#0f1729]">Revenue: {formatRevenue(supplier.annual_revenue_usd)}</p>
              </div>
            )}
            {(() => {
              const lics: string[] = (() => { try { return JSON.parse(supplier.licenses ?? '[]') } catch { return [] } })()
              return lics.length > 0 ? (
                <div>
                  <p className="text-[10px] text-[#9aa3b2] mb-1">Licenses / Certifications</p>
                  <div className="flex flex-wrap gap-1">
                    {lics.map(l => (
                      <span key={l} className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{l}</span>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
          </div>
        )}

        {/* Notes */}
        {supplier.notes && (
          <p className="text-xs text-[#4a5568] italic">{supplier.notes}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="primary" size="sm" className="flex-1" iconLeft={<Upload className="w-3.5 h-3.5" />}
            onClick={() => setShowAddQuote(true)}>
            Add Quote
          </Button>
        </div>
      </div>
      <DragHandle onPointerDown={handleInfoDrag} />
      {/* Tabs — Quotes / Customers / Compare / Negotiate */}
      <div className="flex overflow-x-auto border-b border-[#e5e8ef] flex-shrink-0 scrollbar-none">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors relative flex-none whitespace-nowrap justify-center', tab === t.key ? 'text-brand' : 'text-[#9aa3b2] hover:text-[#4a5568]')}>
            {t.icon}
            <span>{t.label}</span>
            {tab === t.key && <motion.div layoutId="supplier-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" transition={{ type: 'spring', stiffness: 380, damping: 35 }} />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
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
              <p className="text-xs text-[#9aa3b2] text-center py-4">Run a comparison first, then generate a negotiation report from the Quotes tab.</p>
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
            {/* Compose Email — always available in Negotiate tab */}
            {supplier.contact_email && (
              <div className="pt-2 border-t border-[#e5e8ef]">
                <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wide mb-2">Outreach</p>
                <Button variant="outline" size="sm" className="w-full" iconLeft={<Mail className="w-3.5 h-3.5" />}
                  onClick={() => setShowCompose(true)}>
                  Compose Email to Supplier
                </Button>
              </div>
            )}
            <SupplierConversations supplierId={supplier.id} />
          </div>
        )}
      </div>

      {showAddQuote && (
        <AddQuoteModal supplierId={supplier.id} onClose={() => setShowAddQuote(false)} />
      )}
    </motion.div>
  )

  if (expanded) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9200] bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onToggleExpand() }}
      >
        {/* Resizable floating panel */}
        <div
          style={{ left: panelRect.x, top: panelRect.y, width: panelRect.w, height: panelRect.h }}
          className="fixed z-[9201] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Edge + corner resize handles.
              Edges are 1 px (cursor-only) so they never overlap the scrollbar.
              Corners are 24 px so they are easy to grab despite thin edges. */}
          <div className="absolute top-0 left-6 right-6 h-px z-20 cursor-n-resize"  onPointerDown={onResize('n')}  />
          <div className="absolute bottom-0 left-6 right-6 h-px z-20 cursor-s-resize" onPointerDown={onResize('s')} />
          <div className="absolute left-0 top-6 bottom-6 w-px z-20 cursor-w-resize"  onPointerDown={onResize('w')}  />
          <div className="absolute right-0 top-6 bottom-6 w-px z-20 cursor-e-resize" onPointerDown={onResize('e')} />
          <div className="absolute top-0 left-0 w-6 h-6 z-20 cursor-nw-resize" onPointerDown={onResize('nw')} />
          <div className="absolute top-0 right-0 w-6 h-6 z-20 cursor-ne-resize" onPointerDown={onResize('ne')} />
          <div className="absolute bottom-0 left-0 w-6 h-6 z-20 cursor-sw-resize" onPointerDown={onResize('sw')} />
          <div className="absolute bottom-0 right-0 w-6 h-6 z-20 cursor-se-resize" onPointerDown={onResize('se')} />
          {/* SE resize grip indicator */}
          <div className="absolute bottom-1.5 right-1.5 z-20 pointer-events-none opacity-40">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 10L10 2M6 10L10 6" stroke="#9aa3b2" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          {/* Content fills the panel */}
          <div className="absolute inset-0">
            {panelContent}
          </div>
        </div>
      </motion.div>
    )
  }

  return panelContent
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
  const [filterCountry, setFilterCountry] = useState<string[]>([])
  const [filterOrigin, setFilterOrigin] = useState<string[]>([])
  const [filterCompanySize, setFilterCompanySize] = useState<string[]>([])
  const [filterLicense, setFilterLicense] = useState('')
  const [filterMinAge, setFilterMinAge] = useState<number>(0)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompareDrawer, setShowCompareDrawer] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'discover' | 'map' | 'detail'>('map')

  // Left panel drag resize: AI Discovery (top) vs Filter (bottom)
  const [discoverHeight, handleDiscoverDrag] = useDragResize(260, 150, 520)

  // Column width drag resize
  const [leftW, handleLeftWidthDrag]   = useWidthResize(280, 180, 440, 'right')
  const [rightW, handleRightWidthDrag] = useWidthResize(320, 220, 500, 'left')

  // Map view controls
  type MapSize = 'sm' | 'md' | 'lg' | 'full'
  const [mapSize, setMapSize] = useState<MapSize>('md')
  const [tileStyle, setTileStyle] = useState<TileStyle>('light')
  const [scrollWheelZoom, setScrollWheelZoom] = useState(false)

  // Supplier detail expand
  const [detailExpanded, setDetailExpanded] = useState(false)

  const MAP_HEIGHTS: Record<MapSize, string> = {
    sm:   'h-32',
    md:   'h-56',
    lg:   'h-80',
    full: 'h-56', // overridden by fullscreen overlay
  }

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
    if (filterCountry.length > 0) {
      list = list.filter(s => filterCountry.includes(s.country_code))
    }
    if (filterOrigin.length > 0) {
      list = list.filter(s => filterOrigin.includes(s.origin))
    }
    if (filterCompanySize.length > 0) {
      list = list.filter(s => s.company_size && filterCompanySize.includes(s.company_size))
    }
    if (filterLicense.trim()) {
      const lic = filterLicense.trim().toLowerCase()
      list = list.filter(s => s.licenses && s.licenses.toLowerCase().includes(lic))
    }
    if (filterMinAge > 0) {
      const currentYear = new Date().getFullYear()
      list = list.filter(s => s.founded_year && (currentYear - s.founded_year) >= filterMinAge)
    }
    return list
  }, [suppliers, searchText, filterMinTier, filterCapability, filterCountry, filterOrigin, filterCompanySize, filterLicense, filterMinAge])

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
    code: s.id,
    coords: (s.lat != null && s.lng != null)
      ? [s.lat, s.lng] as [number, number]
      : COUNTRY_COORDS[s.country_code] ?? [0, 0] as [number, number],
    label: s.name,
    supplier: { name: s.name, country: COUNTRY_NAMES[s.country_code] ?? s.country_code, country_code: s.country_code, specialisation: '', estimated_lead_time_days: 0, cost_index: s.tier_rating ?? 3, notes: s.notes ?? '' },
    selected: selectedSupplier?.id === s.id,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content h-[calc(100dvh-var(--topbar-h,3.5rem))] lg:h-[calc(100dvh-4rem)] flex flex-col gap-3 overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#0f1729] leading-tight">Supplier Discovery</h1>
          <p className="text-xs lg:text-sm text-[#9aa3b2] mt-0.5">Find, manage, and negotiate with suppliers</p>
        </div>
        <span className="text-sm text-[#9aa3b2]">{suppliers.filter(s => s.is_active).length} suppliers</span>
      </div>

      {/* Mobile panel tabs */}
      <div className="flex-shrink-0 flex lg:hidden gap-1 bg-white rounded-xl border border-[#e5e8ef] p-1">
        {([
          { id: 'discover', label: 'Discover', icon: Zap },
          { id: 'map',      label: 'Map & List', icon: MapPin },
          { id: 'detail',   label: 'Detail', icon: Building2 },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobilePanel(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all',
              mobilePanel === tab.id
                ? 'bg-navy text-white shadow-sm'
                : 'text-[#4a5568] hover:bg-surface-2',
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 flex gap-0">

        {/* ── Panel 1: Filter + Discover ── */}
        <div
          style={{ width: leftW }}
          className={cn('flex-col min-h-0 flex-shrink-0 min-w-full lg:min-w-0', mobilePanel === 'discover' ? 'flex' : 'hidden lg:flex')}
        >
          <div style={{ height: discoverHeight }} className="overflow-y-auto scroll-area flex-shrink-0">
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
                <input
                  type="text"
                  list="commodity-discovery-list"
                  value={commodityType}
                  onChange={e => setCommodityType(e.target.value)}
                  placeholder="e.g. cnc machining, turning…"
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <datalist id="commodity-discovery-list">
                  {COMMODITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </datalist>
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
                <div className="grid grid-cols-3 lg:grid-cols-2 gap-1">
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <button key={code} onClick={() => toggleCountry(code)}
                      className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
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
          </div>
          <DragHandle onPointerDown={handleDiscoverDrag} />
          <div className="flex-1 overflow-y-auto scroll-area min-h-0">
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
                  list="capability-list"
                  value={filterCapability}
                  onChange={e => setFilterCapability(e.target.value)}
                  placeholder="Type to search (e.g. CNC, casting…)"
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <datalist id="capability-list">
                  {COMMODITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Region / Country</label>
                <div className="grid grid-cols-3 lg:grid-cols-2 gap-1">
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <button key={code}
                      onClick={() => setFilterCountry(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                      className={cn('flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all',
                        filterCountry.includes(code) ? 'bg-brand text-white' : 'bg-surface-3 text-[#4a5568] hover:bg-surface-4')}>
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Source / Origin</label>
                <div className="flex flex-col gap-1">
                  {(['manual', 'ai_suggested', 'external_api'] as const).map(o => (
                    <button key={o}
                      onClick={() => setFilterOrigin(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])}
                      className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        filterOrigin.includes(o) ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-[#4a5568] border-[#e5e8ef] hover:border-brand/50')}>
                      {o === 'ai_suggested' ? <Zap className="w-3 h-3 flex-shrink-0" /> : o === 'external_api' ? <Globe className="w-3 h-3 flex-shrink-0" /> : <Building2 className="w-3 h-3 flex-shrink-0" />}
                      {o.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Company Size</label>
                <div className="flex flex-wrap gap-1">
                  {COMPANY_SIZES.map(sz => (
                    <button key={sz}
                      onClick={() => setFilterCompanySize(prev => prev.includes(sz) ? prev.filter(x => x !== sz) : [...prev, sz])}
                      className={cn('px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border',
                        filterCompanySize.includes(sz) ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-[#4a5568] border-[#e5e8ef] hover:border-brand/50')}>
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1">License / Certification</label>
                <input
                  type="text"
                  value={filterLicense}
                  onChange={e => setFilterLicense(e.target.value)}
                  placeholder="e.g. ISO 9001, IATF…"
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4a5568] mb-1.5">Min Company Age</label>
                <div className="flex gap-1">
                  {[{label:'Any',val:0},{label:'5+',val:5},{label:'10+',val:10},{label:'20+',val:20},{label:'30+',val:30}].map(opt => (
                    <button key={opt.val} onClick={() => setFilterMinAge(opt.val)}
                      className={cn('flex-1 py-1 text-[10px] rounded-md transition-all border',
                        filterMinAge === opt.val ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-[#4a5568] border-[#e5e8ef] hover:border-brand/50')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {(filterMinTier > 0 || filterCapability.trim() || filterCountry.length > 0 || filterOrigin.length > 0 || filterCompanySize.length > 0 || filterLicense.trim() || filterMinAge > 0) && (
                <button
                  onClick={() => { setFilterMinTier(0); setFilterCapability(''); setFilterCountry([]); setFilterOrigin([]); setFilterCompanySize([]); setFilterLicense(''); setFilterMinAge(0) }}
                  className="text-xs text-brand hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        <HorizontalDragHandle onPointerDown={handleLeftWidthDrag} side="right" />

        {/* ── Panel 2: Map + Supplier List ── */}
        <div className={cn('flex-1 min-w-0 flex-col gap-3 min-h-0 overflow-y-auto scroll-area', mobilePanel === 'map' ? 'flex' : 'hidden lg:flex')}>
          {/* Map */}
          <Card className="overflow-hidden flex-shrink-0">
            {/* Map toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#f1f3f7] bg-surface-2 min-w-0">
              {/* Tile style */}
              <div className="flex items-center gap-1 min-w-0 shrink">
                <Layers className="w-3.5 h-3.5 text-[#9aa3b2] flex-shrink-0" />
                {(['light', 'dark', 'satellite'] as TileStyle[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setTileStyle(s)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium capitalize transition-all whitespace-nowrap',
                      tileStyle === s ? 'bg-brand text-white' : 'text-[#4a5568] hover:bg-surface-3',
                    )}
                  >
                    <span className="hidden sm:inline">{s}</span>
                    <span className="sm:hidden">{s === 'light' ? 'Lt' : s === 'dark' ? 'Dk' : 'Sat'}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Scroll zoom toggle */}
                <button
                  onClick={() => setScrollWheelZoom(v => !v)}
                  title={scrollWheelZoom ? 'Disable scroll zoom' : 'Enable scroll zoom'}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all',
                    scrollWheelZoom ? 'bg-navy text-white' : 'text-[#9aa3b2] hover:bg-surface-3',
                  )}
                >
                  <MousePointer2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Scroll zoom</span>
                </button>
                {/* Size controls — always fully visible */}
                <div className="flex items-center gap-0 border border-[#e5e8ef] rounded-lg overflow-hidden flex-shrink-0">
                  {([
                    { key: 'sm',   label: 'S'  },
                    { key: 'md',   label: 'M'  },
                    { key: 'lg',   label: 'L'  },
                    { key: 'full', label: <Maximize2 className="w-3 h-3" /> },
                  ] as { key: MapSize; label: React.ReactNode }[]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setMapSize(key)}
                      title={key === 'full' ? 'Fullscreen / Maximize' : `Map size: ${key}`}
                      className={cn(
                        'px-2 py-1 text-[10px] font-semibold transition-all leading-none',
                        mapSize === key
                          ? 'bg-brand text-white'
                          : 'bg-white text-[#9aa3b2] hover:bg-surface-2 hover:text-[#4a5568]',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Map area */}
            <div className={cn('relative transition-all duration-300', MAP_HEIGHTS[mapSize])}>
              <MapErrorBoundary>
                <Suspense fallback={<div className="h-full bg-surface-2" />}>
                  <MapView
                    pins={mapPins}
                    tileStyle={tileStyle}
                    scrollWheelZoom={scrollWheelZoom}
                    onPinClick={(code) => {
                      const match = filteredSuppliers.find(s => s.id === code)
                      if (match) {
                        setSelectedSupplier(match === selectedSupplier ? null : match)
                        if (window.innerWidth < 1024) setMobilePanel('detail')
                      }
                    }}
                  />
                </Suspense>
              </MapErrorBoundary>
            </div>
          </Card>

          {/* Fullscreen map overlay */}
          <AnimatePresence>
            {mapSize === 'full' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9100] bg-black/60 backdrop-blur-sm flex flex-col"
              >
                {/* Fullscreen toolbar */}
                <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[#e5e8ef] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#9aa3b2]" />
                    {(['light', 'dark', 'satellite'] as TileStyle[]).map(s => (
                      <button key={s} onClick={() => setTileStyle(s)}
                        className={cn('px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all',
                          tileStyle === s ? 'bg-brand text-white' : 'text-[#4a5568] hover:bg-surface-3')}>
                        {s}
                      </button>
                    ))}
                    <div className="w-px h-4 bg-[#e5e8ef] mx-1" />
                    <button onClick={() => setScrollWheelZoom(v => !v)}
                      className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        scrollWheelZoom ? 'bg-navy text-white' : 'bg-surface-2 text-[#4a5568] hover:bg-surface-3')}>
                      <MousePointer2 className="w-3.5 h-3.5" />
                      Scroll zoom
                    </button>
                    <span className="text-xs text-[#9aa3b2] ml-2">{filteredSuppliers.length} suppliers shown</span>
                  </div>
                  <button onClick={() => setMapSize('md')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 text-xs font-medium text-[#4a5568] hover:bg-surface-3 transition-colors">
                    <Minimize2 className="w-3.5 h-3.5" />
                    Exit fullscreen
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <MapErrorBoundary>
                    <Suspense fallback={<div className="h-full bg-surface-2" />}>
                      <MapView
                        pins={mapPins}
                        tileStyle={tileStyle}
                        scrollWheelZoom={true}
                        onPinClick={(code) => {
                          const match = filteredSuppliers.find(s => s.id === code)
                          if (match) { setSelectedSupplier(match === selectedSupplier ? null : match); setMapSize('md') }
                        }}
                      />
                    </Suspense>
                  </MapErrorBoundary>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    onClick={() => {
                      setSelectedSupplier(s === selectedSupplier ? null : s)
                      if (window.innerWidth < 1024) setMobilePanel('detail')
                    }}
                    onCompare={e => { e.stopPropagation(); toggleCompare(s.id) }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <HorizontalDragHandle onPointerDown={handleRightWidthDrag} side="left" />

        {/* ── Panel 3: Detail ── */}
        <div
          style={{ width: rightW }}
          className={cn('flex-shrink-0 min-w-full lg:min-w-0 min-h-0 overflow-hidden', mobilePanel === 'detail' ? 'block' : 'hidden lg:block')}
        >
          <AnimatePresence mode="wait">
            {selectedSupplier ? (
              <SupplierDetailPanel
                key={selectedSupplier.id}
                supplier={selectedSupplier}
                quotationId={selectedQuotationId}
                onClose={() => { setSelectedSupplier(null); setDetailExpanded(false) }}
                expanded={detailExpanded}
                onToggleExpand={() => setDetailExpanded(v => !v)}
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
            className="fixed bottom-safe-6 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto z-[8000] flex items-center gap-2 sm:gap-3 bg-[#1e2d4e] text-white px-4 py-3 rounded-2xl shadow-xl"
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
