import React, { useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format, differenceInDays, addDays } from 'date-fns'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CheckCircle, XCircle, Send, Archive, RotateCcw, Download, FileText, Loader2,
  Clock, RefreshCw,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useSubscription } from '../../hooks/useSubscription'
import { useConfetti } from '../../hooks/useConfetti'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton, SkeletonText } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import Tab1Overview from './tabs/Tab1Overview'
import Tab2Process from './tabs/Tab2Process'
import Tab3Logistics from './tabs/Tab3Logistics'
import Tab4Assumptions from './tabs/Tab4Assumptions'
import Tab5History from './tabs/Tab5History'

type QuoteStatus = 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'archived'
type QuoteType   = 'individual' | 'assembly' | 'component'

interface Quotation {
  id: string; status: QuoteStatus; quote_type: QuoteType
  confidence_score: number | null; cost_eur: number | null
  final_price_eur: number | null; margin_pct: number | null
  one_time_cost_eur: number | null; created_at: string; updated_at: string
  part: {
    id: string; name: string; part_number: string | null; commodity_type: string
    material: string | null; primary_process: string | null
    dimensions: Record<string, number> | null; weight_kg: number | null
  }
  kb_coverage_pct: number | null; ai_reasoning: string | null
  routing_path: string[] | null; volume_sensitivity: Record<string, number> | null
}

const STATUS_CONFIG: Record<QuoteStatus, { label: string; badge: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft:            { label: 'Draft',           badge: 'default' },
  in_review:        { label: 'In Review',       badge: 'info' },
  pending_approval: { label: 'Pending Approval', badge: 'warning' },
  approved:         { label: 'Approved',        badge: 'success' },
  archived:         { label: 'Archived',        badge: 'default' },
}

function confidenceVariant(s: number | null): 'default' | 'success' | 'warning' | 'danger' {
  if (s === null) return 'default'
  if (s >= 80) return 'success'
  if (s >= 60) return 'warning'
  return 'danger'
}

const TABS = ['Overview', 'Process', 'Logistics', 'Assumptions', 'History'] as const

// ─── Confidence arc gauge ─────────────────────────────────────────────────────

