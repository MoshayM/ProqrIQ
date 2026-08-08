import React, { useState, useRef } from 'react'
import { HelpCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'

interface Props {
  content: string
  className?: string
}

export function HelpTooltip({ content, className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={ref}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="Help"
        className="text-[#9aa3b2] hover:text-brand transition-colors focus:outline-none"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-xl bg-[#1e2d4e] text-white text-xs px-3 py-2 shadow-lg pointer-events-none"
          >
            {content}
            {/* Arrow */}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e2d4e]" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
