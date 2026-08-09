import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Brain, Sliders, BarChart3, RefreshCw, Save, RotateCcw, Zap,
  AlertTriangle, CheckCircle, TrendingUp, Clock, ChevronLeft,
  Route, CircleDot, DollarSign, PlayCircle, XCircle, Download,
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
  { id: 'qwen2.5:7b',                 label: 'Qwen 2.5 7B',       tier: 'Ollama — fast',   color: 'text-violet-600' },
  { id: 'qwen2.5:14b',                label: 'Qwen 2.5 14B',      tier: 'Ollama — balanced', color: 'text-violet-600' },
  { id: 'qwen2.5:72b',                label: 'Qwen 2.5 72B',      tier: 'Ollama — capable', color: 'text-violet-700' },
  { id: 'llama3.1:8b',                label: 'Llama 3.1 8B',      tier: 'Ollama — fast',   color: 'text-violet-600' },
  { id: 'llama3.2:3b',                label: 'Llama 3.2 3B',      tier: 'Ollama — ultra-fast', color: 'text-violet-500' },
  { id: 'gemma2:9b',                  label: 'Gemma 2 9B',        tier: 'Ollama — efficient', color: 'text-violet-600' },
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

const PROVIDER_COLORS: Record<string, { dot: string; label: string; bg: string }> = {
  anthropic: { dot: '#e85c1a', label: 'Anthropic', bg: 'bg-orange-50' },
  openai:    { dot: '#22c55e', label: 'OpenAI',    bg: 'bg-green-50' },
  google:    { dot: '#3b82f6', label: 'Google',    bg: 'bg-blue-50' },
  ollama:    { dot: '#7c3aed', label: 'Ollama',    bg: 'bg-violet-50' },
  together:  { dot: '#0ea5e9', label: 'Together AI', bg: 'bg-sky-50' },
}

