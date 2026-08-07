import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Brain, Sliders, BarChart3, RefreshCw, Save, RotateCcw, Zap,
  AlertTriangle, CheckCircle, TrendingUp, Clock, ChevronLeft,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
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
  rate_limits: {
    interactive_per_hour: number
    bulk_per_hour:        number
  }
  confidence_gate: number
  margin_pct:      number
  max_batch_items: number
  bulk_concurrency: number
}

interface AiUsage {
  since: string
  total_calls: number
  by_action: { action: string; count: number }[]
}

const AVAILABLE_MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',   tier: 'Fast & cheap',      color: 'text-green-600' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6',  tier: 'Balanced',           color: 'text-blue-600' },
  { id: 'claude-sonnet-4-20250514',   label: 'Sonnet 4 (stable)', tier: 'Stable prod', color: 'text-blue-700' },
  { id: 'claude-opus-4-8',            label: 'Opus 4.8',    tier: 'Most capable',       color: 'text-brand' },
]

const OPERATION_LABELS: Record<keyof AiConfig['models'], string> = {
  analyse_drawing:   'Drawing Analysis',
  estimate_cost:     'Cost Estimation',
  estimate_assembly: 'Assembly Estimation',
  kb_query:          'KB Query / Chat',
  supplier_suggest:  'Supplier Discovery',
}

const OPERATION_ICONS: Record<keyof AiConfig['models'], React.ComponentType<{ className?: string }>> = {
  analyse_drawing:   Brain,
  estimate_cost:     Zap,
  estimate_assembly: TrendingUp,
  kb_query:          BarChart3,
  supplier_suggest:  Sliders,
}

const ACTION_LABEL: Record<string, string> = {
  ai_analyse_drawing:   'Drawing analysis',
  ai_estimate_cost:     'Cost estimation',
  ai_estimate_assembly: 'Assembly ops',
  ai_kb_query:          'KB query',
  ai_supplier_suggest:  'Supplier discovery',
  ai_config_update:     'Config update',
  ai_config_reset:      'Config reset',
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
        <p className="text-sm text-[#9aa3b2] mb-6">
          This section is restricted to administrators, CEOs, developers, and owners.
        </p>
        <Button variant="outline" onClick={() => navigate('/dashboard')} iconLeft={<ChevronLeft className="w-4 h-4" />}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  )
}

