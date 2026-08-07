import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Brain, Sliders, BarChart3, RefreshCw, Save, RotateCcw, Zap,
  AlertTriangle, CheckCircle, TrendingUp, Clock, ChevronLeft,
  Route, CircleDot, DollarSign,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { usePlan } from '../../contexts/PlanContext'
import { PlanGate } from '../../components/ui/plan-gate'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { ProgressBar } from '../../components/ui/progress-bar'
import { cn } from '../../lib/utils'

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

interface AiConfig {
  models: {
    analyse_drawing:   string
    estimate_cost:     string
    estimate_assembly: string
    kb_query:          string
    supplier_suggest:  string
  }
  rate_limits: { interactive_per_hour: number; bulk_per_hour: number }
  confidence_gate: number; margin_pct: number; max_batch_items: number; bulk_concurrency: number
}

interface AiUsage {
  since: string
  total_calls: number
  total_cost_usd: number
  by_provider: Record<string, { calls: number; cost: number; inputTokens: number; outputTokens: number }>
  by_task: Record<string, { calls: number; cost: number }>
  by_user: { user_id: string; total_cost: number; total_calls: number }[]
  by_day: Record<string, number>
}

interface RouteRow { task: string; provider: string; model: string; is_overridden: boolean }
interface ProviderStatus { id: string; displayName: string; available: boolean }

const AVAILABLE_MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',         tier: 'Fast & cheap',   color: 'text-green-600' },
  { id: 'claude-sonnet-4-20250514',   label: 'Sonnet 4 (stable)', tier: 'Balanced',        color: 'text-blue-700' },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6',        tier: 'Latest balanced', color: 'text-blue-600' },
  { id: 'claude-opus-4-8',            label: 'Opus 4.8',          tier: 'Most capable',    color: 'text-brand' },
  { id: 'gpt-4o',                     label: 'GPT-4o',            tier: 'OpenAI',          color: 'text-emerald-600' },
  { id: 'gpt-4o-mini',                label: 'GPT-4o mini',       tier: 'OpenAI fast',     color: 'text-emerald-500' },
  { id: 'gemini-2.0-flash',           label: 'Gemini Flash 2.0',  tier: 'Google',          color: 'text-indigo-600' },
]

const TASK_LABELS: Record<string, string> = {
  costing:            'Cost Estimation',
  bulk_costing:       'Bulk Costing',
  cad_costing:        'CAD / 3D Model',
  kb_summary:         'KB Summary',
  supplier_suggest:   'Supplier Suggest',
  supplier_recommend: 'Supplier Recommend',
  negotiation:        'Negotiation Report',
  clarification:      'Clarification',
  extraction:         'Extraction',
  generic:            'Generic / Query',
}

const LABEL_CLS = 'block text-xs font-medium text-[#4a5568] mb-1'
const INPUT_CLS = 'w-full border border-[#e5e8ef] rounded-lg px-3 py-2 text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors'

