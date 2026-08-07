import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, LayoutDashboard, FileText, Plus, Layers, Package, Settings, LogOut, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const go = (path: string) => { navigate(path); onClose() }

  const commands: Command[] = [
    { id: 'dashboard',  label: 'Dashboard',       icon: LayoutDashboard, action: () => go('/dashboard'),   keywords: ['home', 'overview'] },
    { id: 'quotes',     label: 'All Quotes',       icon: FileText,        action: () => go('/quotes'),      keywords: ['list'] },
    { id: 'new-quote',  label: 'New Quote',        description: 'Start a new costing quote', icon: Plus, action: () => go('/quotes/new'), keywords: ['create', 'add'] },
    { id: 'bulk',       label: 'Bulk Costing',     icon: Layers,          action: () => go('/bulk'),        keywords: ['batch', 'multiple'] },
    { id: 'assemblies', label: 'Assemblies',       icon: Package,         action: () => go('/assemblies'),  keywords: ['bom', 'component'] },
    { id: 'account',    label: 'Account Settings', icon: Settings,        action: () => go('/account'),     keywords: ['profile', 'admin'] },
    { id: 'logout',     label: 'Sign Out',         icon: LogOut,          action: async () => { await logout(); navigate('/login'); onClose() }, keywords: ['log out', 'exit'] },
  ]

  const filtered = query.trim()
    ? commands.filter(c => {
        const q = query.toLowerCase()
        return c.label.toLowerCase().includes(q) || c.keywords?.some(k => k.includes(q))
      })
    : commands

  useEffect(() => { setSelected(0) }, [query])

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && filtered[selected]) { filtered[selected].action() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, selected, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh] px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e5e8ef]">
              <Search className="w-4 h-4 text-[#9aa3b2] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type a command or search…"
                className="flex-1 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] bg-transparent outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#9aa3b2] bg-surface-3 border border-[#e5e8ef] rounded px-1.5 py-0.5 font-mono">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto py-1.5">
              {filtered.length === 0 ? (
                <p className="text-sm text-[#9aa3b2] text-center py-8">No results for "{query}"</p>
              ) : (
                filtered.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selected === i ? 'bg-surface-3' : 'hover:bg-surface-2',
                    )}
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      selected === i ? 'bg-navy text-white' : 'bg-surface-3 text-[#4a5568]',
                    )}>
                      <cmd.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0f1729]">{cmd.label}</p>
                      {cmd.description && <p className="text-xs text-[#9aa3b2] truncate">{cmd.description}</p>}
                    </div>
                    {selected === i && (
                      <kbd className="text-[10px] text-[#9aa3b2] bg-white border border-[#e5e8ef] rounded px-1.5 py-0.5 font-mono">↵</kbd>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-[#e5e8ef] flex items-center gap-3 text-[10px] text-[#9aa3b2]">
              <span><kbd className="font-mono bg-surface-3 border border-[#e5e8ef] rounded px-1 py-0.5">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono bg-surface-3 border border-[#e5e8ef] rounded px-1 py-0.5">↵</kbd> select</span>
              <span><kbd className="font-mono bg-surface-3 border border-[#e5e8ef] rounded px-1 py-0.5">Esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { open, setOpen }
}
