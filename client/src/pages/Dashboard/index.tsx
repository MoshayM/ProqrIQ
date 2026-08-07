import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, startOfMonth, subMonths } from 'date-fns'
import { toast } from 'sonner'
import {
  TrendingUp, FileText, Clock, Layers, Plus, Package, ArrowRight, CheckCircle2, DollarSign,
  Zap, AlertTriangle, Star,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useConfetti } from '../../hooks/useConfetti'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { ProgressBar } from '../../components/ui/progress-bar'
import { OnboardingChecklist } from '../../components/OnboardingChecklist'

interface Quotation {
  id: string
  status: 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'archived'
  quote_type: 'individual' | 'assembly' | 'component'
  confidence_score: number | null
  cost_eur: number | null
  created_at: string
  part: { id: string; name: string; part_number: string | null; commodity_type: string }
}

interface CostingBatch {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
  total_items: number
  processed_items: number
  created_at: string
}

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

interface AiUsage {
  since: string
  total_calls: number
  total_cost_usd: number
  by_task: Record<string, { calls: number; cost: number }>
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

function statusVariant(status: Quotation['status']): BadgeVariant {
  const map: Record<Quotation['status'], BadgeVariant> = {
    draft: 'default', in_review: 'info', pending_approval: 'warning',
    approved: 'success', archived: 'default',
  }
  return map[status]
}

function statusLabel(status: Quotation['status']): string {
  const map: Record<Quotation['status'], string> = {
    draft: 'Draft', in_review: 'In Review', pending_approval: 'Pending',
    approved: 'Approved', archived: 'Archived',
  }
  return map[status]
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] as any } }),
}

