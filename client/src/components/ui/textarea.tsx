import { cn } from '../../lib/utils'
import { TextareaHTMLAttributes, forwardRef } from 'react'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm',
        'focus:border-[#e85c1a] focus:ring-1 focus:ring-[#e85c1a] outline-none',
        'resize-vertical min-h-[80px]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
