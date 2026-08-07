import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, XCircle, Calendar, CheckCircle, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSubscription } from '../../hooks/useSubscription'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Modal } from '../../components/ui/modal'
import { Skeleton } from '../../components/ui/skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'
import { api } from '../../lib/api'

// Arc gauge SVG component
function ArcGauge({ used, limit, label, unit = '' }: { used: number; limit: number | null; label: string; unit?: string }) {
  const pct = limit !== null && limit > 0 ? Math.min(1, used / limit) : 0
  const r = 36
  const circumference = Math.PI * r // half-circle arc length
  const strokeDash = circumference * pct
  const color = pct >= 0.9 ? '#ef4444' : pct >= 0.7 ? '#f59e0b' : '#22c55e'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-14">
        <svg viewBox="0 0 96 56" className="w-full h-full">
          {/* Track */}
          <path d="M 8 48 A 40 40 0 0 1 88 48" fill="none" stroke="#e5e8ef" strokeWidth="8" strokeLinecap="round" />
          {/* Fill */}
          <path
            d="M 8 48 A 40 40 0 0 1 88 48"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * 40 * pct} ${Math.PI * 40}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-sm font-bold font-mono text-[#0f1729]">{used}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-[#4a5568]">{label}</p>
        <p className="text-[10px] text-[#9aa3b2]">
          {limit === null ? 'unlimited' : `of ${limit}${unit}`}
        </p>
      </div>
    </div>
  )
}

const PLAN_FEATURES: Record<string, string[]> = {
  free:         ['10 quotes/month', 'PDF export', 'Dashboard & analytics', 'AI cost estimation'],
  pro:          ['Unlimited quotes', 'Bulk costing (50 parts)', 'Assembly costing', 'Excel export', 'Supplier search', 'Priority support'],
  organization: ['Everything in Pro', 'KB management', 'Regional rates config', 'User management (25 seats)', 'Multi-provider AI routing', 'Device preview tool'],
}

export default function Billing() {
  usePageTitle('Billing')
  const { plan, status, daysUntilRenewal, usage, limits, isLoading } = useSubscription()
  const navigate = useNavigate()
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

  async function handleUpgrade() {
    setUpgrading(true)
    try {
      const data = await api.subscription.checkout({ plan: 'pro', billing: 'monthly' })
      if (data?.url) window.location.href = data.url
    } catch {
      // Stripe not configured or error
    } finally {
      setUpgrading(false)
    }
  }

  async function handlePortal() {
    try {
      const data = await api.subscription.portal()
      if (data?.url) window.location.href = data.url
    } catch {
      // not configured
    }
  }

  async function handleCancel() {
    setCanceling(true)
    try {
      await api.subscription.cancel()
      setCancelModalOpen(false)
    } finally {
      setCanceling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page-content space-y-6">
        <div className="space-y-1"><Skeleton variant="line" height="28px" width="200px" /><Skeleton variant="line" height="16px" width="280px" /></div>
        <Skeleton variant="rect" height="180px" className="rounded-2xl" />
        <Skeleton variant="rect" height="160px" className="rounded-2xl" />
      </div>
    )
  }

  const planLabel = plan === 'organization' ? 'Organization' : plan === 'pro' ? 'Pro' : 'Free'
  const features = PLAN_FEATURES[plan] ?? []

  const statusColor = {
    active:   'text-green-400 bg-green-400/20',
    trialing: 'text-blue-300 bg-blue-400/20',
    past_due: 'text-red-400 bg-red-400/20',
    canceled: 'text-white/40 bg-white/10',
    paused:   'text-amber-300 bg-amber-400/20',
  }[status] ?? 'text-white/40 bg-white/10'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-6 max-w-3xl"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Billing &amp; Subscription</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Manage your plan, usage, and billing settings</p>
      </div>

      {/* Plan card — gradient navy */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1629 0%, #1e2d4e 60%, #253660 100%)' }}
      >
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-4 right-8 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,92,26,0.12) 0%, transparent 70%)' }} />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-white/50" />
                <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Current Plan</span>
              </div>
              <p className="text-3xl font-extrabold">{planLabel}</p>
              {daysUntilRenewal !== null && (
                <p className="text-xs text-white/50 flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" /> Renews in {daysUntilRenewal} days
                </p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor}`}>
              {status}
            </span>
          </div>

          {/* Feature checklist */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-5">
            {features.map(f => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-[#e85c1a] shrink-0" />
                <span className="text-xs text-white/70">{f}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {plan !== 'organization' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/pricing')}
                iconRight={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Upgrade Plan
              </Button>
            )}
            {plan !== 'free' && (
              <Button variant="outline" size="sm" onClick={handlePortal} className="border-white/20 text-white hover:bg-white/10">
                Manage Billing
              </Button>
            )}
            {plan !== 'free' && status === 'active' && (
              <button
                onClick={() => setCancelModalOpen(true)}
                className="text-xs text-white/40 hover:text-red-400 transition-colors px-3 py-1.5"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Arc gauge usage section */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
          <p className="text-xs text-[#9aa3b2] mt-0.5">Resets at the start of each billing cycle</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-around flex-wrap gap-6 py-2">
            <ArcGauge label="Quotes"           used={usage.quotes_used}            limit={limits.quotes_per_month} />
            <ArcGauge label="Bulk Batches"     used={usage.bulk_used}              limit={limits.bulk_batch_items} />
            <ArcGauge label="Supplier Searches" used={usage.supplier_searches_used} limit={limits.supplier_searches_per_month} />
          </div>
        </CardContent>
      </Card>

      {/* Invoice History placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-10 h-10 rounded-xl bg-[#f1f3f7] flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#9aa3b2]" />
            </div>
            <p className="text-sm font-medium text-[#4a5568]">Invoice history requires active billing</p>
            <p className="text-xs text-[#9aa3b2] max-w-xs">
              Configure Stripe to view invoices. Upgrade to a paid plan to start generating invoices.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      {plan !== 'free' && (
        <Card className="border-red-100">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#0f1729]">Cancel subscription</p>
                <p className="text-xs text-[#9aa3b2]">You'll keep access until the end of your billing period.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(true)} className="text-red-600 hover:bg-red-50 border border-red-200">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Subscription"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">This will downgrade your account</p>
              <p className="text-xs text-red-600 mt-0.5">
                You'll lose access to Pro/Org features at the end of your billing period.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)}>
              Keep Plan
            </Button>
            <Button variant="danger" size="sm" onClick={handleCancel} loading={canceling}>
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  )
}
