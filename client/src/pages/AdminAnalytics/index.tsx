import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BarChart3, TrendingUp, TrendingDown, Users, DollarSign,
  RefreshCw, ChevronLeft, AlertTriangle, CheckCircle,
  CreditCard, Settings, Save, RotateCcw, Activity,
  ArrowUpRight, ArrowDownRight, Minus, Calendar,
  ShieldCheck, Zap, Crown, Package, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'

const ADMIN_ROLES = ['admin', 'developer', 'owner']

// ─── Types ────────────────────────────────────────────────────────────────────

interface Analytics {
  total_users: number; new_users_this_month: number; new_users_last_month: number; user_growth_pct: number
  active_subscriptions: number; trialing_subscriptions: number; canceled_this_month: number; total_paying: number
  plan_distribution: Record<string, number>
  mrr: number; arr: number; arpu: number; run_rate: number
  new_mrr: number; churned_mrr: number; net_new_mrr: number
  churn_rate_pct: number; grr_pct: number; trial_conversion_rate_pct: number
  total_revenue_inr: number
  revenue_by_month: Array<{ month: string; revenue: number }>
  signups_by_month: Array<{ month: string; cnt: number }>
  trials_expiring_soon: Array<{ name: string; email: string; trial_ends_at: string; plan: string }>
  upcoming_renewals: Array<{ name: string; email: string; plan: string; billing_cycle: string; current_period_end: string }>
  recent_churn: Array<{ name: string; email: string; plan: string; billing_cycle: string; canceled_at: string }>
  top_ai_spend: Array<{ name: string; email: string; tokens: number }>
}

interface PlanConfig {
  id: string; plan: string; display_name: string
  monthly_price_inr: number; annual_price_inr: number
  monthly_price_usd: number; annual_price_usd: number
  trial_days: number; features: Record<string, unknown>
  effective_from: string
}

interface Subscription {
  id: string; user_id: string; name: string; email: string; role: string
  plan: string; status: string; billing_cycle: string
  trial_ends_at: string | null; current_period_end: string | null; canceled_at: string | null; created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',    label: 'Overview',      icon: BarChart3 },
  { id: 'revenue',     label: 'Revenue',       icon: DollarSign },
  { id: 'retention',   label: 'Retention',     icon: Users },
  { id: 'unit-econ',   label: 'Unit Economics',icon: TrendingUp },
  { id: 'plan-config', label: 'Plan Manager',  icon: Settings },
  { id: 'billing',     label: 'Billing',       icon: CreditCard },
] as const

