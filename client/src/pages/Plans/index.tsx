import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Check, X, Zap, Building2, Users, Star, ChevronLeft, ExternalLink } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ProgressBar } from '../../components/ui/progress-bar'
import { cn } from '../../lib/utils'

interface PlanFeature {
  label: string
  free: boolean | string
  pro: boolean | string
  org: boolean | string
}

const FEATURES: PlanFeature[] = [
  { label: 'Quotes per month',        free: '10',        pro: '200',       org: 'Unlimited' },
  { label: 'Bulk batch items',        free: '10',        pro: '50',        org: '50 ×N users' },
  { label: 'Assembly depth',          free: '2 levels',  pro: '3 levels',  org: '3 levels' },
  { label: 'KB documents',            free: '5',         pro: '50',        org: 'Unlimited' },
  { label: 'AI model access',         free: 'Haiku',     pro: 'Sonnet',    org: 'Sonnet + Opus' },
  { label: 'Supplier discovery',      free: false,       pro: true,        org: true },
  { label: 'Negotiation reports',     free: false,       pro: true,        org: true },
  { label: 'Excel / PDF export',      free: false,       pro: true,        org: true },
  { label: 'Passkey authentication',  free: false,       pro: true,        org: true },
  { label: 'AI Cost Control panel',   free: false,       pro: false,       org: true },
  { label: 'Custom margin %',         free: false,       pro: false,       org: true },
  { label: 'SSO / SAML',             free: false,       pro: false,       org: true },
  { label: 'Priority support',        free: false,       pro: true,        org: true },
  { label: 'Audit log export',        free: false,       pro: false,       org: true },
]

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'For individual engineers getting started with cost estimation.',
    icon: Star,
    color: 'text-[#9aa3b2]',
    bg: 'bg-surface-2',
    border: 'border-[#e5e8ef]',
    cta: 'Current Plan',
    ctaVariant: 'outline' as const,
    highlights: ['10 quotes/month', 'Haiku model', 'Basic exports'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    period: 'per user / month',
    description: 'For serious engineers and cost analysts who need the full toolset.',
    icon: Zap,
    color: 'text-brand',
    bg: 'bg-brand/5',
    border: 'border-brand/30',
    cta: 'Upgrade to Pro',
    ctaVariant: 'primary' as const,
    badge: 'Most Popular',
    highlights: ['200 quotes/month', 'Sonnet model', 'Supplier discovery', 'Bulk ≤50 items'],
  },
  {
    id: 'org',
    name: 'Organization',
    price: 199,
    period: 'per org / month',
    description: 'For teams and enterprises that need governance, SSO, and full model access.',
    icon: Building2,
    color: 'text-navy',
    bg: 'bg-navy/5',
    border: 'border-navy/20',
    cta: 'Contact Sales',
    ctaVariant: 'navy' as const,
    highlights: ['Unlimited quotes', 'Sonnet + Opus', 'AI Cost Control', 'SSO + audit'],
  },
]

const USAGE_MOCK = {
  quotes_used:  7,
  quotes_limit: 10,
  kb_docs_used:  3,
  kb_docs_limit: 5,
  ai_calls_used:  4,
  ai_calls_limit: 10,
}

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="w-4 h-4 text-green-500 mx-auto" />
  if (value === false) return <X className="w-4 h-4 text-[#c8cdd8] mx-auto" />
  return <span className="text-xs font-medium text-[#4a5568] text-center block">{value}</span>
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.35 } }),
}

