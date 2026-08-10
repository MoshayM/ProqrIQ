import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Zap, Building2, Star, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { cn } from '../../lib/utils'
import { LogoMark } from '../../components/ui/logo'
import { usePageTitle } from '../../hooks/usePageTitle'

// ─── Plan data ────────────────────────────────────────────────────────────────

interface Plan {
  id: string
  name: string
  monthlyPrice: number
  annualPrice: number
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  accent: string
  highlights: string[]
  cta: string
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'For engineers who want to explore AI-assisted cost estimation.',
    icon: Star,
    color: 'text-[#9aa3b2]',
    accent: 'border-[#e5e8ef]',
    highlights: ['10 quotes per month', 'Haiku AI model', 'PDF export', '5 KB documents'],
    cta: 'Get Started Free',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 79,
    annualPrice: 65,
    description: 'For professional cost engineers who need full capability.',
    icon: Zap,
    color: 'text-[#e85c1a]',
    accent: 'border-[#e85c1a]',
    highlights: ['200 quotes per month', 'Sonnet AI model', 'Excel + PDF export', 'Supplier discovery', 'Bulk costing (50 parts)', 'Passkey login'],
    cta: 'Start 14-Day Trial',
    popular: true,
  },
  {
    id: 'organization',
    name: 'Organization',
    monthlyPrice: 249,
    annualPrice: 199,
    description: 'For engineering teams that need collaboration and governance.',
    icon: Building2,
    color: 'text-[#1e2d4e]',
    accent: 'border-[#1e2d4e]',
    highlights: ['Unlimited quotes', 'Up to 25 users', 'KB management', 'AI Cost Control', 'SSO / SAML', 'Priority support', 'Audit log export'],
    cta: 'Start 30-Day Trial',
  },
]

const FEATURES = [
  { label: 'Quotes per month',       free: '10',        pro: '200',       org: 'Unlimited' },
  { label: 'Bulk costing',           free: '—',         pro: '50 parts',  org: '50 parts × N users' },
  { label: 'Assembly depth',         free: '2 levels',  pro: '3 levels',  org: '3 levels' },
  { label: 'Supplier discovery',     free: false,       pro: true,        org: true },
  { label: 'Negotiation reports',    free: false,       pro: true,        org: true },
  { label: 'Excel / PDF export',     free: 'PDF only',  pro: true,        org: true },
  { label: 'KB documents',           free: '5',         pro: '50',        org: 'Unlimited' },
  { label: 'AI model',               free: 'Haiku',     pro: 'Sonnet',    org: 'Sonnet + Opus' },
  { label: 'Passkey login',          free: false,       pro: true,        org: true },
  { label: 'AI Cost Control',        free: false,       pro: false,       org: true },
  { label: 'User management',        free: false,       pro: false,       org: true },
  { label: 'SSO / SAML',            free: false,       pro: false,       org: true },
  { label: 'Audit log export',       free: false,       pro: false,       org: true },
  { label: 'Priority support',       free: false,       pro: true,        org: true },
]

const FAQS = [
  { q: 'Is my data stored locally?', a: 'Yes. ProqrIQ runs entirely on your machine. All data stays in a local SQLite database. Anthropic receives only the AI prompts you send — no drawings or business data are stored externally.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your Billing page at any time. Your plan stays active until the end of the current billing period, then reverts to Free.' },
  { q: 'What happens when I hit my quote limit?', a: 'Your in-progress quotes are always saved. You can still view and export existing quotes, but new estimation runs are paused until the next billing period or until you upgrade.' },
  { q: 'How does the 14/30-day trial work?', a: 'No credit card is required for the first 7 days. After that, enter a card to continue your trial. You will not be charged until the trial ends.' },
  { q: 'Can I switch plans?', a: 'Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next renewal date.' },
]

// ─── Pricing Quiz (6B.5) ──────────────────────────────────────────────────────

interface QuizState {
  step: number
  volume: string
  team: string
  supplier: string
}

const QUIZ_STEPS = [
  {
    q: 'How many quotes do you generate per month?',
    key: 'volume',
    options: ['Fewer than 5', '5–20', '20–100', 'More than 100'],
  },
  {
    q: 'Do you work alone or with a team?',
    key: 'team',
    options: ['Solo', '2–5 people', '5–25 people', 'More than 25'],
  },
  {
    q: 'Do you need supplier sourcing & negotiation?',
    key: 'supplier',
    options: ['Yes, essential', 'Maybe later', 'Not needed', 'Not sure'],
  },
]

