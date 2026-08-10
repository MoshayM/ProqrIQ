import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, User, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useConfetti } from '../../hooks/useConfetti'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Logo, LogoMark } from '../../components/ui/logo'
import { cn } from '../../lib/utils'

function Particle({ x, y, size, delay, dur }: { x: number; y: number; size: number; delay: number; dur: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-[#e85c1a] pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, opacity: 0.15 }}
      animate={{ y: [0, -28, 0], opacity: [0.08, 0.28, 0.08] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

const PARTICLES = [
  { x: 7,  y: 14, size: 5,  delay: 0,   dur: 5.1 },
  { x: 85, y: 8,  size: 3,  delay: 1.2, dur: 6.2 },
  { x: 16, y: 70, size: 7,  delay: 0.7, dur: 7.1 },
  { x: 76, y: 55, size: 4,  delay: 1.8, dur: 5.7 },
  { x: 52, y: 86, size: 6,  delay: 1.0, dur: 6.5 },
  { x: 66, y: 24, size: 3,  delay: 2.1, dur: 4.9 },
  { x: 88, y: 80, size: 8,  delay: 0.4, dur: 5.8 },
]

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email:     z.string().email('Please enter a valid email address'),
  password:  z.string().min(6, 'Password must be at least 6 characters'),
  confirm:   z.string(),
}).refine(d => d.password === d.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})

type RegisterFormData = z.infer<typeof registerSchema>

const PLAN_CHIPS = [
  { id: 'free',         label: 'Free',         sub: '10 quotes/mo',   color: 'bg-[#f1f3f7] text-[#4a5568] border-[#e5e8ef]' },
  { id: 'pro',          label: 'Pro',           sub: '€79/mo',         color: 'bg-brand/5 text-brand border-brand/30' },
  { id: 'organization', label: 'Organization',  sub: '€249/mo',        color: 'bg-navy/5 text-navy border-navy/20' },
]

const PAID_PLAN_DETAILS: Record<string, { features: string[]; price: string; color: string; bg: string }> = {
  pro: {
    price: '€79/mo',
    color: '#e85c1a',
    bg: 'rgba(232,92,26,0.06)',
    features: [
      'Unlimited cost quotes per month',
      'Bulk costing — up to 50 parts/batch',
      'Assembly BOM roll-up with margin',
      'Excel & PDF export',
      'Supplier sourcing & negotiation',
      'Priority AI processing (Sonnet)',
    ],
  },
  organization: {
    price: '€249/mo',
    color: '#1e2d4e',
    bg: 'rgba(30,45,78,0.06)',
    features: [
      'Everything in Pro',
      'Up to 25 team seats',
      'Knowledge base management',
      'Regional rates configuration',
      'Multi-provider AI routing control',
      'Admin dashboard & full audit log',
    ],
  },
}

const FEATURE_CHIPS = ['AI Drawing Analysis', 'KB-Sourced Estimates', 'Assembly Roll-up', 'Bulk Costing', 'Confidence Scoring', 'CEO Approval Flow']
const STATS = [
  { value: '98%', label: 'Confidence Target' },
  { value: '50+', label: 'Parts per Batch' },
  { value: '30d',  label: 'Quote Validity' },
]

export default function Register() {
  const { loginWithToken, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const burst = useConfetti()

  const planParam = searchParams.get('plan') as 'free' | 'pro' | 'organization' | null
  const [selectedPlan, setSelectedPlan] = useState<string>(planParam ?? 'free')
  const [showPassword, setShowPassword]       = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [submitError, setSubmitError]         = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(data: RegisterFormData) {
    setSubmitError(null)
    try {
      const res = await api.auth.register(data.email, data.password, data.full_name, selectedPlan, 'monthly')
      const { token, user, needs_payment, pending_plan, pending_billing } = res as {
        token: string; user: unknown
        needs_payment?: boolean; pending_plan?: string; pending_billing?: string
      }
      localStorage.setItem('aq_token', token)
      loginWithToken(token, user as Parameters<typeof loginWithToken>[1])
      if (needs_payment) {
        navigate(`/checkout?plan=${pending_plan ?? selectedPlan}&billing=${pending_billing ?? 'monthly'}`, { replace: true })
      } else {
        await burst()
        navigate('/dashboard', { replace: true })
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const message = e?.response?.data?.error ?? e?.message ?? 'Registration failed. Please try again.'
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* LEFT PANEL — hero */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col overflow-hidden">
        {/* Animated blobs */}
        <motion.div className="absolute top-[-15%] left-[-10%] w-[65%] h-[65%] rounded-full opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #1e2d4e 0%, transparent 70%)', filter: 'blur(60px)' }}
          animate={{ scale: [1, 1.08, 1], x: [0, 18, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute top-[10%] right-[-12%] w-[55%] h-[55%] rounded-full opacity-[0.14]"
          style={{ background: 'radial-gradient(circle, #e85c1a 0%, transparent 70%)', filter: 'blur(80px)' }}
          animate={{ scale: [1, 1.12, 1], y: [0, -28, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }} />
        <motion.div className="absolute bottom-[5%] left-[15%] w-[45%] h-[45%] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #2d6ac8 0%, transparent 70%)', filter: 'blur(70px)' }}
          animate={{ scale: [1, 1.1, 1], x: [0, -18, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }} />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.22]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        {/* Particles */}
        {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

        <div className="relative z-10 flex flex-col h-full px-14 py-12 justify-between"
          style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0f1629 45%, #1a2744 100%)' }}>

          {/* Logo */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3">
            <Logo size="md" inverted />
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(232,92,26,0.18)', color: '#f0916a' }}>
              Powered by AI
            </span>
          </motion.div>

          {/* 3D logo + headline */}
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotateY: -30 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ transformStyle: 'preserve-3d', perspective: '600px' }}
            >
              <motion.div animate={{ rotateY: [0, 8, 0, -8, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }} className="relative w-fit">
                <div className="absolute inset-0 translate-y-3 blur-xl opacity-25 rounded-2xl bg-[#1e2d4e] scale-90" />
                <LogoMark size={64} className="relative drop-shadow-2xl" />
              </motion.div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="text-[3rem] font-extrabold text-white leading-[1.1] tracking-tight">
                Turn Drawings<br />Into Accurate<br />
                <span className="relative inline-block">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f5761a] to-[#f5a623]">Cost Quotes</span>
                  <motion.span className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-[#e85c1a]/30"
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ delay: 1, duration: 0.6, ease: 'easeOut' }} style={{ originX: 0 }} />
                </span>
              </h1>
              <p className="text-[#8ba5c8] mt-4 text-[15px] leading-relaxed max-w-[22rem]">
                Upload part drawings, query your engineering KB, and generate structured cost breakdowns with 98% confidence — entirely on-premise.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="flex flex-wrap gap-2">
              {FEATURE_CHIPS.map((label, i) => (
                <motion.span key={label}
                  initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.06 }}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border font-medium"
                  style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.05)' }}>
                  <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                  {label}
                </motion.span>
              ))}
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex gap-10 border-t pt-7" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold text-white tracking-tight">{s.value}</p>
                <p className="text-[11px] text-[#8ba5c8] mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* RIGHT PANEL — form */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full lg:w-2/5 flex items-center justify-center bg-white px-8 py-12 overflow-y-auto"
      >
        <div className="w-full max-w-[360px]">

          <div className="mb-8 lg:hidden">
            <Logo size="md" />
          </div>

          <h2 className="text-2xl font-bold text-[#0f1729]">Create your account</h2>
          <p className="text-[#9aa3b2] text-sm mt-1 mb-6">Start free — no credit card required</p>

          {/* Plan chips */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PLAN_CHIPS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                className={cn(
                  'flex flex-col items-center py-2.5 px-1 rounded-xl border-2 text-center transition-all',
                  selectedPlan === p.id ? p.color + ' border-current' : 'border-[#e5e8ef] text-[#9aa3b2] hover:border-brand/30',
                )}
              >
                <span className="text-xs font-bold">{p.label}</span>
                <span className="text-[10px] mt-0.5 opacity-70">{p.sub}</span>
              </button>
            ))}
          </div>

          {/* Plan feature list — shown for paid plans */}
          <AnimatePresence mode="wait">
            {selectedPlan !== 'free' && PAID_PLAN_DETAILS[selectedPlan] && (
              <motion.div
                key={selectedPlan}
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-xl border p-3 space-y-1.5"
                  style={{
                    borderColor: PAID_PLAN_DETAILS[selectedPlan].color + '33',
                    background: PAID_PLAN_DETAILS[selectedPlan].bg,
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
                    style={{ color: PAID_PLAN_DETAILS[selectedPlan].color }}>
                    What you get with {selectedPlan === 'pro' ? 'Pro' : 'Organization'}
                  </p>
                  {PAID_PLAN_DETAILS[selectedPlan].features.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <CheckCircle2
                        className="w-3 h-3 shrink-0"
                        style={{ color: PAID_PLAN_DETAILS[selectedPlan].color }}
                      />
                      <span className="text-[11px] text-[#4a5568]">{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Full name */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-[#0f1729] mb-1.5">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  {...register('full_name')}
                  className="w-full border border-[#e5e8ef] rounded-lg pl-10 pr-3 py-2.5 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all bg-white"
                />
              </div>
              {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#0f1729] mb-1.5">Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  {...register('email')}
                  className="w-full border border-[#e5e8ef] rounded-lg pl-10 pr-3 py-2.5 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all bg-white"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#0f1729] mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  {...register('password')}
                  className="w-full border border-[#e5e8ef] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all bg-white"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-[#0f1729] mb-1.5">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  {...register('confirm')}
                  className="w-full border border-[#e5e8ef] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all bg-white"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm.message}</p>}
            </div>

            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{submitError}</div>
            )}

            <Button type="submit" variant="navy" size="lg" className="w-full mt-1" loading={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-[#9aa3b2] mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-navy font-semibold hover:underline">Sign in</Link>
          </p>

          <p className="text-center text-xs text-[#b0b8c9] mt-4">
            By creating an account you agree to our{' '}
            <Link to="/terms" className="underline hover:text-[#4a5568] transition-colors">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="underline hover:text-[#4a5568] transition-colors">Privacy Policy</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
