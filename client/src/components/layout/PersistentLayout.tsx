import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'
import { Logo, LogoMark } from '../ui/logo'
import {
  LayoutDashboard,
  FileText,
  Layers,
  Package,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Brain,
  MapPin,
  Monitor,
  Menu,
  X,
  Search,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Notification } from '@shared/types'
import { KeyboardShortcutsModal } from '../ui/KeyboardShortcutsModal'
import { UsageBanner } from '../ui/UsageBanner'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/quotes',        label: 'Quotations',     icon: FileText },
  { to: '/bulk',          label: 'Bulk Costing',   icon: Layers },
  { to: '/assemblies',    label: 'Assemblies',     icon: Package },
  { to: '/supplier-map',  label: 'Supplier Map',   icon: MapPin },
  { to: '/search',        label: 'Search',         icon: Search },
  { to: '/ai-control',    label: 'AI Control',     icon: Brain,    adminOnly: true },
  { to: '/device-preview',label: 'Device Preview', icon: Monitor,  adminOnly: true },
]

const sidebarVariants = {
  expanded: { width: 240 },
  collapsed: { width: 64 },
}

// ─── Shortcut discovery (7D.7) ───────────────────────────────────────────────
const SHORTCUT_USAGE_KEY = 'proqriq_shortcut_usage'
const SHORTCUT_TIPS_KEY  = 'proqriq_shortcut_tips_shown'
const SHORTCUT_TIP_THRESHOLD = 5

const SHORTCUT_TIPS: Record<string, string> = {
  'n':   'Press N anywhere to start a new quote instantly',
  '/':   'Press / to search quotes and suppliers',
  '?':   'Press ? to see all keyboard shortcuts',
  'g+d': 'G → D jumps to Dashboard from anywhere',
  'g+q': 'G → Q jumps to Quotations',
  'g+b': 'G → B jumps to Bulk Costing',
  'g+a': 'G → A jumps to Assemblies',
  'g+s': 'G → S jumps to Supplier Map',
}

function getShortcutCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SHORTCUT_USAGE_KEY) ?? '{}') } catch { return {} }
}
function incrementShortcutCount(key: string): number {
  const counts = getShortcutCounts()
  const next = (counts[key] ?? 0) + 1
  counts[key] = next
  localStorage.setItem(SHORTCUT_USAGE_KEY, JSON.stringify(counts))
  return next
}
function hasTipBeenShown(key: string): boolean {
  try { return JSON.parse(localStorage.getItem(SHORTCUT_TIPS_KEY) ?? '{}')[key] === true } catch { return false }
}
function markTipShown(key: string) {
  try {
    const shown = JSON.parse(localStorage.getItem(SHORTCUT_TIPS_KEY) ?? '{}')
    shown[key] = true
    localStorage.setItem(SHORTCUT_TIPS_KEY, JSON.stringify(shown))
  } catch {}
}

// ─── Activity streak (7D.4) ───────────────────────────────────────────────────
const STREAK_KEY = 'proqriq_activity_streak'
function getActivityStreak(): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    const today = new Date().toISOString().slice(0, 10)
    if (!raw) {
      localStorage.setItem(STREAK_KEY, JSON.stringify({ date: today, streak: 1 }))
      return 1
    }
    const { date, streak } = JSON.parse(raw)
    if (date === today) return streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const newStreak = date === yesterday ? streak + 1 : 1
    localStorage.setItem(STREAK_KEY, JSON.stringify({ date: today, streak: newStreak }))
    return newStreak
  } catch { return 1 }
}

