import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, FileText, Building2, Layers, Clock, X, ArrowRight, Package,
} from 'lucide-react'
import { api } from '../../lib/api'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { format } from 'date-fns'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface QuoteResult {
  id: string
  status: string
  quote_type: string
  confidence_score: number | null
  overall_cost_eur: number | null
  created_at: string
  part: { part_name: string; part_number: string | null; commodity_type: string }
}

interface SupplierResult {
  id: string
  name: string
  country_code: string
  city: string | null
  origin: string
  tier_rating: number | null
}

interface BatchResult {
  id: string
  name: string
  batch_type: string
  status: string
  total_items: number
  processed_items: number
  created_at: string
}

interface SearchResults {
  quotations: QuoteResult[]
  suppliers: SupplierResult[]
  batches: BatchResult[]
  query: string
}

// ─── RECENT SEARCHES ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'proqriq_recent_searches'
const MAX_RECENT = 5

function getRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

function addRecentSearch(q: string) {
  const prev = getRecentSearches().filter(s => s !== q)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)))
}

// ─── RESULT ROW ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#f1f3f7] text-[#4a5568]',
  in_review: 'bg-blue-50 text-blue-700',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  archived: 'bg-[#f1f3f7] text-[#9aa3b2]',
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function SearchPage() {
  usePageTitle('Search')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQ)
  const [debouncedQ, setDebouncedQ] = useState(initialQ)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>(getRecentSearches)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Fetch on debounced change
  useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 2) {
      setResults(null)
      return
    }
    setIsLoading(true)
    api.search.query(debouncedQ)
      .then((data: any) => {
        setResults(data)
        addRecentSearch(debouncedQ)
        setRecent(getRecentSearches())
        setSearchParams({ q: debouncedQ }, { replace: true })
      })
      .catch(() => setResults(null))
      .finally(() => setIsLoading(false))
  }, [debouncedQ])

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Build flat navigable list
  const navItems: { url: string }[] = [
    ...(results?.quotations.map(q => ({ url: `/quotes/${q.id}` })) ?? []),
    ...(results?.suppliers.map(s => ({ url: `/supplier-map` })) ?? []),
    ...(results?.batches.map(b => ({ url: `/bulk/${b.id}` })) ?? []),
  ]

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, navItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      navigate(navItems[focusedIdx].url)
    } else if (e.key === 'Escape') {
      navigate(-1)
    }
  }

  const totalResults = results
    ? results.quotations.length + results.suppliers.length + results.batches.length
    : 0

  let navOffset = 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="page-content max-w-3xl mx-auto space-y-6"
    >
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9aa3b2] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setFocusedIdx(-1) }}
          onKeyDown={handleKeyDown}
          placeholder="Search quotes, suppliers, batches..."
          className="w-full pl-12 pr-12 py-3.5 text-base border border-[#e5e8ef] rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand shadow-sm transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults(null); setFocusedIdx(-1); inputRef.current?.focus() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#9aa3b2] hover:text-[#4a5568]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-2">
          {[0,1,2,3].map(i => <Skeleton key={i} variant="rect" height="3.5rem" />)}
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {!isLoading && results && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {totalResults === 0 ? (
              <div className="text-center py-12">
                <Search className="w-10 h-10 text-[#c8cdd8] mx-auto mb-3" />
                <p className="text-sm font-medium text-[#4a5568]">No results for "{results.query}"</p>
                <p className="text-xs text-[#9aa3b2] mt-1">Try different keywords or check spelling</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[#9aa3b2]">{totalResults} result{totalResults !== 1 ? 's' : ''} for <span className="font-semibold text-[#4a5568]">"{results.query}"</span></p>

                {/* Quotations */}
                {results.quotations.length > 0 && (() => {
                  const section = (
                    <div key="quotes">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-3.5 h-3.5 text-[#9aa3b2]" />
                        <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide">Quotations</p>
                        <span className="text-[10px] text-[#9aa3b2]">{results.quotations.length}</span>
                      </div>
                      <div className="space-y-1">
                        {results.quotations.map((q, i) => {
                          const idx = navOffset + i
                          const isFocused = focusedIdx === idx
                          return (
                            <Link key={q.id} to={`/quotes/${q.id}`}
                              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all', isFocused ? 'bg-brand/5 ring-1 ring-brand/20' : 'hover:bg-surface-2')}>
                              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', 'bg-blue-50 text-blue-600')}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#0f1729] truncate">{q.part.part_name}</p>
                                <p className="text-xs text-[#9aa3b2] truncate">
                                  {q.part.commodity_type?.replace(/_/g, ' ')}
                                  {q.part.part_number ? ` · ${q.part.part_number}` : ''}
                                  {' · '}{format(new Date(q.created_at), 'dd MMM yyyy')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {q.overall_cost_eur !== null && (
                                  <span className="font-mono text-xs font-semibold text-[#0f1729]">{fmt(q.overall_cost_eur)}</span>
                                )}
                                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[q.status] ?? 'bg-[#f1f3f7] text-[#4a5568]')}>
                                  {q.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                  navOffset += results.quotations.length
                  return section
                })()}

                {/* Suppliers */}
                {results.suppliers.length > 0 && (() => {
                  const section = (
                    <div key="suppliers">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-3.5 h-3.5 text-[#9aa3b2]" />
                        <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide">Suppliers</p>
                        <span className="text-[10px] text-[#9aa3b2]">{results.suppliers.length}</span>
                      </div>
                      <div className="space-y-1">
                        {results.suppliers.map((s, i) => {
                          const idx = navOffset + i
                          const isFocused = focusedIdx === idx
                          return (
                            <Link key={s.id} to="/supplier-map"
                              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all', isFocused ? 'bg-brand/5 ring-1 ring-brand/20' : 'hover:bg-surface-2')}>
                              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#0f1729] truncate">{s.name}</p>
                                <p className="text-xs text-[#9aa3b2]">{s.country_code}{s.city ? ` · ${s.city}` : ''}</p>
                              </div>
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', s.origin === 'ai_suggested' ? 'bg-purple-50 text-purple-600' : 'bg-[#f1f3f7] text-[#4a5568]')}>
                                {s.origin.replace(/_/g, ' ')}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                  navOffset += results.suppliers.length
                  return section
                })()}

                {/* Batches */}
                {results.batches.length > 0 && (() => {
                  const section = (
                    <div key="batches">
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-3.5 h-3.5 text-[#9aa3b2]" />
                        <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide">Bulk Batches</p>
                        <span className="text-[10px] text-[#9aa3b2]">{results.batches.length}</span>
                      </div>
                      <div className="space-y-1">
                        {results.batches.map((b, i) => {
                          const idx = navOffset + i
                          const isFocused = focusedIdx === idx
                          const pct = b.total_items > 0 ? Math.round((b.processed_items / b.total_items) * 100) : 0
                          return (
                            <Link key={b.id} to={`/bulk/${b.id}`}
                              className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all', isFocused ? 'bg-brand/5 ring-1 ring-brand/20' : 'hover:bg-surface-2')}>
                              <div className="w-8 h-8 rounded-lg bg-navy/10 text-navy flex items-center justify-center flex-shrink-0">
                                <Layers className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#0f1729] truncate">{b.name}</p>
                                <p className="text-xs text-[#9aa3b2]">
                                  {b.total_items} items · {pct}% · {format(new Date(b.created_at), 'dd MMM yyyy')}
                                </p>
                              </div>
                              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', b.status === 'completed' ? 'bg-green-50 text-green-700' : b.status === 'processing' ? 'bg-blue-50 text-blue-700' : 'bg-[#f1f3f7] text-[#4a5568]')}>
                                {b.status}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                  navOffset += results.batches.length
                  return section
                })()}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state + recent searches */}
      {!isLoading && !results && (
        <div className="space-y-6">
          {recent.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-3.5 h-3.5 text-[#9aa3b2]" />
                <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wide">Recent searches</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map(r => (
                  <button
                    key={r}
                    onClick={() => { setQuery(r); setDebouncedQ(r) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-3 hover:bg-surface-4 text-sm text-[#4a5568] transition-colors"
                  >
                    <Clock className="w-3 h-3 text-[#9aa3b2]" />
                    {r}
                  </button>
                ))}
                <button
                  onClick={() => { localStorage.removeItem(STORAGE_KEY); setRecent([]) }}
                  className="text-xs text-[#9aa3b2] hover:text-[#4a5568] px-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Hint text */}
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-[#e8ebf2] mx-auto mb-3" />
            <p className="text-sm text-[#9aa3b2]">Search across quotes, suppliers, and batches</p>
            <p className="text-xs text-[#c8cdd8] mt-1">Press ↑ ↓ to navigate results, Enter to open</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
