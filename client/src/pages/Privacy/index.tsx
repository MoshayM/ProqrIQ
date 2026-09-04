import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Shield, Database, Brain, CreditCard,
  Lock, Eye, Clock, Users, RefreshCw, Mail, Globe,
  CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Logo } from '../../components/ui/logo'

// ── Section data ──────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    n: '01', icon: Shield, color: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
    title: 'Introduction',
    body: (
      <p className="leading-relaxed">
        ProqrIQ ("we", "the Service", reachable at <strong>ProqrIQ.com</strong>) is committed to handling
        your data responsibly and in compliance with applicable privacy laws.
        This Privacy Policy explains how we collect, use, store, and protect information
        when you use our cost engineering and quotation platform.
      </p>
    ),
  },
  {
    n: '02', icon: Eye, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
    title: 'Information We Collect',
    body: (
      <>
        <p className="leading-relaxed mb-3">We collect the following categories of information:</p>
        <ul className="space-y-2.5">
          {[
            ['Account information', 'Full name, email address, and hashed password when you register.'],
            ['Authentication data', 'Passkey (WebAuthn) credentials stored locally on your device. No biometric data is transmitted to our servers.'],
            ['Session data', 'JWT tokens stored in browser local storage for authentication.'],
            ['Usage & audit data', 'Every action within the platform (quotation created, batch started, approval granted, etc.) is recorded in an immutable audit log for compliance.'],
            ['Uploaded content', 'Part drawings, PDF engineering documents, and other files you upload for analysis or knowledge-base ingestion.'],
            ['AI interaction data', 'Messages processed in real time via the in-app Help Assistant — not persistently stored beyond your current session.'],
            ['Billing information', 'Subscription plan, billing cycle, and payment tokens. Full card details are never stored by ProqrIQ and are handled exclusively by Razorpay.'],
            ['Notification preferences', 'In-app notification read status for quote approvals, batch completions, and system alerts.'],
          ].map(([title, desc]) => (
            <li key={title as string} className="flex gap-3 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0 mt-0.5" />
              <span><strong className="text-[#0f1729]">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    n: '03', icon: Brain, color: 'text-[#0d9e8a]', bg: 'bg-[#ecfdf5]',
    title: 'How We Use Your Information',
    body: (
      <>
        <p className="leading-relaxed mb-3">We use collected information to:</p>
        <ul className="space-y-2">
          {[
            'Authenticate your identity and maintain your session securely',
            'Process part drawings and generate structured cost estimates using AI',
            'Search the engineering knowledge base before every AI estimate',
            'Run bulk and assembly costing workflows in parallel',
            'Facilitate supplier sourcing, quote extraction, comparison, and negotiation reports',
            'Maintain a complete, tamper-evident audit trail of all quotation and approval activity',
            'Provide usage analytics and AI budget monitoring to administrators',
            'Process subscription payments and verify payment status through Razorpay',
            'Send in-app notifications for quote submissions, approvals, and batch completions',
          ].map(item => (
            <li key={item} className="flex gap-2.5 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0d9e8a] flex-shrink-0 mt-2" />
              {item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    n: '04', icon: Database, color: 'text-[#e85c1a]', bg: 'bg-[#fff7ed]',
    title: 'Data Storage',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          ProqrIQ is designed to run <strong>on-premise</strong>. All operational data — including the
          SQLite database, uploaded files, and vector embeddings — is stored on your organisation's
          own server infrastructure. We do not operate a central cloud database holding your
          quotation or drawing data.
        </p>
        <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-xl px-4 py-3 flex gap-3">
          <Shield className="w-4 h-4 text-[#e85c1a] flex-shrink-0 mt-0.5" />
          <p className="text-[#9a3412]">
            Quotation and batch records are <strong>soft-deleted and never permanently erased</strong>,
            preserving complete history for audit purposes.
          </p>
        </div>
      </div>
    ),
  },
  {
    n: '05', icon: Brain, color: 'text-[#1e2d4e]', bg: 'bg-[#f0f4ff]',
    title: 'Third-Party AI Providers',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          When you use AI-powered features — including cost estimation, supplier suggestions,
          knowledge-base queries, document analysis, and the Help Assistant — excerpts from
          your drawings and engineering documents are transmitted to external AI providers.
        </p>
        <p>
          By default, only <strong>Anthropic (Claude)</strong> is used. Administrators may
          additionally enable OpenAI, Google Gemini, xAI Grok, Groq, or Together AI through
          the AI Control panel. Review each provider's privacy policy for their data handling practices.
        </p>
        <div className="bg-[#f0f4ff] border border-[#c7d2fe] rounded-xl px-4 py-3 flex gap-3">
          <Globe className="w-4 h-4 text-[#1e2d4e] flex-shrink-0 mt-0.5" />
          <p className="text-[#3730a3]">
            ProqrIQ does not persistently store the content of AI model requests or responses
            on external servers; data handling is governed solely by each provider's terms.
          </p>
        </div>
      </div>
    ),
  },
  {
    n: '06', icon: CreditCard, color: 'text-[#16a34a]', bg: 'bg-[#dcfce7]',
    title: 'Payment Data & Razorpay',
    body: (
      <p className="text-sm leading-relaxed">
        Subscription payments are processed by <strong>Razorpay</strong>, a PCI-DSS-compliant
        payment gateway. ProqrIQ does not receive, store, or process full card or bank account
        details. We receive only payment verification tokens and order status information.
        By completing a payment, you agree to Razorpay's Privacy Policy and Terms of Use
        in addition to this Policy.
      </p>
    ),
  },
  {
    n: '07', icon: Globe, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
    title: 'Supplier Lookup',
    body: (
      <p className="text-sm leading-relaxed">
        Supplier discovery is AI-powered by default (using only the configured AI provider).
        An optional external supplier-directory lookup is <strong>disabled by default</strong> and
        requires explicit administrator configuration via an allow-list of approved hosts.
        When enabled, part specification queries may be transmitted to the configured
        supplier directory. External supplier hits are cached separately and must be manually
        promoted before entering your supplier database.
      </p>
    ),
  },
  {
    n: '08', icon: Lock, color: 'text-[#dc2626]', bg: 'bg-[#fef2f2]',
    title: 'Data Security',
    body: (
      <ul className="space-y-2.5">
        {[
          ['bcrypt password hashing', 'Plaintext passwords are never stored.'],
          ['JWT + RBAC', 'All API routes are protected by JWT authentication and role-based access control.'],
          ['WebAuthn passkeys', 'Phishing-resistant, passwordless authentication supported on all accounts.'],
          ['Immutable audit log', 'All create, update, delete, approve, and reject operations are permanently recorded.'],
          ['Server-side secrets', 'API keys and other secrets are server-side only and never exposed to the browser.'],
        ].map(([title, desc]) => (
          <li key={title as string} className="flex gap-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0 mt-0.5" />
            <span><strong className="text-[#0f1729]">{title}</strong> — {desc}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    n: '09', icon: Clock, color: 'text-[#0d9e8a]', bg: 'bg-[#ecfdf5]',
    title: 'Data Retention',
    body: (
      <p className="text-sm leading-relaxed">
        Quotations, batch records, assemblies, and supplier quotes are soft-deleted (never
        permanently removed) to preserve audit history. Uploaded files and database records
        are retained for as long as required by your organisation's retention policy.
        Administrators may manage user accounts and data through the Account Management section.
        AI Help Assistant messages are session-only and not retained after you close the panel.
      </p>
    ),
  },
  {
    n: '10', icon: Users, color: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
    title: 'Your Rights',
    body: (
      <p className="text-sm leading-relaxed">
        Depending on your jurisdiction, you may have rights to access, correct, or request
        deletion of your personal data. Please contact your system administrator to exercise
        these rights. Administrators can view and manage user accounts through the Admin
        section of the platform.
      </p>
    ),
  },
  {
    n: '11', icon: RefreshCw, color: 'text-[#e85c1a]', bg: 'bg-[#fff7ed]',
    title: 'Changes to This Policy',
    body: (
      <p className="text-sm leading-relaxed">
        We may update this Privacy Policy from time to time to reflect new features or legal
        requirements. Material changes will be communicated through the Service. Your continued
        use of the Service after changes take effect constitutes acceptance of the revised policy.
      </p>
    ),
  },
  {
    n: '12', icon: Mail, color: 'text-[#1e2d4e]', bg: 'bg-[#f0f4ff]',
    title: 'Contact',
    body: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          If you have questions or concerns about this Privacy Policy or how your data is handled,
          please reach out through any of the channels below.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Email', value: 'privacy@proqriq.com', note: '(active once domain is live)' },
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
export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#f4f6fb]">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative bg-[#1e2d4e] overflow-hidden">
        {/* animated glow */}
        <motion.div
          className="absolute top-[-40%] right-[-10%] w-[50%] h-[200%] opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #e85c1a 0%, transparent 60%)' }}
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
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                              bg-white/10 border border-white/15 text-[11px] font-semibold
                              text-[#8ba5c8] mb-3">
                <Globe className="w-3 h-3" />
                Privacy & Data Policy
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Privacy Policy</h1>
              <p className="text-[#8ba5c8] text-[14px] mt-2">
                Last updated: August 2026 · Effective immediately · 12 sections
              </p>
            </div>
          </div>

          {/* quick-scan highlights */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Database, label: 'On-premise', desc: 'Your data stays on your server' },
              { icon: Lock,     label: 'Encrypted',  desc: 'bcrypt + JWT + WebAuthn' },
              { icon: Eye,      label: 'Audited',    desc: 'Immutable audit log' },
              { icon: Globe,    label: 'AI-Aware',   desc: 'Transparent AI data flows' },
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
            <Link to="/terms"  className="hover:text-[#0f1729] transition-colors">Terms of Service</Link>
            <Link to="/login"  className="hover:text-[#0f1729] transition-colors">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
