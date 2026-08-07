import { cn } from '../../lib/utils'

interface PlanBadgeProps {
  plan: 'free' | 'pro' | 'organization'
  className?: string
}

const PLAN_STYLES: Record<string, { label: string; className: string }> = {
  free:         { label: 'FREE', className: 'bg-[#f1f3f7] text-[#4a5568]' },
  pro:          { label: 'PRO',  className: 'bg-brand/10 text-brand' },
  organization: { label: 'ORG',  className: 'bg-navy/10 text-navy' },
}

export function PlanBadge({ plan, className }: PlanBadgeProps) {
  const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
