import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { APP_SHORTCUTS } from '../../hooks/useKeyboardShortcut'

interface Props {
  open: boolean
  onClose: () => void
}

const GROUPS = ['Navigation', 'Actions', 'Help'] as const

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-[#f1f3f7] border border-[#e5e8ef] text-[11px] font-mono font-medium text-[#4a5568]">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e8ef]">
              <h2 className="text-sm font-semibold text-[#0f1729]">Keyboard Shortcuts</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-surface-3 text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {GROUPS.map(group => {
                const items = APP_SHORTCUTS.filter(s => s.group === group)
                return (
                  <div key={group}>
                    <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider mb-2">{group}</p>
                    <div className="space-y-1.5">
                      {items.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-[#4a5568]">{s.description}</span>
                          <div className="flex items-center gap-1">
                            {s.keys.map((k, j) => (
                              <React.Fragment key={j}>
                                {j > 0 && <span className="text-[#c8cdd8] text-xs">then</span>}
                                <Kbd>{k}</Kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