function AccessDenied() {
  const navigate = useNavigate()
  return (
    <div className="page-content flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[#0f1729] mb-2">Access Restricted</h1>
        <p className="text-sm text-[#9aa3b2] mb-6">Restricted to administrators, CEOs, developers, and owners.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')} iconLeft={<ChevronLeft className="w-4 h-4" />}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  )
}

// ─── Inner page (all hooks here — no early returns above hooks) ───────────────

function AiControlInner() {
  const queryClient = useQueryClient()
  const [localConfig, setLocalConfig] = useState<AiConfig | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const { data: config, isLoading: configLoading } = useQuery<AiConfig>({
    queryKey: ['admin-ai-config'],
    queryFn:  () => api.admin.getAiConfig(),
  })

  useEffect(() => {
    if (config && !localConfig) setLocalConfig(config)
  }, [config])

  const { data: usage, isLoading: usageLoading } = useQuery<AiUsage>({
    queryKey:       ['admin-ai-usage'],
    queryFn:        () => api.admin.getAiUsage(),
    refetchInterval: 60_000,
  })

  const { data: providers } = useQuery<ProviderStatus[]>({
    queryKey: ['admin-providers'],
    queryFn:  () => api.admin.getProviders(),
  })

  const { data: routes, isLoading: routesLoading } = useQuery<RouteRow[]>({
    queryKey: ['admin-routes'],
    queryFn:  () => api.admin.getRoutes(),
  })

  const saveMut = useMutation({
    mutationFn: () => api.admin.patchAiConfig(localConfig!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-ai-config'], updated)
      setIsDirty(false)
      toast.success('AI configuration saved')
    },
    onError: () => toast.error('Failed to save configuration'),
  })

  const resetMut = useMutation({
    mutationFn: () => api.admin.resetAiConfig(),
    onSuccess: (defaults) => {
      queryClient.setQueryData(['admin-ai-config'], defaults)
      setLocalConfig(defaults)
      setIsDirty(false)
      toast.success('Configuration reset to defaults')
    },
    onError: () => toast.error('Failed to reset configuration'),
  })

  const setRouteMut = useMutation({
    mutationFn: ({ task, provider, model }: { task: string; provider: string; model: string }) =>
      api.admin.setRoute(task, { provider, model }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-routes'] })
      toast.success('Route override saved')
    },
    onError: () => toast.error('Failed to save route'),
  })

  const deleteRouteMut = useMutation({
    mutationFn: (task: string) => api.admin.deleteRoute(task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-routes'] })
      toast.success('Route reset to default')
    },
  })

  function patch(updates: Partial<AiConfig>) {
    setLocalConfig(prev => {
      if (!prev) return prev
      return { ...prev, ...updates, models: { ...prev.models, ...(updates.models ?? {}) }, rate_limits: { ...prev.rate_limits, ...(updates.rate_limits ?? {}) } }
    })
    setIsDirty(true)
  }

  const effective = localConfig ?? config

  if (configLoading || !effective) {
    return (
      <div className="page-content space-y-6">
        <Skeleton variant="rect" height="2.5rem" width="14rem" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton variant="rect" height="22rem" />
          <Skeleton variant="rect" height="22rem" />
        </div>
        <Skeleton variant="rect" height="14rem" />
      </div>
    )
  }

  const totalCost = usage?.total_cost_usd ?? 0

  // "Savings vs all-Sonnet" — compare actual cost with sonnet-4-6 pricing ($3/$15 per M tokens)
  const SONNET_INPUT_PER_M  = 3.0
  const SONNET_OUTPUT_PER_M = 15.0
  const totalSonnetCost = Object.values(usage?.by_provider ?? {}).reduce((acc, p) => {
    return acc + (p.inputTokens / 1_000_000) * SONNET_INPUT_PER_M + (p.outputTokens / 1_000_000) * SONNET_OUTPUT_PER_M
  }, 0)
  const savingsVsSonnet = Math.max(0, totalSonnetCost - totalCost)

  // Daily spend chart data — last 30 days
  const spendChartData = (() => {
    const days: { date: string; cost: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000)
      const key = d.toISOString().slice(0, 10)
      days.push({ date: key.slice(5), cost: parseFloat(((usage?.by_day?.[key] ?? 0)).toFixed(6)) })
    }
    return days
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">AI Cost Control</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Multi-provider routing, rate limits, and cost tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unsaved changes
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => resetMut.mutate()} loading={resetMut.isPending}
            iconLeft={<RotateCcw className="w-3.5 h-3.5" />}>Reset</Button>
          <Button variant="primary" size="sm" onClick={() => saveMut.mutate()} loading={saveMut.isPending}
            disabled={!isDirty} iconLeft={<Save className="w-3.5 h-3.5" />}>Save Changes</Button>
        </div>
      </div>

      {/* Provider status */}
      {providers && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <CircleDot className="w-4 h-4 text-indigo-600" />
              </div>
              <CardTitle>Active Providers</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { id: 'anthropic', displayName: 'Anthropic (Claude)', envVar: 'ANTHROPIC_API_KEY' },
                { id: 'openai',    displayName: 'OpenAI (GPT)',        envVar: 'OPENAI_API_KEY' },
                { id: 'google',    displayName: 'Google (Gemini)',     envVar: 'GEMINI_API_KEY' },
              ].map(p => {
                const live = providers.find(lp => lp.id === p.id)
                const available = live?.available ?? false
                return (
                  <div key={p.id} className={cn(
                    'flex items-start gap-2.5 p-3 rounded-xl border',
                    available ? 'bg-emerald-50 border-emerald-200' : 'bg-surface-3 border-[#e5e8ef]',
                  )}>
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', available ? 'bg-emerald-500' : 'bg-[#c8cdd8]')} />
                    <div>
                      <p className="text-xs font-semibold text-[#0f1729]">{p.displayName}</p>
                      <p className={cn('text-xs mt-0.5', available ? 'text-emerald-600' : 'text-[#9aa3b2]')}>
                        {available ? 'Active' : `Set ${p.envVar}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Legacy model router (config file) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-brand" />
              </div>
              <CardTitle>Config File Models</CardTitle>
            </div>
            <p className="text-xs text-[#9aa3b2] mt-1">Stored in ai-config.json — used by existing routes</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.entries(effective.models) as [string, string][]).map(([op, modelId]) => (
              <div key={op} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-[#4a5568] mb-1">{TASK_LABELS[op] ?? op}</label>
                  <select
                    value={modelId}
                    onChange={(e) => patch({ models: { ...effective.models, [op]: e.target.value } })}
                    className={INPUT_CLS}
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cost Parameters */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-navy" />
              </div>
              <CardTitle>Cost Parameters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Interactive limit (calls/hr)', key: 'interactive_per_hour', min: 1, max: 100,  type: 'rate', help: 'Per-user interactive AI budget' },
                { label: 'Bulk limit (calls/hr)',        key: 'bulk_per_hour',        min: 1, max: 1000, type: 'rate', help: 'Per-user batch AI budget' },
                { label: 'Confidence gate (%)',          key: 'confidence_gate',      min: 0, max: 100,  type: 'top',  help: 'Min confidence to show cost lines' },
                { label: 'Base margin (%)',              key: 'margin_pct',           min: 0, max: 100,  type: 'top',  help: 'Applied once at assembly parent' },
                { label: 'Max batch items',              key: 'max_batch_items',      min: 1, max: 100,  type: 'top' },
                { label: 'Bulk concurrency',             key: 'bulk_concurrency',     min: 1, max: 16,   type: 'top' },
              ].map(({ label, key, min, max, type, help }) => {
                const val = type === 'rate' ? effective.rate_limits[key as keyof typeof effective.rate_limits] : (effective as unknown as Record<string, unknown>)[key] as number
                return (
                  <div key={key}>
                    <label className={LABEL_CLS}>{label}</label>
                    <input type="number" min={min} max={max} value={val}
                      onChange={e => {
                        if (type === 'rate') patch({ rate_limits: { ...effective.rate_limits, [key]: Number(e.target.value) } })
                        else patch({ [key]: Number(e.target.value) } as Partial<AiConfig>)
                      }}
                      className={INPUT_CLS}
                    />
                    {help && <p className="text-xs text-[#9aa3b2] mt-1">{help}</p>}
                  </div>
                )
              })}
            </div>
            <div className="pt-2 border-t border-[#e5e8ef]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#4a5568]">Confidence threshold</span>
                <span className="text-xs font-mono font-medium text-[#0f1729]">{effective.confidence_gate}%</span>
              </div>
              <ProgressBar
                value={effective.confidence_gate}
                variant={effective.confidence_gate >= 80 ? 'success' : effective.confidence_gate >= 60 ? 'warning' : 'danger'}
                size="sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Route Overrides (DB-backed) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Route className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <CardTitle>Live Route Overrides</CardTitle>
              <p className="text-xs text-[#9aa3b2] mt-0.5">Per-task provider/model overrides — takes effect immediately, no redeploy</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {routesLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} variant="rect" height="3rem" />)}</div>
          ) : (
            <div className="divide-y divide-[#f1f3f7]">
              {(routes ?? []).map((row) => (
                <div key={row.task} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-36 flex-shrink-0">
                    <p className="text-xs font-medium text-[#0f1729]">{TASK_LABELS[row.task] ?? row.task}</p>
                    {row.is_overridden && (
                      <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        Overridden
                      </span>
                    )}
                  </div>
                  <select
                    key={`${row.task}-${row.provider}-${row.model}`}
                    defaultValue={`${row.provider}/${row.model}`}
                    onChange={e => {
                      const [provider, ...rest] = e.target.value.split('/')
                      setRouteMut.mutate({ task: row.task, provider, model: rest.join('/') })
                    }}
                    className="flex-1 border border-[#e5e8ef] rounded-lg px-3 py-1.5 text-xs text-[#0f1729] bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                  >
                    {['anthropic/claude-haiku-4-5-20251001','anthropic/claude-sonnet-4-20250514','anthropic/claude-opus-4-8','openai/gpt-4o','openai/gpt-4o-mini','google/gemini-2.0-flash'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {row.is_overridden && (
                    <Button variant="ghost" size="sm" onClick={() => deleteRouteMut.mutate(row.task)} className="text-[#9aa3b2] hover:text-[#4a5568] flex-shrink-0">
                      Reset
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <CardTitle>AI Usage (Last 30 Days)</CardTitle>
                <p className="text-xs text-[#9aa3b2] mt-0.5">From ai_usage_log</p>
              </div>
            </div>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-ai-usage'] })}
              className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors text-[#9aa3b2]">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} variant="rect" height="2.5rem" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Total Calls</p>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono mt-1">{usage?.total_calls ?? 0}</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <div className="flex items-center gap-1 mb-1"><DollarSign className="w-3.5 h-3.5 text-[#9aa3b2]" /><p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Est. Cost</p></div>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono">${totalCost.toFixed(4)}</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <div className="flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5 text-[#9aa3b2]" /><p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Interactive</p></div>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono">{effective.rate_limits.interactive_per_hour}<span className="text-sm font-normal text-[#9aa3b2]">/hr</span></p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <div className="flex items-center gap-1 mb-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /><p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Savings vs Sonnet</p></div>
                  <p className="text-2xl font-bold text-emerald-600 font-mono">${savingsVsSonnet.toFixed(4)}</p>
                  <p className="text-[10px] text-[#9aa3b2] mt-0.5">vs all-Sonnet 4.6 pricing</p>
                </div>
              </div>

              {/* Daily spend area chart */}
              {spendChartData.some(d => d.cost > 0) && (
                <div>
                  <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide mb-3">Daily Spend (30 days)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={spendChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#e85c1a" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#e85c1a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f7" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9aa3b2' }} tickLine={false} axisLine={false} interval={6} />
                      <YAxis tick={{ fontSize: 10, fill: '#9aa3b2' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(4)}`} width={60} />
                      <Tooltip
                        formatter={(v: number) => [`$${v.toFixed(6)}`, 'Cost']}
                        contentStyle={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="cost" stroke="#e85c1a" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* By-task breakdown */}
              {usage?.by_task && Object.keys(usage.by_task).length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide">By Task</p>
                  {Object.entries(usage.by_task).sort((a, b) => b[1].calls - a[1].calls).map(([task, info]) => {
                    const maxCalls = Math.max(...Object.values(usage.by_task).map(t => t.calls), 1)
                    return (
                      <div key={task} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#4a5568]">{TASK_LABELS[task] ?? task}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[#9aa3b2]">${info.cost.toFixed(4)}</span>
                            <span className="text-xs font-mono font-medium text-[#0f1729]">{info.calls} calls</span>
                          </div>
                        </div>
                        <ProgressBar value={(info.calls / maxCalls) * 100} size="sm" variant="navy" />
                      </div>
                    )
                  })}
                </div>
              )}

              {!usage?.total_calls && (
                <p className="text-sm text-[#9aa3b2] text-center py-6">No AI activity logged yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Exported page (gate check before rendering inner) ────────────────────────

export default function AiControl() {
  usePageTitle('AI Control')
  const { hasRole } = useAuth()
  const { isFeatureEnabled } = usePlan()

  if (!hasRole(ADMIN_ROLES)) return <AccessDenied />
  if (!isFeatureEnabled('ai_cost_control')) {
    return (
      <div className="page-content">
        <PlanGate feature="ai_cost_control" />
      </div>
    )
  }
  return <AiControlInner />
}
