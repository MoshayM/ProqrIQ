import { cn } from '../../lib/utils'
import { HTMLAttributes } from 'react'

type Variant = 'info' | 'success' | 'warning' | 'error'

const map: Record<Variant, string> = {
  info:    'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error:   'bg-red-50 border-red-200 text-red-800',
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
}

export function Alert({ variant = 'info', className, children, ...props }: Props) {
  return (
    <div
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', map[variant], className)}
      {...props}
    >
      {children}
    </div>
  )
}
