import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, XCircle, Calendar, CheckCircle, IndianRupee, Zap,
  Check, Lock, ArrowRight, Sparkles, Building2, Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSubscription } from '../../hooks/useSubscription'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Modal } from '../../components/ui/modal'
import { Skeleton } from '../../components/ui/skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'
import { api } from '../../lib/api'

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay script'))
    document.body.appendChild(script)
  })
}

// ─── Arc gauge ───────────────────────────────────────────────────────────────

function ArcGauge({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  const pct   = limit !== null && limit > 0 ? Math.min(1, used / limit) : 0
  const color = pct >= 0.9 ? '#ef4444' : pct >= 0.7 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-14">
        <svg viewBox="0 0 96 56" className="w-full h-full">
          <path d="M 8 48 A 40 40 0 0 1 88 48" fill="none" stroke="#e5e8ef" strokeWidth="8" strokeLinecap="round" />
          <path d="M 8 48 A 40 40 0 0 1 88 48" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${Math.PI * 40 * pct} ${Math.PI * 40}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-sm font-bold font-mono text-[#0f1729]">{used}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-[#4a5568]">{label}</p>
        <p className="text-[10px] text-[#9aa3b2]">{limit === null ? 'unlimited' : `of ${limit}`}</p>
      </div>
    </div>
  )
}

// ─── Plan comparison data ─────────────────────────────────────────────────────

type PlanTier = 'free' | 'pro' | 'organization'

interface PlanFeatureRow {
  label: string
  free:  string | boolean
  pro:   string | boolean
  org:   string | boolean
}

const PLAN_FEATURES: PlanFeatureRow[] = [
  { label: 'Quotes per month',         free: '10',       pro: 'Unlimited',   org: 'Unlimited' },
  { label: 'AI cost estimation',        free: true,       pro: true,          org: true },
  { label: 'PDF export',               free: true,       pro: true,          org: true },
  { label: 'Dashboard & analytics',    free: true,       pro: true,          org: true },
  { label: 'Approval workflow',         free: true,       pro: true,          org: true },
  { label: 'Bulk costing (50 parts)',   free: false,      pro: '50 parts',    org: '50 parts' },
  { label: 'Assembly BOM costing',      free: false,      pro: true,          org: true },
  { label: 'Excel export',             free: false,      pro: true,          org: true },
  { label: 'Supplier search & AI',     free: false,      pro: true,          org: true },
  { label: 'Negotiation reports',      free: false,      pro: true,          org: true },
  { label: 'Priority AI processing',   free: false,      pro: true,          org: true },
  { label: 'Team seats',               free: '1 seat',   pro: '1 seat',      org: '25 seats' },
  { label: 'Knowledge base (PDF)',     free: false,      pro: false,         org: true },
  { label: 'Regional rates config',    free: false,      pro: false,         org: true },
  { label: 'Multi-provider AI routing',free: false,      pro: false,         org: true },
  { label: 'Device preview tool',      free: false,      pro: false,         org: true },
  { label: 'Admin dashboard',          free: false,      pro: false,         org: true },
]

const PLAN_CONFIGS: Record<PlanTier, {
  label: string; icon: React.ReactNode; price: string; priceAnnual: string
  color: string; glow: string; badge?: string; highlight?: boolean
}> = {
  free: {
    label: 'Free', icon: <Star className="w-4 h-4" />,
    price: '₹0/mo', priceAnnual: '₹0/yr',
    color: '#4a5568', glow: 'rgba(74,85,104,0.12)',
  },
  pro: {
    label: 'Pro', icon: <Zap className="w-4 h-4" />,
    price: '₹3,999/mo', priceAnnual: '₹39,990/yr',
    color: '#e85c1a', glow: 'rgba(232,92,26,0.15)',
    badge: 'Most popular', highlight: true,
  },
  organization: {
    label: 'Organization', icon: <Building2 className="w-4 h-4" />,
    price: '₹14,999/mo', priceAnnual: '₹1,49,990/yr',
    color: '#1e2d4e', glow: 'rgba(30,45,78,0.12)',
    badge: 'Best value',
  },
}

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === false) return <Lock className="w-3.5 h-3.5 text-[#c8cdd8] mx-auto" />
  if (value === true)  return <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
  return <span className="text-[11px] font-medium text-[#4a5568]">{value}</span>
}