function recommendPlan(quiz: Omit<QuizState, 'step'>): 'free' | 'pro' | 'organization' {
  if (quiz.team === '5–25 people' || quiz.team === 'More than 25') return 'organization'
  if (quiz.volume === '20–100' || quiz.volume === 'More than 100') return 'pro'
  if (quiz.supplier === 'Yes, essential' || quiz.supplier === 'Maybe later') return 'pro'
  if (quiz.volume === '5–20') return 'pro'
  return 'free'
}

function PricingQuiz({ onRecommend }: { onRecommend: (plan: string) => void }) {
  const [quiz, setQuiz] = useState<QuizState>({ step: 0, volume: '', team: '', supplier: '' })
  const [result, setResult] = useState<string | null>(null)

  function pick(value: string) {
    const key = QUIZ_STEPS[quiz.step].key as keyof QuizState
    const next = { ...quiz, [key]: value }
    if (quiz.step < QUIZ_STEPS.length - 1) {
      setQuiz({ ...next, step: quiz.step + 1 })
    } else {
      const rec = recommendPlan({ volume: next.volume, team: next.team, supplier: next.supplier })
      setResult(rec)
      onRecommend(rec)
    }
  }

  if (result) {
    const plan = PLANS.find(p => p.id === result)!
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
        <p className="text-sm text-[#9aa3b2]">Based on your answers, we recommend:</p>
        <p className="text-2xl font-bold text-[#1e2d4e]">{plan.name} Plan</p>
        <p className="text-sm text-[#4a5568]">{plan.description}</p>
        <Button size="sm" variant="ghost" onClick={() => { setQuiz({ step: 0, volume: '', team: '', supplier: '' }); setResult(null) }}>
          Retake quiz
        </Button>
      </motion.div>
    )
  }

  const step = QUIZ_STEPS[quiz.step]
  return (
    <div className="space-y-4">
      <div className="flex gap-1 justify-center">
        {QUIZ_STEPS.map((_, i) => (
          <div key={i} className={cn('h-1 rounded-full flex-1 max-w-[60px] transition-colors', i <= quiz.step ? 'bg-[#e85c1a]' : 'bg-[#e5e8ef]')} />
        ))}
      </div>
      <p className="text-sm font-medium text-[#1e2d4e] text-center">{step.q}</p>
      <div className="grid grid-cols-2 gap-2">
        {step.options.map(opt => (
          <button
            key={opt}
            onClick={() => pick(opt)}
            className="px-3 py-2.5 rounded-lg border border-[#e5e8ef] text-sm text-[#1e2d4e] hover:border-[#e85c1a] hover:bg-[#e85c1a]/5 transition-all text-left font-medium"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

function Cell({ value }: { value: boolean | string }) {
  if (value === false) return <X className="w-4 h-4 text-[#c8cdd8] mx-auto" />
  if (value === true) return <Check className="w-4 h-4 text-green-600 mx-auto" />
  return <span className="text-xs text-[#4a5568]">{value}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Pricing() {
  usePageTitle('Pricing')
  const navigate = useNavigate()
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [highlightPlan, setHighlightPlan] = useState<string | null>(null)

  function handleCta(planId: string) {
    if (planId === 'free') {
      navigate('/login')
    } else {
      navigate(`/billing?plan=${planId}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Navbar */}
      <nav className="bg-white border-b border-[#e5e8ef] px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="font-bold text-[#1e2d4e] text-base">ProqrIQ</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-[#4a5568] hover:text-[#1e2d4e]">Sign in</Link>
          <Button size="sm" onClick={() => navigate('/login')}>Get started</Button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16 space-y-20">
        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1e2d4e]">Simple, honest pricing</h1>
          <p className="text-lg text-[#4a5568] max-w-xl mx-auto">
            AI-powered cost engineering for precision parts. Start free, scale as you grow.
          </p>
          {/* Monthly / Annual toggle */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className={cn('text-sm font-medium', !annual ? 'text-[#1e2d4e]' : 'text-[#9aa3b2]')}>Monthly</span>
            <button
              onClick={() => setAnnual(v => !v)}
              className={cn('relative w-11 h-6 rounded-full transition-colors', annual ? 'bg-[#e85c1a]' : 'bg-[#c8cdd8]')}
            >
              <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', annual ? 'translate-x-6' : 'translate-x-1')} />
            </button>
            <span className={cn('text-sm font-medium', annual ? 'text-[#1e2d4e]' : 'text-[#9aa3b2]')}>Annual</span>
            {annual && (
              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Save ~18%</span>
            )}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice
            const isHighlighted = highlightPlan === plan.id
            return (
              <motion.div
                key={plan.id}
                animate={{ scale: isHighlighted ? 1.02 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Card className={cn('relative overflow-hidden border-2 h-full flex flex-col', plan.popular ? 'border-[#e85c1a] shadow-lg' : 'border-[#e5e8ef]', isHighlighted && 'ring-2 ring-[#6366f1] ring-offset-2')}>
                  {plan.popular && (
                    <div className="bg-[#e85c1a] text-white text-xs font-semibold text-center py-1.5 tracking-wide">
                      MOST POPULAR
                    </div>
                  )}
                  {isHighlighted && (
                    <div className="bg-[#6366f1] text-white text-xs font-semibold text-center py-1.5 tracking-wide">
                      RECOMMENDED FOR YOU
                    </div>
                  )}
                  <CardContent className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <plan.icon className={cn('w-5 h-5', plan.color)} />
                      <span className="font-bold text-[#1e2d4e] text-lg">{plan.name}</span>
                    </div>
                    <div className="mb-4">
                      {price === 0 ? (
                        <p className="text-3xl font-bold text-[#1e2d4e]">Free</p>
                      ) : (
                        <div className="flex items-end gap-1">
                          <p className="text-3xl font-bold text-[#1e2d4e]">€{price}</p>
                          <p className="text-sm text-[#9aa3b2] mb-1">/ mo{annual ? ' billed annually' : ''}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-[#4a5568] mb-5">{plan.description}</p>
                    <ul className="space-y-2 mb-6 flex-1">
                      {plan.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-[#1e2d4e]">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={plan.popular ? 'primary' : 'outline'}
                      className={cn('w-full', plan.popular && 'bg-[#e85c1a] hover:bg-[#d14e0f] text-white')}
                      onClick={() => handleCta(plan.id)}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {/* Feature comparison */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e2d4e] mb-6 text-center">Full feature comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e8ef]">
                  <th className="text-left py-3 px-4 font-medium text-[#9aa3b2] w-1/2">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.id} className="py-3 px-4 font-semibold text-[#1e2d4e] text-center">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f3f7]">
                {FEATURES.map((f) => (
                  <tr key={f.label} className="hover:bg-white/60">
                    <td className="py-2.5 px-4 text-[#4a5568]">{f.label}</td>
                    <td className="py-2.5 px-4 text-center"><Cell value={f.free} /></td>
                    <td className="py-2.5 px-4 text-center"><Cell value={f.pro} /></td>
                    <td className="py-2.5 px-4 text-center"><Cell value={f.org} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing quiz */}
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-[#1e2d4e] mb-1 text-center">Not sure which plan?</h2>
            <p className="text-sm text-[#9aa3b2] text-center mb-6">Answer 3 quick questions — we'll recommend the best fit.</p>
            <PricingQuiz onRecommend={(plan) => setHighlightPlan(plan)} />
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e2d4e] mb-6 text-center">Frequently asked questions</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-[#e5e8ef] rounded-xl overflow-hidden bg-white">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-[#1e2d4e] text-sm">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-4 h-4 text-[#9aa3b2] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9aa3b2] flex-shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm text-[#4a5568] leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center space-y-4 py-8">
          <h2 className="text-3xl font-bold text-[#1e2d4e]">Ready to get started?</h2>
          <p className="text-[#4a5568]">Join engineering teams using ProqrIQ to cut quotation time by 70%.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button className="bg-[#e85c1a] hover:bg-[#d14e0f] text-white px-8" onClick={() => navigate('/login')}>
              Get Started Free
            </Button>
            <Button variant="outline" className="px-8" onClick={() => navigate('/login')}>
              Start Pro Trial
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
