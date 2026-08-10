import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  CheckCircle2, Zap, Building2, ArrowRight, Shield, RotateCcw,
  AlertTriangle, Sparkles, ChevronRight, X,
} from 'lucide-react'
import { Logo, LogoMark } from '../../components/ui/logo'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useConfetti } from '../../hooks/useConfetti'

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanId = 'pro' | 'organization'
type BillingCycle = 'monthly' | 'annual'
type PayState = 'idle' | 'loading' | 'verifying' | 'success' | 'incomplete'

// ─── Config ───────────────────────────────────────────────────────────────────

const PLANS: Record<PlanId, {
  label: string
  icon: React.ReactNode
  color: string
  glow: string
  monthly: number
  annual: number
  annualMonthly: number
  savePct: number
  features: string[]
  topFeature: string
}> = {
  pro: {
    label: 'Pro',
    icon: <Zap className="w-5 h-5" />,
    color: '#e85c1a',
    glow: 'rgba(232,92,26,0.25)',
    monthly: 79,
    annual: 948,
    annualMonthly: 65,
    savePct: 18,
    topFeature: 'Unlimited cost quotes + bulk costing',
    features: [
      'Unlimited quotes per month',
      'Bulk costing up to 50 parts',
      'Assembly BOM roll-up',
      'Excel & PDF export',
      'Supplier sourcing & negotiation',
      'Priority AI processing',
    ],
  },
  organization: {
    label: 'Organization',
    icon: <Building2 className="w-5 h-5" />,
    color: '#1e2d4e',
    glow: 'rgba(30,45,78,0.3)',
    monthly: 249,
    annual: 2988,
    annualMonthly: 199,
    savePct: 20,
    topFeature: 'Everything in Pro, unlimited team access',
    features: [
      'Everything in Pro',
      'Up to 25 team seats',
      'Knowledge base management',
      'Regional rates configuration',
      'Multi-provider AI routing',
      'Admin dashboard & audit log',
    ],
  },
}