// ─── Plan comparison section ──────────────────────────────────────────────────

function PlanComparisonSection({
  currentPlan,
  onUpgrade,
}: {
  currentPlan: PlanTier
  onUpgrade: (plan: 'pro' | 'organization') => void
}) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')

  const tiers: PlanTier[] = ['free', 'pro', 'organization']

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="space-y-5"
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#0f1729]">Compare Plans</h2>
          <p className="text-xs text-[#9aa3b2] mt-0.5">Everything you get at each tier</p>
        </div>
        {/* Billing toggle */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f1f3f7] border border-[#e5e8ef]">
          {(['monthly', 'annual'] as const).map(b => (
            <button key={b} onClick={() => setBilling(b)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                billing === b
                  ? 'bg-white text-[#0f1729] shadow-sm'
                  : 'text-[#9aa3b2] hover:text-[#4a5568]'
              }`}>
              {b === 'monthly' ? 'Monthly' : 'Annual · 2 months free'}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-3">
        {tiers.map(tier => {
          const c = PLAN_CONFIGS[tier]
          const isCurrent = tier === currentPlan
          const canUpgrade = tier !== 'free' && tier !== currentPlan && (
            currentPlan === 'free' ||
            (currentPlan === 'pro' && tier === 'organization')
          )

          return (
            <motion.div
              key={tier}
              whileHover={!isCurrent ? { y: -2 } : {}}
              className={`relative rounded-2xl p-4 flex flex-col gap-3 border-2 transition-all ${
                isCurrent
                  ? 'border-[#1e2d4e] bg-white shadow-md'
                  : c.highlight
                  ? 'border-[#e85c1a]/40 bg-white'
                  : 'border-[#e5e8ef] bg-white hover:border-[#c8cdd8]'
              }`}
            >
              {/* Badge */}
              {c.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-white whitespace-nowrap"
                    style={{ background: c.color }}>
                    {c.badge}
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#1e2d4e] text-white whitespace-nowrap">
                    Your plan
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-2 mt-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: c.glow, color: c.color }}>
                  {c.icon}
                </div>
                <p className="font-bold text-[#0f1729] text-sm">{c.label}</p>
              </div>

              {/* Price */}
              <div>
                <p className="text-lg font-extrabold font-mono text-[#0f1729]">
                  {billing === 'annual' ? c.priceAnnual : c.price}
                </p>
                {billing === 'annual' && tier !== 'free' && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">2 months free</p>
                )}
              </div>

              {/* CTA */}
              {isCurrent ? (
                <div className="w-full py-2 rounded-xl border-2 border-[#1e2d4e] text-center text-xs font-semibold text-[#1e2d4e]">
                  Current plan
                </div>
              ) : canUpgrade ? (
                <motion.button
                  onClick={() => onUpgrade(tier as 'pro' | 'organization')}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="group w-full py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1.5 relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 100%)` }}
                >
                  <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                  <Sparkles className="w-3 h-3" />
                  Upgrade to {c.label}
                  <ArrowRight className="w-3 h-3" />
                </motion.button>
              ) : (
                <div className="w-full py-2 rounded-xl bg-[#f8f9fc] text-center text-xs font-medium text-[#9aa3b2]">
                  {tier === 'free' ? 'Included' : 'Contact sales'}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Feature comparison table */}
      <div className="rounded-2xl border border-[#e5e8ef] overflow-hidden bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px_80px] bg-[#f8f9fc] border-b border-[#e5e8ef]">
          <div className="px-4 py-3 text-xs font-semibold text-[#4a5568]">Feature</div>
          {tiers.map(t => (
            <div key={t} className={`py-3 text-center text-[10px] font-bold uppercase tracking-wider ${
              t === currentPlan ? 'text-[#1e2d4e]' : 'text-[#9aa3b2]'
            }`}>
              {PLAN_CONFIGS[t].label}
            </div>
          ))}
        </div>

        {/* Feature rows */}
        {PLAN_FEATURES.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_80px_80px_80px] items-center border-b border-[#f1f3f7] last:border-0 ${
              i % 2 === 0 ? 'bg-white' : 'bg-[#fafbfc]'
            }`}
          >
            <div className="px-4 py-2.5 text-xs text-[#4a5568]">{row.label}</div>
            <div className="py-2.5 text-center"><FeatureCell value={row.free} /></div>
            <div className="py-2.5 text-center"><FeatureCell value={row.pro} /></div>
            <div className="py-2.5 text-center"><FeatureCell value={row.org} /></div>
          </div>
        ))}
      </div>

      {currentPlan === 'free' && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #e85c1a 0%, #f5761a 60%, #e85c1a 100%)' }}
        >
          <div className="absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4" />
                <p className="font-bold text-sm">Unlock the full platform</p>
              </div>
              <p className="text-white/80 text-xs leading-relaxed max-w-sm">
                Upgrade to Pro and get unlimited quotes, bulk costing, assembly BOM roll-up, Excel export, and supplier negotiation tools.
              </p>
            </div>
            <button
              onClick={() => onUpgrade('pro')}
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#e85c1a] text-sm font-bold hover:bg-white/90 transition-colors shadow-md"
            >
              Upgrade now <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── Billing page ─────────────────────────────────────────────────────────────

export default function Billing() {
  usePageTitle('Billing')
  const { plan, status, daysUntilRenewal, usage, limits, isLoading, refetch } = useSubscription()
  const { user } = useAuth()

  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [rzpModalOpen,    setRzpModalOpen]    = useState(false)
  const [canceling,       setCanceling]       = useState(false)
  const [rzpPlan,         setRzpPlan]         = useState<'pro' | 'organization'>('pro')
  const [rzpBilling,      setRzpBilling]      = useState<'monthly' | 'annual'>('monthly')
  const [rzpLoading,      setRzpLoading]      = useState(false)
  const billingPaySucceeded = React.useRef(false)

  async function handlePortal() {
    try {
      const data = await api.subscription.portal()
      if (data?.url) window.location.href = data.url
    } catch { /* not configured */ }
  }

  async function handleCancel() {
    setCanceling(true)
    try {
      await api.subscription.cancel()
      setCancelModalOpen(false)
    } finally { setCanceling(false) }
  }

  function handleUpgrade(targetPlan: 'pro' | 'organization') {
    setRzpPlan(targetPlan)
    setRzpModalOpen(true)
  }

  async function handleRazorpayCheckout() {
    setRzpLoading(true)
    billingPaySucceeded.current = false
    try {
      await loadRazorpayScript()
      const orderData = await api.subscription.razorpayCreateOrder({ plan: rzpPlan, billing: rzpBilling })
      const RazorpayConstructor = (window as unknown as Record<string, unknown>).Razorpay as new (opts: unknown) => { open(): void }
      const rzp = new RazorpayConstructor({
        key:      orderData.key_id,
        order_id: orderData.order_id,
        amount:   orderData.amount,
        currency: orderData.currency,
        name:     'ProqrIQ',
        description: `${rzpPlan === 'pro' ? 'Pro' : 'Organization'} — ${rzpBilling}`,
        image:    '/logo.png',
        theme:    { color: '#e85c1a' },
        prefill: {
          name:  user?.full_name ?? '',
          email: (user as unknown as { email?: string })?.email ?? '',
        },
        config: {
          display: {
            hide: [{ method: 'paylater' }],
            preferences: {
              show_default_blocks: true,
              sequence: ['block.upi', 'block.card', 'block.netbanking', 'block.wallet'],
            },
          },
        },
        modal: {
          ondismiss: () => {
            if (!billingPaySucceeded.current) setRzpLoading(false)
          },
        },
        handler: async (response: Record<string, string>) => {
          billingPaySucceeded.current = true
          try {
            await api.subscription.razorpayVerifyOrder({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_signature:  response.razorpay_signature,
              plan:    rzpPlan,
              billing: rzpBilling,
            })
            toast.success('Payment successful! Your plan has been upgraded.')
            setRzpModalOpen(false)
            refetch?.()
          } catch {
            toast.error('Payment verification failed. Contact support.')
          } finally {
            setRzpLoading(false)
          }
        },
      } as unknown as object)
      rzp.open()
    } catch (err) {
      toast.error((err as Error).message || 'Razorpay checkout failed')
      setRzpLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page-content space-y-6">
        <div className="space-y-1">
          <Skeleton variant="line" height="28px" width="200px" />
          <Skeleton variant="line" height="16px" width="280px" />
        </div>
        <Skeleton variant="rect" height="180px" className="rounded-2xl" />
        <Skeleton variant="rect" height="400px" className="rounded-2xl" />
        <Skeleton variant="rect" height="160px" className="rounded-2xl" />
      </div>
    )
  }

  const planLabel = plan === 'organization' ? 'Organization' : plan === 'pro' ? 'Pro' : 'Free'
  const planColor = plan === 'pro' ? '#e85c1a' : plan === 'organization' ? '#1e2d4e' : '#4a5568'

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
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Plans &amp; Billing</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Your subscription, usage, and plan details</p>
      </div>

      {/* ── Current plan card ── */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f1629 0%, #1e2d4e 60%, #253660 100%)' }}
      >
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Glow orb */}
        <div className="absolute top-4 right-8 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${planColor}20 0%, transparent 70%)` }} />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-white/50" />
                <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Current Plan</span>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-extrabold">{planLabel}</p>
                {plan === 'free' && (
                  <span className="text-xs bg-white/10 text-white/60 px-2.5 py-1 rounded-full font-medium">Free tier</span>
                )}
                {plan === 'pro' && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: '#e85c1a22', color: '#e85c1a' }}>
                    Pro
                  </span>
                )}
                {plan === 'organization' && (
                  <span className="text-xs bg-white/10 text-white/70 px-2.5 py-1 rounded-full font-semibold">Org</span>
                )}
              </div>
              {daysUntilRenewal !== null && (
                <p className="text-xs text-white/50 flex items-center gap-1 mt-1.5">
                  <Calendar className="w-3 h-3" /> Renews in {daysUntilRenewal} days
                </p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor}`}>
              {status}
            </span>
          </div>

          {/* What you have access to */}
          <div className="mb-5">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2.5">Your access</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {PLAN_FEATURES
                .filter(f => {
                  const val = plan === 'pro' ? f.pro : plan === 'organization' ? f.org : f.free
                  return val !== false
                })
                .slice(0, 8)
                .map(f => {
                  const val = plan === 'pro' ? f.pro : plan === 'organization' ? f.org : f.free
                  return (
                    <div key={f.label} className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-[#e85c1a] shrink-0" />
                      <span className="text-xs text-white/70">
                        {typeof val === 'string' ? `${f.label} (${val})` : f.label}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {plan === 'free' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRzpModalOpen(true)}
                className="border-[#e85c1a]/60 text-[#e85c1a] hover:bg-[#e85c1a]/10"
                iconLeft={<IndianRupee className="w-3.5 h-3.5" />}
              >
                Upgrade with Razorpay
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

      {/* ── Plan comparison ── */}
      <PlanComparisonSection
        currentPlan={plan as PlanTier}
        onUpgrade={(p) => { setRzpPlan(p); setRzpModalOpen(true) }}
      />

      {/* ── Usage section ── */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
          <p className="text-xs text-[#9aa3b2] mt-0.5">Resets at the start of each billing cycle</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-around flex-wrap gap-6 py-2">
            <ArcGauge label="Quotes"            used={usage.quotes_used}            limit={limits.quotes_per_month} />
            <ArcGauge label="Bulk Batches"      used={usage.bulk_used}              limit={limits.bulk_batch_items} />
            <ArcGauge label="Supplier Searches" used={usage.supplier_searches_used} limit={limits.supplier_searches_per_month} />
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice history ── */}
      <Card>
        <CardHeader><CardTitle>Invoice History</CardTitle></CardHeader>
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

      {/* ── Danger zone ── */}
      {plan !== 'free' && (
        <Card className="border-red-100">
          <CardHeader><CardTitle className="text-red-600">Danger Zone</CardTitle></CardHeader>
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

      {/* ── Razorpay plan selector modal ── */}
      <Modal open={rzpModalOpen} onClose={() => setRzpModalOpen(false)} title="Upgrade Plan">
        <div className="space-y-5">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#2d9c6a]/5 border border-[#2d9c6a]/20">
            <IndianRupee className="w-4 h-4 text-[#2d9c6a] shrink-0" />
            <p className="text-xs text-[#2d9c6a] font-medium">Payments in INR via Razorpay — UPI, cards &amp; netbanking accepted</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4a5568] mb-2">Select plan</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pro', 'organization'] as const).map(p => {
                const c = PLAN_CONFIGS[p]
                return (
                  <button key={p} onClick={() => setRzpPlan(p)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      rzpPlan === p ? 'border-[#e85c1a] bg-[#e85c1a]/5' : 'border-[#e5e8ef] hover:border-[#c8cdd8]'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ color: c.color }}>{c.icon}</span>
                      <p className="text-sm font-semibold text-[#0f1729]">{c.label}</p>
                      {c.badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: c.color }}>{c.badge}</span>}
                    </div>
                    <p className="text-xs text-[#9aa3b2]">
                      {rzpBilling === 'annual' ? c.priceAnnual : c.price}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4a5568] mb-2">Billing cycle</label>
            <div className="grid grid-cols-2 gap-2">
              {(['monthly', 'annual'] as const).map(b => (
                <button key={b} onClick={() => setRzpBilling(b)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    rzpBilling === b ? 'border-[#e85c1a] bg-[#e85c1a]/5' : 'border-[#e5e8ef] hover:border-[#c8cdd8]'
                  }`}>
                  <p className="text-sm font-semibold text-[#0f1729] capitalize">{b}</p>
                  {b === 'annual' && <p className="text-[10px] text-[#2d9c6a] mt-0.5 font-medium">2 months free</p>}
                </button>
              ))}
            </div>
          </div>

          {/* What's included */}
          <div className="p-3 rounded-xl bg-[#f8f9fc] border border-[#e5e8ef]">
            <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wider mb-2">Included in {PLAN_CONFIGS[rzpPlan].label}</p>
            <div className="space-y-1">
              {PLAN_FEATURES
                .filter(f => (rzpPlan === 'pro' ? f.pro : f.org) !== false)
                .slice(0, 6)
                .map(f => (
                  <div key={f.label} className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span className="text-[11px] text-[#4a5568]">{f.label}</span>
                  </div>
                ))}
              <p className="text-[10px] text-[#9aa3b2] mt-1">+ more features</p>
            </div>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={handleRazorpayCheckout}
            loading={rzpLoading}
            iconLeft={<Zap className="w-4 h-4" />}
          >
            Continue to Razorpay · {rzpBilling === 'annual'
              ? PLAN_CONFIGS[rzpPlan].priceAnnual
              : PLAN_CONFIGS[rzpPlan].price}
          </Button>

          <p className="text-[10px] text-center text-[#9aa3b2]">
            Secured by Razorpay · Cancel anytime · Refunds within 5–7 business days
          </p>
        </div>
      </Modal>

      {/* ── Cancel modal ── */}
      <Modal open={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel Subscription">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">This will downgrade your account</p>
              <p className="text-xs text-red-600 mt-0.5">You'll lose access to Pro/Org features at the end of your billing period.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)}>Keep Plan</Button>
            <Button variant="danger" size="sm" onClick={handleCancel} loading={canceling}>Confirm Cancel</Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  )
}
