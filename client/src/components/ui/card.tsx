import { cn } from '../../lib/utils'
import { HTMLAttributes } from 'react'

type CardVariant = 'default' | 'elevated' | 'bordered' | 'hover'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
}

const cardVariants: Record<CardVariant, string> = {
  default:  'bg-white rounded-xl border border-[#e5e8ef] shadow-sm',
  elevated: 'bg-white rounded-xl border border-[#e5e8ef] shadow-md',
  bordered: 'bg-white rounded-xl border-2 border-[#e5e8ef]',
  hover:    'bg-white rounded-xl border border-[#e5e8ef] shadow-sm card-hover cursor-pointer',
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants[variant], className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-4 border-b border-[#e5e8ef]', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-semibold text-[#0f1729] tracking-tight', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-[#4a5568] mt-0.5', className)} {...props}>
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-3 border-t border-[#e5e8ef] bg-[#f8f9fb] rounded-b-xl', className)} {...props}>
      {children}
    </div>
  )
}
