import { cn, formatCost } from '../../lib/utils'

interface Props {
  value: number | null | undefined
  currency?: string
  className?: string
}

export function CostNumber({ value, currency = 'EUR', className }: Props) {
  return (
    <span className={cn('font-mono text-sm tabular-nums', className)}>
      {formatCost(value, currency)}
    </span>
  )
}
