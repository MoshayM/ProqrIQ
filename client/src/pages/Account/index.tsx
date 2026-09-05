import React, { useRef, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Eye, EyeOff, Check, BookOpen, Globe, Users, Info, Plus, X, Loader2, LogOut,
  CreditCard, Trash2, AlertTriangle, ShieldAlert, RotateCcw, Clock, BarChart3,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api, extractApiError } from '../../lib/api'
import { format, formatDistanceToNow } from 'date-fns'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import KBManager from '../KBManager'
import RegionalRates from '../RegionalRates'
import Billing from '../Billing'
import AdminAnalytics from '../AdminAnalytics'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { PlanBadge } from '../../components/ui/PlanBadge'
import { useSubscription } from '../../hooks/useSubscription'

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

const ROLE_COLORS: Record<string, string> = {
  admin:        'bg-red-50 text-red-700',
  engineer:     'bg-blue-50 text-blue-700',
  cost_analyst: 'bg-purple-50 text-purple-700',
  ceo:          'bg-amber-50 text-amber-700',
  developer:    'bg-indigo-50 text-indigo-700',
  owner:        'bg-emerald-50 text-emerald-700',
}

const nameSchema     = z.object({ full_name: z.string().min(1, 'Name is required').max(100) })
const passwordSchema = z.object({
  old_password:     z.string().min(1, 'Current password is required'),
  new_password:     z.string().min(8, 'At least 8 characters'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] })

const createUserSchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  email:    z.string().email('Valid email required'),
  role:     z.enum(['admin', 'engineer', 'cost_analyst', 'ceo', 'developer', 'owner']),
  password: z.string().min(8, 'At least 8 characters'),
})