export default function Plans() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [billingAnnual, setBillingAnnual] = useState(false)

  const currentPlan = (user as any)?.plan ?? 'free'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="page-content space-y-8"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f1729]">Plans &amp; Usage</h1>
        <p className="text-sm text-[#9aa3b2] mt-1">Compare plans and track your current usage</p>
      </div>

      {/* Current Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Current Usage — Free Plan</CardTitle>
          <p className="text-xs text-[#9aa3b2] mt-0.5">Resets on the 1st of each month</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: 'Quotes', used: USAGE_MOCK.quotes_used, limit: USAGE_MOCK.quotes_limit },
              { label: 'KB Documents', used: USAGE_MOCK.kb_docs_used, limit: USAGE_MOCK.kb_docs_limit },
              { label: 'AI Calls (today)', used: USAGE_MOCK.ai_calls_used, limit: USAGE_MOCK.ai_calls_limit },
            ].map((item) => {
              const pct = Math.round((item.used / item.limit) * 100)
              const variant = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'brand'
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-[#4a5568]">{item.label}</span>
                    <span className="text-xs font-mono text-[#0f1729]">{item.used} / {item.limit}</span>
                  </div>
                  <ProgressBar value={pct} variant={variant} size="sm" />
                  {pct >= 90 && (
                    <p className="text-xs text-red-600 mt-1">Approaching limit — consider upgrading</p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn('text-sm font-medium', !billingAnnual ? 'text-[#0f1729]' : 'text-[#9aa3b2]')}>Monthly</span>
        <button
          onClick={() => setBillingAnnual(v => !v)}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors duration-200',
            billingAnnual ? 'bg-brand' : 'bg-[#e8ebf2]',
          )}
          role="switch"
          aria-checked={billingAnnual}
        >
          <span className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            billingAnnual ? 'translate-x-5' : 'translate-x-0',
          )} />
        </button>
        <span className={cn('text-sm font-medium', billingAnnual ? 'text-[#0f1729]' : 'text-[#9aa3b2]')}>
          Annual <span className="text-green-600 text-xs font-semibold">Save 20%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan, i) => {
          const Icon = plan.icon
          const monthly = billingAnnual ? Math.round(plan.price * 0.8) : plan.price
          const isCurrent = currentPlan === plan.id
          return (
            <motion.div key={plan.id} variants={fadeUp} custom={i} initial="hidden" animate="show">
              <Card className={cn('relative h-full flex flex-col', plan.bg, plan.border, 'border-2')}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-brand text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                      {plan.badge}
                    </span>
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', plan.bg, 'border', plan.border)}>
                      <Icon className={cn('w-4 h-4', plan.color)} />
                    </div>
                    <CardTitle className={plan.color}>{plan.name}</CardTitle>
                  </div>
                  <div className="mb-2">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-bold text-[#0f1729]">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-[#0f1729] font-mono">${monthly}</span>
                        <span className="text-sm text-[#9aa3b2] ml-1">{plan.period}</span>
                        {billingAnnual && plan.price > 0 && (
                          <p className="text-xs text-green-600 mt-0.5">Billed annually (save ${(plan.price - monthly) * 12}/yr)</p>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-sm text-[#4a5568]">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {plan.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-2">
                      <Check className={cn('w-3.5 h-3.5 flex-shrink-0', plan.color)} />
                      <span className="text-sm text-[#4a5568]">{h}</span>
                    </div>
                  ))}
                </CardContent>
                <div className="p-6 pt-0">
                  <Button
                    variant={plan.ctaVariant}
                    className="w-full"
                    disabled={isCurrent}
                    onClick={() => {
                      if (plan.id === 'org') {
                        // Would open sales contact
                        return
                      }
                      // Would trigger Stripe checkout
                    }}
                  >
                    {isCurrent ? 'Current Plan' : plan.cta}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Full comparison table */}
      <Card>
        <CardHeader>
          <CardTitle>Full Feature Comparison</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e8ef]">
                <th className="py-3 pr-4 text-left font-medium text-[#9aa3b2] text-xs uppercase tracking-wide w-1/2">Feature</th>
                {PLANS.map((p) => (
                  <th key={p.id} className={cn('py-3 px-4 text-center font-semibold text-sm', p.color)}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e8ef]">
              {FEATURES.map((feat) => (
                <tr key={feat.label} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3 pr-4 text-[#4a5568]">{feat.label}</td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={feat.free} /></td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={feat.pro} /></td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={feat.org} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Enterprise CTA */}
      <div className="bg-navy rounded-2xl p-8 text-center text-white">
        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-xl font-bold mb-2">Need a custom plan?</h2>
        <p className="text-white/60 text-sm mb-6 max-w-md mx-auto">
          We work with large manufacturing teams and enterprises to build tailored deployments
          with custom rate limits, on-premise options, and dedicated support.
        </p>
        <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" iconRight={<ExternalLink className="w-4 h-4" />}>
          Talk to Sales
        </Button>
      </div>
    </motion.div>
  )
}
