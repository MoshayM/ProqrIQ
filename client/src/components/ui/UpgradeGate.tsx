import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Zap } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'
import { useAuth } from '../../hooks/useAuth'
import { Button } from './button'

interface UpgradeGateProps {
  requiredPlan: 'pro' | 'organization'
  feature: string
  children: React.ReactNode
}

const PLAN_HIERARCHY: Record<string, number> = { free: 0, pro: 1, organization: 2 }
const BYPASS_ROLES = ['admin', 'ceo', 'developer', 'owner']

export function UpgradeGate({ requiredPlan, feature, children }: UpgradeGateProps) {
  const { user } = useAuth()
  const { plan, isLoading } = useSubscription()
  const navigate = useNavigate()

  // Admin/developer/ceo/owner always pass — no plan check needed
  if (user && BYPASS_ROLES.includes(user.role)) return <>{children}</>

  // While subscription is loading, don't flash the lock screen
  if (isLoading) return <>{children}</>

  const hasAccess = (PLAN_HIERARCHY[plan] ?? 0) >= (PLAN_HIERARCHY[requiredPlan] ?? 0)
  if (hasAccess) return <>{children}</>

  const planLabel = requiredPlan === 'organization' ? 'Organization' : 'Pro'

  return (
    <div className="relative rounded-xl border-2 border-dashed border-[#e5e8ef] bg-surface-2 min-h-[160px] flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#f1f3f7] flex items-center justify-center">
        <Lock className="w-6 h-6 text-[#9aa3b2]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0f1729]">{feature} requires {planLabel}</p>
        <p className="text-xs text-[#9aa3b2] mt-0.5">
          Upgrade to {planLabel} to unlock this feature.
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Zap className="w-3.5 h-3.5" />}
        onClick={() => navigate('/billing')}
      >
        Upgrade to {planLabel}
      </Button>
    </div>
  )
}