function ConfidenceArc({ score }: { score: number }) {
  const r = 48
  const cx = 64
  const cy = 64
  const semicircle = Math.PI * r          // ≈ 150.8
  const filled = (score / 100) * semicircle

  const color = score >= 80 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <svg viewBox="0 0 128 72" width="128" height="72" className="overflow-visible">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e8ebf2"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Value */}
        <motion.path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${semicircle} ${semicircle}`}
          initial={{ strokeDashoffset: semicircle }}
          animate={{ strokeDashoffset: semicircle - filled }}
          transition={{ delay: 0.35, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Score label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#0f1729" fontFamily="ui-monospace,monospace">
          {score.toFixed(0)}%
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill="#9aa3b2" fontFamily="system-ui,sans-serif">
          CONFIDENCE
        </text>
      </svg>
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ConfirmModal({ title, description, confirmLabel, confirmVariant, onConfirm, onCancel, loading }: {
  title: string; description: string; confirmLabel: string
  confirmVariant: 'primary' | 'danger'; onConfirm: (notes: string) => void
  onCancel: () => void; loading: boolean
}) {
  const [notes, setNotes] = useState('')
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-[#0f1729] mb-1">{title}</h2>
        <p className="text-sm text-[#9aa3b2] mb-4">{description}</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note (optional)"
          rows={3}
          className="w-full border border-[#e5e8ef] rounded-xl px-3 py-2 text-sm text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-navy resize-none mb-4 placeholder:text-[#9aa3b2]"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={confirmVariant} loading={loading} onClick={() => onConfirm(notes)}>
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function QuoteDetailSkeleton() {
  return (
    <div className="page-content space-y-6">
      <Skeleton variant="line" height="14px" width="80px" />
      <div className="space-y-3">
        <Skeleton variant="line" height="32px" width="300px" />
        <Skeleton variant="line" height="14px" width="120px" />
        <div className="flex gap-2">
          {[80, 100, 70].map(w => <Skeleton key={w} variant="line" height="22px" style={{ width: w }} className="rounded-full" />)}
        </div>
        <Skeleton variant="line" height="40px" width="180px" />
      </div>
      <div className="flex gap-2">
        {[100, 100, 80, 110].map((w, i) => <Skeleton key={i} height="36px" style={{ width: w }} className="rounded-lg" />)}
      </div>
      <div className="bg-white rounded-xl border border-[#e5e8ef] p-6">
        <SkeletonText lines={6} />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuoteDetail() {
  usePageTitle('Quote Detail')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { canUse } = useSubscription()

  const burstConfetti = useConfetti()
  const [activeTab, setActiveTab]           = useState(0)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal]   = useState(false)
  const [isSubmitting, setIsSubmitting]     = useState(false)
  const [isArchiving, setIsArchiving]       = useState(false)
  const [isRestoring, setIsRestoring]       = useState(false)
  const [isExporting, setIsExporting]       = useState(false)

  const downloadAnchorRef = useRef<HTMLAnchorElement>(null)

  const { data: quotation, isLoading, isError } = useQuery<Quotation>({
    queryKey: ['quote', id],
    queryFn: () => api.quotes.get(id!),
    enabled: !!id,
    retry: false,
  })

  const approveMut = useMutation({
    mutationFn: ({ notes }: { notes: string }) => api.quotes.approve(id!, { notes }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['quote', id] })
      const prev = queryClient.getQueryData<Quotation>(['quote', id])
      queryClient.setQueryData<Quotation>(['quote', id], old =>
        old ? { ...old, status: 'approved' as const } : old
      )
      return { prev }
    },
    onError: (_err: unknown, _vars: { notes: string }, ctx?: { prev?: Quotation }) => {
      if (ctx?.prev) queryClient.setQueryData(['quote', id], ctx.prev)
      toast.error('Failed to approve')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote approved! 🎉')
      setShowApproveModal(false)
      burstConfetti()
    },
  })

  const rejectMut = useMutation({
    mutationFn: ({ notes }: { notes: string }) => api.quotes.reject(id!, { notes }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['quote', id] })
      const prev = queryClient.getQueryData<Quotation>(['quote', id])
      return { prev }
    },
    onError: (_err: unknown, _vars: { notes: string }, ctx?: { prev?: Quotation }) => {
      if (ctx?.prev) queryClient.setQueryData(['quote', id], ctx.prev)
      toast.error('Failed to reject')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.info('Quote rejected')
      setShowRejectModal(false)
      navigate('/quotes')
    },
  })

  if (isLoading) return <QuoteDetailSkeleton />

  if (isError || !quotation) {
    return (
      <div className="page-content flex items-center justify-center min-h-[50vh]">
        <div className="bg-white rounded-2xl border border-[#e5e8ef] p-10 max-w-sm w-full text-center shadow-sm">
          <FileText className="h-10 w-10 text-[#9aa3b2] mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[#0f1729] mb-2">Quote not found</h2>
          <p className="text-sm text-[#9aa3b2] mb-6">This quote may have been deleted or you don't have permission to view it.</p>
          <Link to="/quotes">
            <Button variant="secondary" size="sm" iconLeft={<ArrowLeft className="h-4 w-4" />}>Back to All Quotes</Button>
          </Link>
        </div>
      </div>
    )
  }

  const role = user?.role
  const isArchived = quotation.status === 'archived'
  const statusCfg  = STATUS_CONFIG[quotation.status]

  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: ['quote', id] })
    await queryClient.invalidateQueries({ queryKey: ['quotes'] })
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    try { await api.quotes.submit(id!); await invalidateAll(); toast.success('Submitted for review') }
    catch (err: unknown) { toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to submit') }
    finally { setIsSubmitting(false) }
  }

  function handleApproveConfirm(notes: string) {
    approveMut.mutate({ notes })
  }

  function handleRejectConfirm(notes: string) {
    rejectMut.mutate({ notes })
  }

  async function handleArchive() {
    setIsArchiving(true)
    try { await api.quotes.softDelete(id!); await invalidateAll(); toast.success('Archived'); navigate('/quotes') }
    catch { toast.error('Failed to archive') }
    finally { setIsArchiving(false) }
  }

  async function handleRestore() {
    setIsRestoring(true)
    try { await api.quotes.restore(id!); await invalidateAll(); toast.success('Restored') }
    catch { toast.error('Failed to restore') }
    finally { setIsRestoring(false) }
  }

  async function handleExportExcel() {
    setIsExporting(true)
    try {
      const blob = await api.quotes.exportExcel(id!)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `quote-${id}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Excel downloaded')
    } catch { toast.error('Export failed') }
    finally { setIsExporting(false) }
  }

  return (
    <div className="page-content space-y-6">
      <a ref={downloadAnchorRef} className="hidden" aria-hidden="true" />

      {/* Back link */}
      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <Link to="/quotes" className="inline-flex items-center gap-1.5 text-sm text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Quotes
        </Link>
      </motion.div>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-2xl border border-[#e5e8ef] shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left — part info */}
          <div className="space-y-3 flex-1 min-w-0">
            <div>
              <h1 className="text-2xl font-bold text-[#0f1729] tracking-tight truncate">{quotation.part.name}</h1>
              <p className="text-sm text-[#9aa3b2] mt-0.5">{quotation.part.part_number ?? 'No part number'} · {quotation.part.commodity_type}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusCfg.badge}>{statusCfg.label}</Badge>
              {quotation.confidence_score !== null ? (
                <Badge variant={confidenceVariant(quotation.confidence_score)}>
                  {quotation.confidence_score.toFixed(1)}% confidence
                </Badge>
              ) : (
                <Badge variant="default">Confidence N/A</Badge>
              )}
              <Badge variant="default" className="capitalize">{quotation.quote_type}</Badge>
            </div>

            <p className="text-xs text-[#9aa3b2]">
              Created {format(new Date(quotation.created_at), 'dd MMM yyyy, HH:mm')}
              {' · '}Updated {format(new Date(quotation.updated_at), 'dd MMM yyyy, HH:mm')}
            </p>
            {/* Quote validity countdown (7D.5) — 30-day validity */}
            {quotation.status !== 'approved' && quotation.status !== 'archived' && (() => {
              const expiryDate = addDays(new Date(quotation.created_at), 30)
              const daysLeft = differenceInDays(expiryDate, new Date())
              if (daysLeft > 7) return null
              const isExpired = daysLeft < 0
              const color = isExpired ? 'text-red-600' : daysLeft <= 3 ? 'text-red-600' : 'text-amber-600'
              return (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${isExpired ? 'bg-red-50' : daysLeft <= 3 ? 'bg-red-50' : 'bg-amber-50'} ${color}`}>
                  <Clock className="w-3 h-3" />
                  {isExpired ? 'Quote expired — refresh recommended' : `Valid for ${daysLeft} more day${daysLeft !== 1 ? 's' : ''}`}
                  {daysLeft <= 3 && !isExpired && <span className="opacity-60">· prices may have changed</span>}
                </div>
              )
            })()}
          </div>

          {/* Right — cost + confidence arc */}
          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            {quotation.confidence_score !== null && (
              <ConfidenceArc score={quotation.confidence_score} />
            )}
            {quotation.cost_eur !== null ? (
              <div className="text-right">
                <p className="text-xs text-[#9aa3b2] mb-1 font-medium uppercase tracking-wider">Total Cost</p>
                <p className="font-mono text-3xl font-bold text-[#0f1729]">
                  €{new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quotation.cost_eur)}
                </p>
              </div>
            ) : (
              <p className="text-lg font-medium text-[#9aa3b2]">Not estimated</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Action bar */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex items-center gap-2 flex-wrap"
      >
        {quotation.status === 'draft' && (role === 'engineer' || role === 'cost_analyst') && (
          <Button onClick={handleSubmit} loading={isSubmitting} iconLeft={!isSubmitting ? <Send className="h-4 w-4" /> : undefined}>
            Submit for Review
          </Button>
        )}
        {quotation.status === 'pending_approval' && (role === 'ceo' || role === 'admin') && (<>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-none"
            onClick={() => setShowApproveModal(true)}
            loading={approveMut.isPending}
            iconLeft={!approveMut.isPending ? <CheckCircle className="h-4 w-4" /> : undefined}
          >Approve</Button>
          <Button variant="danger" onClick={() => setShowRejectModal(true)} loading={rejectMut.isPending} iconLeft={!rejectMut.isPending ? <XCircle className="h-4 w-4" /> : undefined}>
            Reject
          </Button>
        </>)}
        {!isArchived && role === 'admin' && (
          <Button variant="secondary" onClick={handleArchive} loading={isArchiving} iconLeft={!isArchiving ? <Archive className="h-4 w-4" /> : undefined}>Archive</Button>
        )}
        {isArchived && role === 'admin' && (
          <Button variant="secondary" onClick={handleRestore} loading={isRestoring} iconLeft={!isRestoring ? <RotateCcw className="h-4 w-4" /> : undefined}>Restore</Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {canUse('excel_export') && (
            <Button variant="ghost" size="sm" onClick={handleExportExcel} loading={isExporting} iconLeft={!isExporting ? <Download className="h-4 w-4" /> : undefined}>
              Excel
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => toast.info('PDF export coming soon')} iconLeft={<FileText className="h-4 w-4" />}>
            PDF
          </Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Tab bar */}
        <div className="relative flex border-b border-[#e5e8ef] mb-6 gap-1">
          {TABS.map((tab, index) => (
            <button
              key={tab}
              onClick={() => setActiveTab(index)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === index ? 'text-[#0f1729]' : 'text-[#9aa3b2] hover:text-[#4a5568]',
              )}
            >
              {tab}
              {activeTab === index && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 0 && <Tab1Overview quotation={quotation} quotationId={id!} />}
            {activeTab === 1 && <Tab2Process  quotation={quotation} quotationId={id!} />}
            {activeTab === 2 && <Tab3Logistics quotation={quotation} quotationId={id!} />}
            {activeTab === 3 && <Tab4Assumptions quotation={quotation} quotationId={id!} />}
            {activeTab === 4 && <Tab5History  quotation={quotation} quotationId={id!} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {showApproveModal && (
          <ConfirmModal
            title="Approve Quote" description="This quote will be marked as approved."
            confirmLabel="Approve" confirmVariant="primary"
            onConfirm={handleApproveConfirm} onCancel={() => setShowApproveModal(false)} loading={approveMut.isPending}
          />
        )}
        {showRejectModal && (
          <ConfirmModal
            title="Reject Quote" description="This quote will be rejected and the team notified. Please provide a reason."
            confirmLabel="Reject" confirmVariant="danger"
            onConfirm={handleRejectConfirm} onCancel={() => setShowRejectModal(false)} loading={rejectMut.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
