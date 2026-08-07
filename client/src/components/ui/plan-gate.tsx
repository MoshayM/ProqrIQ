import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Zap } from 'lucide-react'
import { usePlan, type PlanLimits } from '../../contexts/PlanContext'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface PlanGateProps {
  feature: keyof PlanLimits
  children?: React.ReactNode
  fallback?: React.ReactNode
  inline?: boolean
}

export function PlanGate({ feature, children, fallback, inline = false }: PlanGateProps) {
  const { isFeatureEnabled } = usePlan()

  if (isFeatureEnabled(feature)) return children ? <>{children}</> : null

  if (fallback) return <>{fallback}</>

  if (inline) {
    return (
      <div className="flex items-center gap-1.5 text-[#9aa3b2] cursor-not-allowed" title="Not available on your plan">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs">Upgrade required</span>
      </div>
    )
  }

  return <LockedOverlay />
}

function LockedOverlay() {
  const navigate = useNavigate()
  return (
    <div className="relative rounded-xl border-2 border-dashed border-[#e5e8ef] bg-surface-2 min-h-[120px] flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-[#f1f3f7] flex items-center justify-center">
        <Lock className="w-5 h-5 text-[#9aa3b2]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#4a5568]">Feature locked</p>
        <p className="text-xs text-[#9aa3b2] mt-0.5">Upgrade your plan to access this feature.</p>
      </div>
      <Button variant="primary" size="sm" iconLeft={<Zap className="w-3.5 h-3.5" />}
        onClick={() => navigate('/plans')}>
        View Plans
      </Button>
    </div>
  )
}
