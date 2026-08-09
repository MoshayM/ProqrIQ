import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Tablet, Smartphone, Users, RefreshCw, ExternalLink, Zap } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { UpgradeGate } from '../../components/ui/UpgradeGate'
import { DeviceShell } from '../../components/DeviceShell'

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
  { id: 'mobile',   label: 'Mobile',   width: 375,  height: 812,  icon: Smartphone, device: 'iPhone 14' },
  { id: 'tablet',   label: 'Tablet',   width: 768,  height: 1024, icon: Tablet,     device: 'iPad Air' },
  { id: 'laptop',   label: 'Laptop',   width: 1280, height: 800,  icon: Monitor,    device: '13" Laptop' },
  { id: 'desktop',  label: 'Desktop',  width: 1440, height: 900,  icon: Monitor,    device: '24" Monitor' },
]

// 5D.4 — Preview matrix: quick-access scenario presets
const PREVIEW_MATRIX = [
  { label: 'Free user · mobile',    viewport: 'mobile',  role: 'engineer',    page: '/dashboard',  desc: 'Engineer on iPhone 14 on Free plan' },
  { label: 'Pro user · desktop',    viewport: 'desktop', role: 'engineer',    page: '/quotes',     desc: 'Engineer on 24" desktop on Pro plan' },
  { label: 'CEO · tablet',          viewport: 'tablet',  role: 'ceo',         page: '/dashboard',  desc: 'CEO reviewing dashboard on iPad' },
  { label: 'Admin · AI Control',    viewport: 'laptop',  role: 'admin',       page: '/ai-control', desc: 'Admin managing AI routing on laptop' },
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
  const { user, setPreviewRole } = useAuth()
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0])
  const [selectedRole, setSelectedRole] = useState(ROLES[0])
  const [selectedPage, setSelectedPage] = useState(PREVIEW_PAGES[0])
  const [iframeKey, setIframeKey] = useState(0)

  // Use real user role — not the effective/preview role — so role simulation
  // inside this tool never locks the admin out of the tool itself.
  if (!user || !ADMIN_ROLES.includes(user.role)) return <AccessDenied />

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

      {/* 5D.4 — Preview matrix */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand" />
            <CardTitle className="text-sm">Quick Scenarios</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PREVIEW_MATRIX.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const vp = VIEWPORTS.find(v => v.id === preset.viewport) ?? VIEWPORTS[0]
                  const role = ROLES.find(r => r.id === preset.role) ?? ROLES[0]
                  const page = PREVIEW_PAGES.find(p => p.path === preset.page) ?? PREVIEW_PAGES[0]
                  setViewport(vp)
                  handleRoleChange(role)
                  setSelectedPage(page)
                  setIframeKey(k => k + 1)
                }}
                className="flex flex-col gap-1 p-3 rounded-xl border border-[#e5e8ef] hover:border-brand/40 hover:bg-brand/5 transition-all text-left"
              >
                <span className="text-xs font-semibold text-[#0f1729] leading-tight">{preset.label}</span>
                <span className="text-[10px] text-[#9aa3b2] leading-tight">{preset.desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device Frame + iframe with DeviceShell (5C.2) */}
      <div className="flex justify-center overflow-x-auto pb-4">
        {(() => {
          const shellType = viewport.id === 'mobile' ? 'mobile' : viewport.id === 'tablet' ? 'tablet' : 'desktop'
          const maxW = 900
          const scale = viewport.width > maxW ? maxW / viewport.width : 1
          return (
            <DeviceShell type={shellType} width={viewport.width} height={viewport.height} scale={scale}>
              <iframe
                key={iframeKey}
                src={previewUrl}
                title={`Preview: ${selectedPage.label} as ${selectedRole.label}`}
                className="border-0"
                style={{ width: viewport.width, height: viewport.height }}
              />
            </DeviceShell>
          )
        })()}
      </div>

      {/* Note */}
      <p className="text-xs text-[#9aa3b2] text-center">
        Role simulation uses the{' '}
        <code className="font-mono bg-surface-3 px-1 rounded">preview_role</code> URL param — UI only, API calls use your real session.
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
