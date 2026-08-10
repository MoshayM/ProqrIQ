import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Eye, EyeOff, Mail, Lock, Fingerprint, Sparkles,
  CheckCircle2, ArrowRight, ChevronRight, Zap
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Button } from '../../components/ui/button'
import { Logo, LogoMark } from '../../components/ui/logo'

const loginSchema = z.object({
  email:    z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginFormData = z.infer<typeof loginSchema>

const webAuthnSupported =
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential === 'function'

// ── floating particle (same as landing) ──────────────────────────────────────
function Particle({ x, y, size, delay, dur }: {
  x: number; y: number; size: number; delay: number; dur: number
}) {
  return (
    <motion.div
      className="absolute rounded-full bg-[#e85c1a] pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, opacity: 0.15 }}
      animate={{ y: [0, -28, 0], opacity: [0.08, 0.3, 0.08] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

const PARTICLES = [
  { x: 6,  y: 12, size: 5,  delay: 0,   dur: 5.2 },
  { x: 88, y: 7,  size: 3,  delay: 1.3, dur: 6.1 },
  { x: 14, y: 72, size: 7,  delay: 0.6, dur: 7.0 },
  { x: 78, y: 58, size: 4,  delay: 1.9, dur: 5.6 },
  { x: 50, y: 88, size: 6,  delay: 0.9, dur: 6.4 },
  { x: 68, y: 22, size: 3,  delay: 2.2, dur: 4.9 },
  { x: 32, y: 42, size: 5,  delay: 1.6, dur: 7.3 },
  { x: 92, y: 82, size: 8,  delay: 0.4, dur: 5.9 },
]

const CHIPS = [
  'AI Drawing Analysis', 'KB-Sourced Estimates', 'Assembly Roll-up',
  'Bulk Costing', 'Confidence Scoring', 'CEO Approval Flow',
]

const STATS = [
  { value: '98%', label: 'Confidence Target' },
  { value: '50+', label: 'Parts per Batch' },
  { value: '80%', label: 'Time Saved' },
]

export default function Login() {
  const { loginWithToken, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [submitError,   setSubmitError]   = useState<string | null>(null)
  const [showPassword,  setShowPassword]  = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  const [pendingToken, setPendingToken] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingUser,  setPendingUser]  = useState<any>(null)
  const [showSetup,    setShowSetup]    = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)

  React.useEffect(() => {
    if (isAuthenticated && !showSetup) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate, showSetup])

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginFormData) {
    setSubmitError(null)
    try {
      const res = await api.auth.login(data.email, data.password)
      const { token, user } = res
      localStorage.setItem('aq_token', token)

      if (webAuthnSupported) {
        try {
          const { count } = await api.passkey.credentials()
          if (count === 0) {
            setPendingToken(token)
            setPendingUser(user)
            setShowSetup(true)
            return
          }
        } catch { /* passkey check failed — proceed normally */ }
      }

      loginWithToken(token, user)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const message = e?.response?.data?.error ?? e?.message ?? 'Login failed. Please check your credentials.'
      setSubmitError(message)
      toast.error(message)
    }
  }

  async function handlePasskeyLogin() {
    if (!webAuthnSupported) { toast.error('Your browser does not support passkeys'); return }
    setPasskeyLoading(true)
    try {
      const email = getValues('email') || undefined
      const { options, challengeId } = await api.passkey.authOptions(email)
      const assertion = await startAuthentication(options)
      const { token, user } = await api.passkey.authVerify({ response: assertion, challengeId })
      loginWithToken(token, user)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const e = err as { name?: string; response?: { data?: { error?: string } } }
      if (e?.name === 'NotAllowedError') toast.error('Passkey sign-in was cancelled')
      else toast.error(e?.response?.data?.error ?? 'Passkey sign-in failed')
    } finally { setPasskeyLoading(false) }
  }

  async function handleSetupPasskey() {
    setSetupLoading(true)
    try {
      const { options, challengeId } = await api.passkey.registerOptions()
      const attestation = await startRegistration(options)
      await api.passkey.registerVerify({ response: attestation, challengeId })
      toast.success('Passkey registered — sign in with your fingerprint next time!')
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e?.name !== 'NotAllowedError') toast.error('Passkey setup failed')
    } finally { setSetupLoading(false); finishLogin() }
  }

  function finishLogin() {
    if (pendingToken && pendingUser) loginWithToken(pendingToken, pendingUser)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex overflow-hidden bg-[#0b1120]">

      {/* ── LEFT PANEL — immersive hero ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col overflow-hidden">

        {/* Animated mesh blobs */}
        <motion.div
          className="absolute top-[-15%] left-[-10%] w-[65%] h-[65%] rounded-full opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #1e2d4e 0%, transparent 70%)', filter: 'blur(60px)' }}
          animate={{ scale: [1, 1.08, 1], x: [0, 18, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-[10%] right-[-12%] w-[55%] h-[55%] rounded-full opacity-[0.14]"
          style={{ background: 'radial-gradient(circle, #e85c1a 0%, transparent 70%)', filter: 'blur(80px)' }}
          animate={{ scale: [1, 1.12, 1], y: [0, -28, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute bottom-[5%] left-[15%] w-[45%] h-[45%] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #2d6ac8 0%, transparent 70%)', filter: 'blur(70px)' }}
          animate={{ scale: [1, 1.1, 1], x: [0, -18, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Particles */}
        {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12 justify-between">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <Logo size="md" inverted />
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(232,92,26,0.18)', color: '#f0916a' }}>
              Powered by AI
            </span>
          </motion.div>

          {/* Centre — hero copy + 3D logo mark */}
          <div className="space-y-10">
            {/* 3D rotating logo mark */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotateY: -30 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ transformStyle: 'preserve-3d', perspective: '600px' }}
            >
              <motion.div
                animate={{ rotateY: [0, 8, 0, -8, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative w-fit"
              >
                <div className="absolute inset-0 translate-y-3 blur-xl opacity-30 rounded-2xl
                                bg-[#1e2d4e] scale-90" />
                <LogoMark size={72} className="relative drop-shadow-2xl" />
              </motion.div>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="text-[3.2rem] font-extrabold text-white leading-[1.1] tracking-tight">
                Turn Drawings<br />Into Accurate<br />
                <span className="relative inline-block">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f5761a] to-[#f5a623]">
                    Cost Quotes
                  </span>
                  <motion.span
                    className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-[#e85c1a]/30"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 1, duration: 0.6, ease: 'easeOut' }}
                    style={{ originX: 0 }}
                  />
                </span>
              </h1>
              <p className="text-[#8ba5c8] mt-4 text-[15px] leading-relaxed max-w-[22rem]">
                Upload part drawings, query your engineering KB, and generate structured
                cost breakdowns with 98% confidence — entirely on-premise.
              </p>
            </motion.div>

            {/* Feature chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="flex flex-wrap gap-2"
            >
              {CHIPS.map((label, i) => (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.06 }}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full
                             border font-medium"
                  style={{
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.65)',
                    background: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                  {label}
                </motion.span>
              ))}
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex gap-10 border-t pt-7"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold text-white tracking-tight">{s.value}</p>
                <p className="text-[11px] text-[#8ba5c8] mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom-right decorative sphere */}
        <motion.div
          className="absolute bottom-[-60px] right-[-60px] w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(232,92,26,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      {/* ── RIGHT PANEL — form ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full lg:w-[42%] flex items-center justify-center px-8 py-12 relative"
        style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f7f9fc 100%)' }}
      >
        {/* subtle top-right glow that bleeds from the left panel */}
        <div className="absolute top-0 left-0 w-40 h-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 0 0, rgba(30,45,78,0.06) 0%, transparent 70%)' }} />

        <div className="w-full max-w-[340px]">

          {/* Mobile logo */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 lg:hidden"
          >
            <Logo size="md" />
          </motion.div>

          {/* ── Passkey setup prompt ────────────────────────────────── */}
          {showSetup ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-2
                              bg-[#1e2d4e] shadow-lg shadow-[#1e2d4e]/20">
                <Fingerprint className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-[#0f1729]">Sign in faster next time</h2>
                <p className="text-[#9aa3b2] text-[13px] mt-2 leading-relaxed">
                  Register a passkey to sign in with your fingerprint, face, or device PIN — no password needed.
                </p>
              </div>
              <Button variant="navy" size="lg" className="w-full" loading={setupLoading}
                onClick={handleSetupPasskey}
                iconLeft={!setupLoading ? <Fingerprint className="h-4 w-4" /> : undefined}>
                {setupLoading ? 'Setting up…' : 'Set up passkey'}
              </Button>
              <button onClick={finishLogin} disabled={setupLoading}
                className="w-full text-center text-sm text-[#9aa3b2] hover:text-[#4a5568]
                           transition-colors py-1">
                Not now, skip
              </button>
            </motion.div>

          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#f0f4ff]
                              border border-[#d8e3fa] rounded-full text-[11px] font-semibold
                              text-[#2d6ac8] mb-5">
                <Zap className="w-3 h-3 text-[#e85c1a]" />
                ProqrIQ — Cost Engineering Platform
              </div>

              <h2 className="text-[1.6rem] font-extrabold text-[#0f1729] tracking-tight">
                Welcome back
              </h2>
              <p className="text-[#9aa3b2] text-[13px] mt-1 mb-7">
                Sign in to continue to your dashboard
              </p>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label htmlFor="email"
                    className="block text-[13px] font-semibold text-[#0f1729] mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      {...register('email')}
                      className="w-full border border-[#e5e8ef] rounded-xl pl-10 pr-4 py-3 text-[13px]
                                 text-[#0f1729] placeholder:text-[#c2c8d6]
                                 focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30
                                 focus:border-[#1e2d4e] transition-all bg-white
                                 hover:border-[#c2c8d6]"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 text-[11px] text-red-600 flex items-center gap-1">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password"
                    className="block text-[13px] font-semibold text-[#0f1729] mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa3b2]" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password')}
                      className="w-full border border-[#e5e8ef] rounded-xl pl-10 pr-11 py-3 text-[13px]
                                 text-[#0f1729] placeholder:text-[#c2c8d6]
                                 focus:outline-none focus:ring-2 focus:ring-[#1e2d4e]/30
                                 focus:border-[#1e2d4e] transition-all bg-white
                                 hover:border-[#c2c8d6]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9aa3b2]
                                 hover:text-[#4a5568] transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-[11px] text-red-600">{errors.password.message}</p>
                  )}
                </div>

                {submitError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-red-50 border border-red-100 px-4 py-3
                               text-[13px] text-red-700"
                  >
                    {submitError}
                  </motion.div>
                )}

                {/* Sign in button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative w-full flex items-center justify-center gap-2.5
                             py-3.5 px-6 bg-[#1e2d4e] text-white font-bold rounded-xl
                             text-[14px] overflow-hidden transition-all duration-200 mt-1
                             shadow-md shadow-[#1e2d4e]/20
                             hover:shadow-lg hover:shadow-[#1e2d4e]/30 hover:-translate-y-0.5
                             disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                >
                  {/* shimmer */}
                  <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%]
                                   transition-transform duration-700
                                   bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              {/* Passkey */}
              {webAuthnSupported && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-[#e5e8ef]" />
                    <span className="text-[11px] text-[#b0b8c9] font-medium">or continue with</span>
                    <div className="flex-1 h-px bg-[#e5e8ef]" />
                  </div>
                  <button
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4
                               border border-[#e5e8ef] rounded-xl text-[13px] font-semibold
                               text-[#4a5568] bg-white hover:bg-[#f7f9fc] hover:border-[#c2c8d6]
                               transition-all duration-200 disabled:opacity-60 shadow-sm"
                  >
                    {passkeyLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-[#9aa3b2]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Waiting for passkey…
                      </>
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4 text-[#1e2d4e]" />
                        Sign in with passkey
                        <Sparkles className="h-3.5 w-3.5 text-[#e85c1a] ml-auto" />
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Footer links */}
              <div className="mt-7 space-y-3">
                <p className="text-center text-[13px] text-[#9aa3b2]">
                  Don't have an account?{' '}
                  <Link to="/register"
                    className="text-[#1e2d4e] font-bold hover:text-[#2d6ac8] transition-colors
                               inline-flex items-center gap-0.5 group">
                    Start free
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </p>
                <p className="text-center text-[11px] text-[#c2c8d6]">
                  By signing in you agree to our{' '}
                  <Link to="/terms" className="underline hover:text-[#9aa3b2] transition-colors">Terms</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="underline hover:text-[#9aa3b2] transition-colors">Privacy Policy</Link>
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
