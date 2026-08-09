import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { usePlan } from '../contexts/PlanContext'

export interface SubscriptionData {
  plan: 'free' | 'pro' | 'organization'
  status: string
  isTrialing: boolean
  daysUntilRenewal: number | null
  usage: {
    quotes_used: number
    bulk_used: number
    supplier_searches_used: number
    ai_tokens_used: number
  }
  limits: {
    quotes_per_month: number | null
    bulk_batch_items: number
    supplier_searches_per_month: number | null
  }
  predictedDaysRemaining: number | null
  canUse: (feature: 'bulk_costing' | 'assemblies' | 'supplier_search' | 'kb_management' | 'excel_export' | 'ai_cost_control') => boolean
}

const PLAN_HIERARCHY: Record<string, number> = { free: 0, pro: 1, organization: 2 }

const FEATURE_PLAN_REQUIREMENTS: Record<string, 'free' | 'pro' | 'organization'> = {
  bulk_costing:    'pro',
  assemblies:      'pro',
  supplier_search: 'pro',
  kb_management:   'organization',
  excel_export:    'pro',
  ai_cost_control: 'organization',
}

// Preview plan → subscription plan mapping
const PREVIEW_PLAN_MAP: Record<string, 'free' | 'pro' | 'organization'> = {
  free: 'free',
  pro:  'pro',
  org:  'organization',
}

const PREVIEW_LIMITS: Record<string, { quotes_per_month: number | null; bulk_batch_items: number; supplier_searches_per_month: number | null }> = {
  free:         { quotes_per_month: 10,   bulk_batch_items: 10,  supplier_searches_per_month: 0 },
  pro:          { quotes_per_month: 200,  bulk_batch_items: 50,  supplier_searches_per_month: null },
  organization: { quotes_per_month: null, bulk_batch_items: 50,  supplier_searches_per_month: null },
}

export function useSubscription(): SubscriptionData & { isLoading: boolean; refetch: () => void } {
  const { previewPlan } = usePlan()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.subscription.get(),
    staleTime: 60_000,
    retry: false,
  })

  const realPlan: 'free' | 'pro' | 'organization' = (data as any)?.plan ?? 'free'
  const realStatus: string = (data as any)?.status ?? 'active'

  // When plan preview is active, simulate the preview plan
  const isPreview = previewPlan !== null
  const plan: 'free' | 'pro' | 'organization' = isPreview
    ? (PREVIEW_PLAN_MAP[previewPlan!] ?? 'free')
    : realPlan
  const status = isPreview ? 'active' : realStatus
  const isTrialing = status === 'trialing'

  const currentPeriodEnd: string | null = isPreview ? null : ((data as any)?.current_period_end ?? null)
  let daysUntilRenewal: number | null = null
  if (currentPeriodEnd) {
    const diff = new Date(currentPeriodEnd).getTime() - Date.now()
    daysUntilRenewal = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const usage = (data as any)?.usage ?? {
    quotes_used: 0,
    bulk_used: 0,
    supplier_searches_used: 0,
    ai_tokens_used: 0,
  }

  const limits = isPreview
    ? (PREVIEW_LIMITS[plan] ?? PREVIEW_LIMITS.free)
    : ((data as any)?.limits ?? {
        quotes_per_month: 10,
        bulk_batch_items: 10,
        supplier_searches_per_month: 0,
      })

  function canUse(feature: 'bulk_costing' | 'assemblies' | 'supplier_search' | 'kb_management' | 'excel_export' | 'ai_cost_control'): boolean {
    const required = FEATURE_PLAN_REQUIREMENTS[feature] ?? 'free'
    return (PLAN_HIERARCHY[plan] ?? 0) >= (PLAN_HIERARCHY[required] ?? 0)
  }

  // Velocity: estimate days until quote limit is hit based on current pace
  let predictedDaysRemaining: number | null = null
  if (limits.quotes_per_month !== null && daysUntilRenewal !== null) {
    const daysElapsed = Math.max(1, 30 - daysUntilRenewal)
    const dailyAvg = usage.quotes_used / daysElapsed
    if (dailyAvg > 0) {
      const remaining = limits.quotes_per_month - usage.quotes_used
      predictedDaysRemaining = Math.floor(remaining / dailyAvg)
    }
  }

  return {
    plan,
    status,
    isTrialing,
    daysUntilRenewal,
    usage,
    limits,
    predictedDaysRemaining,
    canUse,
    isLoading,
    refetch,
  }
}
