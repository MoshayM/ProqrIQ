import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, UserPlus, UserX, Mail, Shield, Clock, CheckCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Modal } from '../../components/ui/modal'
import { Input } from '../../components/ui/input'
import { usePageTitle } from '../../hooks/usePageTitle'
import { api } from '../../lib/api'

const ROLE_OPTIONS = [
  { value: 'engineer',     label: 'Engineer' },
  { value: 'cost_analyst', label: 'Cost Analyst' },
  { value: 'ceo',          label: 'CEO' },
  { value: 'admin',        label: 'Admin' },
]

export default function Organization() {
  usePageTitle('Organization')
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('engineer')

  const { data, isLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.organization.get(),
  })

  const org = (data as any)?.org
  const members: any[] = (data as any)?.members ?? []

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.organization.removeMember(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
  })

  const inviteMutation = useMutation({
    mutationFn: (body: unknown) => api.organization.invite(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('engineer')
    },
  })

  function handleInvite() {
    if (!inviteEmail.trim()) return
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f1729]">Organization</h1>
          <p className="text-sm text-[#9aa3b2] mt-1">Manage team members and organization settings</p>
        </div>
      </div>

      <UpgradeGate requiredPlan="organization" feature="Organization Management">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-32 bg-[#e8ebf2] rounded-xl animate-pulse" />
            <div className="h-48 bg-[#e8ebf2] rounded-xl animate-pulse" />
          </div>
        ) : (
          <>
            {/* Org Info */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-navy" />
                  </div>
                  <div>
                    <CardTitle>{org?.name ?? 'Your Organization'}</CardTitle>
                    <p className="text-xs text-[#9aa3b2] mt-0.5">
                      {members.length} member{members.length !== 1 ? 's' : ''} · Limit: {org?.member_limit ?? 25}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Members */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Team Members</CardTitle>
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<UserPlus className="w-3.5 h-3.5" />}
                    onClick={() => setInviteOpen(true)}
                  >
                    Invite Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <div className="w-10 h-10 rounded-xl bg-[#f1f3f7] flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-[#9aa3b2]" />
                    </div>
                    <p className="text-sm font-medium text-[#4a5568]">No members yet</p>
                    <p className="text-xs text-[#9aa3b2]">Invite team members to collaborate</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#e5e8ef]">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 py-3">
                        <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="w-4 h-4 text-navy" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#0f1729] truncate">{member.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-[#9aa3b2]">
                              <Shield className="w-3 h-3" />
                              <span className="capitalize">{member.role?.replace('_', ' ')}</span>
                            </span>
                            {member.joined_at ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Joined
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-amber-600">
                                <Clock className="w-3 h-3" />
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeMutation.mutate(member.id)}
                          disabled={removeMutation.isPending}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-[#9aa3b2] hover:text-red-500 transition-colors"
                          title="Remove member"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </UpgradeGate>

      {/* Invite Modal */}
      <AnimatePresence>
        {inviteOpen && (
          <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#4a5568]">Email address</label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#4a5568]">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e8ef] rounded-lg text-sm text-[#0f1729] bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleInvite}
                  loading={inviteMutation.isPending}
                  disabled={!inviteEmail.trim()}
                >
                  Send Invite
                </Button>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
