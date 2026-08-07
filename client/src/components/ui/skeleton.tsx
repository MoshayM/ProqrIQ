import { cn } from '../../lib/utils'
import { HTMLAttributes, CSSProperties } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'line' | 'circle' | 'rect'
  width?: string
  height?: string
}

export function Skeleton({ className, variant = 'rect', width, height, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton',
        variant === 'circle' && 'rounded-full',
        variant === 'line'   && 'rounded-md',
        variant === 'rect'   && 'rounded-lg',
        className,
      )}
      style={{ width, height, ...(style as CSSProperties) }}
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="line"
          height="14px"
          style={{ width: i === lines - 1 ? '60%' : '100%' } as CSSProperties}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-[#e5e8ef] p-6 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" width="40px" height="40px" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="line" height="14px" width="40%" />
          <Skeleton variant="line" height="12px" width="60%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
}
