import { cn } from '../../lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'full' | 'mark'
  className?: string
  inverted?: boolean
}

const markSizes = { sm: 24, md: 32, lg: 40 }
const textSizes = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }

export function Logo({ size = 'md', variant = 'full', className, inverted = false }: LogoProps) {
  const markPx = markSizes[size]

  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={markPx} />
      {variant === 'full' && (
        <span
          className={cn(
            'font-semibold tracking-tight leading-none',
            textSizes[size],
            inverted ? 'text-white' : 'text-[#1e2d4e]',
          )}
        >
          Proqr<span className="text-[#e85c1a]">IQ</span>
        </span>
      )}
    </div>
  )
}

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#1e2d4e" />
      {/* P vertical stroke */}
      <rect x="8" y="8" width="4" height="16" rx="2" fill="white" />
      {/* P bowl */}
      <path
        d="M12 8h4a5 5 0 0 1 0 10h-4"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Circuit nodes */}
      <circle cx="22" cy="22" r="2.5" fill="#e85c1a" />
      <circle cx="27" cy="19" r="1.5" fill="#e85c1a" opacity="0.7" />
      <circle cx="24" cy="27" r="1.5" fill="#e85c1a" opacity="0.7" />
      {/* Connector lines */}
      <line x1="22" y1="22" x2="27" y2="19" stroke="#e85c1a" strokeWidth="1" opacity="0.5" />
      <line x1="22" y1="22" x2="24" y2="27" stroke="#e85c1a" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}