// ─── Razorpay loader ──────────────────────────────────────────────────────────

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load payment SDK'))
    document.body.appendChild(s)
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepBadge({ step, done }: { step: number; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
      done
        ? 'bg-[#22c55e] border-[#22c55e] text-white'
        : 'bg-[#e85c1a] border-[#e85c1a] text-white'
    }`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : step}
    </div>
  )
}

function SuccessView({ plan, onDashboard }: { plan: PlanId; onDashboard: () => void }) {
  const [count, setCount] = useState(4)
  useEffect(() => {
    if (count <= 0) { onDashboard(); return }
    const t = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count, onDashboard])

  return (
    <motion.div className="flex flex-col items-center text-center py-8 gap-6"
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}>
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-[#22c55e]/10 flex items-center justify-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}>
            <CheckCircle2 className="w-14 h-14 text-[#22c55e]" />
          </motion.div>
        </div>
        <motion.div className="absolute -inset-3 rounded-full border-2 border-[#22c55e]/30"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }} />
      </div>
      <div>
        <h2 className="text-2xl font-extrabold text-white">
          {PLANS[plan].label} Activated!
        </h2>
        <p className="text-[#8ba5c8] mt-1">Your account is now fully unlocked.</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <p className="text-[#8ba5c8] text-sm">
          Redirecting to your dashboard in <span className="font-bold text-white">{count}</span>…
        </p>
        <motion.button onClick={onDashboard} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          Go to Dashboard <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  )
}

function IncompleteView({
  onRetry, onFree, failRef,
}: { onRetry: () => void; onFree: () => void; failRef?: string }) {
  return (
    <motion.div className="flex flex-col gap-5"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}>
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-white font-semibold text-sm">Payment not completed</p>
          <p className="text-[#8ba5c8] text-xs mt-0.5 leading-relaxed">
            The payment window was closed before confirmation. Your account is still active on the Free plan.
          </p>
          {failRef && (
            <p className="text-[#8ba5c8] text-[11px] mt-2 font-mono opacity-70">Ref: {failRef}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <motion.button onClick={onRetry} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="group relative flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-white text-sm overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #e85c1a 0%, #f5761a 100%)' }}>
          <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
          <RotateCcw className="w-4 h-4" /> Try Again
        </motion.button>
        <button onClick={onFree}
          className="text-[#8ba5c8] text-xs text-center hover:text-white transition-colors py-2">
          Continue with Free Plan instead →
        </button>
      </div>

      <p className="text-[#8ba5c8] text-[11px] text-center">
        If money was deducted, it will be automatically refunded within 5-7 business days.{' '}
        <a href="mailto:support@proqriq.com" className="underline hover:text-white transition-colors">
          Contact support
        </a>
      </p>
    </motion.div>
  )
}

// ─── Main Checkout page ───────────────────────────────────────────────────────

export default function Checkout() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const burst = useConfetti()

  const planParam = (searchParams.get('plan') ?? 'pro') as PlanId
  const plan: PlanId = PLANS[planParam] ? planParam : 'pro'
  const config = PLANS[plan]

  const [billing, setBilling] = useState<BillingCycle>(
    (searchParams.get('billing') ?? 'monthly') as BillingCycle,
  )
  const [payState,      setPayState]      = useState<PayState>('idle')
  const [failRef,       setFailRef]       = useState<string | undefined>()
  const [noProvider,    setNoProvider]    = useState(false)
  const [providerChecked, setProviderChecked] = useState(false)
  const hasAutoOpened  = React.useRef(false)
  const paySucceeded   = React.useRef(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/register', { replace: true })
  }, [isAuthenticated, authLoading, navigate])

  // Check which payment providers are available on mount
  useEffect(() => {
    if (!isAuthenticated) return
    api.subscription.paymentMethods().then(m => {
      const noP = !m.razorpay && !m.stripe
      setNoProvider(noP)
      setProviderChecked(true)
    }).catch(() => setProviderChecked(true))
  }, [isAuthenticated])

  const price = billing === 'annual' ? config.annualMonthly : config.monthly
  const annualTotal = config.annual

  const handleDashboard = useCallback(() => {
    navigate('/dashboard', { replace: true })
  }, [navigate])

  const handleFree = useCallback(() => {
    toast('Continuing with Free plan. You can upgrade anytime in Account → Billing.')
    navigate('/dashboard', { replace: true })
  }, [navigate])

  const handlePay = useCallback(async () => {
    setPayState('loading')
    setFailRef(undefined)
    paySucceeded.current = false
    try {
      await loadRazorpay()

      const orderData = await api.subscription.razorpayCreateOrder({ plan, billing })

      const Rzp = (window as unknown as Record<string, unknown>).Razorpay as new (o: unknown) => { open(): void }
      const rzp = new Rzp({
        key:      orderData.key_id,
        order_id: orderData.order_id,
        amount:   orderData.amount,
        currency: orderData.currency,
        name:     'ProqrIQ',
        description: `${config.label} — ${billing === 'annual' ? 'Annual' : 'Monthly'}`,
        image:    '/logo.png',
        theme:    { color: config.color },
        prefill: {
          name:  user?.full_name ?? '',
          email: (user as unknown as { email?: string })?.email ?? '',
        },
        config: {
          display: {
            hide: [{ method: 'paylater' }],
            preferences: {
              // show_default_blocks must be true — false causes "no payment methods" error
              // when the merchant account doesn't have custom blocks enabled
              show_default_blocks: true,
              sequence: ['block.upi', 'block.card', 'block.netbanking', 'block.wallet'],
            },
          },
        },
        modal: {
          ondismiss: () => {
            // Use a ref (not state) to guard: state may not have committed yet when
            // Razorpay auto-closes the modal after calling handler, causing a race
            if (!paySucceeded.current) {
              setPayState('incomplete')
            }
          },
        },
        handler: async (response: Record<string, string>) => {
          paySucceeded.current = true
          setPayState('verifying')
          try {
            await api.subscription.razorpayVerifyOrder({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_signature:  response.razorpay_signature,
              plan,
              billing,
            })
            await burst()
            setPayState('success')
          } catch {
            setFailRef(response.razorpay_payment_id)
            setPayState('incomplete')
          }
        },
      } as unknown as object)

      rzp.open()
      // Don't reset to 'idle' — keep 'loading' so the animated screen stays visible
      // behind the Razorpay modal. State transitions only via handler / ondismiss.
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (err as Error).message ?? 'Could not start payment'
      toast.error(msg)
      setPayState('idle')
    }
  }, [plan, billing, config, burst])

  // Auto-open Razorpay modal once provider check passes — no extra click needed
  useEffect(() => {
    if (providerChecked && !noProvider && !hasAutoOpened.current && isAuthenticated && !authLoading) {
      hasAutoOpened.current = true
      handlePay()
    }
  }, [providerChecked, noProvider, isAuthenticated, authLoading, handlePay])

  if (authLoading) return null

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0f1629 55%, #1a2744 100%)' }}>

      {/* Animated blobs */}
      <motion.div className="fixed top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1e2d4e 0%, transparent 70%)', filter: 'blur(80px)', opacity: 0.2 }}
        animate={{ scale: [1, 1.08, 1], x: [0, 20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="fixed bottom-[-10%] right-[-15%] w-[55%] h-[55%] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${config.color} 0%, transparent 70%)`, filter: 'blur(90px)', opacity: 0.12 }}
        animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
      {/* Dot grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.08]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <Logo size="md" inverted />

        {/* Progress steps */}
        <div className="flex items-center gap-2">
          <StepBadge step={1} done />
          <span className="text-[11px] text-[#8ba5c8] font-medium">Account Created</span>
          <ChevronRight className="w-3 h-3 text-[#4a5568]" />
          <StepBadge step={2} done={payState === 'success'} />
          <span className="text-[11px] text-white font-medium">Activate Plan</span>
          <ChevronRight className="w-3 h-3 text-[#4a5568]" />
          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
            payState === 'success' ? 'bg-[#22c55e] border-[#22c55e] text-white' : 'border-white/20 text-white/30'
          }`}>
            {payState === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 3}
          </div>
          <span className={`text-[11px] font-medium transition-colors ${payState === 'success' ? 'text-white' : 'text-[#4a5568]'}`}>
            Full Access
          </span>
        </div>

        <Link to="/dashboard" className="text-[#4a5568] hover:text-white transition-colors text-xs flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Continue Free
        </Link>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="grid lg:grid-cols-[1fr_420px] gap-6">

            {/* ── LEFT: Plan features ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/[0.08] p-8 flex flex-col gap-8"
              style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${config.color}22`, color: config.color }}>
                  {config.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-white font-extrabold text-lg">{config.label}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                      style={{ background: `${config.color}22`, color: config.color }}>
                      Recommended
                    </span>
                  </div>
                  <p className="text-[#8ba5c8] text-xs mt-0.5">{config.topFeature}</p>
                </div>
              </div>

              <div className="space-y-3">
                {config.features.map((f, i) => (
                  <motion.div key={f} className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${config.color}22` }}>
                      <CheckCircle2 className="w-3 h-3" style={{ color: config.color }} />
                    </div>
                    <span className="text-[#c8d4e6] text-sm">{f}</span>
                  </motion.div>
                ))}
              </div>

              {/* What happens after */}
              <div className="mt-auto pt-6 border-t border-white/[0.06]">
                <p className="text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider mb-3">What happens next</p>
                <div className="space-y-2.5">
                  {[
                    { icon: '⚡', text: 'Instant access upon payment confirmation' },
                    { icon: '🔒', text: 'Cancel anytime from Account → Billing' },
                    { icon: '↩️', text: 'Refunds processed within 5–7 business days' },
                  ].map(({ icon, text }) => (
                    <div key={text} className="flex items-center gap-2.5">
                      <span className="text-sm">{icon}</span>
                      <span className="text-[#8ba5c8] text-xs">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Payment panel ────────────────────────────────────── */}
            <div className="rounded-2xl bg-white p-8 flex flex-col">

              <AnimatePresence mode="wait">
                {noProvider ? (
                  <motion.div key="no-provider" className="flex flex-col items-center text-center gap-5 py-6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                      <AlertTriangle className="w-7 h-7 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-[#0f1729] font-extrabold text-lg">Payment not configured</h3>
                      <p className="text-[#9aa3b2] text-sm mt-1 max-w-[260px] mx-auto">
                        The payment provider is not set up yet. You have Free access in the meantime.
                      </p>
                    </div>
                    <p className="text-[11px] text-[#b0b8c9]">
                      Set <code className="bg-gray-100 px-1 rounded text-[10px]">RAZORPAY_KEY_ID</code> and{' '}
                      <code className="bg-gray-100 px-1 rounded text-[10px]">RAZORPAY_KEY_SECRET</code> in your server environment.
                    </p>
                    <button onClick={handleFree}
                      className="text-sm text-[#e85c1a] font-semibold hover:underline">
                      Continue with Free Plan →
                    </button>
                  </motion.div>

                ) : payState === 'success' ? (
                  <SuccessView key="success" plan={plan} onDashboard={handleDashboard} />

                ) : payState === 'incomplete' ? (
                  <motion.div key="incomplete" className="flex flex-col flex-1 gap-6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div>
                      <h3 className="text-[#0f1729] font-extrabold text-xl">Payment not completed</h3>
                      <p className="text-[#9aa3b2] text-sm mt-1">
                        Your account is safe on the Free plan. Would you like to try again?
                      </p>
                    </div>
                    <IncompleteView onRetry={handlePay} onFree={handleFree} failRef={failRef} />
                  </motion.div>

                ) : payState === 'loading' || payState === 'verifying' ? (
                  /* ── Opening / verifying: full-panel loading state ── */
                  <motion.div key="opening" className="flex flex-col flex-1 items-center justify-center gap-6 py-8"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                    {/* Animated ring */}
                    <div className="relative w-20 h-20">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#f1f3f7" strokeWidth="5" />
                        <motion.circle cx="40" cy="40" r="34" fill="none"
                          stroke={config.color} strokeWidth="5" strokeLinecap="round"
                          strokeDasharray="213.6" strokeDashoffset="213.6"
                          animate={{ strokeDashoffset: [213.6, 0, 213.6] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Shield className="w-7 h-7" style={{ color: config.color }} />
                      </div>
                    </div>

                    <div className="text-center">
                      <h3 className="text-[#0f1729] font-extrabold text-xl">
                        {payState === 'verifying' ? 'Confirming payment…' : 'Opening secure payment…'}
                      </h3>
                      <p className="text-[#9aa3b2] text-sm mt-1">
                        {payState === 'verifying'
                          ? 'Verifying with Razorpay — please wait'
                          : 'The payment window will open in a moment'}
                      </p>
                    </div>

                    {/* Payment method preview */}
                    <div className="w-full rounded-xl border border-[#e5e8ef] bg-[#f8f9fc] p-4 space-y-3">
                      <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wider">Accepted payment methods</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'UPI', sub: 'PhonePe · GPay · Paytm', color: '#5f259f' },
                          { label: 'Cards', sub: 'Visa · Mastercard · RuPay', color: '#1e2d4e' },
                          { label: 'Net Banking', sub: '50+ banks supported', color: '#15803d' },
                          { label: 'Wallets', sub: 'Paytm · Amazon Pay', color: '#c45500' },
                        ].map(({ label, sub, color }) => (
                          <div key={label} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-[#e5e8ef]">
                            <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: color }} />
                            <div>
                              <p className="text-xs font-semibold text-[#0f1729]">{label}</p>
                              <p className="text-[10px] text-[#9aa3b2]">{sub}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#9aa3b2]">
                      <Shield className="w-3 h-3" />
                      256-bit encryption · PCI-DSS compliant
                    </div>
                  </motion.div>

                ) : (
                  <motion.div key="payment" className="flex flex-col flex-1 gap-6"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

                    <div>
                      <p className="text-[11px] font-semibold text-[#9aa3b2] uppercase tracking-wider mb-1">Activate</p>
                      <h3 className="text-[#0f1729] font-extrabold text-2xl">{config.label} Plan</h3>
                    </div>

                    {/* Billing toggle */}
                    <div>
                      <p className="text-xs font-medium text-[#4a5568] mb-2">Billing cycle</p>
                      <div className="flex gap-2">
                        {(['monthly', 'annual'] as const).map((b) => (
                          <button key={b} type="button"
                            onClick={() => setBilling(b)}
                            className={`relative flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                              billing === b
                                ? 'border-[#e85c1a] text-[#e85c1a] bg-[#e85c1a]/5'
                                : 'border-[#e5e8ef] text-[#9aa3b2] hover:border-[#e85c1a]/30'
                            }`}>
                            {b === 'monthly' ? 'Monthly' : 'Annual'}
                            {b === 'annual' && (
                              <span className="absolute -top-2 -right-2 text-[9px] bg-[#22c55e] text-white px-1.5 py-0.5 rounded-full font-bold">
                                SAVE {config.savePct}%
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="rounded-xl p-4 border border-[#e5e8ef] bg-[#f8f9fc]">
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-extrabold text-[#0f1729] font-mono">€{price}</span>
                        <span className="text-[#9aa3b2] text-sm mb-1">/month</span>
                      </div>
                      {billing === 'annual' && (
                        <p className="text-[#9aa3b2] text-xs mt-1">
                          Billed annually as <span className="font-semibold text-[#4a5568]">€{annualTotal}/year</span>
                          {' '}· saves €{config.monthly * 12 - annualTotal}/year
                        </p>
                      )}
                      {billing === 'monthly' && (
                        <p className="text-[11px] text-[#9aa3b2] mt-1">
                          Switch to annual and save €{config.monthly * 12 - annualTotal}/year
                        </p>
                      )}
                    </div>

                    {/* Pay button */}
                    <motion.button
                      onClick={handlePay}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      className="group relative flex items-center justify-center gap-2.5 w-full py-4 rounded-xl font-bold text-white text-[15px] overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%)` }}>
                      <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-600 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                      <Sparkles className="w-4 h-4" /> Pay &amp; Activate {config.label} <ArrowRight className="w-4 h-4" />
                    </motion.button>

                    {/* Payment method grid */}
                    <div className="rounded-xl border border-[#e5e8ef] bg-[#f8f9fc] p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wider">Pay with any method</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'UPI', color: '#5f259f' },
                          { label: 'PhonePe', color: '#5f259f' },
                          { label: 'Google Pay', color: '#1a73e8' },
                          { label: 'Paytm', color: '#00b9f1' },
                          { label: 'Cards', color: '#1e2d4e' },
                          { label: 'Net Banking', color: '#15803d' },
                          { label: 'Wallets', color: '#c45500' },
                        ].map(({ label, color }) => (
                          <span key={label}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md border"
                            style={{ color, borderColor: color + '44', background: color + '0d' }}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Security row */}
                    <div className="flex items-center gap-2 justify-center">
                      <Shield className="w-3 h-3 text-[#9aa3b2]" />
                      <span className="text-[10px] text-[#9aa3b2]">
                        Secured by Razorpay · 256-bit encryption · Cancel anytime
                      </span>
                    </div>

                    <div className="mt-auto pt-4 border-t border-[#e5e8ef] text-center">
                      <button onClick={handleFree}
                        className="text-[#9aa3b2] text-xs hover:text-[#4a5568] transition-colors">
                        Continue with Free Plan for now →
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer trust line */}
      <footer className="relative z-10 text-center py-5 border-t border-white/[0.04]">
        <p className="text-[11px] text-[#4a5568]">
          ProqrIQ · Questions?{' '}
          <a href="mailto:support@proqriq.com" className="underline hover:text-[#8ba5c8] transition-colors">
            support@proqriq.com
          </a>
          {' '}· <Link to="/terms" className="underline hover:text-[#8ba5c8] transition-colors">Terms</Link>
          {' '}· <Link to="/privacy" className="underline hover:text-[#8ba5c8] transition-colors">Privacy</Link>
        </p>
      </footer>
    </div>
  )
}