type TabId = typeof TABS[number]['id']

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals })
}
function fmtInr(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`
  return `₹${fmt(n, 0)}`
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function paise2inr(p: number) { return p / 100 }

function TrendBadge({ pct, inverse = false }: { pct: number; inverse?: boolean }) {
  const good = inverse ? pct < 0 : pct > 0
  const icon = pct > 0 ? <ArrowUpRight className="h-3 w-3" /> : pct < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
      good ? 'bg-green-50 text-green-700' : pct < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
    )}>
      {icon}{Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MetricCard({ label, value, sub, trend, trendInverse, color = '#1e2d4e', loading }: {
  label: string; value: string; sub?: string; trend?: number; trendInverse?: boolean
  color?: string; loading?: boolean
}) {
  if (loading) return (
    <Card className="border-[#e5e8ef]">
      <CardContent className="p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-32 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
  return (
    <Card className="border-[#e5e8ef] hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <p className="text-[12px] text-[#9aa3b2] font-medium uppercase tracking-wide mb-2">{label}</p>
        <p className="text-[28px] font-black leading-none font-mono" style={{ color }}>{value}</p>
        {(sub || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-2">
            {sub && <span className="text-[11px] text-[#9aa3b2]">{sub}</span>}
            {trend !== undefined && <TrendBadge pct={trend} inverse={trendInverse} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const PIE_COLORS = ['#1e2d4e', '#2d6ac8', '#0d9e8a', '#7c3aed', '#e85c1a']
const PLAN_COLOR: Record<string, string> = { free: '#9aa3b2', pro: '#2d6ac8', organization: '#7c3aed' }
const PLAN_ICON: Record<string, React.ReactNode> = {
  free: <Package className="h-3.5 w-3.5" />,
  pro: <Zap className="h-3.5 w-3.5" />,
  organization: <Crown className="h-3.5 w-3.5" />,
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
      style={{ background: PLAN_COLOR[plan] ?? '#9aa3b2' }}>
      {PLAN_ICON[plan]}{plan}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const col = status === 'active' ? '#22c55e' : status === 'trialing' ? '#f59e0b' : status === 'canceled' ? '#ef4444' : '#9aa3b2'
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: col }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: col }} />{status}
  </span>
}

// ─── Feature keys ─────────────────────────────────────────────────────────────

const BOOL_FEATURES = [
  { key: 'supplier_discovery',   label: 'Supplier Discovery' },
  { key: 'negotiation_reports',  label: 'Negotiation Reports' },
  { key: 'excel_pdf_export',     label: 'Excel + PDF Export' },
  { key: 'passkey_auth',         label: 'Passkey Auth' },
  { key: 'ai_cost_control',      label: 'AI Cost Control' },
  { key: 'custom_margin',        label: 'Custom Margin %' },
  { key: 'sso_saml',             label: 'SSO / SAML' },
  { key: 'priority_support',     label: 'Priority Support' },
  { key: 'audit_log_export',     label: 'Audit Log Export' },
]
const NUM_FEATURES = [
  { key: 'quotes_per_month', label: 'Quotes / Month', nullable: true },
  { key: 'bulk_batch_items', label: 'Bulk Batch Items', nullable: false },
  { key: 'assembly_depth',   label: 'Assembly Depth',  nullable: false },
  { key: 'kb_documents',     label: 'KB Documents',    nullable: true },
]

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ data, loading }: { data: Analytics | undefined; loading: boolean }) {
  const planDist = data ? Object.entries(data.plan_distribution ?? {}).map(([name, value]) => ({ name, value })) : []
  const mergedMonthly = (() => {
    const months: Record<string, { month: string; signups: number; revenue: number }> = {}
    for (const s of data?.signups_by_month ?? []) {
      months[s.month] = { month: s.month, signups: s.cnt, revenue: 0 }
    }
    for (const r of data?.revenue_by_month ?? []) {
      if (months[r.month]) months[r.month].revenue = r.revenue
      else months[r.month] = { month: r.month, signups: 0, revenue: r.revenue }
    }
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  })()

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard loading={loading} label="MRR" value={data ? fmtInr(data.mrr) : '—'} sub="Monthly Recurring Revenue" color="#2d6ac8" />
        <MetricCard loading={loading} label="ARR" value={data ? fmtInr(data.arr) : '—'} sub="Annual Run Rate" color="#1e2d4e" />
        <MetricCard loading={loading} label="Active Users" value={data ? fmt(data.total_users) : '—'}
          sub={`+${data?.new_users_this_month ?? 0} this month`}
          trend={data?.user_growth_pct} color="#0d9e8a" />
        <MetricCard loading={loading} label="Churn Rate" value={data ? fmtPct(data.churn_rate_pct) : '—'}
          sub="Monthly churn" trend={data ? -data.churn_rate_pct : undefined} trendInverse color="#e85c1a" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard loading={loading} label="Paying Customers" value={data ? fmt(data.total_paying) : '—'} sub="Excl. free tier" />
        <MetricCard loading={loading} label="ARPU" value={data ? fmtInr(data.arpu) : '—'} sub="Avg Revenue Per User" color="#7c3aed" />
        <MetricCard loading={loading} label="GRR" value={data ? fmtPct(data.grr_pct) : '—'} sub="Gross Revenue Retention"
          trend={data ? data.grr_pct - 100 : undefined} color="#0d9e8a" />
        <MetricCard loading={loading} label="Trial Conversion" value={data ? fmtPct(data.trial_conversion_rate_pct) : '—'}
          sub="Trials → Paid" trend={data?.trial_conversion_rate_pct} color="#2d6ac8" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="border-[#e5e8ef]">
            <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">User Growth & Revenue (12 months)</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mergedMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="colSignups" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2d6ac8" stopOpacity={0.18} /><stop offset="95%" stopColor="#2d6ac8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9e8a" stopOpacity={0.18} /><stop offset="95%" stopColor="#0d9e8a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9aa3b2' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9aa3b2' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9aa3b2' }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e8ef' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="left" type="monotone" dataKey="signups" stroke="#2d6ac8" fill="url(#colSignups)" strokeWidth={2} name="New Users" />
                    <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#0d9e8a" fill="url(#colRevenue)" strokeWidth={2} name="Revenue (₹)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#e5e8ef]">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Plan Distribution</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : planDist.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-[#9aa3b2] text-sm">No subscribers yet</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={planDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                      dataKey="value" nameKey="name" paddingAngle={2}>
                      {planDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {planDist.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-[#4a5568] capitalize">{p.name}</span>
                      </div>
                      <span className="font-bold text-[#0f1729]">{p.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alert lists */}
      {data && data.trials_expiring_soon.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Trials Expiring in 7 Days ({data.trials_expiring_soon.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.trials_expiring_soon.slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <div>
                    <span className="font-semibold text-amber-900">{t.name}</span>
                    <span className="text-amber-700 ml-1.5">{t.email}</span>
                  </div>
                  <span className="text-amber-700 font-mono">{t.trial_ends_at?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RevenueTab({ data, loading }: { data: Analytics | undefined; loading: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard loading={loading} label="MRR" value={data ? fmtInr(data.mrr) : '—'} color="#2d6ac8" sub="Monthly Recurring Revenue" />
        <MetricCard loading={loading} label="ARR" value={data ? fmtInr(data.arr) : '—'} color="#1e2d4e" sub="Annual Recurring Revenue" />
        <MetricCard loading={loading} label="Run Rate" value={data ? fmtInr(data.run_rate) : '—'} color="#7c3aed" sub="ARR = MRR × 12" />
        <MetricCard loading={loading} label="New MRR" value={data ? fmtInr(data.new_mrr) : '—'} color="#0d9e8a" sub="Added this month" trend={data?.new_mrr > 0 ? 100 : 0} />
        <MetricCard loading={loading} label="Churned MRR" value={data ? fmtInr(data.churned_mrr) : '—'} color="#e85c1a" sub="Lost this month" trend={data?.churned_mrr > 0 ? -100 : 0} />
        <MetricCard loading={loading} label="Net New MRR" value={data ? fmtInr(data.net_new_mrr) : '—'}
          color={data && data.net_new_mrr >= 0 ? '#0d9e8a' : '#ef4444'} sub="New − Churned"
          trend={data?.net_new_mrr !== undefined ? (data.net_new_mrr >= 0 ? 1 : -1) : undefined} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard loading={loading} label="ARPU" value={data ? fmtInr(data.arpu) : '—'} sub="Avg Revenue Per Paying User" color="#2d6ac8" />
        <MetricCard loading={loading} label="GRR" value={data ? fmtPct(data.grr_pct) : '—'} sub="Gross Revenue Retention" color="#0d9e8a" />
      </div>

      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Revenue MoM (₹)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-52 w-full" /> : data?.revenue_by_month.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center gap-2 text-[#9aa3b2]">
              <DollarSign className="h-8 w-8 opacity-30" />
              <p className="text-sm">No billing transactions recorded yet.</p>
              <p className="text-xs">Use the Billing tab to log payments manually.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.revenue_by_month} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9aa3b2' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9aa3b2' }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e8ef' }} formatter={(v) => [`₹${fmt(Number(v))}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#2d6ac8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-[#e5e8ef]">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Total Revenue Collected</CardTitle></CardHeader>
          <CardContent>
            <p className="text-[36px] font-black text-[#0f1729] font-mono">{data ? fmtInr(data.total_revenue_inr) : <Skeleton className="h-10 w-32" />}</p>
            <p className="text-[12px] text-[#9aa3b2] mt-1">From recorded billing transactions</p>
          </CardContent>
        </Card>
        <Card className="border-[#e5e8ef]">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Paying vs Free Users</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? <Skeleton className="h-20 w-full" /> : (
              <>
                {[
                  { label: 'Paying', count: data?.total_paying ?? 0, color: '#2d6ac8' },
                  { label: 'Free', count: (data?.total_users ?? 0) - (data?.total_paying ?? 0), color: '#9aa3b2' },
                ].map(({ label, count, color }) => {
                  const total = data?.total_users ?? 1
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="font-medium text-[#4a5568]">{label}</span>
                        <span className="font-bold font-mono" style={{ color }}>{count}</span>
                      </div>
                      <div className="h-2 bg-[#f0f2f7] rounded-full">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${(count / total) * 100}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RetentionTab({ data, loading }: { data: Analytics | undefined; loading: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard loading={loading} label="Monthly Churn" value={data ? fmtPct(data.churn_rate_pct) : '—'}
          color={data && data.churn_rate_pct > 5 ? '#ef4444' : '#0d9e8a'}
          sub="% subscribers lost / month" trend={data ? -data.churn_rate_pct : undefined} trendInverse />
        <MetricCard loading={loading} label="Churned This Month" value={data ? fmt(data.canceled_this_month) : '—'}
          color="#e85c1a" sub="Canceled subscriptions" />
        <MetricCard loading={loading} label="GRR" value={data ? fmtPct(data.grr_pct) : '—'}
          color={data && data.grr_pct > 90 ? '#0d9e8a' : '#e85c1a'} sub="Gross Revenue Retention" />
        <MetricCard loading={loading} label="Trial → Paid" value={data ? fmtPct(data.trial_conversion_rate_pct) : '—'}
          color="#2d6ac8" sub="Trial conversion rate" />
      </div>

      {/* Annual churn estimate */}
      {data && (
        <Card className="border-[#e5e8ef]">
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Retention Forecast</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-[11px] text-[#9aa3b2] uppercase tracking-wide mb-1">Annual Churn</p>
                <p className="text-[24px] font-black font-mono text-[#e85c1a]">
                  {fmtPct(Math.min(100, data.churn_rate_pct * 12))}
                </p>
                <p className="text-[10px] text-[#9aa3b2] mt-0.5">Monthly × 12 estimate</p>
              </div>
              <div>
                <p className="text-[11px] text-[#9aa3b2] uppercase tracking-wide mb-1">Customer Lifetime</p>
                <p className="text-[24px] font-black font-mono text-[#2d6ac8]">
                  {data.churn_rate_pct > 0 ? `${(1 / (data.churn_rate_pct / 100)).toFixed(1)} mo` : '∞'}
                </p>
                <p className="text-[10px] text-[#9aa3b2] mt-0.5">1 / monthly churn rate</p>
              </div>
              <div>
                <p className="text-[11px] text-[#9aa3b2] uppercase tracking-wide mb-1">Net Revenue Retained</p>
                <p className="text-[24px] font-black font-mono text-[#0d9e8a]">
                  {fmtPct(data.grr_pct)}
                </p>
                <p className="text-[10px] text-[#9aa3b2] mt-0.5">Gross Revenue Retention</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent churn list */}
      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] font-semibold text-[#0f1729]">Churned in Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32 w-full" /> : !data?.recent_churn.length ? (
            <div className="flex items-center gap-2 text-[#9aa3b2] text-sm py-4">
              <CheckCircle className="h-4 w-4 text-green-500" /> No churn this month. Great retention!
            </div>
          ) : (
            <div className="space-y-2">
              {data.recent_churn.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#f4f6fb] last:border-0 text-[12px]">
                  <div>
                    <p className="font-semibold text-[#0f1729]">{r.name}</p>
                    <p className="text-[#9aa3b2]">{r.email}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <PlanBadge plan={r.plan} />
                    <span className="text-[#9aa3b2] font-mono">{r.canceled_at?.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trials expiring soon */}
      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] font-semibold text-[#0f1729]">Trials Expiring in 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32 w-full" /> : !data?.trials_expiring_soon.length ? (
            <p className="text-[#9aa3b2] text-sm py-4">No trials expiring in the next 7 days.</p>
          ) : (
            <div className="space-y-2">
              {data.trials_expiring_soon.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#f4f6fb] last:border-0 text-[12px]">
                  <div>
                    <p className="font-semibold text-[#0f1729]">{t.name}</p>
                    <p className="text-[#9aa3b2]">{t.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <PlanBadge plan={t.plan} />
                    <span className="text-amber-600 font-mono font-semibold">{t.trial_ends_at?.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function UnitEconTab({ data, loading }: { data: Analytics | undefined; loading: boolean }) {
  const [cac, setCac] = useState(5000)
  const [tam, setTam] = useState(50000000)

  const ltv = data && data.churn_rate_pct > 0
    ? data.arpu / (data.churn_rate_pct / 100)
    : data ? data.arpu * 24 : 0
  const ltvCac = cac > 0 ? ltv / cac : 0
  const payback = data && data.arpu > 0 ? cac / data.arpu : 0

  return (
    <div className="space-y-6">
      {/* Input overrides */}
      <Card className="border-[#e5e8ef] bg-[#f8fafc]">
        <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Assumptions (editable)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-[#9aa3b2] uppercase tracking-wide font-medium block mb-1.5">
                CAC — Customer Acquisition Cost (₹)
              </label>
              <input type="number" value={cac} onChange={e => setCac(Number(e.target.value))}
                className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30" />
            </div>
            <div>
              <label className="text-[11px] text-[#9aa3b2] uppercase tracking-wide font-medium block mb-1.5">
                TAM — Total Addressable Market (₹)
              </label>
              <input type="number" value={tam} onChange={e => setTam(Number(e.target.value))}
                className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard loading={loading} label="LTV" value={fmtInr(ltv)} color="#2d6ac8"
          sub="Lifetime Value per customer" />
        <MetricCard loading={loading} label="CAC" value={fmtInr(cac)} color="#e85c1a"
          sub="Customer Acquisition Cost" />
        <MetricCard loading={loading} label="LTV:CAC Ratio" value={ltvCac.toFixed(1) + 'x'}
          color={ltvCac >= 3 ? '#0d9e8a' : ltvCac >= 1 ? '#f59e0b' : '#ef4444'}
          sub={ltvCac >= 3 ? 'Healthy ✓' : ltvCac >= 1 ? 'Fair — target 3x+' : 'Below break-even'} />
        <MetricCard loading={loading} label="Payback Period" value={payback > 0 ? `${payback.toFixed(1)} mo` : '—'}
          color="#7c3aed" sub="Months to recover CAC" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard loading={loading} label="TAM" value={fmtInr(tam)} color="#1e2d4e" sub="Total Addressable Market" />
        <MetricCard loading={loading} label="Market Penetration"
          value={tam > 0 && data ? `${((data.arr / tam) * 100).toFixed(3)}%` : '—'}
          color="#2d6ac8" sub="ARR / TAM" />
        <MetricCard loading={loading} label="ARPU" value={data ? fmtInr(data.arpu) : '—'}
          color="#0d9e8a" sub="Avg Revenue Per User / month" />
      </div>

      {/* LTV:CAC gauge */}
      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-2"><CardTitle className="text-[13px] font-semibold text-[#0f1729]">Unit Economics Health</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'LTV:CAC', value: ltvCac, target: 3, unit: 'x', good: v => v >= 3, warn: v => v >= 1 },
              { label: 'Churn Rate', value: data?.churn_rate_pct ?? 0, target: 5, unit: '%', good: v => v < 2, warn: v => v < 5 },
              { label: 'GRR', value: data?.grr_pct ?? 100, target: 85, unit: '%', good: v => v >= 90, warn: v => v >= 80 },
              { label: 'Trial Conversion', value: data?.trial_conversion_rate_pct ?? 0, target: 25, unit: '%', good: v => v >= 20, warn: v => v >= 10 },
            ].map(({ label, value, target, unit, good, warn }) => {
              const isGood = good(value), isWarn = !isGood && warn(value)
              const color  = isGood ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444'
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span className="font-medium text-[#4a5568]">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold" style={{ color }}>{value.toFixed(1)}{unit}</span>
                      <span className="text-[#9aa3b2]">Target: {target}{unit}</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-[#f0f2f7] rounded-full">
                    <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, (value / (target * 1.5)) * 100)}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PlanConfigTab() {
  const qc = useQueryClient()
  const { data: configData, isLoading } = useQuery({
    queryKey: ['admin', 'plan-config'],
    queryFn: () => api.admin.getPlanConfig(),
  })
  const configs: PlanConfig[] = (configData as PlanConfig[] | undefined) ?? []

  const [editing, setEditing] = useState<Record<string, PlanConfig>>({})

  function getEditing(plan: string): PlanConfig | undefined {
    return editing[plan] ?? configs.find(c => c.plan === plan)
  }
  function patch(plan: string, updates: Partial<PlanConfig>) {
    const base = getEditing(plan)
    if (!base) return
    setEditing(prev => ({ ...prev, [plan]: { ...base, ...updates } }))
  }
  function patchFeature(plan: string, key: string, value: unknown) {
    const base = getEditing(plan)
    if (!base) return
    setEditing(prev => ({
      ...prev,
      [plan]: { ...base, features: { ...base.features, [key]: value } },
    }))
  }

  const saveMutation = useMutation({
    mutationFn: ({ plan, data }: { plan: string; data: PlanConfig }) =>
      api.admin.savePlanConfig(plan, {
        display_name:      data.display_name,
        monthly_price_inr: data.monthly_price_inr,
        annual_price_inr:  data.annual_price_inr,
        monthly_price_usd: data.monthly_price_usd,
        annual_price_usd:  data.annual_price_usd,
        trial_days:        data.trial_days,
        features:          data.features,
      }),
    onSuccess: (_, { plan }) => {
      toast.success(`${plan} plan saved — new subscribers will see the updated pricing`)
      setEditing(prev => { const n = { ...prev }; delete n[plan]; return n })
      qc.invalidateQueries({ queryKey: ['admin', 'plan-config'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const PLAN_ORDER = ['free', 'pro', 'organization']
  const PLAN_ACCENT: Record<string, string> = { free: '#9aa3b2', pro: '#2d6ac8', organization: '#7c3aed' }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-800">
        <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Grandfathering protection is automatic</p>
          <p className="mt-0.5 text-blue-700">Changes take effect for new subscribers only. Existing subscribers keep their current plan terms until their billing period ends.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-96 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_ORDER.map(planKey => {
            const cfg = getEditing(planKey)
            if (!cfg) return null
            const isDirty = !!editing[planKey]
            const accent = PLAN_ACCENT[planKey]

            return (
              <Card key={planKey} className={cn('border-2 transition-all', isDirty ? 'border-[#2d6ac8] shadow-md' : 'border-[#e5e8ef]')}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-8 rounded-full" style={{ background: accent }} />
                      <div>
                        <input
                          value={cfg.display_name}
                          onChange={e => patch(planKey, { display_name: e.target.value })}
                          className="text-[15px] font-bold text-[#0f1729] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[#2d6ac8] rounded px-1 w-full"
                        />
                        <p className="text-[10px] text-[#9aa3b2] px-1">{planKey}</p>
                      </div>
                    </div>
                    {isDirty && (
                      <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[planKey]; return n })}
                        className="text-[#9aa3b2] hover:text-[#4a5568] p-1">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pricing */}
                  <div>
                    <p className="text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold mb-2">Pricing (INR paise)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Monthly (₹ paise)', field: 'monthly_price_inr' as const },
                        { label: 'Annual (₹ paise)',  field: 'annual_price_inr' as const },
                        { label: 'Monthly ($ cents)', field: 'monthly_price_usd' as const },
                        { label: 'Annual ($ cents)',  field: 'annual_price_usd' as const },
                      ].map(({ label, field }) => (
                        <div key={field}>
                          <label className="text-[9px] text-[#9aa3b2] block mb-1">{label}</label>
                          <input type="number" value={cfg[field] as number}
                            onChange={e => patch(planKey, { [field]: Number(e.target.value) })}
                            className="w-full border border-[#e5e8ef] rounded-lg px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30"
                          />
                          <p className="text-[9px] text-[#9aa3b2] mt-0.5">
                            = {field.includes('inr')
                              ? `₹${(Number(cfg[field]) / 100).toFixed(0)}`
                              : `$${(Number(cfg[field]) / 100).toFixed(0)}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trial days */}
                  <div>
                    <label className="text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold block mb-1.5">Trial Days</label>
                    <input type="number" value={cfg.trial_days}
                      onChange={e => patch(planKey, { trial_days: Number(e.target.value) })}
                      className="w-full border border-[#e5e8ef] rounded-lg px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30"
                    />
                  </div>

                  {/* Numeric features */}
                  <div>
                    <p className="text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold mb-2">Usage Limits</p>
                    <div className="space-y-2">
                      {NUM_FEATURES.map(({ key, label, nullable }) => (
                        <div key={key} className="grid grid-cols-2 items-center gap-2">
                          <label className="text-[11px] text-[#4a5568]">{label}</label>
                          <div className="flex items-center gap-1">
                            {nullable && (
                              <input type="checkbox"
                                checked={cfg.features[key] === null}
                                onChange={e => patchFeature(planKey, key, e.target.checked ? null : 10)}
                                className="rounded"
                                title="Unlimited"
                              />
                            )}
                            {cfg.features[key] === null ? (
                              <span className="text-[11px] text-[#0d9e8a] font-semibold">∞</span>
                            ) : (
                              <input type="number"
                                value={cfg.features[key] as number ?? 0}
                                onChange={e => patchFeature(planKey, key, Number(e.target.value))}
                                className="w-full border border-[#e5e8ef] rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Boolean features */}
                  <div>
                    <p className="text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold mb-2">Features</p>
                    <div className="space-y-2">
                      {BOOL_FEATURES.map(({ key, label }) => {
                        const enabled = !!cfg.features[key]
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-[11px] text-[#4a5568]">{label}</span>
                            <button onClick={() => patchFeature(planKey, key, !enabled)}>
                              {enabled
                                ? <ToggleRight className="h-5 w-5 text-[#2d6ac8]" />
                                : <ToggleLeft className="h-5 w-5 text-[#9aa3b2]" />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <Button
                    variant="navy"
                    size="sm"
                    className="w-full"
                    disabled={!isDirty || saveMutation.isPending}
                    loading={saveMutation.isPending}
                    iconLeft={<Save className="h-3.5 w-3.5" />}
                    onClick={() => cfg && saveMutation.mutate({ plan: planKey, data: cfg })}
                  >
                    {isDirty ? 'Save Changes' : 'No Changes'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BillingTab() {
  const qc = useQueryClient()
  const [subFilter, setSubFilter] = useState('')
  const [editSub, setEditSub] = useState<Subscription | null>(null)
  const [showTxForm, setShowTxForm] = useState(false)
  const [txForm, setTxForm] = useState({ user_id: '', amount_inr: 0, type: 'payment', plan: 'pro', billing_cycle: 'monthly', notes: '' })

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => api.admin.getSubscriptions(),
  })
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['admin', 'transactions'],
    queryFn: () => api.admin.getTransactions(),
  })

  const subs: Subscription[] = ((subsData as Subscription[] | undefined) ?? []).filter((s: Subscription) =>
    !subFilter || s.email?.toLowerCase().includes(subFilter.toLowerCase()) || s.name?.toLowerCase().includes(subFilter.toLowerCase())
  )
  const txs = (txData as unknown[] | undefined) ?? []

  const patchSub = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: unknown }) => api.admin.patchSubscription(userId, data),
    onSuccess: () => { toast.success('Subscription updated'); setEditSub(null); qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const createTx = useMutation({
    mutationFn: (data: unknown) => api.admin.createTransaction(data),
    onSuccess: () => { toast.success('Transaction recorded'); setShowTxForm(false); qc.invalidateQueries({ queryKey: ['admin', 'transactions'] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      {/* Subscriptions list */}
      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-[#0f1729]">All Subscriptions</CardTitle>
            <input placeholder="Filter by name or email…"
              value={subFilter} onChange={e => setSubFilter(e.target.value)}
              className="border border-[#e5e8ef] rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30 w-56"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {subsLoading ? (
            <div className="p-5 space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e5e8ef]">
                    {['User', 'Plan', 'Status', 'Billing', 'Period End', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 50).map((s, i) => (
                    <tr key={i} className="border-b border-[#f4f6fb] hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-[#0f1729]">{s.name}</p>
                        <p className="text-[#9aa3b2]">{s.email}</p>
                      </td>
                      <td className="px-4 py-2.5"><PlanBadge plan={s.plan} /></td>
                      <td className="px-4 py-2.5"><StatusDot status={s.status} /></td>
                      <td className="px-4 py-2.5 text-[#4a5568] capitalize">{s.billing_cycle ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[#4a5568]">{s.current_period_end?.slice(0, 10) ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEditSub(s)}
                          className="text-[#2d6ac8] hover:underline font-medium text-[11px]">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {subs.length === 0 && (
                <div className="p-8 text-center text-[#9aa3b2] text-sm">No subscriptions found</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit subscription modal */}
      {editSub && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditSub(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-[#0f1729] mb-4">Edit Subscription — {editSub.email}</h3>
            <div className="space-y-3">
              {[
                { label: 'Plan', field: 'plan', type: 'select', opts: ['free', 'pro', 'organization'] },
                { label: 'Status', field: 'status', type: 'select', opts: ['active', 'trialing', 'past_due', 'canceled', 'paused'] },
                { label: 'Billing Cycle', field: 'billing_cycle', type: 'select', opts: ['monthly', 'annual'] },
                { label: 'Period End (ISO date)', field: 'current_period_end', type: 'text', opts: [] },
              ].map(({ label, field, type, opts }) => (
                <div key={field}>
                  <label className="text-[11px] text-[#9aa3b2] font-medium block mb-1">{label}</label>
                  {type === 'select' ? (
                    <select value={(editSub as Record<string, string>)[field] ?? ''}
                      onChange={e => setEditSub(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                      className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30">
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={(editSub as Record<string, string>)[field] ?? ''}
                      onChange={e => setEditSub(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                      className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30"
                      placeholder="YYYY-MM-DDTHH:mm:ss.000Z"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="navy" size="sm" className="flex-1"
                loading={patchSub.isPending}
                onClick={() => patchSub.mutate({ userId: editSub.user_id, data: { plan: editSub.plan, status: editSub.status, billing_cycle: editSub.billing_cycle, current_period_end: editSub.current_period_end } })}>
                Save
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditSub(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Billing transactions */}
      <Card className="border-[#e5e8ef]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-[#0f1729]">Billing Transactions</CardTitle>
            <Button variant="navy" size="sm" iconLeft={<DollarSign className="h-3.5 w-3.5" />}
              onClick={() => setShowTxForm(true)}>
              Log Transaction
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="p-5 space-y-3">{[0, 1].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : txs.length === 0 ? (
            <div className="p-8 text-center">
              <CreditCard className="h-8 w-8 text-[#e5e8ef] mx-auto mb-2" />
              <p className="text-[#9aa3b2] text-sm">No transactions recorded yet.</p>
              <p className="text-[#9aa3b2] text-[12px] mt-1">Stripe & Razorpay webhooks will auto-log payments, or log manually above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e5e8ef]">
                    {['User', 'Amount', 'Plan', 'Type', 'Gateway', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#9aa3b2] uppercase tracking-wide font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.slice(0, 50).map((t: Record<string, unknown>, i: number) => (
                    <tr key={i} className="border-b border-[#f4f6fb] hover:bg-[#f8fafc]">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-[#0f1729]">{String(t.name ?? '—')}</p>
                        <p className="text-[#9aa3b2]">{String(t.email ?? '')}</p>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-[#0f1729]">₹{fmt(paise2inr(Number(t.amount_inr ?? 0)))}</td>
                      <td className="px-4 py-2.5"><PlanBadge plan={String(t.plan ?? 'free')} /></td>
                      <td className="px-4 py-2.5 capitalize text-[#4a5568]">{String(t.type ?? '')}</td>
                      <td className="px-4 py-2.5 text-[#4a5568]">{String(t.gateway ?? '')}</td>
                      <td className="px-4 py-2.5"><StatusDot status={String(t.status ?? '')} /></td>
                      <td className="px-4 py-2.5 font-mono text-[#9aa3b2]">{String(t.created_at ?? '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log transaction modal */}
      {showTxForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowTxForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-[#0f1729] mb-4">Log Billing Transaction</h3>
            <div className="space-y-3">
              {[
                { label: 'User ID (optional)', field: 'user_id', type: 'text' },
                { label: 'Amount (₹ paise, e.g. 399900 = ₹3999)', field: 'amount_inr', type: 'number' },
                { label: 'Notes', field: 'notes', type: 'text' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="text-[11px] text-[#9aa3b2] font-medium block mb-1">{label}</label>
                  <input type={type} value={(txForm as Record<string, unknown>)[field] as string ?? ''}
                    onChange={e => setTxForm(p => ({ ...p, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30"
                  />
                </div>
              ))}
              {[
                { label: 'Type', field: 'type', opts: ['payment', 'refund', 'credit', 'chargeback'] },
                { label: 'Plan', field: 'plan', opts: ['free', 'pro', 'organization'] },
                { label: 'Billing Cycle', field: 'billing_cycle', opts: ['monthly', 'annual'] },
              ].map(({ label, field, opts }) => (
                <div key={field}>
                  <label className="text-[11px] text-[#9aa3b2] font-medium block mb-1">{label}</label>
                  <select value={(txForm as Record<string, string>)[field]}
                    onChange={e => setTxForm(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#2d6ac8]/30">
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="navy" size="sm" className="flex-1" loading={createTx.isPending}
                onClick={() => createTx.mutate(txForm)}>
                Record
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowTxForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  usePageTitle('Admin Analytics')
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [tab, setTab] = useState<TabId>('overview')

  const isAdmin = ADMIN_ROLES.includes((user?.role ?? '') as string)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => api.admin.getAnalytics(),
    enabled: isAdmin,
    staleTime: 60_000,
  })

  const analytics: Analytics | undefined = data as Analytics | undefined

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 text-[#e5e8ef] mx-auto mb-3" />
          <h1 className="text-xl font-bold text-[#0f1729] mb-2">Access Restricted</h1>
          <p className="text-[#9aa3b2] text-sm mb-4">Admin, developer, or owner role required.</p>
          <Button variant="navy" size="sm" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-[#e5e8ef] transition-all text-[#9aa3b2] hover:text-[#4a5568]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <h1 className="text-[22px] font-black text-[#0f1729]">Admin Analytics</h1>
              <p className="text-[13px] text-[#9aa3b2] mt-0.5">Business intelligence, plan management & billing — visible to admins only</p>
            </div>
            <button onClick={() => refetch()}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e5e8ef] bg-white text-[12px] text-[#4a5568] hover:bg-[#f4f6fb] transition-all', isFetching && 'opacity-60')}>
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white border border-[#e5e8ef] rounded-xl p-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all',
                  tab === id
                    ? 'bg-[#1e2d4e] text-white shadow-sm'
                    : 'text-[#9aa3b2] hover:text-[#4a5568] hover:bg-[#f4f6fb]'
                )}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Tab content */}
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'overview'    && <OverviewTab    data={analytics} loading={isLoading} />}
          {tab === 'revenue'     && <RevenueTab     data={analytics} loading={isLoading} />}
          {tab === 'retention'   && <RetentionTab   data={analytics} loading={isLoading} />}
          {tab === 'unit-econ'   && <UnitEconTab    data={analytics} loading={isLoading} />}
          {tab === 'plan-config' && <PlanConfigTab />}
          {tab === 'billing'     && <BillingTab />}
        </motion.div>
      </div>
    </div>
  )
}
