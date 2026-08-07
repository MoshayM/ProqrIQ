import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Notification } from '@shared/types'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/quotes',     label: 'Quotations',  icon: FileText },
  { to: '/bulk',       label: 'Bulk Costing', icon: Layers },
  { to: '/assemblies', label: 'Assemblies',  icon: Package },
]

const sidebarVariants = {
  expanded: { width: 240 },
  collapsed: { width: 64 },
}

export default function PersistentLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

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
    (item) => !item.adminOnly || hasRole(['admin']),
  )

  return (
    <div className="flex h-screen overflow-hidden bg-surface-2">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={collapsed ? 'collapsed' : 'expanded'}
        variants={sidebarVariants}
        transition={{ type: 'spring', stiffness: 380, damping: 35 }}
        className="flex flex-col bg-navy text-white flex-shrink-0 relative z-30 overflow-hidden"
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

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
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