export default function AiControl() {
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()
  const [localConfig, setLocalConfig] = useState<AiConfig | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  if (!hasRole(ADMIN_ROLES)) return <AccessDenied />

  const { data: config, isLoading: configLoading } = useQuery<AiConfig>({
    queryKey: ['admin-ai-config'],
    queryFn: () => api.admin.getAiConfig(),
  })

  useEffect(() => {
    if (config && !localConfig) setLocalConfig(config)
  }, [config])

  const { data: usage, isLoading: usageLoading } = useQuery<AiUsage>({
    queryKey: ['admin-ai-usage'],
    queryFn: () => api.admin.getAiUsage(),
    refetchInterval: 60_000,
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

  function patch(updates: Partial<AiConfig>) {
    setLocalConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev, ...updates,
        models: { ...prev.models, ...(updates.models ?? {}) },
        rate_limits: { ...prev.rate_limits, ...(updates.rate_limits ?? {}) },
      }
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

  const topActions = usage?.by_action?.slice(0, 5) ?? []
  const maxCount = Math.max(...topActions.map(a => a.count), 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">AI Cost Control</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Configure model routing, rate limits, and cost parameters</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unsaved changes
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => resetMut.mutate()} loading={resetMut.isPending}
            iconLeft={<RotateCcw className="w-3.5 h-3.5" />}>
            Reset Defaults
          </Button>
          <Button variant="primary" size="sm" onClick={() => saveMut.mutate()} loading={saveMut.isPending}
            disabled={!isDirty} iconLeft={<Save className="w-3.5 h-3.5" />}>
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Router */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-brand" />
              </div>
              <CardTitle>Model Router</CardTitle>
            </div>
            <p className="text-xs text-[#9aa3b2] mt-1">Choose which Claude model handles each operation type</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(OPERATION_LABELS) as Array<keyof AiConfig['models']>).map((op) => {
              const Icon = OPERATION_ICONS[op]
              return (
                <div key={op} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#4a5568]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-[#4a5568] mb-1">
                      {OPERATION_LABELS[op]}
                    </label>
                    <select
                      value={effective.models[op]}
                      onChange={(e) => patch({ models: { ...effective.models, [op]: e.target.value } })}
                      className={INPUT_CLS}
                    >
                      {AVAILABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}

            {/* Model legend */}
            <div className="pt-2 border-t border-[#e5e8ef]">
              <p className="text-xs font-medium text-[#9aa3b2] mb-2">Model tiers</p>
              <div className="flex flex-wrap gap-3">
                {AVAILABLE_MODELS.map((m) => (
                  <span key={m.id} className={cn('text-xs', m.color)}>
                    {m.label} <span className="text-[#9aa3b2]">— {m.tier}</span>
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parameters */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-navy" />
              </div>
              <CardTitle>Cost Parameters</CardTitle>
            </div>
            <p className="text-xs text-[#9aa3b2] mt-1">Confidence gates, margin, and batch limits</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Interactive limit (calls/hr)</label>
                <input type="number" min={1} max={100} value={effective.rate_limits.interactive_per_hour}
                  onChange={(e) => patch({ rate_limits: { ...effective.rate_limits, interactive_per_hour: Number(e.target.value) } })}
                  className={INPUT_CLS} />
                <p className="text-xs text-[#9aa3b2] mt-1">Per-user interactive AI budget</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Bulk limit (calls/hr)</label>
                <input type="number" min={1} max={1000} value={effective.rate_limits.bulk_per_hour}
                  onChange={(e) => patch({ rate_limits: { ...effective.rate_limits, bulk_per_hour: Number(e.target.value) } })}
                  className={INPUT_CLS} />
                <p className="text-xs text-[#9aa3b2] mt-1">Per-user batch AI budget</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Confidence gate (%)</label>
                <input type="number" min={0} max={100} value={effective.confidence_gate}
                  onChange={(e) => patch({ confidence_gate: Number(e.target.value) })}
                  className={INPUT_CLS} />
                <p className="text-xs text-[#9aa3b2] mt-1">Min confidence to show cost lines</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Base margin (%)</label>
                <input type="number" min={0} max={100} value={effective.margin_pct}
                  onChange={(e) => patch({ margin_pct: Number(e.target.value) })}
                  className={INPUT_CLS} />
                <p className="text-xs text-[#9aa3b2] mt-1">Applied once at assembly parent</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Max batch items</label>
                <input type="number" min={1} max={100} value={effective.max_batch_items}
                  onChange={(e) => patch({ max_batch_items: Number(e.target.value) })}
                  className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Bulk concurrency</label>
                <input type="number" min={1} max={16} value={effective.bulk_concurrency}
                  onChange={(e) => patch({ bulk_concurrency: Number(e.target.value) })}
                  className={INPUT_CLS} />
                <p className="text-xs text-[#9aa3b2] mt-1">Parallel Anthropic calls in batch</p>
              </div>
            </div>

            {/* Confidence gate visualiser */}
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
              <div className="flex items-center gap-1 mt-1.5">
                {effective.confidence_gate < 70 ? (
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                ) : (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                )}
                <span className={cn('text-xs', effective.confidence_gate < 70 ? 'text-red-600' : 'text-green-600')}>
                  {effective.confidence_gate < 70 ? 'Below recommended minimum (70%)' : 'Within recommended range'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <CardTitle>AI Usage (Last 7 Days)</CardTitle>
                <p className="text-xs text-[#9aa3b2] mt-0.5">Aggregated from audit log</p>
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
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rect" height="2.5rem" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Total KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Total Calls</p>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono mt-1">{usage?.total_calls ?? 0}</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-[#9aa3b2]" />
                    <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Interactive limit</p>
                  </div>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono">{effective.rate_limits.interactive_per_hour}<span className="text-sm font-normal text-[#9aa3b2]">/hr</span></p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3 text-[#9aa3b2]" />
                    <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Bulk limit</p>
                  </div>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono">{effective.rate_limits.bulk_per_hour}<span className="text-sm font-normal text-[#9aa3b2]">/hr</span></p>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-[#e5e8ef]">
                  <p className="text-xs text-[#9aa3b2] uppercase tracking-wide">Margin</p>
                  <p className="text-2xl font-bold text-[#0f1729] font-mono mt-1">{effective.margin_pct}<span className="text-sm font-normal text-[#9aa3b2]">%</span></p>
                </div>
              </div>

              {/* By-action breakdown */}
              {topActions.length > 0 ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-[#4a5568] uppercase tracking-wide">By Operation</p>
                  {topActions.map((row) => (
                    <div key={row.action} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#4a5568]">
                          {ACTION_LABEL[row.action] ?? row.action.replace(/^ai_/, '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-mono font-medium text-[#0f1729]">{row.count}</span>
                      </div>
                      <ProgressBar value={(row.count / maxCount) * 100} size="sm" variant="navy" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#9aa3b2] text-center py-6">No AI activity in the last 7 days.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active model summary */}
      <Card>
        <CardHeader>
          <CardTitle>Active Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(Object.entries(effective.models) as Array<[keyof AiConfig['models'], string]>).map(([op, modelId]) => {
              const model = AVAILABLE_MODELS.find(m => m.id === modelId)
              const Icon = OPERATION_ICONS[op]
              return (
                <div key={op} className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-[#e5e8ef]">
                  <div className="w-7 h-7 rounded-lg bg-white border border-[#e5e8ef] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-[#4a5568]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#9aa3b2] truncate">{OPERATION_LABELS[op]}</p>
                    <p className={cn('text-sm font-medium truncate', model?.color ?? 'text-[#0f1729]')}>
                      {model?.label ?? modelId}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