export default function PersistentLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [shortcutTip, setShortcutTip] = useState<string | null>(null)
  const pendingGRef = useRef(false)
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fireTip(key: string) {
    const count = incrementShortcutCount(key)
    if (count === SHORTCUT_TIP_THRESHOLD && !hasTipBeenShown(key) && SHORTCUT_TIPS[key]) {
      markTipShown(key)
      setShortcutTip(SHORTCUT_TIPS[key])
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current)
      tipTimerRef.current = setTimeout(() => setShortcutTip(null), 4000)
    }
  }

  // Close mobile menu on navigation
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Global keyboard shortcuts (skip when focused in inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
      if (isInput) { pendingGRef.current = false; return }

      const key = e.key.toLowerCase()

      // ? → show shortcuts
      if (key === '?' && !e.metaKey && !e.ctrlKey) { setShowShortcuts(v => !v); fireTip('?'); return }
      // n → new quote
      if (key === 'n' && !e.metaKey && !e.ctrlKey) { navigate('/quotes/new'); fireTip('n'); return }
      // / → global search
      if (key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate('/search'); fireTip('/'); return }

      // G-chord navigation
      if (key === 'g' && !e.metaKey && !e.ctrlKey) { pendingGRef.current = true; return }
      if (pendingGRef.current) {
        pendingGRef.current = false
        const routes: Record<string, string> = { d: '/dashboard', q: '/quotes', b: '/bulk', a: '/assemblies', s: '/supplier-map' }
        if (routes[key]) { navigate(routes[key]); fireTip(`g+${key}`); e.preventDefault() }
        return
      }
    }
    // Reset G-chord on any non-G key with a short timeout
    function resetG() { pendingGRef.current = false }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', resetG)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', resetG) }
  }, [navigate])

  useEffect(() => () => { if (tipTimerRef.current) clearTimeout(tipTimerRef.current) }, [])

  const { data: notifs } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000,
  })
  const unread = notifs?.filter((n) => !n.is_read).length ?? 0

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || hasRole(['admin', 'ceo', 'developer', 'owner']),
  )

  return (
    <div className="flex h-screen overflow-hidden bg-surface-2">
      {/* ── Mobile top bar (hidden on lg+) ──────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-navy z-40 flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Logo size="sm" inverted />
        <div className="ml-auto flex items-center gap-2">
          <NavLink to="/notifications" className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <Bell className="w-4 h-4 text-white/60" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        </div>
      </div>

      {/* ── Mobile overlay ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={collapsed ? 'collapsed' : 'expanded'}
        variants={sidebarVariants}
        transition={{ type: 'spring', stiffness: 380, damping: 35 }}
        className={cn(
          'flex flex-col bg-navy text-white flex-shrink-0 relative z-40 overflow-hidden',
          // Desktop: always visible inline
          'hidden lg:flex',
        )}
        style={{ minWidth: collapsed ? 64 : 240 }}
      >
        {/* Brand header */}
        <div className="flex items-center h-16 px-4 border-b border-white/10 flex-shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {collapsed ? (
              <motion.div
                key="mark"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="mx-auto"
              >
                <LogoMark size={28} />
              </motion.div>
            ) : (
              <motion.div
                key="full"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 flex-1"
              >
                <Logo size="md" inverted />
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && (
            <div className="flex items-center gap-1 ml-auto">
              {/* Notifications */}
              <NavLink
                to="/notifications"
                className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-white/60" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>

              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4 text-white/60" />
              </button>
            </div>
          )}

          {collapsed && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              onClick={() => setCollapsed(false)}
              className="absolute -right-3 top-[18px] w-6 h-6 bg-navy-700 border border-white/20 rounded-full flex items-center justify-center hover:bg-navy-600 transition-colors z-10"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-3 h-3 text-white" />
            </motion.button>
          )}
        </div>

        {/* New Quote button */}
        <div className="px-3 py-3 border-b border-white/10 flex-shrink-0">
          <button
            onClick={() => navigate('/quotes/new')}
            className={cn(
              'flex items-center gap-2 w-full bg-brand hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-medium transition-all duration-150 text-sm shadow-sm hover:-translate-y-px active:translate-y-0',
              collapsed ? 'justify-center p-2' : 'px-3 py-2',
            )}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  New Quote
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Cmd+K hint */}
        {!collapsed && (
          <div className="px-3 pb-2 flex-shrink-0">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
                window.dispatchEvent(event)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <span className="flex-1 text-left">Quick search…</span>
              <kbd className="font-mono text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white',
                  collapsed && 'justify-center px-0 py-2.5',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute inset-0 bg-white/15 rounded-lg"
                      transition={{ type: 'spring', stiffness: 380, damping: 35 }}
                    />
                  )}
                  <item.icon className="w-4 h-4 flex-shrink-0 relative z-10" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="relative z-10 whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-3 flex-shrink-0">
          {collapsed ? (
            <button
              onClick={() => navigate('/account')}
              className="w-full flex justify-center"
              title="My account"
            >
              <UserAvatar user={user} />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/account')}
                className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg p-1.5 hover:bg-white/10 transition-colors text-left"
              >
                <UserAvatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate leading-tight">
                    {user?.full_name ?? user?.email}
                  </p>
                  <p className="text-xs text-white/40 capitalize mt-0.5">
                    {user?.role?.replace('_', ' ')}
                  </p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* ── Mobile sidebar drawer ────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 35 }}
            className="lg:hidden fixed top-0 left-0 bottom-0 w-64 bg-navy text-white z-50 flex flex-col overflow-hidden"
          >
            <div className="flex items-center h-14 px-4 border-b border-white/10 flex-shrink-0 gap-3">
              <Logo size="sm" inverted />
              <button onClick={() => setMobileOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-3 border-b border-white/10 flex-shrink-0">
              <button
                onClick={() => navigate('/quotes/new')}
                className="flex items-center gap-2 w-full bg-brand hover:bg-brand-600 text-white rounded-lg font-medium transition-all text-sm px-3 py-2"
              >
                <Plus className="w-4 h-4" />
                New Quote
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 p-3 flex-shrink-0 space-y-2">
              {/* Activity streak */}
              {(() => {
                const streak = getActivityStreak()
                if (streak < 2) return null
                return (
                  <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-white/5">
                    <span className="text-xs">🔥</span>
                    <span className="text-[10px] text-white/50">{streak} day streak</span>
                  </div>
                )
              })()}
              <button
                onClick={() => navigate('/account')}
                className="flex items-center gap-2.5 w-full rounded-lg p-1.5 hover:bg-white/10 transition-colors text-left"
              >
                <UserAvatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate leading-tight">{user?.full_name ?? user?.email}</p>
                  <p className="text-xs text-white/40 capitalize mt-0.5">{user?.role?.replace('_', ' ')}</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0 relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="min-h-full"
          >
            <UsageBanner />
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Shortcut discovery tip (7D.7) ───────────────────────────────────── */}
      <AnimatePresence>
        {shortcutTip && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-[#1e2d4e] text-white text-sm rounded-full shadow-xl border border-white/10 pointer-events-none"
          >
            <span className="text-[#e85c1a]">⌨</span>
            <span className="font-medium">Tip:</span>
            <span className="text-white/80">{shortcutTip}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Keyboard shortcuts modal ─────────────────────────────────────────── */}
      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  )
}

function UserAvatar({ user }: { user: { full_name?: string | null; email?: string | null; avatar_url?: string | null } | null | undefined }) {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name ?? 'Avatar'}
        className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20 flex-shrink-0"
      />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/20 flex-shrink-0">
      {user?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
