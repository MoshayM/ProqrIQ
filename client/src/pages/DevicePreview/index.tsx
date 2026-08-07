import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Monitor, Tablet, Smartphone, Users, RefreshCw, ExternalLink } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { UpgradeGate } from '../../components/ui/UpgradeGate'

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner']

interface Viewport {
  id: string
  label: string
  width: number
  height: number
  icon: React.ComponentType<{ className?: string }>
  device: string
}

const VIEWPORTS: Viewport[] = [
  { id: 'mobile',   label: 'Mobile',   width: 375,  height: 812, icon: Smartphone, device: 'iPhone 14' },
  { id: 'tablet',   label: 'Tablet',   width: 768,  height: 1024, icon: Tablet,    device: 'iPad Air' },
  { id: 'laptop',   label: 'Laptop',   width: 1280, height: 800,  icon: Monitor,   device: '13" Laptop' },
  { id: 'desktop',  label: 'Desktop',  width: 1440, height: 900,  icon: Monitor,   device: '24" Monitor' },
]

const ROLES = [
  { id: 'engineer',    label: 'Engineer',    color: 'bg-blue-50 text-blue-700' },
  { id: 'cost_analyst',label: 'Cost Analyst', color: 'bg-indigo-50 text-indigo-700' },
  { id: 'ceo',         label: 'CEO',          color: 'bg-amber-50 text-amber-700' },
  { id: 'admin',       label: 'Admin',        color: 'bg-[#f1f3f7] text-[#4a5568]' },
]

const PREVIEW_PAGES = [
  { path: '/dashboard',   label: 'Dashboard' },
  { path: '/quotes',      label: 'All Quotes' },
  { path: '/quotes/new',  label: 'New Quote Wizard' },
  { path: '/bulk',        label: 'Bulk Costing' },
  { path: '/assemblies',  label: 'Assemblies' },
  { path: '/ai-control',  label: 'AI Control' },
  { path: '/account',     label: 'Account' },
]

function AccessDenied() {
  return (
    <div className="page-content flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-[#9aa3b2] text-sm">This tool is restricted to administrators and developers.</p>
      </div>
    </div>
  )
}

function DevicePreviewInner() {
  usePageTitle('Device Preview')
  const { hasRole, setPreviewRole } = useAuth()
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0])
  const [selectedRole, setSelectedRole] = useState(ROLES[0])
  const [selectedPage, setSelectedPage] = useState(PREVIEW_PAGES[0])
  const [iframeKey, setIframeKey] = useState(0)

  if (!hasRole(ADMIN_ROLES)) return <AccessDenied />

  function handleRoleChange(role: typeof ROLES[number]) {
    setSelectedRole(role)
    // Also apply to this window so live-preview works without iframe
    setPreviewRole(role.id)
  }

  const previewUrl = `${window.location.origin}${selectedPage.path}?preview_role=${selectedRole.id}`

  const maxPreviewWidth = Math.min(viewport.width, 900)
  const computedScale = maxPreviewWidth / viewport.width

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Device Preview</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Preview ProqrIQ across devices and roles</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-start">
        {/* Viewport selector */}
        <Card className="flex-1 min-w-[280px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Viewport</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {VIEWPORTS.map((vp) => {
                const Icon = vp.icon
                return (
                  <button
                    key={vp.id}
                    onClick={() => setViewport(vp)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center',
                      viewport.id === vp.id ? 'border-brand bg-brand/5' : 'border-[#e5e8ef] hover:border-brand/40',
                    )}
                  >
                    <Icon className={cn('w-5 h-5', viewport.id === vp.id ? 'text-brand' : 'text-[#9aa3b2]')} />
                    <span className={cn('text-xs font-medium', viewport.id === vp.id ? 'text-brand' : 'text-[#4a5568]')}>
                      {vp.label}
                    </span>
                    <span className="text-xs text-[#9aa3b2]">{vp.width}×{vp.height}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Role selector */}
        <Card className="flex-1 min-w-[220px]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#9aa3b2]" />
              <CardTitle className="text-sm">Role Simulator</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleChange(role)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium',
                    selectedRole.id === role.id ? 'border-brand bg-brand/5 text-brand' : 'border-[#e5e8ef] text-[#4a5568] hover:border-brand/30',
                  )}
                >
                  {role.label}
                  {selectedRole.id === role.id && (
                    <span className="text-xs text-brand">● Active</span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Page selector */}
        <Card className="flex-1 min-w-[200px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {PREVIEW_PAGES.map((page) => (
                <button
                  key={page.path}
                  onClick={() => setSelectedPage(page)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                    selectedPage.path === page.path ? 'bg-brand/10 text-brand font-medium' : 'text-[#4a5568] hover:bg-surface-3',
                  )}
                >
                  {page.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[#9aa3b2]">
          <span className="font-mono text-xs bg-surface-3 px-2 py-0.5 rounded">{viewport.device}</span>
          <span>{viewport.width} × {viewport.height}px</span>
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', selectedRole.color)}>
            as {selectedRole.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIframeKey(k => k + 1)}
            iconLeft={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(previewUrl, '_blank')}
            iconLeft={<ExternalLink className="w-3.5 h-3.5" />}>
            Open in Tab
          </Button>
        </div>
      </div>

      {/* Device Frame + iframe */}
      <div className="flex justify-center">
        <div
          className="relative bg-[#1a1a2e] rounded-3xl shadow-2xl overflow-hidden"
          style={{
            width: Math.min(viewport.width + 32, 932),
            height: viewport.height + 48,
          }}
        >
          {/* Phone notch / screen */}
          {viewport.id === 'mobile' && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#1a1a2e] rounded-b-2xl z-10" />
          )}
          <div
            className="absolute overflow-hidden bg-white"
            style={{
              top: viewport.id === 'mobile' ? 24 : 12,
              left: 16,
              right: 16,
              bottom: 12,
              borderRadius: viewport.id === 'mobile' ? '0 0 16px 16px' : 8,
            }}
          >
            <iframe
              key={iframeKey}
              src={previewUrl}
              title={`Preview: ${selectedPage.label} as ${selectedRole.label}`}
              className="w-full h-full border-0"
              style={{
                transformOrigin: 'top left',
                transform: `scale(${Math.min(viewport.width, 900) / viewport.width})`,
                width: `${viewport.width}px`,
                height: `${viewport.height}px`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-[#9aa3b2] text-center">
        The iframe preview shows the live app. Role simulation relies on the{' '}
        <code className="font-mono bg-surface-3 px-1 rounded">preview_role</code> query param
        — actual role-gating in auth is not overridden.
      </p>
    </motion.div>
  )
}

export default function DevicePreview() {
  return (
    <UpgradeGate requiredPlan="organization" feature="Device Preview">
      <DevicePreviewInner />
    </UpgradeGate>
  )
}
