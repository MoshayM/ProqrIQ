import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePlan } from '../contexts/PlanContext'
import { useLocation } from 'react-router-dom'

const ROLE_LABELS: Record<string, string> = {
  engineer:    'Engineer',
  cost_analyst:'Cost Analyst',
  ceo:         'CEO',
  admin:       'Admin',
  developer:   'Developer',
  owner:       'Owner',
}
const PLAN_LABELS: Record<string, string> = {
  free: 'Free Plan',
  pro:  'Pro Plan',
  org:  'Organization Plan',
}

export function PreviewBanner() {
  const { previewRole, setPreviewRole } = useAuth()
  const { previewPlan, setPreviewPlan } = usePlan()
  const location = useLocation()

  // Don't render inside an iframe preview (avoid nesting)
  const isInsidePreview = new URLSearchParams(location.search).has('preview_role')
  if (isInsidePreview) return null

  const active = previewRole !== null || previewPlan !== null
  if (!active) return null

  const parts: string[] = []
  if (previewRole) parts.push(ROLE_LABELS[previewRole] ?? previewRole)
  if (previewPlan) parts.push(PLAN_LABELS[previewPlan] ?? previewPlan)

  function exitAll() {
    setPreviewRole(null)
    setPreviewPlan(null)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="preview-banner"
        initial={{ y: -48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -48, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2.5 bg-[#e85c1a] text-white text-sm font-medium shadow-lg"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span>
            Previewing as: <strong>{parts.join(' · ')}</strong>
            {' — '}
            <span className="font-normal opacity-80">UI simulation only. API calls use your real session.</span>
          </span>
        </div>
        <button
          onClick={exitAll}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold whitespace-nowrap"
        >
          <X className="w-3 h-3" />
          Exit Preview
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
