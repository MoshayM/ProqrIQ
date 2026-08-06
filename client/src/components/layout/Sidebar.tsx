import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Plus,
  Layers,
  Package,
  UserCircle,
  LogOut,
  Bell,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Notification } from '@shared/types'

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const { data: notifs } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000,
  })

  const unread = notifs?.filter((n) => !n.is_read).length ?? 0

  const navItems = [
    { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
    { to: '/quotes',      label: 'All Quotes',   icon: FileText },
    { to: '/quotes/new',  label: 'New Quote',    icon: Plus },
    { to: '/bulk',        label: 'Bulk Costing', icon: Layers },
    { to: '/assemblies',  label: 'Assemblies',   icon: Package },
  ]


  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 bg-[#1e2d4e] text-white flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ProqrIQ</h1>
          <p className="text-xs text-white/50 mt-0.5">Cost Engineering</p>
        </div>
        <NavLink
          to="/notifications"
          className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-white/70" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#e85c1a] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </NavLink>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-[#e85c1a] text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}

      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-white/10 pt-3">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              isActive ? 'bg-[#e85c1a] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            )
          }
        >
          <UserCircle className="w-4 h-4" />
          Account
        </NavLink>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>

        {/* User profile chip */}
        <NavLink to="/account" className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name ?? 'Avatar'} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#e85c1a] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name ?? user?.email ?? 'Unknown user'}
            </p>
            <p className="text-xs text-white/50 capitalize mt-0.5">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </NavLink>
      </div>
    </aside>
  )
}
