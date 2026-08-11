import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, Search, Eye, Send, CheckCircle, XCircle, Archive, RotateCcw, Loader2, FileText,
  ChevronLeft, ChevronRight, SlidersHorizontal, PlayCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { QuoteEmptyIllustration } from '../../components/ui/illustrations'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

type QuoteStatus = 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'archived'
type QuoteType   = 'individual' | 'assembly' | 'component'

interface Quotation {
  id: string
  status: QuoteStatus
  quote_type: QuoteType
  confidence_score: number | null
  cost_eur: number | null
  final_price_eur: number | null
  margin_pct: number | null
  one_time_cost_eur: number | null
  created_at: string
  updated_at: string
  created_by: string | null
  part: {
    id: string; name: string; part_number: string | null
    commodity_type: string; material: string | null
    primary_process: string | null
    dimensions: Record<string, number> | null; weight_kg: number | null
  } | null
  kb_coverage_pct: number | null
  ai_reasoning: string | null
  routing_path: string[] | null
  volume_sensitivity: Record<string, number> | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QuoteStatus, { label: string; className: string }> = {
  draft:            { label: 'Draft',           className: 'bg-surface-3 text-[#4a5568]' },
  in_review:        { label: 'In Review',       className: 'bg-blue-50 text-blue-700' },
  pending_approval: { label: 'Pending',         className: 'bg-amber-50 text-amber-700' },
  approved:         { label: 'Approved',        className: 'bg-emerald-50 text-emerald-700' },
  archived:         { label: 'Archived',        className: 'bg-surface-4 text-[#9aa3b2]' },
}

const STATUS_PILLS: { value: QuoteStatus | ''; label: string }[] = [
  { value: '',                label: 'All' },
  { value: 'draft',           label: 'Draft' },
  { value: 'in_review',       label: 'In Review' },
  { value: 'pending_approval',label: 'Pending' },
  { value: 'approved',        label: 'Approved' },
]

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger'
function confidenceVariant(score: number | null): BadgeVariant {
  if (score === null) return 'default'
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

const PAGE_SIZE = 25

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <tr key={i}>
          {[200, 80, 60, 80, 70, 90, 70, 60].map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <Skeleton variant="line" height="14px" style={{ width: w }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AllQuotes() {
  usePageTitle('All Quotes')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('')
  const [typeFilter, setTypeFilter]     = useState<QuoteType | ''>('')
  const [sortBy, setSortBy]             = useState<'newest' | 'oldest' | 'cost_desc' | 'cost_asc' | 'confidence_desc'>('newest')
  const [showArchived, setShowArchived] = useState(false)
  const [currentPage, setCurrentPage]  = useState(1)
  const [showFilters, setShowFilters]  = useState(false)
  const [mutating, setMutating]        = useState<Set<string>>(new Set())

  function markMutating(id: string)   { setMutating(p => new Set(p).add(id)) }
  function unmarkMutating(id: string) { setMutating(p => { const n = new Set(p); n.delete(id); return n }) }

  const { data: quotesRaw, isLoading, isError } = useQuery<Quotation[]>({
    queryKey: ['quotes'],
    queryFn: () => api.quotes.list(),
  })
  const quotes = quotesRaw ?? []

  const filteredQuotes = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = quotes.filter(quote => {
      if (quote.status === 'archived') {
        if (!['admin', 'developer'].includes(user?.role ?? '')) return false
        if (!showArchived) return false
      }
      if (q && !(quote.part?.name ?? '').toLowerCase().includes(q) && !(quote.part?.part_number ?? '').toLowerCase().includes(q)) return false
      if (statusFilter && quote.status !== statusFilter) return false
      if (typeFilter && quote.quote_type !== typeFilter) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'cost_desc': return (b.cost_eur ?? -1) - (a.cost_eur ?? -1)
        case 'cost_asc': return (a.cost_eur ?? Infinity) - (b.cost_eur ?? Infinity)
        case 'confidence_desc': return (b.confidence_score ?? -1) - (a.confidence_score ?? -1)
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
  }, [quotes, search, statusFilter, typeFilter, showArchived, sortBy, user?.role])

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / PAGE_SIZE))
  const safePage   = Math.min(currentPage, totalPages)
  const pageStart  = (safePage - 1) * PAGE_SIZE
  const pageEnd    = Math.min(pageStart + PAGE_SIZE, filteredQuotes.length)
  const pageQuotes = filteredQuotes.slice(pageStart, pageEnd)

  const resetPage = () => setCurrentPage(1)

  // ── Actions ───────────────────────────────────────────────────────────────
  async function withMutation(id: string, fn: () => Promise<void>, successMsg: string) {
    markMutating(id)
    try { await fn(); await queryClient.invalidateQueries({ queryKey: ['quotes'] }); toast.success(successMsg) }
    catch (err: unknown) { toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Action failed') }
    finally { unmarkMutating(id) }
  }

  const handleSubmit  = (id: string) => withMutation(id, () => api.quotes.submit(id), 'Submitted for review')
  const handleApprove = (id: string) => withMutation(id, () => api.quotes.approve(id, {}), 'Quote approved')
  const handleReject  = (id: string) => withMutation(id, () => api.quotes.reject(id, {}), 'Quote rejected')
  const handleArchive = (id: string) => withMutation(id, () => api.quotes.softDelete(id), 'Quote archived')
  const handleRestore = (id: string) => withMutation(id, () => api.quotes.restore(id), 'Quote restored')

  const activeFiltersCount = [statusFilter, typeFilter, showArchived && ['admin', 'developer'].includes(user?.role ?? '') ? 'archived' : ''].filter(Boolean).length

  return (
    <div className="page-content space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729] tracking-tight">All Quotes</h1>
          {!isLoading && (
            <p className="text-sm text-[#9aa3b2] mt-0.5">{filteredQuotes.length} quote{filteredQuotes.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Button onClick={() => navigate('/quotes/new')} iconLeft={<Plus className="w-4 h-4" />}>
          New Quote
        </Button>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.3 }}
        className="space-y-3"
      >
        {/* Search + sort + filter toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2] pointer-events-none" />
            <input
              type="text"
              placeholder="Search part name or number…"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
              className="w-full pl-9 pr-3 h-9 text-sm border border-[#e5e8ef] rounded-lg bg-white text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value as typeof sortBy); resetPage() }}
            className="h-9 text-sm border border-[#e5e8ef] rounded-lg px-3 bg-white text-[#4a5568] focus:outline-none focus:ring-2 focus:ring-navy cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="cost_desc">Highest cost</option>
            <option value="cost_asc">Lowest cost</option>
            <option value="confidence_desc">Highest confidence</option>
          </select>
          <Button
            variant={activeFiltersCount > 0 ? 'navy' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters(v => !v)}
            iconLeft={<SlidersHorizontal className="w-3.5 h-3.5" />}
          >
            Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
          </Button>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_PILLS.map(pill => (
            <button
              key={pill.value}
              onClick={() => { setStatusFilter(pill.value); resetPage() }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all border',
                statusFilter === pill.value
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-[#4a5568] border-[#e5e8ef] hover:border-[#c8cdd8] hover:bg-surface-3',
              )}
            >
              {pill.label}
              {pill.value !== '' && (
                <span className="ml-1 opacity-60">
                  {quotes.filter(q => q.status === pill.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Advanced filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 p-4 bg-white rounded-xl border border-[#e5e8ef]">
                <div>
                  <label className="block text-xs font-medium text-[#9aa3b2] mb-1.5">Quote Type</label>
                  <select
                    value={typeFilter}
                    onChange={e => { setTypeFilter(e.target.value as QuoteType | ''); resetPage() }}
                    className="text-sm border border-[#e5e8ef] rounded-lg px-3 py-1.5 bg-white text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-navy"
                  >
                    <option value="">All Types</option>
                    <option value="individual">Individual</option>
                    <option value="assembly">Assembly</option>
                    <option value="component">Component</option>
                  </select>
                </div>
                {['admin', 'developer'].includes(user?.role ?? '') && (
                  <div className="flex items-end pb-0.5">
                    <label className="flex items-center gap-2 text-sm text-[#4a5568] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={e => { setShowArchived(e.target.checked); resetPage() }}
                        className="rounded border-[#c8cdd8] text-brand focus:ring-brand"
                      />
                      Show archived
                    </label>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error */}
      {isError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load quotes. Please refresh the page.
        </div>
      )}

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardContent className="p-0">
            {/* ── Mobile card list (hidden on sm+) ── */}
            <div className="sm:hidden divide-y divide-[#e5e8ef]">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-[#e5e8ef] p-4 space-y-2">
                      <Skeleton variant="line" height="16px" width="60%" />
                      <Skeleton variant="line" height="12px" width="40%" />
                    </div>
                  ))}
                </div>
              ) : pageQuotes.length === 0 ? null : pageQuotes.map(quote => {
                const cfg = STATUS_CONFIG[quote.status]
                return (
                  <Link key={quote.id} to={`/quotes/${quote.id}`} className="block px-4 py-3.5 hover:bg-surface-2 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0f1729] truncate">{quote.part?.name ?? '—'}</p>
                        <p className="text-xs text-[#9aa3b2] mt-0.5">{quote.part?.commodity_type ?? ''}{quote.part?.part_number ? ` · ${quote.part.part_number}` : ''}</p>
                      </div>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', cfg.className)}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {quote.cost_eur !== null && (
                        <span className="text-sm font-mono font-semibold text-[#0f1729]">
                          €{new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2 }).format(quote.cost_eur)}
                        </span>
                      )}
                      {quote.confidence_score !== null && (
                        <Badge variant={confidenceVariant(quote.confidence_score)}>{quote.confidence_score.toFixed(0)}%</Badge>
                      )}
                      <span className="text-xs text-[#9aa3b2] ml-auto">{format(new Date(quote.created_at), 'dd MMM yyyy')}</span>
                    </div>
                  </Link>
                )
              })}
              {!isLoading && filteredQuotes.length === 0 && (
                <EmptyState
                  illustration={<QuoteEmptyIllustration />}
                  title="No quotes found"
                  description={search || statusFilter || typeFilter ? 'Try adjusting your filters.' : 'Get started by creating your first quote.'}
                  action={{ label: 'New Quote', onClick: () => navigate('/quotes/new') }}
                />
              )}
            </div>

            {/* ── Desktop table (hidden below sm) ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-[#e5e8ef]">
                <thead className="bg-surface-2">
                  <tr>
                    {['Part Name', 'Part No', 'Type', 'Status', 'Confidence', 'Cost (EUR)', 'Created', ''].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e8ef] bg-white">
                  {isLoading ? (
                    <SkeletonRows />
                  ) : pageQuotes.length > 0 ? pageQuotes.map(quote => {
                    const isMutating = mutating.has(quote.id)
                    const isArchived = quote.status === 'archived'
                    const role = user?.role
                    const cfg = STATUS_CONFIG[quote.status]

                    return (
                      <tr key={quote.id} className="hover:bg-surface-2 transition-colors group">
                        {/* Part Name */}
                        <td className="px-4 py-3.5 max-w-[200px]">
                          <p className="text-sm font-medium text-[#0f1729] truncate">{quote.part?.name ?? '—'}</p>
                          <p className="text-xs text-[#9aa3b2] truncate">{quote.part?.commodity_type ?? ''}</p>
                        </td>
                        {/* Part No */}
                        <td className="px-4 py-3.5 text-sm text-[#4a5568] font-mono whitespace-nowrap">
                          {quote.part?.part_number ?? '—'}
                        </td>
                        {/* Type */}
                        <td className="px-4 py-3.5 text-sm text-[#4a5568] capitalize whitespace-nowrap">
                          {quote.quote_type}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
                            {cfg.label}
                          </span>
                        </td>
                        {/* Confidence */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {quote.confidence_score === null ? (
                            <span className="text-sm text-[#9aa3b2]">—</span>
                          ) : (
                            <Badge variant={confidenceVariant(quote.confidence_score)}>
                              {quote.confidence_score.toFixed(1)}%
                            </Badge>
                          )}
                        </td>
                        {/* Cost */}
                        <td className="px-4 py-3.5 text-sm font-mono text-[#0f1729] whitespace-nowrap">
                          {quote.cost_eur === null ? '—' : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote.cost_eur)}
                        </td>
                        {/* Created */}
                        <td className="px-4 py-3.5 text-sm text-[#9aa3b2] whitespace-nowrap">
                          {format(new Date(quote.created_at), 'dd MMM yyyy')}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3.5">
                          {(() => {
                            const isOwner = quote.created_by === user?.id
                            const isGlobalRole = ['admin', 'developer', 'ceo', 'owner'].includes(role ?? '')
                            const canArchive = !isArchived && quote.status !== 'approved' && (isGlobalRole || isOwner)
                            const canRestore = isArchived && (role === 'admin' || role === 'developer')
                            return (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link to={`/quotes/${quote.id}`}>
                                  <ActionIcon title="View" className="text-[#4a5568] hover:text-navy hover:bg-surface-3">
                                    <Eye className="h-4 w-4" />
                                  </ActionIcon>
                                </Link>
                                {(quote.status === 'draft' || quote.status === 'in_review') && isOwner && (
                                  <Link to={`/quotes/${quote.id}`}>
                                    <ActionIcon title="Resume" className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50">
                                      <PlayCircle className="h-4 w-4" />
                                    </ActionIcon>
                                  </Link>
                                )}
                                {quote.status === 'draft' && (role === 'engineer' || role === 'cost_analyst') && (
                                  <ActionIcon title="Submit for review" disabled={isMutating} onClick={() => handleSubmit(quote.id)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50">
                                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                  </ActionIcon>
                                )}
                                {quote.status === 'pending_approval' && (role === 'ceo' || role === 'admin' || role === 'developer') && (<>
                                  <ActionIcon title="Approve" disabled={isMutating} onClick={() => handleApprove(quote.id)} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                  </ActionIcon>
                                  <ActionIcon title="Reject" disabled={isMutating} onClick={() => handleReject(quote.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                  </ActionIcon>
                                </>)}
                                {canArchive && (
                                  <ActionIcon title="Delete" disabled={isMutating} onClick={() => handleArchive(quote.id)} className="text-[#9aa3b2] hover:text-red-500 hover:bg-red-50">
                                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                                  </ActionIcon>
                                )}
                                {canRestore && (
                                  <ActionIcon title="Restore" disabled={isMutating} onClick={() => handleRestore(quote.id)} className="text-amber-500 hover:text-amber-700 hover:bg-amber-50">
                                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                  </ActionIcon>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                      </tr>
                    )
                  }) : null}
                </tbody>
              </table>

              {/* Empty state */}
              {!isLoading && filteredQuotes.length === 0 && (
                <EmptyState
                  illustration={<QuoteEmptyIllustration />}
                  title="No quotes found"
                  description={search || statusFilter || typeFilter ? 'Try adjusting your filters.' : 'Get started by creating your first quote.'}
                  action={{ label: 'New Quote', onClick: () => navigate('/quotes/new') }}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pagination */}
      {!isLoading && filteredQuotes.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-[#4a5568]">
          <span>Showing {pageStart + 1}–{pageEnd} of {filteredQuotes.length}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} iconLeft={<ChevronLeft className="w-4 h-4" />}>
              Prev
            </Button>
            <span className="px-2 text-[#9aa3b2] text-xs">
              {safePage} / {totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} iconRight={<ChevronRight className="w-4 h-4" />}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ActionIcon helper ─────────────────────────────────────────────────────────
function ActionIcon({ children, title, disabled, onClick, className }: {
  children: React.ReactNode; title?: string; disabled?: boolean
  onClick?: () => void; className?: string
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn('p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed', className)}
    >
      {children}
    </button>
  )
}
