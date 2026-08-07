import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useConfetti } from '../../hooks/useConfetti'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Logo } from '../../components/ui/logo'
import { cn } from '../../lib/utils'

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
      const res = await api.auth.register(data.email, data.password, data.full_name)
      const { token, user } = res
      localStorage.setItem('aq_token', token)
      loginWithToken(token, user)
      await burst()
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const message = e?.response?.data?.error ?? e?.message ?? 'Registration failed. Please try again.'
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* LEFT PANEL — hero (identical to login) */}
      <div
        className="hidden lg:flex lg:w-3/5 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0f1629 45%, #1a2744 100%)' }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="absolute top-24 right-16 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,92,26,0.13) 0%, transparent 70%)' }} />
        <div className="absolute bottom-24 left-8 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex items-center gap-3"
        >
          <Logo size="md" inverted />
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(232,92,26,0.18)', color: '#f0916a' }}>Powered by AI</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 space-y-6"
        >
          <div>
            <h1 className="text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
              Turn Drawings<br />Into Accurate<br /><span className="text-[#e85c1a]">Cost Quotes</span>
            </h1>
            <p className="text-blue-200 mt-4 text-[15px] leading-relaxed max-w-[22rem] opacity-80">
              Upload part drawings, query your engineering knowledge base, and generate structured cost breakdowns with 98% confidence — entirely on-premise.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_CHIPS.map((label, i) => (
              <motion.span
                key={label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="text-xs px-3 py-1.5 rounded-full border font-medium"
                style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.05)' }}
              >
                {label}
              </motion.span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-10 flex gap-10 border-t pt-7"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-blue-300 mt-0.5 opacity-70">{s.label}</p>
            </div>
          ))}
        </motion.div>
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
          <div className="grid grid-cols-3 gap-2 mb-6">
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

          <p className="text-center text-[11px] text-[#9aa3b2] mt-4 leading-relaxed">
            By creating an account you agree to run ProqrIQ on-premise only.<br />
            No data leaves your infrastructure.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