export default function Dashboard() {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  usePageTitle('Dashboard')

  const isAdmin = hasRole(ADMIN_ROLES)
  const burstConfetti = useConfetti()

  const { data: quotesRaw, isLoading: quotesLoading } = useQuery<Quotation[]>({
    queryKey: ['quotes'],
    queryFn: () => api.quotes.list(),
  })

  const { data: batchesRaw, isLoading: batchesLoading } = useQuery<CostingBatch[]>({
    queryKey: ['batches'],
    queryFn: () => api.bulk.list(),
  })

  const { data: aiUsage, isLoading: aiUsageLoading } = useQuery<AiUsage>({
    queryKey: ['admin-ai-usage'],
    queryFn: () => api.admin.getAiUsage(),
    enabled: isAdmin,
    refetchInterval: 120_000,
  })

  const quotes = quotesRaw ?? []
  const batches = batchesRaw ?? []

  const kpis = useMemo(() => {
    const monthStart = startOfMonth(new Date())
    const quotesThisMonth = quotes.filter(q => new Date(q.created_at) >= monthStart).length
    const scores = quotes.map(q => q.confidence_score).filter((s): s is number => s !== null)
    const avgConfidence = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
    const pendingApprovals = quotes.filter(q => q.status === 'pending_approval').length
    const activeBatches = batches.filter(b => b.status === 'processing' || b.status === 'queued').length
    return { quotesThisMonth, avgConfidence, pendingApprovals, activeBatches }
  }, [quotes, batches])

  const monthlyData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      const monthStart = startOfMonth(d)
      const monthEnd = startOfMonth(subMonths(d, -1))
      const count = quotes.filter(q => {
        const t = new Date(q.created_at)
        return t >= monthStart && t < monthEnd
      }).length
      return { month: format(d, 'MMM'), quotes: count }
    })
  }, [quotes])

  const recentQuotes = useMemo(
    () => [...quotes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8),
    [quotes],
  )

  const lastInProgress = useMemo(
    () => [...quotes]
      .filter(q => q.status === 'draft' || q.status === 'in_review')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      [0] ?? null,
    [quotes],
  )

  const pendingList = useMemo(() => quotes.filter(q => q.status === 'pending_approval'), [quotes])
  const canApprove = user?.role === 'ceo' || user?.role === 'admin'

  async function handleApprove(id: string) {
    try {
      await api.quotes.approve(id, {})
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote approved! 🎉')
      burstConfetti()
    } catch { toast.error('Failed to approve') }
  }

  async function handleReject(id: string) {
    try {
      await api.quotes.reject(id, {})
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.info('Quote rejected')
    } catch { toast.error('Failed to reject') }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? ''

  const baseKpiCards = [
    {
      label: 'Quotes This Month',
      value: quotesLoading ? null : kpis.quotesThisMonth,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      accent: 'border-l-blue-500',
    },
    {
      label: 'Avg Confidence',
      value: quotesLoading ? null : (kpis.avgConfidence !== null ? `${kpis.avgConfidence.toFixed(1)}%` : 'N/A'),
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-600',
      accent: 'border-l-emerald-500',
      sub: kpis.avgConfidence !== null ? <ProgressBar value={kpis.avgConfidence} size="sm" variant={kpis.avgConfidence >= 80 ? 'success' : 'warning'} className="mt-2 w-24" /> : null,
    },
    {
      label: 'Pending Approvals',
      value: quotesLoading ? null : kpis.pendingApprovals,
      icon: Clock,
      color: 'bg-amber-50 text-amber-600',
      accent: 'border-l-amber-500',
    },
    {
      label: 'Active Batches',
      value: batchesLoading ? null : kpis.activeBatches,
      icon: Layers,
      color: 'bg-orange-50 text-orange-600',
      accent: 'border-l-brand',
    },
  ]

  const aiSpendCard = isAdmin ? {
    label: 'AI Spend (30d)',
    value: aiUsageLoading ? null : `$${(aiUsage?.total_cost_usd ?? 0).toFixed(2)}`,
    icon: DollarSign,
    color: 'bg-violet-50 text-violet-600',
    accent: 'border-l-violet-500',
    sub: aiUsage ? (
      <p className="text-xs text-[#9aa3b2] mt-1">{aiUsage.total_calls.toLocaleString()} calls</p>
    ) : null,
  } : null

  const kpiCards = aiSpendCard ? [...baseKpiCards, aiSpendCard] : baseKpiCards

  const smartSuggestions = useMemo(() => {
    if (quotesLoading) return []
    const suggestions: { icon: React.ComponentType<{ className?: string }>; label: string; action: string; to: string; color: string }[] = []

    if (kpis.pendingApprovals > 0 && canApprove) {
      suggestions.push({ icon: CheckCircle2, label: `${kpis.pendingApprovals} quote${kpis.pendingApprovals > 1 ? 's' : ''} need approval`, action: 'Review now', to: '/quotes?status=pending_approval', color: 'text-amber-600 bg-amber-50 border-amber-200' })
    }
    if (kpis.activeBatches > 0) {
      suggestions.push({ icon: Layers, label: `${kpis.activeBatches} batch${kpis.activeBatches > 1 ? 'es' : ''} running`, action: 'Track progress', to: '/bulk', color: 'text-blue-600 bg-blue-50 border-blue-200' })
    }
    const lowConfidence = quotes.filter(q => q.status === 'draft' && q.confidence_score !== null && q.confidence_score < 70)
    if (lowConfidence.length > 0) {
      suggestions.push({ icon: AlertTriangle, label: `${lowConfidence.length} quote${lowConfidence.length > 1 ? 's' : ''} with low confidence`, action: 'Improve', to: `/quotes/${lowConfidence[0].id}`, color: 'text-red-600 bg-red-50 border-red-200' })
    }
    if (quotes.length === 0) {
      suggestions.push({ icon: Zap, label: 'Run your first AI cost estimate', action: 'Start now', to: '/quotes/new', color: 'text-brand bg-orange-50 border-orange-200' })
    }
    if (kpis.avgConfidence !== null && kpis.avgConfidence >= 95) {
      suggestions.push({ icon: Star, label: 'Excellent confidence score!', action: 'View quotes', to: '/quotes', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' })
    }
    return suggestions.slice(0, 3)
  }, [quotes, kpis, canApprove, quotesLoading])

  return (
    <div className="page-content space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729] tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-[#9aa3b2] mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Button onClick={() => navigate('/quotes/new')} iconLeft={<Plus className="w-4 h-4" />}>
          New Quote
        </Button>
      </motion.div>

      {/* Onboarding checklist — shown to new users */}
      {!quotesLoading && (
        <OnboardingChecklist
          quoteCount={quotes.length}
          batchCount={batches.length}
          assemblyCount={0}
        />
      )}

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { label: 'New Quote',    icon: Plus,        to: '/quotes/new',  color: 'text-brand' },
          { label: 'Bulk Batch',   icon: Layers,      to: '/bulk',        color: 'text-navy' },
          { label: 'Assemblies',   icon: Package,     to: '/assemblies',  color: 'text-blue-600' },
          { label: 'All Quotes',   icon: FileText,    to: '/quotes',      color: 'text-emerald-600' },
        ].map((a) => (
          <Link key={a.to} to={a.to}>
            <Card variant="hover" className="p-4 flex items-center gap-3 border-[#e5e8ef]">
              <div className={`w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center ${a.color}`}>
                <a.icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-[#0f1729]">{a.label}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#9aa3b2] ml-auto" />
            </Card>
          </Link>
        ))}
      </motion.div>

      {/* Continue where you left off */}
      {!quotesLoading && lastInProgress && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between bg-[#eef2ff] border border-[#c7d2fe] rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#6366f1]/10 flex items-center justify-center flex-shrink-0">
                <ArrowRight className="w-4 h-4 text-[#6366f1]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0f1729]">Continue where you left off</p>
                <p className="text-xs text-[#6366f1]">{lastInProgress.part.name} — <span className="capitalize">{lastInProgress.status.replace('_', ' ')}</span></p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-[#6366f1] hover:bg-[#6366f1]/10" onClick={() => navigate(`/quotes/${lastInProgress.id}`)}>
              Resume <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* KPI cards */}
      <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${kpiCards.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {kpiCards.map((kpi, i) => (
          <motion.div key={kpi.label} custom={i} initial="hidden" animate="show" variants={fadeUp}>
            <Card className={`border-l-4 ${kpi.accent}`}>
              <CardContent className="flex items-start justify-between py-5">
                <div>
                  <p className="text-xs text-[#9aa3b2] font-medium uppercase tracking-wider">{kpi.label}</p>
                  {kpi.value === null ? (
                    <Skeleton variant="line" height="28px" width="60px" className="mt-1.5" />
                  ) : (
                    <p className="text-2xl font-bold text-[#0f1729] mt-0.5 font-mono">{kpi.value}</p>
                  )}
                  {kpi.sub}
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.color} flex-shrink-0`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Smart suggestions */}
      {!quotesLoading && smartSuggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3 }}
          className="flex gap-3 overflow-x-auto pb-1 -mb-1"
        >
          {smartSuggestions.map((s, i) => (
            <Link key={i} to={s.to} className="flex-shrink-0">
              <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm ${s.color}`}>
                <s.icon className="w-4 h-4 flex-shrink-0" />
                <span>{s.label}</span>
                <span className="text-xs opacity-70 underline underline-offset-2">{s.action}</span>
              </div>
            </Link>
          ))}
        </motion.div>
      )}

      {/* Chart + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <CardTitle>Monthly Quote Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e5e8ef', fontSize: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}
                    cursor={{ fill: '#f1f3f7' }}
                  />
                  <Bar dataKey="quotes" fill="#1e2d4e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Activity Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Approved', count: quotes.filter(q => q.status === 'approved').length, color: 'bg-emerald-500' },
                { label: 'In Review', count: quotes.filter(q => q.status === 'in_review').length, color: 'bg-blue-500' },
                { label: 'Draft', count: quotes.filter(q => q.status === 'draft').length, color: 'bg-[#c8cdd8]' },
              ].map((s) => (
                quotesLoading ? (
                  <Skeleton key={s.label} height="36px" className="rounded-lg" />
                ) : (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                    <span className="text-sm text-[#4a5568] flex-1">{s.label}</span>
                    <span className="text-sm font-semibold text-[#0f1729] font-mono">{s.count}</span>
                  </div>
                )
              ))}
              <div className="pt-2 border-t border-[#e5e8ef]">
                <Link to="/quotes" className="text-xs text-brand font-medium hover:underline flex items-center gap-1">
                  View all quotes <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Quotes table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Quotes</CardTitle>
            <Link to="/quotes">
              <Button variant="ghost" size="sm" iconRight={<ArrowRight className="w-3.5 h-3.5" />}>
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {quotesLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} height="40px" className="rounded-lg" />)}
              </div>
            ) : recentQuotes.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-[#9aa3b2]">No quotes yet.</p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/quotes/new')} iconLeft={<Plus className="w-3.5 h-3.5" />}>
                  Create first quote
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile card list */}
                <div className="sm:hidden divide-y divide-[#e5e8ef]">
                  {recentQuotes.map((q) => (
                    <Link key={q.id} to={`/quotes/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0f1729] truncate">{q.part.name}</p>
                        <p className="text-xs text-[#9aa3b2] mt-0.5">
                          {format(new Date(q.created_at), 'MMM d')}
                          {q.confidence_score !== null && ` · ${q.confidence_score.toFixed(0)}% conf`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge variant={statusVariant(q.status)} className="text-[10px]">{statusLabel(q.status)}</Badge>
                        {q.cost_eur !== null && (
                          <span className="font-mono text-xs font-semibold text-[#0f1729]">
                            {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(q.cost_eur)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e5e8ef]">
                    <thead className="bg-surface-2">
                      <tr>
                        {['Part Name', 'Status', 'Confidence', 'Cost (EUR)', 'Created', ''].map((col) => (
                          <th key={col} className="px-6 py-3 text-left text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5e8ef] bg-white">
                      {recentQuotes.map((q) => (
                        <tr key={q.id} className="hover:bg-surface-2 transition-colors group">
                          <td className="px-6 py-3.5 text-sm font-medium text-[#0f1729] max-w-[200px] truncate">
                            {q.part.name}
                            {q.part.part_number && (
                              <span className="block text-xs text-[#9aa3b2] font-normal">{q.part.part_number}</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant={statusVariant(q.status)}>{statusLabel(q.status)}</Badge>
                          </td>
                          <td className="px-6 py-3.5 text-sm font-mono text-[#4a5568]">
                            {q.confidence_score === null ? '—' : `${q.confidence_score.toFixed(1)}%`}
                          </td>
                          <td className="px-6 py-3.5 text-sm font-mono text-[#0f1729]">
                            {q.cost_eur === null ? '—' : new Intl.NumberFormat('en-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(q.cost_eur)}
                          </td>
                          <td className="px-6 py-3.5 text-sm text-[#9aa3b2]">
                            {format(new Date(q.created_at), 'MMM d, yyyy')}
                          </td>
                          <td className="px-6 py-3.5">
                            <Link to={`/quotes/${q.id}`}>
                              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Pending Approvals — CEO / Admin only */}
      {canApprove && pendingList.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Pending Approvals</CardTitle>
                <span className="text-xs font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{pendingList.length}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-[#e5e8ef]">
                {pendingList.map((q) => (
                  <div key={q.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0f1729] truncate">{q.part.name}</p>
                        {q.part.part_number && <p className="text-xs text-[#9aa3b2]">{q.part.part_number}</p>}
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#0f1729] flex-shrink-0">
                        {q.cost_eur === null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(q.cost_eur)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleApprove(q.id)} iconLeft={<CheckCircle2 className="w-3 h-3" />} className="flex-1">Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => handleReject(q.id)} className="flex-1">Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-[#e5e8ef]">
                  <thead className="bg-surface-2">
                    <tr>
                      {['Part Name', 'Cost EUR', 'Created', 'Actions'].map(col => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e8ef] bg-white">
                    {pendingList.map((q) => (
                      <tr key={q.id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-6 py-3.5 text-sm font-medium text-[#0f1729]">
                          {q.part.name}
                          {q.part.part_number && <span className="block text-xs text-[#9aa3b2] font-normal">{q.part.part_number}</span>}
                        </td>
                        <td className="px-6 py-3.5 text-sm font-mono text-[#0f1729]">
                          {q.cost_eur === null ? '—' : new Intl.NumberFormat('en-DE', { style: 'currency', currency: 'EUR' }).format(q.cost_eur)}
                        </td>
                        <td className="px-6 py-3.5 text-sm text-[#9aa3b2]">
                          {format(new Date(q.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleApprove(q.id)} iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />}>Approve</Button>
                            <Button size="sm" variant="danger" onClick={() => handleReject(q.id)}>Reject</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
