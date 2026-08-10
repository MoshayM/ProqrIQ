import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useRef, useState } from 'react'
import {
  Brain, Layers, Package, MapPin, BarChart2, ShieldCheck,
  ArrowRight, ChevronRight, Zap, Clock, Target, TrendingUp,
  CheckCircle2, Play, Star, Users, FileText, Cpu
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ── tiny hook: animate counter ────────────────────────────────────────────────
function useCounter(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime: number | null = null
    const step = (ts: number) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(ease * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return value
}

// ── stat card ────────────────────────────────────────────────────────────────
function StatCard({ value, suffix = '', label, inView }: {
  value: number; suffix?: string; label: string; inView: boolean
}) {
  const count = useCounter(value, 1600, inView)
  return (
    <div className="text-center">
      <p className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
        {count}{suffix}
      </p>
      <p className="mt-1 text-sm text-[#8ba5c8] font-medium">{label}</p>
    </div>
  )
}

// ── feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, color }: {
  icon: React.ComponentType<{ className?: string }>
  title: string; desc: string; color: string
}) {
  return (
    <div className="group relative bg-white rounded-2xl border border-[#e5e8ef] p-6
                    hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-default">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-4', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-[15px] font-semibold text-[#0f1729] mb-2">{title}</h3>
      <p className="text-[13px] text-[#6b7280] leading-relaxed">{desc}</p>
      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-[#9aa3b2]" />
      </div>
    </div>
  )
}

// ── step ─────────────────────────────────────────────────────────────────────
function Step({ n, title, desc, last }: { n: number; title: string; desc: string; last?: boolean }) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-[#1e2d4e] text-white flex items-center justify-center
                        text-sm font-bold flex-shrink-0 shadow-md">
          {n}
        </div>
        {!last && <div className="w-0.5 flex-1 bg-[#e5e8ef] mt-2" />}
      </div>
      <div className={cn('pb-8', last && 'pb-0')}>
        <h4 className="text-[15px] font-semibold text-[#0f1729] mb-1">{title}</h4>
        <p className="text-[13px] text-[#6b7280] leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsInView, setStatsInView] = useState(false)

  // redirect logged-in users
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  // intersection observer for counter animation
  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsInView(true) },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (isLoading) return null

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-[#e5e8ef]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* logo mark */}
            <div className="w-8 h-8 rounded-lg bg-[#1e2d4e] flex items-center justify-center">
              <Brain className="w-4 h-4 text-[#f5a623]" />
            </div>
            <span className="font-bold text-[#0f1729] text-[15px] tracking-tight">ProqrIQ</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-[13px] text-[#4a5568] font-medium">
            <a href="#features" className="hover:text-[#1e2d4e] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[#1e2d4e] transition-colors">How it works</a>
            <a href="#stats" className="hover:text-[#1e2d4e] transition-colors">Results</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-[13px] font-medium text-[#4a5568] hover:text-[#1e2d4e] transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 bg-[#1e2d4e] text-white text-[13px] font-semibold
                         rounded-lg hover:bg-[#2d3e5c] transition-colors shadow-sm"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e8ef_1px,transparent_1px),linear-gradient(to_bottom,#e5e8ef_1px,transparent_1px)]
                        bg-[size:40px_40px] opacity-40" />
        {/* radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px]
                        bg-gradient-radial from-[#1e2d4e]/8 to-transparent rounded-full" />

        <div className="relative max-w-6xl mx-auto px-6 text-center">
          {/* badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#f0f4ff] border border-[#c7d4f7]
                          rounded-full text-[12px] font-semibold text-[#1e2d4e] mb-8">
            <Zap className="w-3 h-3 text-[#f5a623]" />
            AI-Powered Cost Engineering — Built for Sensor Manufacturing
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-[#0f1729] leading-[1.08] tracking-tight mb-6">
            Cost every part.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e2d4e] to-[#2d6ac8]">
              Accurately. Instantly.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg text-[#6b7280] leading-relaxed mb-10">
            ProqrIQ is an AI-powered cost engineering platform that analyses part drawings,
            searches your engineering knowledge base, and generates structured cost breakdowns
            with confidence scores — in minutes, not hours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to="/register"
              className="group flex items-center gap-2 px-7 py-3.5 bg-[#1e2d4e] text-white
                         font-semibold rounded-xl hover:bg-[#2d3e5c] transition-all duration-200
                         shadow-lg shadow-[#1e2d4e]/20 text-[15px]"
            >
              Start for free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 px-7 py-3.5 bg-white text-[#1e2d4e]
                         font-semibold rounded-xl border border-[#d1d9e8] hover:bg-[#f4f6fb]
                         transition-colors text-[15px]"
            >
              <Play className="w-4 h-4" />
              Sign in
            </Link>
          </div>

          {/* hero card — mock UI preview */}
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute -inset-4 bg-gradient-to-b from-[#1e2d4e]/6 to-transparent rounded-3xl" />
            <div className="relative bg-white rounded-2xl border border-[#e5e8ef] shadow-2xl shadow-[#1e2d4e]/10 overflow-hidden">
              {/* mock browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#f4f6fb] border-b border-[#e5e8ef]">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                <div className="flex-1 mx-4 px-3 py-1 bg-white rounded text-[11px] text-[#9aa3b2] border border-[#e5e8ef] text-left">
                  proqriq.vercel.app/dashboard
                </div>
              </div>
              {/* mock dashboard content */}
              <div className="p-6 bg-[#f4f6fb] grid grid-cols-3 gap-4 text-left">
                {[
                  { label: 'Active Quotes', value: '24', delta: '+3 this week', col: 'bg-white' },
                  { label: 'Avg Confidence', value: '96%', delta: 'Target: 98%', col: 'bg-white' },
                  { label: 'Bulk Batches', value: '8', delta: '312 parts costed', col: 'bg-white' },
                ].map(({ label, value, delta, col }) => (
                  <div key={label} className={`${col} rounded-xl border border-[#e5e8ef] p-4`}>
                    <p className="text-[11px] text-[#9aa3b2] font-medium mb-1">{label}</p>
                    <p className="text-2xl font-bold text-[#0f1729] font-mono">{value}</p>
                    <p className="text-[11px] text-[#22c55e] mt-1">{delta}</p>
                  </div>
                ))}
                {/* fake cost breakdown row */}
                <div className="col-span-3 bg-white rounded-xl border border-[#e5e8ef] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] font-semibold text-[#0f1729]">Latest Cost Breakdown — AL6061 Sensor Housing</p>
                    <span className="px-2 py-0.5 bg-[#dcfce7] text-[#16a34a] text-[10px] font-bold rounded-full">94% confidence</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { cat: 'Material', val: '€18.40', pct: 38 },
                      { cat: 'Machining', val: '€22.10', pct: 46 },
                      { cat: 'Setup', val: '€3.20', pct: 7 },
                      { cat: 'Overhead', val: '€2.80', pct: 6 },
                      { cat: 'Margin 16%', val: '€7.44', pct: 16 },
                    ].map(({ cat, val, pct }) => (
                      <div key={cat} className="text-center">
                        <div className="w-full bg-[#f0f4ff] rounded-full h-1.5 mb-1.5">
                          <div className="h-1.5 rounded-full bg-[#1e2d4e]" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-[#9aa3b2]">{cat}</p>
                        <p className="text-[11px] font-bold text-[#0f1729] font-mono">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────────────────────── */}
      <section className="border-y border-[#e5e8ef] bg-[#f4f6fb] py-5">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {[
            'Sheet Metal Costing', 'CNC Machining', 'Injection Moulding',
            'Assembly BOM Roll-up', 'Supplier Negotiation', 'Bulk Batch Costing'
          ].map(tag => (
            <div key={tag} className="flex items-center gap-2 text-[13px] text-[#4a5568] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />
              {tag}
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold text-[#2d6ac8] mb-3 uppercase tracking-wider">Platform Features</p>
          <h2 className="text-4xl font-extrabold text-[#0f1729] mb-4">Everything your cost team needs</h2>
          <p className="text-[#6b7280] max-w-xl mx-auto text-[15px]">
            From a single part to a 50-item bulk batch to a multi-level assembly BOM —
            one platform handles it all with the same AI pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: Brain, color: 'bg-[#1e2d4e]',
              title: 'AI Cost Estimation',
              desc: 'Upload a drawing. AI analyses the geometry, queries your KB of engineering PDFs, and returns a structured cost breakdown with source tier and confidence score.'
            },
            {
              icon: Layers, color: 'bg-[#2d6ac8]',
              title: 'Bulk Batch Costing',
              desc: 'Cost up to 50 independent parts in parallel with one submission. Fire-and-forget runner — results arrive as items complete, no waiting.'
            },
            {
              icon: Package, color: 'bg-[#0d9e8a]',
              title: 'Assembly BOM Roll-up',
              desc: 'Multi-level BOM with child components, purchased parts, and assembly ops. Deterministic roll-up with 16% margin applied exactly once at the parent.'
            },
            {
              icon: MapPin, color: 'bg-[#7c3aed]',
              title: 'Supplier Sourcing & Map',
              desc: 'AI-discover suppliers, manage contacts, ingest quotes, and run apple-to-apple comparisons against your should-cost. Full negotiation reports included.'
            },
            {
              icon: ShieldCheck, color: 'bg-[#16a34a]',
              title: 'Confidence Gating',
              desc: 'Every cost line carries a confidence score. If confidence is below 70%, the system returns targeted clarification questions instead of guessing.'
            },
            {
              icon: Cpu, color: 'bg-[#f5761a]',
              title: 'Multi-Provider AI Routing',
              desc: 'Route tasks to Anthropic Claude, Groq LLaMA, Ollama (local, offline), or xAI Grok. Admins control routing and track cost per call in real time.'
            },
          ].map(f => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#f4f6fb] border-y border-[#e5e8ef]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-[13px] font-semibold text-[#2d6ac8] mb-3 uppercase tracking-wider">How it works</p>
            <h2 className="text-4xl font-extrabold text-[#0f1729] mb-4">From drawing to cost in minutes</h2>
            <p className="text-[#6b7280] max-w-xl mx-auto text-[15px]">
              A clear, auditable pipeline from input to approved quote — every step traceable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div className="pt-2">
              <Step n={1} title="Upload part drawing"
                desc="Engineer uploads a drawing (PDF/PNG) and fills basic part details: material, process type, lot size." />
              <Step n={2} title="AI searches the knowledge base"
                desc="Before calling the AI, the system runs a vector search over your engineering KB — PDFs of standards, historical quotes, and process guides. Relevant context is injected into the prompt." />
              <Step n={3} title="AI generates cost breakdown"
                desc="Claude analyses the drawing and KB context, then returns structured JSON: cost lines by category, confidence score, and source tier (1–5) for every line." />
              <Step n={4} title="Confidence gate"
                desc="Confidence ≥ 70%: cost lines are saved and shown. Confidence < 70%: the system returns clarification questions — no guess-work in the output." />
              <Step n={5} title="Review, submit & approve"
                desc="Cost analyst reviews the breakdown. Submit for CEO/Owner approval. The full audit trail — who did what and when — is always preserved." last />
            </div>

            {/* side card */}
            <div className="space-y-4">
              {[
                { icon: Target,     color: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
                  title: '98% confidence target',
                  desc: 'The system is tuned to reach 98% confidence on well-specified parts — ask clarifying questions instead of padding uncertainty.' },
                { icon: Clock,      color: 'text-[#0d9e8a]', bg: 'bg-[#ecfdf5]',
                  title: 'Minutes, not hours',
                  desc: 'A part that took 2–4 hours to cost manually comes back in under 3 minutes with a full breakdown and audit trail.' },
                { icon: TrendingUp, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
                  title: 'KB-grounded, not hallucinated',
                  desc: 'Every estimate is grounded in your internal engineering documents. Source tier on every line tells you exactly where the number came from.' },
                { icon: Users,      color: 'text-[#f5761a]', bg: 'bg-[#fff7ed]',
                  title: 'Role-based workflow',
                  desc: 'Engineer → Cost Analyst → CEO/Owner. Each role sees only what they need. Approvals cascade correctly through assemblies.' },
              ].map(({ icon: Icon, color, bg, title, desc }) => (
                <div key={title} className="bg-white rounded-xl border border-[#e5e8ef] p-5 flex gap-4">
                  <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#0f1729] mb-1">{title}</h4>
                    <p className="text-[12.5px] text-[#6b7280] leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section id="stats" ref={statsRef}
        className="py-24 bg-[#1e2d4e]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-[13px] font-semibold text-[#f5a623] mb-3 uppercase tracking-wider">Results</p>
            <h2 className="text-4xl font-extrabold text-white mb-4">Built for real engineering teams</h2>
            <p className="text-[#8ba5c8] max-w-xl mx-auto text-[15px]">
              Deployed in production. Used daily. Numbers that reflect actual team outcomes.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
            <StatCard value={80}  suffix="%" label="Reduction in quoting time" inView={statsInView} />
            <StatCard value={50}  suffix=""  label="Parts in a single bulk batch" inView={statsInView} />
            <StatCard value={98}  suffix="%" label="Target AI confidence score" inView={statsInView} />
            <StatCard value={5}   suffix=""  label="AI providers supported" inView={statsInView} />
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: BarChart2,  title: 'Deterministic comparison',
                desc: 'Supplier vs should-cost deltas are computed in code — not by AI. Numbers you can defend in a negotiation.' },
              { icon: ShieldCheck, title: 'Soft-delete & full audit',
                desc: 'No data is ever hard-deleted. Every mutation is written to an immutable audit log — compliance built in.' },
              { icon: FileText,   title: 'Excel & PDF export',
                desc: 'One-click export of any quote, batch, or negotiation report. Server-side Excel, client-side PDF.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <Icon className="w-6 h-6 text-[#f5a623] mb-4" />
                <h4 className="text-[14px] font-semibold text-white mb-2">{title}</h4>
                <p className="text-[13px] text-[#8ba5c8] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ───────────────────────────────────────────────────── */}
      <section className="py-16 border-b border-[#e5e8ef]">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-[12px] font-semibold text-[#9aa3b2] uppercase tracking-wider mb-6">
            Built with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              'React 18', 'TypeScript', 'Node.js', 'Express',
              'SQLite / Turso', 'Drizzle ORM', 'Anthropic Claude',
              'Tailwind CSS', 'Vercel', 'shadcn/ui'
            ].map(tag => (
              <span key={tag}
                className="px-3 py-1.5 bg-[#f4f6fb] border border-[#e5e8ef] rounded-full
                           text-[12px] font-medium text-[#4a5568]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 max-w-6xl mx-auto px-6 text-center">
        <div className="bg-gradient-to-br from-[#1e2d4e] to-[#2d3e5c] rounded-3xl p-12 md:p-16
                        shadow-2xl shadow-[#1e2d4e]/20 relative overflow-hidden">
          {/* decorative circles */}
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/4 rounded-full" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-white/4 rounded-full" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/15 border border-[#f5a623]/30
                            rounded-full text-[12px] font-semibold text-[#f5a623] mb-6">
              <Star className="w-3 h-3" />
              Ready to use — no setup required
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
              Ready to cut your quoting<br />time by 80%?
            </h2>
            <p className="text-[#8ba5c8] text-[16px] max-w-xl mx-auto mb-10">
              Get started today. Cost your first part in under 5 minutes.
              No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="group flex items-center gap-2 px-8 py-4 bg-[#f5a623] text-[#1e2d4e]
                           font-bold rounded-xl hover:bg-[#f0962a] transition-colors shadow-lg
                           shadow-[#f5a623]/20 text-[15px]"
              >
                Create free account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl
                           border border-white/20 hover:bg-white/15 transition-colors text-[15px]"
              >
                Sign in to existing account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e5e8ef] bg-[#f4f6fb] py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1e2d4e] flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-[#f5a623]" />
            </div>
            <span className="font-bold text-[#0f1729] text-[14px]">ProqrIQ</span>
            <span className="text-[#9aa3b2] text-[12px] ml-1">
              AI Cost Engineering Platform
            </span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-[#9aa3b2]">
            <Link to="/terms"   className="hover:text-[#4a5568] transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-[#4a5568] transition-colors">Privacy</Link>
            <Link to="/login"   className="hover:text-[#4a5568] transition-colors">Sign in</Link>
            <span>© {new Date().getFullYear()} ProqrIQ</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
