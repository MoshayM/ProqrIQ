import { cn } from '../../lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm',
        'focus:border-[#e85c1a] focus:ring-1 focus:ring-[#e85c1a] outline-none transition-colors',
        'disabled:bg-gray-50 disabled:text-gray-500',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
