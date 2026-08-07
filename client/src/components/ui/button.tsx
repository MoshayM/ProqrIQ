import { cn } from '../../lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'outline' | 'navy' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}

const variants: Record<Variant, string> = {
  primary:   'bg-brand text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 hover:-translate-y-px active:translate-y-0',
  secondary: 'bg-surface-1 border border-[#e5e8ef] text-[#0f1729] shadow-xs hover:bg-surface-3 hover:border-[#c8cdd8] hover:-translate-y-px active:translate-y-0',
  outline:   'bg-transparent border border-[#e5e8ef] text-[#4a5568] hover:bg-surface-3 hover:-translate-y-px active:translate-y-0',
  navy:      'bg-navy text-white shadow-sm hover:bg-navy-800 active:bg-navy-900 hover:-translate-y-px active:translate-y-0',
  ghost:     'bg-transparent text-[#4a5568] hover:bg-surface-3 hover:text-[#0f1729]',
  danger:    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 hover:-translate-y-px active:translate-y-0',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 gap-1.5 text-xs rounded-md',
  md: 'h-9 px-4 gap-2 text-sm rounded-lg',
  lg: 'h-11 px-6 gap-2 text-base rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, iconLeft, iconRight, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        'select-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin shrink-0" size={size === 'lg' ? 18 : 15} />
      ) : iconLeft ? (
        <span className="shrink-0">{iconLeft}</span>
      ) : null}
      {children}
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  ),
)
Button.displayName = 'Button'
