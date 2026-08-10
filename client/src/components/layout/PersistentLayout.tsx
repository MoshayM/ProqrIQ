import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
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
  HelpCircle,
  Monitor,
  Menu,
  X,
  Search,
  CheckCheck,
  AlertTriangle,
  BookOpen,
  RotateCcw,
  TrendingUp,
  ExternalLink,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Notification } from '@shared/types'
import { KeyboardShortcutsModal } from '../ui/KeyboardShortcutsModal'
import { UsageBanner } from '../ui/UsageBanner'
import { HelpPanel } from '../ui/HelpPanel'
import { useSubscription } from '../../hooks/useSubscription'
import { formatDistanceToNow } from 'date-fns'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  roles?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/quotes',        label: 'Quotations',     icon: FileText },
  { to: '/bulk',          label: 'Bulk Costing',   icon: Layers },
  { to: '/assemblies',    label: 'Assemblies',     icon: Package },
  { to: '/supplier-map',  label: 'Supplier Map',   icon: MapPin },
  { to: '/ai-control',    label: 'AI Control',     icon: Brain,    roles: ['admin', 'developer'] },
  { to: '/device-preview',label: 'Device Preview', icon: Monitor,   roles: ['admin', 'developer'] },
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
  '/':   'Press / to open Dashboard search',
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

// ─── Notifications drawer (7B.6) ─────────────────────────────────────────────

