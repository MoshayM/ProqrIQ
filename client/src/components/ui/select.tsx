import { cn } from '../../lib/utils'
import { SelectHTMLAttributes, forwardRef } from 'react'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm',
        'focus:border-[#e85c1a] focus:ring-1 focus:ring-[#e85c1a] outline-none bg-white',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
