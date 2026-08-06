import React, { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { User, BookOpen, Globe, Shield, Camera, Loader2, Eye, EyeOff, Check } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import KBManager from '../KBManager'
import RegionalRates from '../RegionalRates'
import Settings from '../Settings'

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

type NameForm     = z.infer<typeof nameSchema>
type PasswordForm = z.infer<typeof passwordSchema>

// ─── helpers ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin:        'bg-red-100 text-red-700',
  engineer:     'bg-blue-100 text-blue-700',
  cost_analyst: 'bg-purple-100 text-purple-700',
  ceo:          'bg-amber-100 text-amber-700',
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  return email?.[0]?.toUpperCase() ?? '?'
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [avatarLoading,   setAvatarLoading]   = useState(false)
  const [nameSaving,      setNameSaving]      = useState(false)
  const [passwordSaving,  setPasswordSaving]  = useState(false)
  const [showOld,         setShowOld]         = useState(false)
  const [showNew,         setShowNew]         = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)

  const nameForm = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    defaultValues: { full_name: user?.full_name ?? '' },
  })

  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

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

  async function handlePasswordSave(data: PasswordForm) {
    setPasswordSaving(true)
    try {
      await api.auth.changePassword({ old_password: data.old_password, new_password: data.new_password })
      toast.success('Password changed successfully')
      pwForm.reset()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e?.response?.data?.error ?? 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const initials = getInitials(user?.full_name, user?.email)

  return (
    <div className="space-y-5">

      {/* Avatar + basic info */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile picture</h2>
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name ?? 'Avatar'}
                className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1e2d4e] flex items-center justify-center text-white text-2xl font-bold ring-2 ring-gray-100">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {avatarLoading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.full_name ?? user?.email}</p>
            <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[user?.role ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
              {user?.role?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Click the avatar to upload a new image. JPEG, PNG or WebP, max 5 MB.</p>
      </div>

      {/* Display name */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Display name</h2>
        <form onSubmit={nameForm.handleSubmit(handleNameSave)} className="flex gap-3">
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

      {/* Password change */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Change password</h2>
        <form onSubmit={pwForm.handleSubmit(handlePasswordSave)} className="space-y-3 max-w-sm">
          {(
            [
              { field: 'old_password' as const,     label: 'Current password', show: showOld,     setShow: setShowOld },
              { field: 'new_password' as const,     label: 'New password',     show: showNew,     setShow: setShowNew },
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
    </div>
  )
}

// ─── Account page ─────────────────────────────────────────────────────────────

export default function Account() {
  const { hasRole } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'profile'

  const tabs = [
    { id: 'profile', label: 'My Profile',     icon: User },
    ...(hasRole(['admin']) ? [
      { id: 'kb',     label: 'Knowledge Base', icon: BookOpen },
      { id: 'rates',  label: 'Regional Rates', icon: Globe },
      { id: 'admin',  label: 'Administration', icon: Shield },
    ] : []),
  ]

  const isFullWidth = activeTab !== 'profile'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">Account</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage your profile and application settings</p>
      </div>

      {/* Tab bar */}
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
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className={isFullWidth ? '' : 'max-w-2xl mx-auto p-8'}>
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'kb'      && hasRole(['admin']) && <KBManager />}
        {activeTab === 'rates'   && hasRole(['admin']) && <RegionalRates />}
        {activeTab === 'admin'   && hasRole(['admin']) && <Settings />}
      </div>
    </div>
  )
}
