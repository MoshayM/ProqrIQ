import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { User, Shield, Lock, Users, Info, Eye, EyeOff, Check, X, Loader2, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { format } from 'date-fns';

interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'engineer' | 'cost_analyst' | 'ceo';
  is_active: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'engineer' | 'cost_analyst' | 'ceo';
}

// ─── ROLE BADGE ──────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  engineer: 'bg-blue-100 text-blue-700',
  cost_analyst: 'bg-purple-100 text-purple-700',
  ceo: 'bg-amber-100 text-amber-700',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.replace(/_/g, ' ')}
    </span>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── PASSWORD SCHEMA ─────────────────────────────────────────────────────────

const passwordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

// ─── CREATE USER SCHEMA ──────────────────────────────────────────────────────

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  role: z.enum(['admin', 'engineer', 'cost_analyst', 'ceo']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

// ─── PROFILE SECTION ─────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: Profile }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-[#e85c1a]" />
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Profile</h2>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-[#1e2d4e] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {getInitials(user.full_name)}
          </div>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold text-[#1e2d4e]">{user.full_name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <RoleBadge role={user.role} />
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                Account Active
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── PASSWORD SECTION ─────────────────────────────────────────────────────────

function PasswordSection({ userId }: { userId: string }) {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit(data: PasswordFormData) {
    setIsSubmitting(true);
    try {
      await api.users.update(userId, { password: data.newPassword });
      toast.success('Password updated successfully');
      reset();
    } catch {
      toast.error('Failed to update password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#e85c1a]" />
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Change Password</h2>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
          {/* Current Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input
                {...register('oldPassword')}
                type={showOld ? 'text' : 'password'}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.oldPassword ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.oldPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.oldPassword.message}</p>
            )}
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                {...register('newPassword')}
                type={showNew ? 'text' : 'password'}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.newPassword ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                {...register('confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.confirmPassword ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Re-enter new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2 px-5"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── CREATE USER MODAL ───────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'engineer' },
  });

  async function onSubmit(data: CreateUserFormData) {
    setIsSubmitting(true);
    try {
      await api.users.create(data);
      toast.success(`User ${data.name} created`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Create User</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              {...register('name')}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="John Doe"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input
              {...register('email')}
              type="email"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.email ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="john@company.com"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <select
              {...register('role')}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.role ? 'border-red-400' : 'border-gray-300'}`}
            >
              <option value="engineer">Engineer</option>
              <option value="cost_analyst">Cost Analyst</option>
              <option value="ceo">CEO</option>
              <option value="admin">Admin</option>
            </select>
            {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Initial Password</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 ${errors.password ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#e85c1a] hover:bg-[#d04e14] text-white font-semibold py-2.5 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create User
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── ADMIN SECTION ───────────────────────────────────────────────────────────

function AdminSection({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  async function handleToggleActive(u: UserRecord) {
    setTogglingId(u.id);
    try {
      await api.users.update(u.id, { is_active: !u.is_active });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`User ${u.is_active ? 'deactivated' : 'activated'}`);
    } catch {
      toast.error('Failed to update user status');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRoleChange(u: UserRecord, newRole: string) {
    setUpdatingRoleId(u.id);
    try {
      await api.users.update(u.id, { role: newRole });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Role updated to ${newRole.replace(/_/g, ' ')}`);
    } catch {
      toast.error('Failed to update role');
    } finally {
      setUpdatingRoleId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#e85c1a]" />
            <h2 className="text-lg font-semibold text-[#1e2d4e]">User Management</h2>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-[#e85c1a] hover:bg-[#d04e14] text-white flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Create User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#e85c1a]" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center py-8 text-gray-400">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Role</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                      <td className="py-3 pr-4 font-medium text-[#1e2d4e]">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1e2d4e]/10 flex items-center justify-center text-xs font-bold text-[#1e2d4e] flex-shrink-0">
                            {getInitials(u.full_name)}
                          </div>
                          {u.full_name}
                          {isSelf && (
                            <span className="text-xs text-gray-400 font-normal">(you)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs">{u.email}</td>
                      <td className="py-3 pr-4">
                        {isSelf ? (
                          <RoleBadge role={u.role} />
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              value={u.role}
                              disabled={updatingRoleId === u.id}
                              onChange={(e) => handleRoleChange(u, e.target.value)}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#e85c1a]/40 bg-white"
                            >
                              <option value="engineer">Engineer</option>
                              <option value="cost_analyst">Cost Analyst</option>
                              <option value="ceo">CEO</option>
                              <option value="admin">Admin</option>
                            </select>
                            {updatingRoleId === u.id && (
                              <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">
                        {format(new Date(u.created_at), 'dd MMM yyyy')}
                      </td>
                      <td className="py-3">
                        {!isSelf && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={togglingId === u.id}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                              u.is_active
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                          >
                            {togglingId === u.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : u.is_active ? (
                              'Deactivate'
                            ) : (
                              'Activate'
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </Card>
  );
}

// ─── APP INFO SECTION ─────────────────────────────────────────────────────────

function AppInfoSection() {
  const INFO_ITEMS = [
    { label: 'Version', value: 'ProqrIQ v1.0.0' },
    { label: 'API', value: 'localhost:3099' },
    { label: 'Client', value: 'localhost:5299' },
    { label: 'Environment', value: 'Development' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-[#1e2d4e]">Application Information</h2>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {INFO_ITEMS.map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3">
              <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
              <dd className="text-sm font-semibold text-gray-700 font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[#e85c1a]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e2d4e]">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile, security, and application preferences</p>
      </div>

      <ProfileSection user={user as unknown as Profile} />
      <PasswordSection userId={user.id} />
      {user.role === 'admin' && <AdminSection currentUserId={user.id} />}
      <AppInfoSection />
    </div>
  );
}
