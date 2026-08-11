import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, FileText, Package, CreditCard, UserCheck,
  Brain, Layers, ShieldCheck, GitCommit, AlertTriangle,
  RefreshCw, Scale, Mail, CheckCircle2, ChevronDown, ChevronUp, Globe,
} from 'lucide-react'
import { Logo } from '../../components/ui/logo'

// ── Section data ──────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    n: '01', icon: FileText, color: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
    title: 'Acceptance of Terms',
    body: (
      <p className="text-sm leading-relaxed">
        By accessing or using <strong>ProqrIQ</strong> ("the Service", available at{' '}
        <strong>ProqrIQ.com</strong> once launched), you agree to be bound by these Terms of Service.
        If you do not agree, you may not use the Service. These terms apply to all users —
        engineers, cost analysts, administrators, CEOs, and any individuals who access the
        platform under a paid or free subscription.
      </p>
    ),
  },
  {
    n: '02', icon: Package, color: 'text-[#0d9e8a]', bg: 'bg-[#ecfdf5]',
    title: 'Description of Service',
    body: (
      <>
        <p className="text-sm leading-relaxed mb-3">
          ProqrIQ is a B2B cost engineering and quotation platform for industrial manufacturers.
          The Service provides:
        </p>
        <ul className="space-y-2">
          {[
            'AI-assisted part drawing analysis and structured cost breakdowns (individual, bulk up to 50 parts, and assembly BOM roll-up)',
            'Engineering knowledge-base queries over your internal PDF document library',
            'Supplier discovery, sourcing, and apple-to-apple negotiation comparison',
            'Quotation approval workflows with full immutable audit trail',
            'Excel and PDF export of cost reports',
            'An AI-powered in-app Help Assistant for guided support',
            'Regional rate configuration and AI model management for administrators',
          ].map(item => (
            <li key={item} className="flex gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    n: '03', icon: CreditCard, color: 'text-[#16a34a]', bg: 'bg-[#dcfce7]',
    title: 'Subscription Plans & Billing',
    body: (
      <div className="space-y-4 text-sm">
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            {
              plan: 'Free',
              color: 'border-[#e5e8ef] bg-[#f4f6fb]',
              badge: 'bg-[#f4f6fb] text-[#9aa3b2]',
              items: ['Limited access', 'Evaluation purposes', 'Single user'],
            },
            {
              plan: 'Pro',
              color: 'border-[#2d6ac8]/30 bg-[#eff6ff]',
              badge: 'bg-[#2d6ac8] text-white',
              items: ['Unlimited quotes', 'Bulk costing (50 parts)', 'Assembly BOM', 'Supplier sourcing', 'Excel / PDF export'],
            },
            {
              plan: 'Organization',
              color: 'border-[#1e2d4e]/30 bg-[#f0f4ff]',
              badge: 'bg-[#1e2d4e] text-white',
              items: ['Everything in Pro', 'Up to 25 seats', 'KB management', 'Multi-provider AI routing', 'Full admin dashboard'],
            },
          ].map(({ plan, color, badge, items }) => (
            <div key={plan} className={`rounded-xl border p-4 ${color}`}>
              <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-3 ${badge}`}>
                {plan}
              </span>
              <ul className="space-y-1.5">
                {items.map(i => (
                  <li key={i} className="flex gap-2 text-[12px] text-[#374151]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0 mt-1.5" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="leading-relaxed text-[#374151]">
          Subscriptions are billed monthly or annually. Annual plans are charged as a single
          upfront payment. Payments are processed securely through <strong>Razorpay</strong>.
          All fees are non-refundable except where required by applicable law. Plan changes
          take effect immediately; downgrades apply at the end of the current billing cycle.
        </p>
      </div>
    ),
  },
  {
    n: '04', icon: UserCheck, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
    title: 'Authorised Use',
    body: (
      <>
        <p className="text-sm leading-relaxed mb-3">
          Access is granted solely to authorised personnel within your organisation. You agree to:
        </p>
        <ul className="space-y-2">
          {[
            'Use the Service only for legitimate business purposes',
            'Keep your login credentials and passkey confidential',
            'Notify your administrator immediately of any suspected unauthorised access',
            'Comply with all applicable laws and regulations',
            'Not attempt to reverse-engineer, scrape, or abuse the AI rate limits of the platform',
          ].map(item => (
            <li key={item} className="flex gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    n: '05', icon: Brain, color: 'text-[#1e2d4e]', bg: 'bg-[#f0f4ff]',
    title: 'AI-Generated Content',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          The Service uses artificial intelligence — including the <strong>Anthropic Claude</strong>{' '}
          model and optionally other configured AI providers — to generate cost estimates,
          supplier suggestions, negotiation talking points, and Help Assistant responses.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[#92400e]">
            All AI-generated content is <strong>for informational purposes only</strong> and must
            be reviewed and validated by qualified engineers before use in commercial quotations
            or procurement decisions. Cost estimates with a confidence score below 70% are
            withheld and replaced with clarification questions.
          </p>
        </div>
        <p>
          ProqrIQ does not warrant the accuracy, completeness, or fitness for purpose of any
          AI-generated output. You are responsible for providing complete and accurate input
          data to obtain reliable estimates.
        </p>
      </div>
    ),
  },
  {
    n: '06', icon: Layers, color: 'text-[#e85c1a]', bg: 'bg-[#fff7ed]',
    title: 'Intellectual Property',
    body: (
      <p className="text-sm leading-relaxed">
        All drawings, documents, and data you upload remain your property. By uploading content,
        you grant ProqrIQ a limited licence to process that content solely for the purpose of
        providing the Service to you. You represent that you have the right to upload and process
        any content you submit. The ProqrIQ software, interface, and brand are the intellectual
        property of their respective owners and may not be copied or redistributed without permission.
      </p>
    ),
  },
  {
    n: '07', icon: ShieldCheck, color: 'text-[#16a34a]', bg: 'bg-[#dcfce7]',
    title: 'Confidentiality',
    body: (
      <p className="text-sm leading-relaxed">
        The Service runs on-premise and processes your data locally by default. Any data
        transmitted to external AI providers (e.g. Anthropic) is governed by those providers'
        terms and data processing agreements. Payment data is transmitted to and processed by
        Razorpay in accordance with their PCI-DSS-compliant infrastructure; ProqrIQ does not
        store full card details. You are responsible for ensuring that data shared with external
        services complies with your organisation's confidentiality obligations.
      </p>
    ),
  },
  {
    n: '08', icon: GitCommit, color: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
    title: 'Approval Workflow & Audit',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          ProqrIQ enforces a multi-role approval workflow: submitted quotations require
          CEO-level approval before they are locked.
        </p>
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3 flex gap-3">
          <ShieldCheck className="w-4 h-4 text-[#2d6ac8] flex-shrink-0 mt-0.5" />
          <p className="text-[#1e40af]">
            All create, update, approve, reject, and delete operations are <strong>permanently
            recorded in an audit log</strong> and cannot be altered retroactively. Soft deletion
            is used for all records — data is never permanently erased and remains available
            for audit and compliance review.
          </p>
        </div>
      </div>
    ),
  },
  {
    n: '09', icon: AlertTriangle, color: 'text-[#dc2626]', bg: 'bg-[#fef2f2]',
    title: 'Limitation of Liability',
    body: (
      <p className="text-sm leading-relaxed">
        To the fullest extent permitted by applicable law, ProqrIQ and its affiliates shall
        not be liable for any indirect, incidental, special, consequential, or punitive damages
        arising out of or related to your use of the Service, including but not limited to
        errors in cost estimates, supplier recommendations, quotation outputs, or billing
        issues arising from third-party payment processors.
      </p>
    ),
  },
  {
    n: '10', icon: RefreshCw, color: 'text-[#e85c1a]', bg: 'bg-[#fff7ed]',
    title: 'Modifications',
    body: (
      <p className="text-sm leading-relaxed">
        We reserve the right to modify these Terms at any time. Material changes will be
        communicated through the Service. Continued use of the Service after changes take
        effect constitutes acceptance of the revised Terms.
      </p>
    ),
  },
  {
    n: '11', icon: Scale, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
    title: 'Governing Law',
    body: (
      <p className="text-sm leading-relaxed">
        These Terms shall be governed by and construed in accordance with applicable laws.
        Any disputes arising under these Terms shall be resolved through good-faith
        negotiation between the parties before any formal proceedings.
      </p>
    ),
  },
  {
    n: '12', icon: Mail, color: 'text-[#1e2d4e]', bg: 'bg-[#f0f4ff]',
    title: 'Contact',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          If you have questions about these Terms, please reach us through any of the following channels.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Email', value: 'legal@proqriq.com', note: '(active once domain is live)' },
            { label: 'Website', value: 'ProqrIQ.com', note: '(coming soon)' },
            { label: 'In-app', value: 'Help Assistant', note: 'available in the sidebar' },
            { label: 'Admin', value: 'System Administrator', note: 'within your organisation' },
          ].map(({ label, value, note }) => (
            <div key={label} className="bg-[#f4f6fb] rounded-xl px-4 py-3">
              <p className="text-[11px] font-bold text-[#9aa3b2] uppercase tracking-wider mb-0.5">{label}</p>
              <p className="font-semibold text-[#0f1729]">{value}</p>
              <p className="text-[11px] text-[#9aa3b2]">{note}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
]

// ── Accordion section ─────────────────────────────────────────────────────────
function Section({ section, index }: { section: typeof SECTIONS[number]; index: number }) {
  const [open, setOpen] = useState(true)
  const Icon = section.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ delay: index * 0.04, duration: 0.5 }}
      className="bg-white rounded-2xl border border-[#e5e8ef] overflow-hidden
                 shadow-sm hover:shadow-md transition-shadow duration-300"
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-6 py-5 text-left"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${section.bg}`}>
          <Icon className={`w-5 h-5 ${section.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold text-[#9aa3b2] uppercase tracking-widest block mb-0.5">
            Section {section.n}
          </span>
          <h2 className="text-[15px] font-bold text-[#0f1729]">{section.title}</h2>
        </div>
        <div className="text-[#9aa3b2] flex-shrink-0">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 text-[#374151] border-t border-[#f4f6fb] pt-4">
          {section.body}
        </div>
      )}
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Terms() {
  return (
    <div className="min-h-screen bg-[#f4f6fb]">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative bg-[#1e2d4e] overflow-hidden">
        <motion.div
          className="absolute top-[-40%] left-[-10%] w-[50%] h-[200%] opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2d6ac8 0%, transparent 60%)' }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-10">
            <Logo size="sm" inverted />
            <Link to="/login"
              className="flex items-center gap-1.5 text-sm text-[#8ba5c8] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>

          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20
                            flex items-center justify-center flex-shrink-0">
              <Scale className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                              bg-white/10 border border-white/15 text-[11px] font-semibold
                              text-[#8ba5c8] mb-3">
                <Globe className="w-3 h-3" />
                ProqrIQ.com · Legal
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Terms of Service</h1>
              <p className="text-[#8ba5c8] text-[14px] mt-2">
                Last updated: August 2026 · Effective immediately · 12 sections
              </p>
            </div>
          </div>

          {/* key guarantees */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: ShieldCheck, label: 'Audit Trail',  desc: 'Every action logged' },
              { icon: Scale,       label: 'Fair Terms',   desc: 'Plain-language policy' },
              { icon: Brain,       label: 'AI Disclosure', desc: 'Transparent AI use' },
              { icon: CreditCard,  label: 'PCI Payments', desc: 'Razorpay-secured' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-center">
                <Icon className="w-4 h-4 text-[#f5a623] mx-auto mb-1.5" />
                <p className="text-[12px] font-semibold text-white">{label}</p>
                <p className="text-[10px] text-[#8ba5c8] mt-0.5 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
        {SECTIONS.map((section, i) => (
          <Section key={section.n} section={section} index={i} />
        ))}

        {/* Footer */}
        <div className="pt-4 pb-8 flex flex-col sm:flex-row items-center justify-between
                        gap-3 text-xs text-[#9aa3b2]">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} ProqrIQ. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-[#0f1729] transition-colors">Privacy Policy</Link>
            <Link to="/login"   className="hover:text-[#0f1729] transition-colors">Sign in</Link>
            <span className="text-[#c2c8d6]">ProqrIQ.com <span className="text-[#d1d9e8]">(coming soon)</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
