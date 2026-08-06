import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, Mail, Lock, Fingerprint, Sparkles } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

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

  const [submitError, setSubmitError]     = useState<string | null>(null)
  const [showPassword, setShowPassword]   = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  // passkey-setup prompt state (shown after password login when no passkey registered)
  const [pendingToken, setPendingToken]   = useState<string | null>(null)
  const [pendingUser,  setPendingUser]    = useState<any>(null)
  const [showSetup,    setShowSetup]      = useState(false)
  const [setupLoading, setSetupLoading]   = useState(false)

  React.useEffect(() => {
    if (isAuthenticated && !showSetup) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate, showSetup])

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  // ── password login ──────────────────────────────────────────────────────────

  async function onSubmit(data: LoginFormData) {
    setSubmitError(null)
    try {
      const res = await api.auth.login(data.email, data.password)
      const { token, user } = res
      // Store token so passkey API calls (requireAuth) work immediately
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
          // passkey check failed — just proceed normally
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

  // ── passkey login ───────────────────────────────────────────────────────────

  async function handlePasskeyLogin() {
    if (!webAuthnSupported) {
      toast.error('Your browser does not support passkeys')
      return
    }
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
      if (e?.name === 'NotAllowedError') {
        toast.error('Passkey sign-in was cancelled')
      } else {
        const msg = e?.response?.data?.error ?? 'Passkey sign-in failed'
        toast.error(msg)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  // ── passkey setup (post-login prompt) ───────────────────────────────────────

  async function handleSetupPasskey() {
    setSetupLoading(true)
    try {
      const { options, challengeId } = await api.passkey.registerOptions()
      const attestation = await startRegistration(options)
      await api.passkey.registerVerify({ response: attestation, challengeId })
      toast.success('Passkey registered — you can sign in with your fingerprint next time!')
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e?.name !== 'NotAllowedError') toast.error('Passkey setup failed')
    } finally {
      setSetupLoading(false)
      finishLogin()
    }
  }

  function finishLogin() {
    if (pendingToken && pendingUser) {
      loginWithToken(pendingToken, pendingUser)
    }
    navigate('/dashboard', { replace: true })
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">

      {/* LEFT PANEL */}
      <div
        className="hidden lg:flex lg:w-3/5 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #080f1e 0%, #0f1629 45%, #1a2744 100%)' }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="absolute top-24 right-16 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,92,26,0.12) 0%, transparent 70%)' }} />
        <div className="absolute bottom-24 left-8 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-lg" style={{ background: 'linear-gradient(135deg, #e85c1a, #c94d10)' }}>P</div>
            <span className="text-white font-bold text-xl tracking-tight">ProqrIQ</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(232,92,26,0.18)', color: '#f0916a' }}>Powered by AI</span>
          </div>
          <p className="text-blue-400 text-sm mt-1.5 ml-11 opacity-80">Intelligent Cost Engineering</p>
        </div>

        <div className="relative z-10 space-y-7">
          <div>
            <h1 className="text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
              Turn Drawings<br />Into Accurate<br /><span style={{ color: '#e85c1a' }}>Cost Quotes</span>
            </h1>
            <p className="text-blue-200 mt-4 text-[15px] leading-relaxed max-w-[22rem] opacity-80">
              Upload part drawings, query your engineering knowledge base, and generate structured cost breakdowns with 98% confidence — entirely on-premise.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_CHIPS.map((label) => (
              <span key={label} className="text-xs px-3 py-1.5 rounded-full border font-medium" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.05)' }}>{label}</span>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex gap-10 border-t pt-7" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-blue-300 mt-0.5 opacity-70">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-[340px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-base" style={{ background: 'linear-gradient(135deg, #e85c1a, #c94d10)' }}>P</div>
            <span className="font-bold text-xl text-gray-800 tracking-tight">ProqrIQ</span>
          </div>

          {/* ── passkey setup prompt ── */}
          {showSetup ? (
            <div className="space-y-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-2" style={{ background: 'linear-gradient(135deg, #1e2d4e, #2a3f6e)' }}>
                <Fingerprint className="h-7 w-7 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">Sign in faster next time</h2>
                <p className="text-gray-400 text-sm mt-1.5">
                  Register a passkey to sign in with your fingerprint, face, or device PIN — no password needed.
                </p>
              </div>
              <button
                onClick={handleSetupPasskey}
                disabled={setupLoading}
                className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 shadow-md hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #1e2d4e, #2a3f6e)' }}
              >
                {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                {setupLoading ? 'Setting up…' : 'Set up passkey'}
              </button>
              <button
                onClick={finishLogin}
                disabled={setupLoading}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                Not now, skip
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-gray-400 text-sm mt-1 mb-8">Sign in to continue to your dashboard</p>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e] focus:border-transparent transition-all" />
                  </div>
                  {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" {...register('password')} className="w-full border border-gray-200 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d4e] focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                </div>

                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{submitError}</div>
                )}

                <button type="submit" disabled={isSubmitting} className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1 shadow-md hover:shadow-lg" style={{ background: 'linear-gradient(135deg, #1e2d4e, #2a3f6e)' }}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              {/* Passkey login */}
              {webAuthnSupported && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {passkeyLoading
                      ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      : <Fingerprint className="h-4 w-4 text-gray-500" />}
                    {passkeyLoading ? 'Waiting for passkey…' : 'Sign in with passkey'}
                    {!passkeyLoading && <Sparkles className="h-3.5 w-3.5 text-orange-400 ml-auto" />}
                  </button>
                </>
              )}

              {/* Demo credentials */}
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Demo credentials</p>
                <div className="space-y-2">
                  {[{ label: 'Email', value: 'admin@autoquote.com' }, { label: 'Password', value: 'AutoQuote2024!' }].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
                      <code className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-700 font-mono truncate">{value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
