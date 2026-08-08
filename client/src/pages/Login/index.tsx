import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Mail, Lock, Fingerprint, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Button } from '../../components/ui/button'
import { Logo } from '../../components/ui/logo'

const loginSchema = z.object({
  email:    z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

const FEATURE_CHIPS = [
  'AI Drawing Analysis',
  'KB-Sourced Estimates',
  'Assembly Roll-up',
  'Bulk Costing',
  'Confidence Scoring',
  'CEO Approval Flow',
]

const STATS = [
  { value: '98%', label: 'Confidence Target' },
  { value: '50+', label: 'Parts per Batch' },
  { value: '30d',  label: 'Quote Validity' },
]

const webAuthnSupported =
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential === 'function'

export default function Login() {
  const { loginWithToken, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [showPassword, setShowPassword]     = useState(false)
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
        } catch {
          // passkey check failed — proceed normally
        }
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
    <div className="min-h-screen flex">

      {/* LEFT PANEL — hero */}
      <div
        className="hidden lg:flex lg:w-3/5 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0f1629 45%, #1a2744 100%)' }}
      >
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        {/* Glow blobs */}
        <div className="absolute top-24 right-16 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,92,26,0.13) 0%, transparent 70%)' }} />
        <div className="absolute bottom-24 left-8 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />

        {/* Top — Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex items-center gap-3"
        >
          <Logo size="md" inverted />
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(232,92,26,0.18)', color: '#f0916a' }}>Powered by AI</span>
        </motion.div>

        {/* Middle — headline */}
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

        {/* Bottom — stats */}
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
        className="w-full lg:w-2/5 flex items-center justify-center bg-white px-8 py-12"
      >
        <div className="w-full max-w-[340px]">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <Logo size="md" />
          </div>

          {/* ── Passkey setup prompt ── */}
          {showSetup ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-2 bg-navy">
                <Fingerprint className="h-7 w-7 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-[#0f1729]">Sign in faster next time</h2>
                <p className="text-[#9aa3b2] text-sm mt-1.5">
                  Register a passkey to sign in with your fingerprint, face, or device PIN — no password needed.
                </p>
              </div>
              <Button variant="navy" size="lg" className="w-full" loading={setupLoading} onClick={handleSetupPasskey} iconLeft={!setupLoading ? <Fingerprint className="h-4 w-4" /> : undefined}>
                {setupLoading ? 'Setting up…' : 'Set up passkey'}
              </Button>
              <button onClick={finishLogin} disabled={setupLoading} className="w-full text-center text-sm text-[#9aa3b2] hover:text-[#4a5568] transition-colors py-1">
                Not now, skip
              </button>
            </motion.div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-[#0f1729]">Welcome back</h2>
              <p className="text-[#9aa3b2] text-sm mt-1 mb-7">Sign in to continue to your dashboard</p>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#0f1729] mb-1.5">Email address</label>
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
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password')}
                      className="w-full border border-[#e5e8ef] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#0f1729] placeholder:text-[#9aa3b2] focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all bg-white"
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                </div>

                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{submitError}</div>
                )}

                <Button type="submit" variant="navy" size="lg" className="w-full mt-1" loading={isSubmitting}>
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              {/* Passkey login */}
              {webAuthnSupported && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-[#e5e8ef]" />
                    <span className="text-xs text-[#9aa3b2]">or</span>
                    <div className="flex-1 h-px bg-[#e5e8ef]" />
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    className="w-full"
                    loading={passkeyLoading}
                    onClick={handlePasskeyLogin}
                    iconLeft={!passkeyLoading ? <Fingerprint className="h-4 w-4" /> : undefined}
                    iconRight={!passkeyLoading ? <Sparkles className="h-3.5 w-3.5 text-brand" /> : undefined}
                  >
                    {passkeyLoading ? 'Waiting for passkey…' : 'Sign in with passkey'}
                  </Button>
                </>
              )}

            </>
          )}

          {!showSetup && (
            <>
              <p className="text-center text-sm text-[#9aa3b2] mt-6">
                Don't have an account?{' '}
                <Link to="/register" className="text-navy font-semibold hover:underline">Start free</Link>
              </p>
              <p className="text-center text-xs text-[#b0b8c9] mt-4">
                By signing in you agree to our{' '}
                <Link to="/terms" className="underline hover:text-[#4a5568] transition-colors">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" className="underline hover:text-[#4a5568] transition-colors">Privacy Policy</Link>
              </p>
            </>
          )}

        </div>
      </motion.div>
    </div>
  )
}
