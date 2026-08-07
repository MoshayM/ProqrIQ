import { cn } from '../../lib/utils'
import { Button } from './button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      {icon ? (
        <div className="mb-5 text-[#9aa3b2]">{icon}</div>
      ) : (
        <DefaultEmptyIllustration />
      )}
      <h3 className="text-base font-semibold text-[#0f1729] mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-[#4a5568] max-w-xs mb-5">{description}</p>
      )}
      {action && (
        <Button size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}

function DefaultEmptyIllustration() {
  return (
    <svg
      className="mb-5 opacity-40"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="20" width="60" height="45" rx="6" fill="#e8ebf2" />
      <rect x="20" y="30" width="40" height="4" rx="2" fill="#c8cdd8" />
      <rect x="20" y="40" width="28" height="4" rx="2" fill="#c8cdd8" />
      <rect x="20" y="50" width="34" height="4" rx="2" fill="#c8cdd8" />
      <circle cx="58" cy="22" r="12" fill="#f8f9fb" stroke="#e5e8ef" strokeWidth="2" />
      <line x1="62.5" y1="26.5" x2="67" y2="31" stroke="#c8cdd8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="58" cy="22" r="6" fill="#e8ebf2" />
    </svg>
  )
}
