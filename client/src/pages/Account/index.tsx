import React, { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera, Loader2, Eye, EyeOff, Check,
  BookOpen, Globe, Users, Info, Plus, X,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { format } from 'date-fns'
import KBManager from '../KBManager'
import RegionalRates from '../RegionalRates'

// ─── constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['admin', 'ceo']

const ROLE_COLORS: Record<string, string> = {
  admin:        'bg-red-100 text-red-700',
  engineer:     'bg-blue-100 text-blue-700',
  cost_analyst: 'bg-purple-100 text-purple-700',
  ceo:          'bg-amber-100 text-amber-700',
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const nameSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
})

const passwordSchema = z
  .object({
    old_password:     z.string().min(1, 'Current password is required'),
    new_password:     z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

const createUserSchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  email:    z.string().email('Valid email required'),
  role:     z.enum(['admin', 'engineer', 'cost_analyst', 'ceo']),
  password: z.string().min(8, 'At least 8 characters'),
})

type NameForm       = z.infer<typeof nameSchema>
type PasswordForm   = z.infer<typeof passwordSchema>
type CreateUserForm = z.infer<typeof createUserSchema>

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  return email?.[0]?.toUpperCase() ?? '?'
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

// ─── CreateUserModal ─────────────────────────────────────────────────────────

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
      onSuccess()
      onClose()
    } catch {
      toast.error('Failed to create user')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-[#1e2d4e]">Create User</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {[
            { field: 'name'  as const, label: 'Full Name',    type: 'text',     placeholder: 'John Doe' },
            { field: 'email' as const, label: 'Email Address', type: 'email',   placeholder: 'john@company.com' },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <input
                {...register(field)}
                type={type}
                placeholder={placeholder}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30 ${errors[field] ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors[field] && <p className="text-xs text-red-500 mt-1">{errors[field]?.message}</p>}
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <select {...register('role')} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30">
              <option value="engineer">Engineer</option>
              <option value="cost_analyst">Cost Analyst</option>
              <option value="ceo">CEO</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Initial Password</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPw ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                className={`w-full border rounded-lg px-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30 ${errors.password ? 'border-red-400' : 'border-gray-200'}`}
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1e2d4e] hover:bg-[#2a3f6e] disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create User
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, updateUser, hasRole } = useAuth()
  const queryClient = useQueryClient()
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

  const nameForm = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    defaultValues: { full_name: user?.full_name ?? '' },
  })
  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  const isAdmin = hasRole(ADMIN_ROLES)

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn:  api.users.list,
    enabled:  isAdmin,
  })

  // ── avatar ────────────────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const { user: updated } = await api.auth.uploadAvatar(fd)
      updateUser({ avatar_url: updated.avatar_url })
      toast.success('Profile picture updated')
    } catch {
      toast.error('Failed to upload image')
    } finally {
      setAvatarLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── name ──────────────────────────────────────────────────────────────────

  async function handleNameSave(data: NameForm) {
    setNameSaving(true)
    try {
      const { user: updated } = await api.auth.updateProfile({ full_name: data.full_name })
      updateUser({ full_name: updated.full_name })
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setNameSaving(false)
    }
  }

  // ── password ──────────────────────────────────────────────────────────────

  async function handlePasswordSave(data: PasswordForm) {
    setPasswordSaving(true)
    try {
      await api.auth.changePassword({ old_password: data.old_password, new_password: data.new_password })
      toast.success('Password changed')
      pwForm.reset()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e?.response?.data?.error ?? 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  // ── user management ───────────────────────────────────────────────────────

  async function handleToggleActive(u: any) {
    setTogglingId(u.id)
    try {
      await api.users.update(u.id, { is_active: !u.is_active })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(`User ${u.is_active ? 'deactivated' : 'activated'}`)
    } catch {
      toast.error('Failed to update user status')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRoleChange(u: any, newRole: string) {
    setUpdatingRoleId(u.id)
    try {
      await api.users.update(u.id, { role: newRole })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(`Role updated`)
    } catch {
      toast.error('Failed to update role')
    } finally {
      setUpdatingRoleId(null)
    }
  }

  const initials = getInitials(user?.full_name, user?.email)

  return (
    <div className="space-y-5">

      {/* ── Avatar + info ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile picture</h2>
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name ?? 'Avatar'} className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-100" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1e2d4e] flex items-center justify-center text-white text-2xl font-bold ring-2 ring-gray-100">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.full_name ?? user?.email}</p>
            <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <RoleBadge role={user?.role ?? ''} />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                Active
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Click the avatar to upload a new image. JPEG, PNG or WebP, max 5 MB.</p>
      </div>

      {/* ── Display name ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Display name</h2>
        <form onSubmit={nameForm.handleSubmit(handleNameSave)} className="flex gap-3 max-w-sm">
          <div className="flex-1">
            <input
              {...nameForm.register('full_name')}
              placeholder="Your full name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e] focus:border-transparent transition-all"
            />
            {nameForm.formState.errors.full_name && (
              <p className="text-xs text-red-600 mt-1">{nameForm.formState.errors.full_name.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={nameSaving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#1e2d4e] hover:bg-[#2a3f6e] disabled:opacity-60 transition-colors"
          >
            {nameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </form>
      </div>

      {/* ── Password ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Change password</h2>
        <form onSubmit={pwForm.handleSubmit(handlePasswordSave)} className="space-y-3 max-w-sm">
          {(
            [
              { field: 'old_password'     as const, label: 'Current password', show: showOld,     setShow: setShowOld },
              { field: 'new_password'     as const, label: 'New password',     show: showNew,     setShow: setShowNew },
              { field: 'confirm_password' as const, label: 'Confirm new',      show: showConfirm, setShow: setShowConfirm },
            ] as const
          ).map(({ field, label, show, setShow }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="relative">
                <input
                  {...pwForm.register(field)}
                  type={show ? 'text' : 'password'}
                  className="w-full border border-gray-200 rounded-lg px-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e] focus:border-transparent transition-all"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwForm.formState.errors[field] && (
                <p className="text-xs text-red-600 mt-1">{pwForm.formState.errors[field]?.message}</p>
              )}
            </div>
          ))}
          <div className="pt-1">
            <button
              type="submit"
              disabled={passwordSaving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#1e2d4e] hover:bg-[#2a3f6e] disabled:opacity-60 transition-colors"
            >
              {passwordSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Change password
            </button>
          </div>
        </form>
      </div>

      {/* ── Admin-only sections ────────────────────────────────────────────── */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Administration</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* User management */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#e85c1a]" />
                <h2 className="text-sm font-semibold text-gray-700">User Management</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#e85c1a] hover:bg-[#d04e14] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Create User
              </button>
            </div>
            {usersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#e85c1a]" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-3 pr-4 font-medium">Name</th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">Role</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Created</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {allUsers.map((u) => {
                      const isSelf = u.id === user?.id
                      return (
                        <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                          <td className="py-3 pr-4 font-medium text-[#1e2d4e]">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#1e2d4e]/10 flex items-center justify-center text-xs font-bold text-[#1e2d4e] flex-shrink-0">
                                {getInitials(u.full_name)}
                              </div>
                              <span>{u.full_name}</span>
                              {isSelf && <span className="text-xs text-gray-400 font-normal">(you)</span>}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-gray-400 text-xs">{u.email}</td>
                          <td className="py-3 pr-4">
                            {isSelf ? (
                              <RoleBadge role={u.role} />
                            ) : (
                              <div className="flex items-center gap-1">
                                <select
                                  value={u.role}
                                  disabled={updatingRoleId === u.id}
                                  onChange={(e) => handleRoleChange(u, e.target.value)}
                                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30 bg-white"
                                >
                                  <option value="engineer">Engineer</option>
                                  <option value="cost_analyst">Cost Analyst</option>
                                  <option value="ceo">CEO</option>
                                  <option value="admin">Admin</option>
                                </select>
                                {updatingRoleId === u.id && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">
                            {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy') : '—'}
                          </td>
                          <td className="py-3">
                            {!isSelf && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                disabled={togglingId === u.id}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${u.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
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
          </div>

          {/* App info */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Application Information</h2>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Version',     value: 'ProqrIQ v1.0.0' },
                { label: 'Environment', value: typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'Development' : 'Production' },
                { label: 'API',         value: '/api' },
                { label: 'Database',    value: 'Turso (SQLite)' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
                  <dd className="text-sm font-semibold text-gray-700 font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </div>
  )
}

// ─── Account page ─────────────────────────────────────────────────────────────

export default function Account() {
  const { hasRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'profile'

  const isAdmin = hasRole(ADMIN_ROLES)

  const tabs = [
    { id: 'profile', label: 'Profile',         icon: null },
    ...(isAdmin ? [
      { id: 'kb',    label: 'Knowledge Base',  icon: BookOpen },
      { id: 'rates', label: 'Regional Rates',  icon: Globe },
    ] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">Account</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage your profile and settings</p>
      </div>

      {/* Tab bar — only show if more than one tab */}
      {tabs.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-8">
          <nav className="flex gap-0.5 -mb-px">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSearchParams({ tab: id })}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-[#1e2d4e] text-[#1e2d4e]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className={activeTab === 'profile' ? 'max-w-2xl mx-auto p-8' : ''}>
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'kb'      && isAdmin && <KBManager />}
        {activeTab === 'rates'   && isAdmin && <RegionalRates />}
      </div>
    </div>
  )
}
