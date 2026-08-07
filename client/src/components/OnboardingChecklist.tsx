import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, ChevronDown, X, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'

interface ChecklistStep {
  id:        string
  label:     string
  desc:      string
  action:    string
  actionTo:  string
  done:      boolean
}

interface OnboardingChecklistProps {
  quoteCount:    number
  batchCount:    number
  assemblyCount: number
}

export function OnboardingChecklist({ quoteCount, batchCount, assemblyCount }: OnboardingChecklistProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('onboarding_dismissed') === 'true')
  const [collapsed, setCollapsed] = useState(false)

  const steps: ChecklistStep[] = [
    {
      id: 'first_quote',
      label: 'Create your first quote',
      desc: 'Upload a part drawing and get an AI cost estimate',
      action: 'Create Quote',
      actionTo: '/quotes/new',
      done: quoteCount > 0,
    },
    {
      id: 'first_bulk',
      label: 'Try bulk costing',
      desc: 'Cost multiple parts in parallel with one upload',
      action: 'Start Batch',
      actionTo: '/bulk',
      done: batchCount > 0,
    },
    {
      id: 'first_assembly',
      label: 'Build an assembly',
      desc: 'Combine child parts into a BOM with roll-up costing',
      action: 'New Assembly',
      actionTo: '/assemblies',
      done: assemblyCount > 0,
    },
    {
      id: 'explore_suppliers',
      label: 'Discover suppliers',
      desc: 'Find and compare global suppliers for your parts',
      action: 'Open Map',
      actionTo: '/supplier-map',
      done: false,
    },
  ]

  const doneCount  = steps.filter(s => s.done).length
  const allDone    = doneCount === steps.length
  const pct        = Math.round((doneCount / steps.length) * 100)

  if (dismissed || allDone) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white border border-[#e5e8ef] rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setCollapsed(v => !v)}>
        <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0f1729]">Get started with ProqrIQ</p>
          <p className="text-xs text-[#9aa3b2]">{doneCount} of {steps.length} steps complete</p>
        </div>
        {/* Progress track */}
        <div className="w-24 h-1.5 bg-surface-3 rounded-full overflow-hidden flex-shrink-0">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-full bg-brand rounded-full"
          />
        </div>
        <span className="text-xs font-mono text-[#9aa3b2] w-7 text-right flex-shrink-0">{pct}%</span>
        <ChevronDown className={cn('w-4 h-4 text-[#9aa3b2] flex-shrink-0 transition-transform', collapsed && 'rotate-180')} />
        <button
          onClick={e => { e.stopPropagation(); localStorage.setItem('onboarding_dismissed', 'true'); setDismissed(true) }}
          className="p-1 rounded-lg hover:bg-surface-3 text-[#9aa3b2] hover:text-[#4a5568] transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Steps */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#e5e8ef] divide-y divide-[#f1f3f7]">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={cn('flex items-center gap-4 px-5 py-3.5', step.done ? 'opacity-60' : '')}
                >
                  {step.done
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    : <Circle className="w-5 h-5 text-[#c8cdd8] flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', step.done ? 'line-through text-[#9aa3b2]' : 'text-[#0f1729]')}>
                      {step.label}
                    </p>
                    <p className="text-xs text-[#9aa3b2] truncate">{step.desc}</p>
                  </div>
                  {!step.done && (
                    <button
                      onClick={() => navigate(step.actionTo)}
                      className="text-xs font-medium text-brand hover:text-brand/80 transition-colors flex-shrink-0 px-3 py-1.5 rounded-lg hover:bg-brand/5"
                    >
                      {step.action} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