function ProviderDot({ provider }: { provider: string }) {
  const cfg = PROVIDER_COLORS[provider]
  if (!cfg) return <span className="w-2 h-2 rounded-full bg-[#c8cdd8] flex-shrink-0" />
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: cfg.dot }}
      title={cfg.label}
    />
  )
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

  const { data: ollamaModels, refetch: refetchOllama } = useQuery<Array<{ name: string; size: number; modified_at: string }>>({
    queryKey:   ['admin-ollama-models'],
    queryFn:    () => api.admin.getOllamaModels(),
    retry:      false,
    staleTime:  30_000,
  })

  const [ollamaTestResult, setOllamaTestResult] = useState<{
    ok: boolean; elapsed_ms?: number; raw?: string; error?: string
  } | null>(null)
  const [ollamaTestLoading, setOllamaTestLoading] = useState(false)

  // Pull state
  const [pullModel, setPullModel] = useState('')
  const [pullStatus, setPullStatus] = useState<{
    active: boolean; model: string; message: string; percent: number | null; done: boolean; error: string | null
  } | null>(null)
  const pullEsRef = useRef<EventSource | null>(null)

  function startPull(modelName: string) {
    const model = modelName.trim()
    if (!model) { toast.error('Enter a model name'); return }
    if (pullEsRef.current) { pullEsRef.current.close() }

    const token = localStorage.getItem('aq_token') ?? ''
    const base  = api.admin.ollamaPullBase()

    // Use fetch + ReadableStream for SSE with auth header
    setPullStatus({ active: true, model, message: 'Starting…', percent: null, done: false, error: null })

    fetch(`${base}/admin/ollama/pull`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ model }),
    }).then(async (resp) => {
      if (!resp.ok || !resp.body) {
        setPullStatus(p => p ? { ...p, active: false, error: `HTTP ${resp.status}` } : null)
        return
      }
      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as {
              status: string; message?: string; percent?: number | null; error?: string; progress?: string
            }
            setPullStatus(p => {
              if (!p) return p
              const done = ev.status === 'done'
              const isErr = ev.status === 'error'
              if (done) { refetchOllama(); toast.success(`${model} downloaded`) }
              if (isErr) toast.error(ev.error ?? 'Pull failed')
              return {
                ...p,
                active:  !done && !isErr,
                message: ev.message ?? (done ? 'Complete' : p.message),
                percent: ev.percent ?? p.percent,
                done,
                error:   isErr ? (ev.error ?? 'Pull failed') : null,
              }
            })
          } catch { /* malformed SSE line */ }
        }
      }
    }).catch(err => {
      setPullStatus(p => p ? { ...p, active: false, error: err.message } : null)
    })
  }

  async function runOllamaTest() {
    setOllamaTestLoading(true)
    setOllamaTestResult(null)
    try {
      const d = await api.admin.testOllama()
      setOllamaTestResult({ ok: d.parsed_ok, elapsed_ms: d.elapsed_ms, raw: d.raw_response })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
             ?? (e as Error).message
      setOllamaTestResult({ ok: false, error: msg })
    } finally {
      setOllamaTestLoading(false)
    }
  }

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

  // 3C.7 — Projected cost calculator: per-task savings if switched to cheapest model
  // Model costs per M tokens (input / output)
  const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    'anthropic/claude-sonnet-4-20250514': { input: 3.00,  output: 15.00 },
    'anthropic/claude-haiku-4-5-20251001':{ input: 0.25,  output: 1.25  },
    'anthropic/claude-opus-4-8':          { input: 15.00, output: 75.00 },
    'openai/gpt-4o':                      { input: 2.50,  output: 10.00 },
    'openai/gpt-4o-mini':                 { input: 0.15,  output: 0.60  },
    'google/gemini-2.0-flash':            { input: 0.10,  output: 0.40  },
  }
  // For each high-volume task, compute potential monthly saving if switched to gpt-4o-mini
  const CHEAPER_ALT: Record<string, { label: string; model: string }> = {
    bulk_costing:       { label: 'switch to Ollama Qwen 2.5 14B', model: 'ollama/qwen2.5:14b' },
    kb_summary:         { label: 'switch to Ollama Qwen 2.5 7B',  model: 'ollama/qwen2.5:7b' },
    supplier_suggest:   { label: 'switch to Ollama Qwen 2.5 7B',  model: 'ollama/qwen2.5:7b' },
    extraction:         { label: 'switch to Ollama Qwen 2.5 14B', model: 'ollama/qwen2.5:14b' },
    clarification:      { label: 'switch to Ollama Qwen 2.5 7B',  model: 'ollama/qwen2.5:7b' },
  }
  const projectedSavings: { task: string; saving: number; alt: string }[] = []
  if (usage?.by_task) {
    for (const [task, info] of Object.entries(usage.by_task)) {
      const alt = CHEAPER_ALT[task]
      if (!alt || info.calls === 0) continue
      const currentRoute = routes?.find(r => r.task === task)
      const currentKey = currentRoute ? `${currentRoute.provider}/${currentRoute.model}` : 'anthropic/claude-sonnet-4-20250514'
      const currentCost = MODEL_COSTS[currentKey]
      const altCost     = MODEL_COSTS[alt.model]
      if (!currentCost || !altCost) continue
      // Estimate tokens from calls (rough avg: 1500 input, 800 output)
      const avgInput  = info.calls > 0 ? 1500 : 0
      const avgOutput = info.calls > 0 ? 800  : 0
      const actualPerCall  = (avgInput * currentCost.input + avgOutput * currentCost.output) / 1_000_000
      const altPerCall     = (avgInput * altCost.input    + avgOutput * altCost.output)     / 1_000_000
      const saving = Math.max(0, (actualPerCall - altPerCall) * info.calls)
      if (saving > 0.00001) projectedSavings.push({ task, saving, alt: alt.label })
    }
    projectedSavings.sort((a, b) => b.saving - a.saving)
  }

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
                { id: 'ollama',    displayName: 'Ollama (Local LLM)',  envVar: 'OLLAMA_ENABLED=true' },
                { id: 'together',  displayName: 'Together AI (Cloud)', envVar: 'TOGETHER_API_KEY' },
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
              {(routes ?? []).map((row) => {
                const provCfg = PROVIDER_COLORS[row.provider]
                return (
                  <div key={row.task} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    {/* Task node */}
                    <div className="w-36 flex-shrink-0 bg-surface-2 border border-[#e5e8ef] rounded-lg px-2.5 py-1.5">
                      <p className="text-xs font-medium text-[#0f1729] leading-tight">{TASK_LABELS[row.task] ?? row.task}</p>
                      {row.is_overridden && (
                        <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded mt-0.5 inline-block leading-none">
                          Override
                        </span>
                      )}
                    </div>

                    {/* Arrow with provider dot */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="w-6 h-px bg-[#c8cdd8]" />
                      <ProviderDot provider={row.provider} />
                      <div className="w-1 h-px bg-[#c8cdd8]" />
                      {/* Arrowhead */}
                      <svg width="6" height="8" viewBox="0 0 6 8" className="text-[#c8cdd8] flex-shrink-0">
                        <path d="M0 0 L6 4 L0 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Model select — styled as a "model node" */}
                    <div className={cn('flex-1 rounded-lg border overflow-hidden', provCfg?.bg ?? 'bg-surface-2', row.is_overridden ? 'border-purple-200' : 'border-[#e5e8ef]')}>
                      <select
                        key={`${row.task}-${row.provider}-${row.model}`}
                        defaultValue={`${row.provider}/${row.model}`}
                        onChange={e => {
                          const [provider, ...rest] = e.target.value.split('/')
                          setRouteMut.mutate({ task: row.task, provider, model: rest.join('/') })
                        }}
                        className="w-full bg-transparent px-3 py-1.5 text-xs text-[#0f1729] focus:outline-none focus:ring-1 focus:ring-brand/30 cursor-pointer"
                      >
                        {[
                          'anthropic/claude-haiku-4-5-20251001',
                          'anthropic/claude-sonnet-4-20250514',
                          'anthropic/claude-opus-4-8',
                          'openai/gpt-4o',
                          'openai/gpt-4o-mini',
                          'google/gemini-2.0-flash',
                          'ollama/qwen2.5:7b',
                          'ollama/qwen2.5:14b',
                          'ollama/qwen2.5:72b',
                          'ollama/llama3.1:8b',
                          'ollama/llama3.2:3b',
                          'ollama/gemma2:9b',
                          'together/qwen2.5:14b',
                          'together/qwen2.5:7b',
                          'together/llama3.1:70b',
                          'together/llama3.1:8b',
                        ].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {row.is_overridden && (
                      <Button variant="ghost" size="sm" onClick={() => deleteRouteMut.mutate(row.task)} className="text-[#9aa3b2] hover:text-[#4a5568] flex-shrink-0">
                        Reset
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ollama Local LLM Setup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Zap className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <CardTitle>Ollama — Local LLM</CardTitle>
              <p className="text-xs text-[#9aa3b2] mt-0.5">Run open-weight models locally for zero token cost on high-volume tasks</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Live installed models */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide">Installed models (live)</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={runOllamaTest}
                  disabled={ollamaTestLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                  title="Send a test JSON prompt to verify Ollama end-to-end"
                >
                  {ollamaTestLoading
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <PlayCircle className="w-3 h-3" />}
                  Test
                </button>
                <button onClick={() => refetchOllama()} className="p-1 rounded hover:bg-surface-3 text-[#9aa3b2] transition-colors" title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Test result panel */}
            {ollamaTestResult && (
              <div className={cn(
                'rounded-xl border px-3 py-2.5 flex items-start gap-2',
                ollamaTestResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
              )}>
                {ollamaTestResult.ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  {ollamaTestResult.ok ? (
                    <p className="text-xs font-medium text-emerald-700">
                      Connection OK — {ollamaTestResult.elapsed_ms}ms
                      <span className="ml-2 font-mono text-[10px] text-emerald-600">{ollamaTestResult.raw}</span>
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-red-700">
                      {ollamaTestResult.error ?? 'Test failed'}
                    </p>
                  )}
                </div>
                <button onClick={() => setOllamaTestResult(null)} className="text-[#9aa3b2] hover:text-[#4a5568]">
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {!ollamaModels || ollamaModels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 p-4 text-center">
                <p className="text-xs text-violet-700 font-medium">No models detected</p>
                <p className="text-[10px] text-[#9aa3b2] mt-1">Set <code className="font-mono">OLLAMA_ENABLED=true</code> and start Ollama, then pull models below</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {ollamaModels.map(m => (
                  <div key={m.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-violet-50 border border-violet-100">
                    <span className="text-xs font-mono font-semibold text-violet-700">{m.name}</span>
                    <span className="text-[10px] text-[#9aa3b2]">{(m.size / 1e9).toFixed(1)} GB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 space-y-3">
            <p className="text-sm font-medium text-violet-800">Recommended models for this app</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { model: 'qwen2.5:14b',  role: 'Bulk Costing · Extraction',         why: 'Best structured JSON output, 128K context' },
                { model: 'qwen2.5:7b',   role: 'KB Summary · Supplier · Clarify',   why: 'Fast inference, good instruction following' },
                { model: 'qwen2.5:72b',  role: 'Complex Costing (optional)',         why: 'Near-Claude accuracy, requires 48GB VRAM' },
              ].map(({ model, role, why }) => {
                const installed = ollamaModels?.some(m => m.name === model || m.name.startsWith(model.split(':')[0]))
                return (
                  <div key={model} className={cn('bg-white rounded-lg border p-3', installed ? 'border-emerald-200' : 'border-violet-100')}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-xs font-mono font-semibold text-violet-700">{model}</p>
                      {installed && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">installed</span>}
                    </div>
                    <p className="text-xs text-[#4a5568]">{role}</p>
                    <p className="text-[10px] text-[#9aa3b2] mt-1">{why}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide">Setup (server .env)</p>
            <div className="bg-[#0f1729] rounded-xl p-4 font-mono text-xs space-y-1.5">
              <p className="text-[#c8cdd8]"><span className="text-violet-400">OLLAMA_ENABLED</span>=<span className="text-emerald-400">true</span></p>
              <p className="text-[#c8cdd8]"><span className="text-violet-400">OLLAMA_BASE_URL</span>=<span className="text-yellow-300">http://localhost:11434</span>  <span className="text-[#4a5568]"># default</span></p>
            </div>
          </div>

          {/* Interactive pull */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide">Pull a model</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. qwen2.5:14b"
                value={pullModel}
                onChange={e => setPullModel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startPull(pullModel)}
                className={INPUT_CLS + ' flex-1'}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => startPull(pullModel)}
                disabled={pullStatus?.active}
                iconLeft={<Download className="w-3.5 h-3.5" />}
              >
                Pull
              </Button>
            </div>

            {/* Quick-pull chips */}
            <div className="flex flex-wrap gap-1.5">
              {['qwen2.5:7b', 'qwen2.5:14b', 'qwen2.5:72b', 'llama3.1:8b', 'gemma2:9b'].map(m => {
                const installed = ollamaModels?.some(om => om.name === m || om.name.startsWith(m.split(':')[0]))
                return (
                  <button
                    key={m}
                    onClick={() => { setPullModel(m); startPull(m) }}
                    disabled={!!installed || pullStatus?.active}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[10px] font-mono border transition-colors',
                      installed
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                        : 'bg-violet-50 border-violet-100 text-violet-700 hover:bg-violet-100 disabled:opacity-40',
                    )}
                  >
                    {installed ? '✓ ' : ''}{m}
                  </button>
                )
              })}
            </div>

            {/* Pull progress panel */}
            {pullStatus && (
              <div className={cn(
                'rounded-xl border p-3 space-y-2',
                pullStatus.error   ? 'bg-red-50 border-red-200' :
                pullStatus.done    ? 'bg-emerald-50 border-emerald-200' :
                                     'bg-violet-50 border-violet-100',
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pullStatus.active && <RefreshCw className="w-3.5 h-3.5 text-violet-600 animate-spin" />}
                    {pullStatus.done   && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                    {pullStatus.error  && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                    <span className="text-xs font-mono font-semibold text-[#0f1729]">{pullStatus.model}</span>
                    {pullStatus.percent != null && (
                      <span className="text-xs font-mono text-violet-700">{pullStatus.percent}%</span>
                    )}
                  </div>
                  <button onClick={() => setPullStatus(null)} className="text-[#9aa3b2] hover:text-[#4a5568]">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                {pullStatus.percent != null && (
                  <ProgressBar value={pullStatus.percent} size="sm" variant="navy" />
                )}
                <p className="text-[10px] font-mono text-[#4a5568] truncate">
                  {pullStatus.error ?? pullStatus.message}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-medium">Tasks that stay on Claude regardless of Ollama settings</p>
              <p className="text-amber-700">Cost Estimation, CAD Costing (vision required), Negotiation Reports, Supplier Recommendation — these need high accuracy or image understanding that local models cannot match reliably.</p>
            </div>
          </div>
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

      {/* 3C.7 — Projected cost calculator */}
      {projectedSavings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Projected Savings Calculator</CardTitle>
                <p className="text-xs text-[#9aa3b2] mt-0.5">Based on last 30 days — switching high-volume tasks to cheaper models</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {projectedSavings.map(({ task, saving, alt }) => (
                <div key={task} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <div>
                    <p className="text-sm font-medium text-[#0f1729]">{TASK_LABELS[task] ?? task}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">{alt}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-700 font-mono">−${saving.toFixed(4)}/mo</p>
                    <p className="text-[10px] text-emerald-600">est. saving</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-[#e5e8ef]">
                <p className="text-sm font-semibold text-[#0f1729]">Total potential saving</p>
                <p className="text-lg font-bold text-emerald-700 font-mono">
                  −${projectedSavings.reduce((s, r) => s + r.saving, 0).toFixed(4)}/mo
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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
