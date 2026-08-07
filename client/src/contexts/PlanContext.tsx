import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type PlanId = 'free' | 'pro' | 'org'

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner'] as const

export interface PlanLimits {
  quotes_per_month: number | null    // null = unlimited
  bulk_batch_items: number
  assembly_depth: number
  kb_documents: number | null
  ai_model: 'haiku' | 'sonnet' | 'sonnet_opus'
  supplier_discovery: boolean
  negotiation_reports: boolean
  excel_pdf_export: boolean
  passkey_auth: boolean
  ai_cost_control: boolean
  custom_margin: boolean
  sso_saml: boolean
  priority_support: boolean
  audit_log_export: boolean
}

const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    quotes_per_month:    10,
    bulk_batch_items:    10,
    assembly_depth:      2,
    kb_documents:        5,
    ai_model:            'haiku',
    supplier_discovery:  false,
    negotiation_reports: false,
    excel_pdf_export:    false,
    passkey_auth:        false,
    ai_cost_control:     false,
    custom_margin:       false,
    sso_saml:            false,
    priority_support:    false,
    audit_log_export:    false,
  },
  pro: {
    quotes_per_month:    200,
    bulk_batch_items:    50,
    assembly_depth:      3,
    kb_documents:        50,
    ai_model:            'sonnet',
    supplier_discovery:  true,
    negotiation_reports: true,
    excel_pdf_export:    true,
    passkey_auth:        true,
    ai_cost_control:     false,
    custom_margin:       false,
    sso_saml:            false,
    priority_support:    true,
    audit_log_export:    false,
  },
  org: {
    quotes_per_month:    null,
    bulk_batch_items:    50,
    assembly_depth:      3,
    kb_documents:        null,
    ai_model:            'sonnet_opus',
    supplier_discovery:  true,
    negotiation_reports: true,
    excel_pdf_export:    true,
    passkey_auth:        true,
    ai_cost_control:     true,
    custom_margin:       true,
    sso_saml:            true,
    priority_support:    true,
    audit_log_export:    true,
  },
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface PlanContextValue {
  effectivePlan: PlanId
  previewPlan: PlanId | null
  setPreviewPlan: (plan: PlanId | null) => void
  limits: PlanLimits
  isFeatureEnabled: (feature: keyof PlanLimits) => boolean
  canPreview: boolean
}

const PlanContext = createContext<PlanContextValue | null>(null)

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [previewPlan, setPreviewPlanState] = useState<PlanId | null>(null)

  const isRealAdmin = ADMIN_ROLES.includes((user?.role ?? '') as typeof ADMIN_ROLES[number])
  const userPlan: PlanId = (user as any)?.plan ?? 'free'
  const effectivePlan: PlanId = (isRealAdmin && previewPlan) ? previewPlan : userPlan

  const setPreviewPlan = useCallback((plan: PlanId | null) => {
    if (!isRealAdmin) return
    setPreviewPlanState(plan)
  }, [isRealAdmin])

  const limits = useMemo(() => PLAN_LIMITS[effectivePlan], [effectivePlan])

  const isFeatureEnabled = useCallback((feature: keyof PlanLimits): boolean => {
    const val = limits[feature]
    if (typeof val === 'boolean') return val
    if (val === null) return true
    if (typeof val === 'number') return val > 0
    return true
  }, [limits])

  return (
    <PlanContext.Provider value={{
      effectivePlan,
      previewPlan,
      setPreviewPlan,
      limits,
      isFeatureEnabled,
      canPreview: isRealAdmin,
    }}>
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>')
  return ctx
}

export { PLAN_LIMITS }