const NOTIF_TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  quote_submitted:         { icon: FileText,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  quote_approved:          { icon: CheckCheck,    color: 'text-green-600',  bg: 'bg-green-50' },
  quote_rejected:          { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50' },
  kb_updated:              { icon: BookOpen,      color: 'text-indigo-600', bg: 'bg-indigo-50' },
  confidence_alert:        { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50' },
  quote_restored:          { icon: RotateCcw,     color: 'text-[#4a5568]',  bg: 'bg-[#f1f3f7]' },
  batch_completed:         { icon: Layers,        color: 'text-brand',      bg: 'bg-brand/10' },
  assembly_rollup_updated: { icon: TrendingUp,    color: 'text-navy',       bg: 'bg-navy/10' },
}
const NOTIF_DEFAULT = { icon: Bell, color: 'text-[#9aa3b2]', bg: 'bg-surface-3' }

function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000,
  })
  const readMut = useMutation({
    mutationFn: (id: string) => api.notifications.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAllMut = useMutation({
    mutationFn: () => api.notifications.readAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const unread = notifs.filter(n => !n.is_read).length

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="notif-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-[60]"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            key="notif-drawer"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 35 }}
            className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-[61] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e8ef] flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#0f1729]">Notifications</h2>
                {unread > 0 && (
                  <span className="min-w-[20px] h-5 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={() => readAllMut.mutate()}
                    className="text-xs text-[#9aa3b2] hover:text-[#4a5568] px-2 py-1 rounded-lg hover:bg-surface-3 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-[#9aa3b2]" />
                  </div>
                  <p className="text-sm font-medium text-[#0f1729]">You're all caught up</p>
                  <p className="text-xs text-[#9aa3b2]">Quote approvals, batch completions, and alerts will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f1f3f7]">
                  {notifs.map(n => {
                    const meta = NOTIF_TYPE_META[n.type] ?? NOTIF_DEFAULT
                    const Icon = meta.icon
                    const href = n.reference_id
                      ? n.reference_type === 'quotation' ? `/quotes/${n.reference_id}`
                      : n.reference_type === 'batch'     ? `/bulk/${n.reference_id}`
                      : n.reference_type === 'assembly'  ? `/assemblies/${n.reference_id}`
                      : null
                    : null
                    return (
                      <div
                        key={n.id}
                        className={cn('flex gap-3 px-5 py-4 hover:bg-surface-2 transition-colors', !n.is_read && 'border-l-2 border-brand')}
                        onClick={() => !n.is_read && readMut.mutate(n.id)}
                      >
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', meta.bg)}>
                          <Icon className={cn('w-3.5 h-3.5', meta.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm leading-snug', n.is_read ? 'text-[#4a5568]' : 'text-[#0f1729] font-medium')}>{n.message}</p>
                          <p className="text-[10px] text-[#9aa3b2] mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                          {href && (
                            <Link
                              to={href}
                              onClick={onClose}
                              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-brand hover:underline font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View
                            </Link>
                          )}
                        </div>
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand mt-1.5 flex-shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#e5e8ef] px-5 py-3 flex-shrink-0">
              <Link
                to="/notifications"
                onClick={onClose}
                className="text-xs text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
              >
                View all notifications →
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// 7B.10 — scroll to top on every route change
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    const main = document.querySelector('main')
    if (main) main.scrollTop = 0
  }, [pathname])
  return null
}

function PaymentPendingBanner() {
  const { needs_payment, pending_plan } = useSubscription()
  const navigate = useNavigate()
  if (!needs_payment) return null
  const planLabel = pending_plan === 'organization' ? 'Organization' : 'Pro'
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 text-sm bg-amber-50 border-b border-amber-200"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <span className="text-amber-800 flex-1">
        Your <strong>{planLabel}</strong> subscription is pending payment — you currently have Free access.
      </span>
      <button
        onClick={() => navigate(`/checkout?plan=${pending_plan ?? 'pro'}&billing=monthly`)}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
      >
        Complete Payment →
      </button>
    </motion.div>
  )
}

export default function PersistentLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [shortcutTip, setShortcutTip] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpMinimized, setHelpMinimized] = useState(false)
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
      if (key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate('/dashboard'); fireTip('/'); return }

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

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.roles) return hasRole(item.roles)
    if (item.adminOnly) return hasRole(['admin', 'ceo', 'developer', 'owner'])
    return true
  })

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
          <button onClick={() => setNotifDrawerOpen(true)} className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <Bell className="w-4 h-4 text-white/60" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
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
          'flex flex-col text-white flex-shrink-0 relative z-40 overflow-hidden',
          'hidden lg:flex',
        )}
        style={{ minWidth: collapsed ? 64 : 240, background: 'linear-gradient(170deg, #0b1525 0%, #1a2844 55%, #1e2d4e 100%)' }}
      >
        {/* subtle dot grid texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            opacity: 0.055,
          }}
        />
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
              <button
                onClick={() => setNotifDrawerOpen(true)}
                className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-white/60" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>

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
              'group relative flex items-center gap-2 w-full bg-brand hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-medium transition-all duration-150 text-sm shadow-md shadow-[#e85c1a]/20 hover:-translate-y-px active:translate-y-0 overflow-hidden',
              collapsed ? 'justify-center p-2' : 'px-3 py-2',
            )}
          >
            <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
            <Plus className="w-4 h-4 flex-shrink-0 relative z-10" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-nowrap relative z-10"
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
                    <>
                      <motion.span
                        layoutId="nav-indicator"
                        className="absolute inset-0 bg-white/12 rounded-lg"
                        transition={{ type: 'spring', stiffness: 380, damping: 35 }}
                      />
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#e85c1a] rounded-r-full shadow-[0_0_8px_rgba(232,92,26,0.6)]" />
                    </>
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
          {/* Activity streak — desktop expanded only */}
          {!collapsed && (() => {
            const streak = getActivityStreak()
            if (streak < 2) return null
            return (
              <div className="flex items-center gap-1.5 px-1.5 py-1 mb-2 rounded-md bg-white/5">
                <span className="text-xs">🔥</span>
                <span className="text-[10px] text-white/50">{streak} day streak</span>
              </div>
            )
          })()}
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
            className="lg:hidden fixed top-0 left-0 bottom-0 w-64 text-white z-50 flex flex-col overflow-hidden"
            style={{ background: 'linear-gradient(170deg, #0b1525 0%, #1a2844 55%, #1e2d4e 100%)' }}
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
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full rounded-lg p-1.5 hover:bg-white/10 transition-colors text-left text-white/60 hover:text-white"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">Sign out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0 relative">
        <ScrollToTop />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="min-h-full"
          >
            <PaymentPendingBanner />
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

      {/* ── Floating Help launcher ───────────────────────────────────────────── */}
      <motion.button
        onClick={() => {
          if (helpOpen && helpMinimized) { setHelpMinimized(false); return }
          if (helpOpen) { setHelpMinimized(true); return }
          setHelpOpen(true)
          setHelpMinimized(false)
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        className="fixed bottom-6 right-6 z-[9998] w-12 h-12 flex items-center justify-center rounded-full text-white shadow-xl transition-colors"
        style={{ background: helpOpen && !helpMinimized ? '#e85c1a' : '#1e2d4e' }}
        title="Help & Guide"
        aria-label="Open help"
      >
        <AnimatePresence mode="wait" initial={false}>
          {helpOpen && !helpMinimized ? (
            <motion.span key="minus"
              initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <HelpCircle className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span key="help"
              initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <HelpCircle className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Help panel ───────────────────────────────────────────────────────── */}
      <HelpPanel
        open={helpOpen}
        minimized={helpMinimized}
        onClose={() => { setHelpOpen(false); setHelpMinimized(false) }}
        onToggleMinimize={() => setHelpMinimized(v => !v)}
      />

      {/* ── Notifications drawer (7B.6) ──────────────────────────────────────── */}
      <NotificationsDrawer open={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} />
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
