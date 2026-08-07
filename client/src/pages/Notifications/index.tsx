import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Bell, CheckCheck, Package, FileText, BookOpen, AlertTriangle,
  RotateCcw, Layers, TrendingUp, ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { NotificationsEmptyIllustration } from '../../components/ui/illustrations'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import type { Notification } from '@shared/types'

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  quote_submitted:          { icon: FileText,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  quote_approved:           { icon: CheckCheck,    color: 'text-green-600',  bg: 'bg-green-50' },
  quote_rejected:           { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50' },
  kb_updated:               { icon: BookOpen,      color: 'text-indigo-600', bg: 'bg-indigo-50' },
  confidence_alert:         { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50' },
  quote_restored:           { icon: RotateCcw,     color: 'text-[#4a5568]',  bg: 'bg-[#f1f3f7]' },
  batch_completed:          { icon: Layers,        color: 'text-brand',      bg: 'bg-brand/10' },
  assembly_rollup_updated:  { icon: TrendingUp,    color: 'text-navy',       bg: 'bg-navy/10' },
}

const DEFAULT_META = { icon: Bell, color: 'text-[#9aa3b2]', bg: 'bg-surface-3' }

function getRef(n: Notification): { label: string; href: string } | null {
  if (!n.reference_id) return null
  if (n.reference_type === 'quotation') return { label: 'View Quote', href: `/quotes/${n.reference_id}` }
  if (n.reference_type === 'batch')     return { label: 'View Batch', href: `/bulk/${n.reference_id}` }
  if (n.reference_type === 'assembly')  return { label: 'View Assembly', href: `/assemblies/${n.reference_id}` }
  return null
}

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit:   { opacity: 0, x: 20, transition: { duration: 0.2 } },
}

export default function Notifications() {
  usePageTitle('Notifications')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
  })

  const readMut = useMutation({
    mutationFn: (id: string) => api.notifications.read(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: () => toast.error('Failed to mark as read'),
  })

  const readAllMut = useMutation({
    mutationFn: () => api.notifications.readAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('All notifications marked as read')
    },
    onError: () => toast.error('Failed to mark all as read'),
  })

  const unread = notifications.filter(n => !n.is_read).length
  const grouped = Object.entries(
    notifications.reduce<Record<string, Notification[]>>((acc, n) => {
      const day = format(new Date(n.created_at), 'yyyy-MM-dd')
      acc[day] = acc[day] ?? []
      acc[day].push(n)
      return acc
    }, {})
  ).sort(([a], [b]) => b.localeCompare(a))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Notifications</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">
            {unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => readAllMut.mutate()}
            loading={readAllMut.isPending} iconLeft={<CheckCheck className="w-3.5 h-3.5" />}>
            Mark all as read
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton variant="circle" width="2.5rem" height="2.5rem" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton variant="line" width="60%" />
                  <Skeleton variant="line" width="80%" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              illustration={<NotificationsEmptyIllustration />}
              title="No notifications yet"
              description="You'll see alerts here when quotes are submitted, approved, or need attention."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider mb-3 px-1">
                {format(new Date(day + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
              </p>
              <Card>
                <CardContent className="p-0 divide-y divide-[#e5e8ef]">
                  <AnimatePresence>
                    {items.map((n) => {
                      const meta = TYPE_META[n.type] ?? DEFAULT_META
                      const Icon = meta.icon
                      const ref = getRef(n)
                      return (
                        <motion.div
                          key={n.id}
                          variants={itemVariants}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          onClick={() => { if (!n.is_read) readMut.mutate(n.id) }}
                          className={cn(
                            'flex items-start gap-3 p-4 transition-colors cursor-pointer',
                            n.is_read ? 'bg-white' : 'bg-brand/3 hover:bg-brand/5',
                          )}
                        >
                          {/* Icon */}
                          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', meta.bg)}>
                            <Icon className={cn('w-4 h-4', meta.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn('text-sm font-medium', n.is_read ? 'text-[#4a5568]' : 'text-[#0f1729]')}>
                                {n.title}
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!n.is_read && (
                                  <span className="w-2 h-2 rounded-full bg-brand flex-shrink-0" />
                                )}
                                <span className="text-xs text-[#9aa3b2] whitespace-nowrap">
                                  {format(new Date(n.created_at), 'HH:mm')}
                                </span>
                              </div>
                            </div>
                            {n.message && (
                              <p className="text-sm text-[#9aa3b2] mt-0.5 leading-relaxed">{n.message}</p>
                            )}
                            {ref && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(ref.href) }}
                                className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1.5 font-medium"
                              >
                                {ref.label} <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