type NameForm       = z.infer<typeof nameSchema>
type PasswordForm   = z.infer<typeof passwordSchema>
type CreateUserForm = z.infer<typeof createUserSchema>

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return email?.[0]?.toUpperCase() ?? '?'
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', ROLE_COLORS[role] ?? 'bg-surface-3 text-[#4a5568]')}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

function SectionCard({ title, icon, children, action }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e8ef] p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-[#0f1729]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── CreateUserModal ──────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'engineer' },
  })

  async function onSubmit(data: CreateUserForm) {
    try {
      await api.users.create(data)
      toast.success(`User ${data.name} created`)
      onSuccess(); onClose()
    } catch { toast.error('Failed to create user') }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e8ef]">
          <h2 className="text-base font-semibold text-[#0f1729]">Create User</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 text-[#9aa3b2] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {[
            { field: 'name' as const,  label: 'Full Name',     type: 'text',  placeholder: 'John Doe' },
            { field: 'email' as const, label: 'Email Address', type: 'email', placeholder: 'john@company.com' },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-[#0f1729] mb-1.5">{label}</label>
              <input
                {...register(field)} type={type} placeholder={placeholder}
                className={cn('w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all', errors[field] ? 'border-red-400' : 'border-[#e5e8ef]')}
              />
              {errors[field] && <p className="text-xs text-red-500 mt-1">{errors[field]?.message}</p>}
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-[#0f1729] mb-1.5">Role</label>
            <select {...register('role')} className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
              <option value="engineer">Engineer</option>
              <option value="cost_analyst">Cost Analyst</option>
              <option value="ceo">CEO</option>
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0f1729] mb-1.5">Initial Password</label>
            <div className="relative">
              <input
                {...register('password')} type={showPw ? 'text' : 'password'} placeholder="Minimum 8 characters"
                className={cn('w-full border rounded-lg px-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent', errors.password ? 'border-red-400' : 'border-[#e5e8ef]')}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
          </div>
          <Button type="submit" variant="navy" size="md" className="w-full" loading={isSubmitting} iconLeft={!isSubmitting ? <Plus className="w-4 h-4" /> : undefined}>
            Create User
          </Button>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ─── DeleteAccountDialog ──────────────────────────────────────────────────────

type DeleteStep = 'warn' | 'confirm' | 'choose' | 'done'
type DeleteMode = 'scheduled' | 'immediate'

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth()
  const navigate          = useNavigate()
  const [step, setStep]   = useState<DeleteStep>('warn')
  const [mode, setMode]   = useState<DeleteMode>('scheduled')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)

  async function handleDelete() {
    if (!password) { setError('Password is required'); return }
    setError(''); setLoading(true)
    try {
      if (mode === 'scheduled') {
        const { deletion_scheduled_at } = await api.auth.deleteAccount(password)
        setScheduledAt(deletion_scheduled_at)
      } else {
        await api.auth.deleteAccountNow(password)
      }
      setStep('done')
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete account. Check your password.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDoneClose() {
    if (mode === 'immediate') {
      await logout()
      navigate('/login', { replace: true })
    } else {
      onClose()
    }
  }

  const WHAT_GETS_DELETED = [
    'All your quotations and cost breakdowns',
    'Uploaded part drawings and files',
    'Supplier quotes and negotiation reports',
    'Your profile picture and personal data',
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-6 py-4 border-b border-[#e5e8ef]',
          step === 'done' ? 'bg-white' : 'bg-red-50',
        )}>
          <div className="flex items-center gap-2.5">
            {step === 'done'
              ? <Check className="w-5 h-5 text-emerald-500" />
              : <ShieldAlert className="w-5 h-5 text-red-500" />}
            <h2 className="text-base font-semibold text-[#0f1729]">
              {step === 'warn'    && 'Delete Account'}
              {step === 'confirm' && 'Confirm Identity'}
              {step === 'choose'  && 'Choose Deletion Type'}
              {step === 'done'    && (mode === 'immediate' ? 'Account Deleted' : 'Deletion Scheduled')}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-red-100 text-[#9aa3b2] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1 — Warning */}
          {step === 'warn' && (
            <div className="space-y-4">
              <div className="flex gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 leading-relaxed">
                  You are about to delete your account. This action has serious consequences and may be irreversible.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider mb-2">What will be removed</p>
                <ul className="space-y-2">
                  {WHAT_GETS_DELETED.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[#4a5568]">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong>7-day grace period available.</strong> You can schedule deletion and restore your account within 7 days by logging back in.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
                  Keep My Account
                </Button>
                <button
                  onClick={() => setStep('confirm')}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                >
                  I understand, continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Confirm identity */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-[#4a5568] leading-relaxed">
                To confirm it's you, enter the password for <span className="font-semibold text-[#0f1729]">{user?.email}</span>.
              </p>
              <div>
                <label className="block text-xs font-medium text-[#9aa3b2] mb-1.5">Your password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') setStep('choose') }}
                    placeholder="Enter your password"
                    className={cn(
                      'w-full border rounded-lg px-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all',
                      error ? 'border-red-400' : 'border-[#e5e8ef]',
                    )}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568]">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" size="md" className="flex-1" onClick={() => setStep('warn')}>
                  Back
                </Button>
                <button
                  onClick={() => { if (password) { setError(''); setStep('choose') } else setError('Password is required') }}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Choose deletion type */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-[#4a5568]">Choose how you want to delete your account:</p>

              {/* Scheduled */}
              <label className={cn(
                'flex gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                mode === 'scheduled' ? 'border-amber-400 bg-amber-50' : 'border-[#e5e8ef] hover:border-[#c8cdd8]',
              )}>
                <input type="radio" name="mode" className="mt-1 accent-amber-500" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} />
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-semibold text-[#0f1729]">Schedule deletion (7 days)</p>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Recommended</span>
                  </div>
                  <p className="text-xs text-[#9aa3b2] mt-1 leading-relaxed">
                    Your account is deactivated now but recoverable for 7 days. Log back in any time to restore everything.
                  </p>
                </div>
              </label>

              {/* Immediate */}
              <label className={cn(
                'flex gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                mode === 'immediate' ? 'border-red-400 bg-red-50' : 'border-[#e5e8ef] hover:border-[#c8cdd8]',
              )}>
                <input type="radio" name="mode" className="mt-1 accent-red-500" checked={mode === 'immediate'} onChange={() => setMode('immediate')} />
                <div>
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <p className="text-sm font-semibold text-[#0f1729]">Delete immediately</p>
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Permanent</span>
                  </div>
                  <p className="text-xs text-[#9aa3b2] mt-1 leading-relaxed">
                    All personal data is wiped right now. This cannot be undone.
                  </p>
                </div>
              </label>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-3 pt-1">
                <Button variant="outline" size="md" className="flex-1" onClick={() => setStep('confirm')}>
                  Back
                </Button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60',
                    mode === 'immediate' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600',
                  )}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {loading ? 'Processing…' : mode === 'immediate' ? 'Delete now' : 'Schedule deletion'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 'done' && (
            <div className="text-center space-y-4 py-2">
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mx-auto',
                mode === 'immediate' ? 'bg-red-100' : 'bg-amber-100',
              )}>
                {mode === 'immediate'
                  ? <Trash2 className="w-8 h-8 text-red-500" />
                  : <Clock className="w-8 h-8 text-amber-500" />}
              </div>
              {mode === 'immediate' ? (
                <>
                  <p className="text-base font-semibold text-[#0f1729]">Account deleted</p>
                  <p className="text-sm text-[#9aa3b2] leading-relaxed">Your personal data has been permanently removed. You will be signed out now.</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-[#0f1729]">Deletion scheduled</p>
                  {scheduledAt && (
                    <p className="text-sm text-[#9aa3b2] leading-relaxed">
                      Your account will be permanently deleted on{' '}
                      <span className="font-semibold text-[#0f1729]">{format(new Date(scheduledAt), 'dd MMM yyyy, HH:mm')}</span>.
                      Log back in any time before then to cancel.
                    </p>
                  )}
                </>
              )}
              <button
                onClick={handleDoneClose}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-colors',
                  mode === 'immediate' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600',
                )}
              >
                {mode === 'immediate' ? 'Sign out' : 'Close'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, updateUser, hasRole, logout } = useAuth()
  const navigate = useNavigate()
  const { plan } = useSubscription()
  const queryClient = useQueryClient()

  const deletionScheduledAt: string | null = (user as any)?.deletion_scheduled_at ?? null
  const isDeletionPending = !!deletionScheduledAt && new Date(deletionScheduledAt) > new Date()

  async function handleSignOut() {
    await logout()
    navigate('/login')
  }

  async function handleRestoreDeletion() {
    setRestoringDeletion(true)
    try {
      await api.auth.restoreAccount()
      toast.success('Account restoration confirmed — your account is active again.')
      // Refresh user profile
      queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Failed to restore account'))
    } finally {
      setRestoringDeletion(false)
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)

  const [avatarLoading,  setAvatarLoading]  = useState(false)
  const [nameSaving,     setNameSaving]     = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [showOld,        setShowOld]        = useState(false)
  const [showNew,        setShowNew]        = useState(false)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [togglingId,     setTogglingId]     = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [restoringDeletion, setRestoringDeletion] = useState(false)

  const nameForm = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { full_name: user?.full_name ?? '' } })
  const pwForm   = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })
  const isAdmin  = hasRole(ADMIN_ROLES)

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<{ id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string }[]>({
    queryKey: ['users'],
    queryFn:  api.users.list,
    enabled:  isAdmin,
  })

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setAvatarLoading(true)
    try {
      const fd = new FormData(); fd.append('avatar', file)
      const { user: updated } = await api.auth.uploadAvatar(fd)
      updateUser({ avatar_url: updated.avatar_url })
      toast.success('Profile picture updated')
    } catch { toast.error('Failed to upload image') }
    finally { setAvatarLoading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleNameSave(data: NameForm) {
    setNameSaving(true)
    try {
      const { user: updated } = await api.auth.updateProfile({ full_name: data.full_name })
      updateUser({ full_name: updated.full_name }); toast.success('Name updated')
    } catch { toast.error('Failed to update name') }
    finally { setNameSaving(false) }
  }

  async function handlePasswordSave(data: PasswordForm) {
    setPasswordSaving(true)
    try {
      await api.auth.changePassword({ old_password: data.old_password, new_password: data.new_password })
      toast.success('Password changed'); pwForm.reset()
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password')
    } finally { setPasswordSaving(false) }
  }

  async function handleToggleActive(u: { id: string; is_active: boolean }) {
    setTogglingId(u.id)
    try {
      await api.users.update(u.id, { is_active: !u.is_active })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(`User ${u.is_active ? 'deactivated' : 'activated'}`)
    } catch { toast.error('Failed to update user status') }
    finally { setTogglingId(null) }
  }

  async function handleRoleChange(u: { id: string }, newRole: string) {
    setUpdatingRoleId(u.id)
    try {
      await api.users.update(u.id, { role: newRole })
      queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Role updated')
    } catch { toast.error('Failed to update role') }
    finally { setUpdatingRoleId(null) }
  }

  const initials = getInitials(user?.full_name, user?.email)

  return (
    <div className="space-y-5">

      {/* Avatar + info */}
      <SectionCard title="Profile Picture">
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name ?? 'Avatar'} className="w-20 h-20 rounded-full object-cover ring-2 ring-[#e5e8ef]" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-navy flex items-center justify-center text-white text-2xl font-bold ring-2 ring-[#e5e8ef]">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="font-semibold text-[#0f1729]">{user?.full_name ?? user?.email}</p>
            <p className="text-sm text-[#9aa3b2] mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <RoleBadge role={user?.role ?? ''} />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />Active
              </span>
              <Link to="/account?tab=billing" className="flex items-center gap-1.5 text-xs text-[#e85c1a] hover:underline font-medium">
                <PlanBadge plan={plan} />
                Manage billing →
              </Link>
            </div>
          </div>
        </div>
        <p className="text-xs text-[#9aa3b2] mt-3">Click the avatar to upload a new image. JPEG, PNG or WebP, max 5 MB.</p>
      </SectionCard>

      {/* Display name */}
      <SectionCard title="Display Name">
        <form onSubmit={nameForm.handleSubmit(handleNameSave)} className="flex gap-3 max-w-sm">
          <div className="flex-1">
            <input
              {...nameForm.register('full_name')}
              placeholder="Your full name"
              className="w-full border border-[#e5e8ef] rounded-lg px-3 py-2.5 text-sm text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all"
            />
            {nameForm.formState.errors.full_name && (
              <p className="text-xs text-red-600 mt-1">{nameForm.formState.errors.full_name.message}</p>
            )}
          </div>
          <Button type="submit" variant="navy" size="md" loading={nameSaving} iconLeft={!nameSaving ? <Check className="w-3.5 h-3.5" /> : undefined}>
            Save
          </Button>
        </form>
      </SectionCard>

      {/* Password */}
      <SectionCard title="Change Password">
        <form onSubmit={pwForm.handleSubmit(handlePasswordSave)} className="space-y-3 max-w-sm">
          {([
            { field: 'old_password'     as const, label: 'Current password', show: showOld,     setShow: setShowOld },
            { field: 'new_password'     as const, label: 'New password',     show: showNew,     setShow: setShowNew },
            { field: 'confirm_password' as const, label: 'Confirm new',      show: showConfirm, setShow: setShowConfirm },
          ] as const).map(({ field, label, show, setShow }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-[#9aa3b2] mb-1">{label}</label>
              <div className="relative">
                <input
                  {...pwForm.register(field)} type={show ? 'text' : 'password'}
                  className="w-full border border-[#e5e8ef] rounded-lg px-3 pr-9 py-2.5 text-sm text-[#0f1729] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all"
                />
                <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors[field] && (
                <p className="text-xs text-red-600 mt-1">{pwForm.formState.errors[field]?.message}</p>
              )}
            </div>
          ))}
          <div className="pt-1">
            <Button type="submit" variant="navy" size="md" loading={passwordSaving} iconLeft={!passwordSaving ? <Check className="w-3.5 h-3.5" /> : undefined}>
              Change password
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* Admin sections */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-[#e5e8ef]" />
            <span className="text-xs font-semibold text-[#9aa3b2] uppercase tracking-widest">Administration</span>
            <div className="flex-1 h-px bg-[#e5e8ef]" />
          </div>

          {/* User Management */}
          <SectionCard
            title="User Management"
            icon={<Users className="w-4 h-4 text-brand" />}
            action={
              <Button size="sm" onClick={() => setShowCreateModal(true)} iconLeft={<Plus className="w-3.5 h-3.5" />}>
                Create User
              </Button>
            }
          >
            {usersLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} height="44px" className="rounded-lg" />)}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e8ef] text-left">
                      {['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(col => (
                        <th key={col} className="pb-3 px-6 text-xs font-semibold text-[#9aa3b2] uppercase tracking-wider">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e8ef]">
                    {allUsers.map(u => {
                      const isSelf = u.id === user?.id
                      return (
                        <tr key={u.id} className={cn('hover:bg-surface-2 transition-colors', !u.is_active && 'opacity-60')}>
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-navy/10 flex items-center justify-center text-xs font-bold text-navy flex-shrink-0">
                                {getInitials(u.full_name)}
                              </div>
                              <span className="font-medium text-[#0f1729] text-sm">{u.full_name}</span>
                              {isSelf && <span className="text-xs text-[#9aa3b2]">(you)</span>}
                            </div>
                          </td>
                          <td className="py-3 px-6 text-[#9aa3b2] text-xs">{u.email}</td>
                          <td className="py-3 px-6">
                            {isSelf ? <RoleBadge role={u.role} /> : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={u.role} disabled={updatingRoleId === u.id}
                                  onChange={e => handleRoleChange(u, e.target.value)}
                                  className="border border-[#e5e8ef] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-navy bg-white text-[#0f1729]"
                                >
                                  <option value="engineer">Engineer</option>
                                  <option value="cost_analyst">Cost Analyst</option>
                                  <option value="ceo">CEO</option>
                                  <option value="admin">Admin</option>
                                </select>
                                {updatingRoleId === u.id && <Loader2 className="w-3 h-3 animate-spin text-[#9aa3b2]" />}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-6">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-3 text-[#9aa3b2]')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', u.is_active ? 'bg-emerald-500' : 'bg-[#c8cdd8]')} />
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-[#9aa3b2] text-xs whitespace-nowrap">
                            {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : '—'}
                          </td>
                          <td className="py-3 px-6">
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                disabled={togglingId === u.id}
                                className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-60', u.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')}
                              >
                                {togglingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* App Info */}
          <SectionCard title="Application Information" icon={<Info className="w-4 h-4 text-[#9aa3b2]" />}>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Version',     value: 'ProqrIQ v1.0.0' },
                { label: 'Environment', value: typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'Development' : 'Production' },
                { label: 'API',         value: '/api' },
                { label: 'Database',    value: 'Turso (libSQL)' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-2 rounded-xl p-3 border border-[#e5e8ef]">
                  <dt className="text-xs font-medium text-[#9aa3b2] uppercase tracking-wide mb-1">{label}</dt>
                  <dd className="text-sm font-semibold text-[#0f1729] font-mono truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {/* Sign Out */}
      <SectionCard title="Session">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#0f1729] font-medium">Sign out</p>
            <p className="text-xs text-[#9aa3b2] mt-0.5">End your current session on this device</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            iconLeft={<LogOut className="w-4 h-4" />}
          >
            Sign out
          </Button>
        </div>
      </SectionCard>

      {/* ── Danger Zone — hidden for admin/developer ──────────────────────── */}
      {!['admin', 'developer'].includes(user?.role ?? '') && <>
        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 h-px bg-red-200" />
          <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">Danger Zone</span>
          <div className="flex-1 h-px bg-red-200" />
        </div>

        {/* Deletion-pending banner */}
        {isDeletionPending && deletionScheduledAt && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3"
          >
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Account deletion scheduled</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Your account will be permanently deleted{' '}
                <strong>{formatDistanceToNow(new Date(deletionScheduledAt), { addSuffix: true })}</strong>{' '}
                ({format(new Date(deletionScheduledAt), 'dd MMM yyyy, HH:mm')}). Log in any time before then to cancel.
              </p>
            </div>
            <Button
              size="sm"
              loading={restoringDeletion}
              iconLeft={!restoringDeletion ? <RotateCcw className="w-3.5 h-3.5" /> : undefined}
              onClick={handleRestoreDeletion}
              className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white border-0"
            >
              Restore
            </Button>
          </motion.div>
        )}

        <div className="bg-white rounded-xl border border-red-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className="w-4 h-4 text-red-500" />
                <p className="text-sm font-semibold text-[#0f1729]">Delete account</p>
              </div>
              <p className="text-xs text-[#9aa3b2] leading-relaxed max-w-sm">
                Permanently remove your account and all associated data. You can choose a 7-day grace period for recovery, or delete immediately.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete account
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showDeleteDialog && <DeleteAccountDialog onClose={() => setShowDeleteDialog(false)} />}
        </AnimatePresence>
      </>}
    </div>
  )
}

// ─── Account page ─────────────────────────────────────────────────────────────

export default function Account() {
  usePageTitle('Account')
  const { hasRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'profile'
  const isAdmin   = hasRole(ADMIN_ROLES)

  const isBypassRole = hasRole(['admin', 'developer', 'owner'])

  const tabs = [
    { id: 'profile', label: 'Profile',        icon: null },
    ...(!isBypassRole ? [{ id: 'billing', label: 'Plans & Billing', icon: CreditCard }] : []),
    ...(isAdmin ? [
      { id: 'kb',        label: 'Knowledge Base', icon: BookOpen },
      { id: 'rates',     label: 'Regional Rates', icon: Globe },
      { id: 'analytics', label: 'Analytics',      icon: BarChart3 },
    ] : []),
  ]

  return (
    <div className="min-h-screen bg-surface-2">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white border-b border-[#e5e8ef] px-8 py-5"
      >
        <h1 className="text-xl font-bold text-[#0f1729]">Account</h1>
        <p className="text-sm text-[#9aa3b2] mt-0.5">Manage your profile and settings</p>
      </motion.div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="bg-white border-b border-[#e5e8ef] px-8">
          <nav className="relative flex gap-0.5 -mb-px">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSearchParams({ tab: id })}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === id ? 'text-[#0f1729]' : 'text-[#9aa3b2] hover:text-[#4a5568]',
                )}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {label}
                {activeTab === id && (
                  <motion.div
                    layoutId="account-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-navy rounded-t-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className={activeTab === 'profile' ? 'max-w-2xl mx-auto p-8' : ''}>
        {activeTab === 'profile'    && <ProfileTab />}
        {activeTab === 'billing'    && <Billing />}
        {activeTab === 'kb'         && isAdmin && <UpgradeGate requiredPlan="organization" feature="Knowledge Base Manager"><KBManager /></UpgradeGate>}
        {activeTab === 'rates'      && isAdmin && <UpgradeGate requiredPlan="organization" feature="Regional Rates"><RegionalRates /></UpgradeGate>}
        {activeTab === 'analytics'  && isAdmin && <AdminAnalytics />}
      </div>
    </div>
  )
}
