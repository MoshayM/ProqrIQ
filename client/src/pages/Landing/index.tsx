import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion'
import {
  Brain, Layers, Package, MapPin, ShieldCheck, Cpu,
  ArrowRight, ChevronRight, Zap, Clock, Target, TrendingUp,
  CheckCircle2, Star, FileText, BarChart2, Sparkles
} from 'lucide-react'
import { Logo, LogoMark } from '../../components/ui/logo'
import { cn } from '../../lib/utils'

// ── animated counter ──────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    let t0: number | null = null
    const step = (ts: number) => {
      if (!t0) t0 = ts
      const p = Math.min((ts - t0) / duration, 1)
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return value
}

// ── floating particle ─────────────────────────────────────────────────────────
function Particle({ x, y, size, delay, dur }: {
  x: number; y: number; size: number; delay: number; dur: number
}) {
  return (
    <motion.div
      className="absolute rounded-full bg-[#e85c1a] pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, opacity: 0.15 }}
      animate={{ y: [0, -30, 0], opacity: [0.1, 0.35, 0.1] }}
      transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// ── 3D floating card ──────────────────────────────────────────────────────────
function FloatingCard({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = (e.clientX - r.left) / r.width  - 0.5
    const cy = (e.clientY - r.top)  / r.height - 0.5
    setTilt({ x: cy * -12, y: cx * 12 })
  }
  function onLeave() { setTilt({ x: 0, y: 0 }) }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: tilt.x === 0 ? 'transform 0.6s ease' : 'transform 0.1s ease',
        transformStyle: 'preserve-3d',
      }}
      className={cn('cursor-default', className)}
    >
      <div style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }}>
        {children}
      </div>
    </motion.div>
  )
}

// ── stat card ────────────────────────────────────────────────────────────────
function StatCard({ value, suffix = '', label, inView, delay = 0 }: {
  value: number; suffix?: string; label: string; inView: boolean; delay?: number
}) {
  const count = useCounter(value, 1600, inView)
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6 }}
      className="text-center"
    >
      <p className="text-5xl md:text-6xl font-extrabold text-white tabular-nums tracking-tight">
        {count}{suffix}
      </p>
      <p className="mt-2 text-sm text-[#8ba5c8] font-medium">{label}</p>
    </motion.div>
  )
}

// ── feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, color, gradient, delay = 0 }: {
  icon: React.ComponentType<{ className?: string }>
  title: string; desc: string; color: string; gradient: string; delay?: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay, duration: 0.6 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative bg-white rounded-2xl border border-[#e5e8ef] p-6 overflow-hidden
                 transition-shadow duration-300 hover:shadow-xl cursor-default group"
      style={{ transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
               transition: 'transform 0.3s ease, box-shadow 0.3s ease' }}
    >
      {/* gradient glow on hover */}
      <motion.div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient}`}
        style={{ borderRadius: 16 }}
      />
      <div className="relative z-10">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-4', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-[15px] font-semibold text-[#0f1729] mb-2">{title}</h3>
        <p className="text-[13px] text-[#6b7280] leading-relaxed">{desc}</p>
        <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-[#2d6ac8]
                        opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          Learn more <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const { scrollY } = useScroll()
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsInView, setStatsInView] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)

  // parallax transforms
  const heroY    = useTransform(scrollY, [0, 500], [0, 120])
  const heroOpac = useTransform(scrollY, [0, 400], [1, 0])
  const cardY    = useTransform(scrollY, [0, 600], [0, -60])
  const smoothHeroY = useSpring(heroY, { stiffness: 80, damping: 20 })

  // redirect if logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  // nav shadow on scroll
  useEffect(() => {
    return scrollY.on('change', v => setNavScrolled(v > 20))
  }, [scrollY])

  // stats intersection
  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setStatsInView(true) },
      { threshold: 0.25 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // particles
  const particles = [
    { x: 5,  y: 15, size: 6,  delay: 0,   dur: 5 },
    { x: 92, y: 8,  size: 4,  delay: 1.2, dur: 6 },
    { x: 18, y: 75, size: 8,  delay: 0.5, dur: 7 },
    { x: 80, y: 60, size: 5,  delay: 1.8, dur: 5.5 },
    { x: 50, y: 90, size: 7,  delay: 0.8, dur: 6.5 },
    { x: 70, y: 20, size: 4,  delay: 2.1, dur: 4.8 },
    { x: 35, y: 45, size: 5,  delay: 1.5, dur: 7.2 },
    { x: 88, y: 85, size: 9,  delay: 0.3, dur: 5.8 },
    { x: 12, y: 50, size: 4,  delay: 2.5, dur: 6.2 },
    { x: 60, y: 5,  size: 6,  delay: 1.0, dur: 5.3 },
  ]

  if (isLoading) return null

  return (
    <div className="min-h-screen bg-white font-sans antialiased overflow-x-hidden">

      {/* ── animated mesh background (top portion) ─────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full opacity-[0.06]"
          style={{
            background: 'radial-gradient(circle, #1e2d4e 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
          animate={{ scale: [1, 1.08, 1], x: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-[10%] right-[-15%] w-[60%] h-[60%] rounded-full opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, #e85c1a 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
          animate={{ scale: [1, 1.12, 1], y: [0, -30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute bottom-[5%] left-[20%] w-[50%] h-[50%] rounded-full opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle, #2d6ac8 0%, transparent 70%)',
            filter: 'blur(70px)',
          }}
          animate={{ scale: [1, 1.1, 1], x: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
        {/* dot grid */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(#1e2d4e 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <motion.nav
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          navScrolled
            ? 'bg-white/90 backdrop-blur-md border-b border-[#e5e8ef] shadow-sm'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* brand logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Logo size="md" variant="full" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="hidden md:flex items-center gap-8 text-[13px] text-[#4a5568] font-medium"
          >
            {[['#features','Features'],['#how-it-works','How it works'],['#stats','Results']].map(([h, l]) => (
              <a key={h} href={h}
                className="hover:text-[#1e2d4e] transition-colors relative group">
                {l}
                <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-[#e85c1a]
                                 group-hover:w-full transition-all duration-300" />
              </a>
            ))}
            <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full
                             bg-[#f5a623]/10 border border-[#f5a623]/30 text-[#c27a10] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" />
              ProqrIQ.com · Coming Soon
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <Link to="/login"
              className="text-[13px] font-medium text-[#4a5568] hover:text-[#1e2d4e] transition-colors">
              Sign in
            </Link>
            <Link to="/register"
              className="px-4 py-2 bg-[#1e2d4e] text-white text-[13px] font-semibold
                         rounded-lg hover:bg-[#2d3e5c] transition-all duration-200
                         shadow-md shadow-[#1e2d4e]/20 hover:shadow-lg hover:shadow-[#1e2d4e]/30">
              Get started
            </Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center
                          pt-24 pb-16 px-6 overflow-hidden">
        {/* floating particles */}
        {particles.map((p, i) => <Particle key={i} {...p} />)}

        <motion.div
          style={{ y: smoothHeroY, opacity: heroOpac }}
          className="relative z-10 text-center max-w-5xl mx-auto"
        >
          {/* badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur
                       border border-[#e5e8ef] rounded-full text-[12px] font-semibold
                       text-[#1e2d4e] mb-8 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#e85c1a]" />
            AI-Powered Cost Engineering Platform
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse ml-1" />
          </motion.div>

          {/* 3D logo mark — large hero logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotateY: -30 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ transformStyle: 'preserve-3d', perspective: '600px' }}
            className="flex justify-center mb-8"
          >
            <motion.div
              animate={{ rotateY: [0, 8, 0, -8, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformStyle: 'preserve-3d' }}
              className="relative"
            >
              {/* 3D shadow layers */}
              <div className="absolute inset-0 translate-y-3 blur-xl opacity-30
                              rounded-2xl bg-[#1e2d4e] scale-90" />
              <div className="absolute inset-0 translate-y-1.5 blur-md opacity-20
                              rounded-2xl bg-[#1e2d4e] scale-95" />
              <LogoMark size={96} className="relative drop-shadow-2xl" />
            </motion.div>
          </motion.div>

          {/* headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-5xl md:text-7xl font-extrabold text-[#0f1729] leading-[1.06]
                       tracking-tight mb-6"
          >
            Cost every part.<br />
            <span className="relative inline-block">
              <span className="relative z-10 text-transparent bg-clip-text
                               bg-gradient-to-r from-[#1e2d4e] via-[#2d6ac8] to-[#e85c1a]">
                Accurately. Instantly.
              </span>
              <motion.span
                className="absolute bottom-1 left-0 h-2 w-full bg-[#e85c1a]/15 rounded-full -z-0"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 1, duration: 0.7, ease: 'easeOut' }}
                style={{ originX: 0 }}
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="max-w-2xl mx-auto text-lg text-[#6b7280] leading-relaxed mb-10"
          >
            ProqrIQ analyses part drawings, queries your engineering knowledge base,
            and generates structured cost breakdowns with confidence scores —
            in minutes, not hours.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <Link to="/register"
              className="group relative flex items-center gap-2.5 px-8 py-4
                         bg-[#1e2d4e] text-white font-bold rounded-xl text-[15px]
                         overflow-hidden transition-all duration-300
                         shadow-lg shadow-[#1e2d4e]/30 hover:shadow-xl hover:shadow-[#1e2d4e]/40
                         hover:-translate-y-0.5"
            >
              {/* shimmer */}
              <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%]
                               transition-transform duration-700
                               bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <Zap className="w-4 h-4 text-[#f5a623]" />
              Start for free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 px-8 py-4 bg-white text-[#1e2d4e]
                         font-semibold rounded-xl border border-[#d1d9e8] text-[15px]
                         hover:bg-[#f4f6fb] hover:border-[#1e2d4e]/30
                         transition-all duration-200 shadow-sm">
              Sign in to your account
            </Link>
          </motion.div>

          {/* trust chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="flex flex-wrap justify-center gap-2.5"
          >
            {[
              'Sheet Metal','CNC Machining','Injection Moulding',
              'Assembly BOM','Supplier Negotiation','Bulk Costing'
            ].map(t => (
              <span key={t}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/70 backdrop-blur
                           border border-[#e5e8ef] rounded-full text-[12px] font-medium
                           text-[#4a5568] shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                {t}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* ── 3D floating dashboard preview ─────────────────────────────── */}
        <motion.div
          style={{ y: cardY }}
          className="relative z-10 mt-16 w-full max-w-5xl mx-auto px-4"
        >
          <FloatingCard delay={0.8} className="w-full">
            <div className="bg-white rounded-2xl border border-[#e5e8ef]
                            shadow-2xl shadow-[#1e2d4e]/15 overflow-hidden">
              {/* mock browser chrome */}
              <div className="flex items-center gap-2 px-5 py-3.5 bg-[#f4f6fb]
                              border-b border-[#e5e8ef]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex-1 mx-3 px-3 py-1 bg-white rounded-md
                                text-[11px] text-[#9aa3b2] border border-[#e5e8ef] text-left
                                flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                  app.proqriq.com/dashboard
                </div>
                <Logo size="sm" variant="full" />
              </div>

              {/* mock dashboard content */}
              <div className="p-5 bg-[#f4f6fb]">
                {/* KPI row */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Active Quotes',   value: '24',   delta: '+3 this week',  good: true  },
                    { label: 'Avg Confidence',  value: '96%',  delta: 'Target: 98%',    good: true  },
                    { label: 'Bulk Batches',    value: '8',    delta: '312 parts total', good: true  },
                    { label: 'Pending Approval',value: '3',    delta: '2 urgent',       good: false },
                  ].map(({ label, value, delta, good }) => (
                    <div key={label}
                      className="bg-white rounded-xl border border-[#e5e8ef] p-3.5">
                      <p className="text-[10px] text-[#9aa3b2] font-medium mb-0.5">{label}</p>
                      <p className="text-xl font-bold text-[#0f1729] font-mono">{value}</p>
                      <p className={`text-[10px] mt-1 font-medium ${good ? 'text-[#22c55e]' : 'text-[#f5761a]'}`}>
                        {delta}
                      </p>
                    </div>
                  ))}
                </div>

                {/* cost breakdown + recent quotes */}
                <div className="grid grid-cols-5 gap-3">
                  {/* breakdown card */}
                  <div className="col-span-3 bg-white rounded-xl border border-[#e5e8ef] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[12px] font-semibold text-[#0f1729]">
                          AL6061 Sensor Housing — CNC
                        </p>
                        <p className="text-[10px] text-[#9aa3b2]">Cost Breakdown</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-[#dcfce7] text-[#16a34a]
                                         text-[9px] font-bold rounded-full">94% conf.</span>
                        <span className="px-2 py-0.5 bg-[#dbeafe] text-[#1d4ed8]
                                         text-[9px] font-bold rounded-full">Tier 3</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { cat: 'Material',  val: '€18.40', pct: 38, col: '#1e2d4e' },
                        { cat: 'Machining', val: '€22.10', pct: 46, col: '#2d6ac8' },
                        { cat: 'Setup',     val: '€3.20',  pct: 7,  col: '#0d9e8a' },
                        { cat: 'Overhead',  val: '€2.80',  pct: 6,  col: '#7c3aed' },
                        { cat: 'Margin 16%',val: '€7.44',  pct: 16, col: '#e85c1a' },
                      ].map(({ cat, val, pct, col }) => (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="text-[10px] text-[#9aa3b2] w-16 flex-shrink-0">{cat}</span>
                          <div className="flex-1 bg-[#f4f6fb] rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct * 2}%`, background: col }} />
                          </div>
                          <span className="text-[10px] font-bold text-[#0f1729] font-mono w-12 text-right">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#f4f6fb] flex justify-between">
                      <span className="text-[11px] font-semibold text-[#0f1729]">Total</span>
                      <span className="text-[13px] font-extrabold text-[#0f1729] font-mono">€53.94</span>
                    </div>
                  </div>

                  {/* recent quotes */}
                  <div className="col-span-2 bg-white rounded-xl border border-[#e5e8ef] p-4">
                    <p className="text-[11px] font-semibold text-[#0f1729] mb-3">Recent Quotes</p>
                    <div className="space-y-2">
                      {[
                        { name: 'M8 Cable Gland', status: 'approved', cost: '€12.30' },
                        { name: 'Proximity Sensor Body', status: 'pending', cost: '€38.70' },
                        { name: 'EMC Shield Plate', status: 'approved', cost: '€8.90' },
                        { name: 'PCB Housing', status: 'costing', cost: '—' },
                      ].map(({ name, status, cost }) => (
                        <div key={name} className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-[10px] font-medium text-[#0f1729]">{name}</p>
                            <span className={cn('text-[9px] font-semibold rounded-full px-1.5 py-0.5',
                              status === 'approved' ? 'bg-[#dcfce7] text-[#16a34a]' :
                              status === 'pending'  ? 'bg-[#fef9c3] text-[#854d0e]' :
                              'bg-[#dbeafe] text-[#1d4ed8]'
                            )}>{status}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[#0f1729] font-mono">{cost}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FloatingCard>
        </motion.div>

        {/* scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        >
          <span className="text-[11px] text-[#9aa3b2] font-medium">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-5 h-8 border-2 border-[#d1d9e8] rounded-full flex justify-center pt-1.5"
          >
            <div className="w-1 h-1.5 bg-[#9aa3b2] rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section id="features" className="py-28 max-w-6xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-[12px] font-bold text-[#e85c1a] uppercase tracking-[0.15em] mb-3">
            Platform Features
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#0f1729] mb-4 tracking-tight">
            Everything your cost team needs
          </h2>
          <p className="text-[#6b7280] max-w-xl mx-auto text-[16px]">
            From a single part to a 50-item bulk batch to a multi-level assembly BOM —
            one AI pipeline, total consistency.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Brain,      color: 'bg-[#1e2d4e]', gradient: 'bg-gradient-to-br from-[#1e2d4e]/5 to-transparent',
              title: 'AI Cost Estimation',
              desc: 'Upload a drawing. AI queries your engineering KB, then generates a structured cost breakdown with source tier and confidence score per line.' },
            { icon: Layers,     color: 'bg-[#2d6ac8]', gradient: 'bg-gradient-to-br from-[#2d6ac8]/5 to-transparent',
              title: 'Bulk Batch Costing',
              desc: 'Cost up to 50 independent parts in parallel. Fire-and-forget runner — results arrive as items complete, tracked with a live progress bar.' },
            { icon: Package,    color: 'bg-[#0d9e8a]', gradient: 'bg-gradient-to-br from-[#0d9e8a]/5 to-transparent',
              title: 'Assembly BOM Roll-up',
              desc: 'Multi-level BOM with child components, purchased parts, and ops. Deterministic roll-up. 16% margin applied exactly once at the parent.' },
            { icon: MapPin,     color: 'bg-[#7c3aed]', gradient: 'bg-gradient-to-br from-[#7c3aed]/5 to-transparent',
              title: 'Supplier Sourcing & Map',
              desc: 'AI-discover suppliers, manage contacts, ingest quotes, and run apple-to-apple comparisons against should-cost. Full negotiation reports.' },
            { icon: ShieldCheck,color: 'bg-[#16a34a]', gradient: 'bg-gradient-to-br from-[#16a34a]/5 to-transparent',
              title: 'Confidence Gating',
              desc: 'Every cost line carries a confidence score. Below 70%: the system returns targeted clarification questions — zero guesswork in the output.' },
            { icon: Cpu,        color: 'bg-[#e85c1a]', gradient: 'bg-gradient-to-br from-[#e85c1a]/5 to-transparent',
              title: 'Multi-Provider AI Routing',
              desc: 'Route tasks to Claude, Groq, Ollama (local/offline), or xAI Grok. Admins control routing and track cost per call in real time.' },
          ].map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 0.08} />)}
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section id="how-it-works"
        className="py-28 bg-gradient-to-b from-[#f4f6fb] to-white border-y border-[#e5e8ef] relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-[12px] font-bold text-[#e85c1a] uppercase tracking-[0.15em] mb-3">
              How it works
            </p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-[#0f1729] mb-4 tracking-tight">
              Drawing to approved cost in minutes
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-5 gap-4 mb-16">
            {[
              { n: '01', title: 'Upload Drawing', icon: FileText,    col: '#1e2d4e' },
              { n: '02', title: 'KB Search',      icon: Brain,       col: '#2d6ac8' },
              { n: '03', title: 'AI Estimates',   icon: Cpu,         col: '#0d9e8a' },
              { n: '04', title: 'Confidence Gate',icon: ShieldCheck, col: '#7c3aed' },
              { n: '05', title: 'Approve & Lock', icon: CheckCircle2,col: '#16a34a' },
            ].map(({ n, title, icon: Icon, col }, i) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="relative"
              >
                <div className="bg-white rounded-2xl border border-[#e5e8ef] p-5 text-center
                                hover:shadow-md transition-shadow duration-300">
                  <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: col }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold text-[#9aa3b2] mb-1">{n}</p>
                  <p className="text-[13px] font-semibold text-[#0f1729]">{title}</p>
                </div>
                {i < 4 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                    <ChevronRight className="w-5 h-5 text-[#d1d9e8]" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              { icon: Target,      col: 'text-[#2d6ac8]', bg: 'bg-[#eff6ff]',
                title: '98% confidence target',
                desc: 'Tuned to reach 98% confidence on well-specified parts. Asks clarification instead of padding uncertainty into the estimate.' },
              { icon: Clock,       col: 'text-[#0d9e8a]', bg: 'bg-[#ecfdf5]',
                title: '2–4 hrs → under 3 minutes',
                desc: 'A part that took hours to cost manually returns a full breakdown with audit trail in minutes.' },
              { icon: TrendingUp,  col: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]',
                title: 'KB-grounded, never hallucinated',
                desc: 'Every estimate is grounded in your engineering PDFs. Source tier per line tells you exactly where the number came from.' },
              { icon: BarChart2,   col: 'text-[#e85c1a]', bg: 'bg-[#fff7ed]',
                title: 'Deterministic supplier comparison',
                desc: 'Should-cost vs supplier delta is computed in code — not AI. Numbers you can defend in a negotiation.' },
            ].map(({ icon: Icon, col, bg, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -24 : 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="bg-white rounded-xl border border-[#e5e8ef] p-5 flex gap-4
                           hover:shadow-md transition-shadow duration-300"
              >
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${col}`} />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-[#0f1729] mb-1">{title}</h4>
                  <p className="text-[13px] text-[#6b7280] leading-relaxed">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS / SOCIAL PROOF ─────────────────────────────────── */}
      <section className="py-24 max-w-6xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="text-[12px] font-bold text-[#e85c1a] uppercase tracking-[0.15em] mb-3">
            What Engineers Say
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#0f1729] mb-4 tracking-tight">
            Trusted by cost engineering teams
          </h2>
          <p className="text-[#6b7280] max-w-xl mx-auto text-[16px]">
            Real feedback from engineers and procurement professionals who use ProqrIQ daily.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              quote: "We went from spending half a day on a single quote to under 10 minutes. The KB-grounded estimates are actually defensible in supplier negotiations.",
              name: "Head of Cost Engineering",
              role: "Industrial Automation OEM",
              stars: 5,
              delay: 0,
            },
            {
              quote: "The confidence gating saved us from three bad quotes in our first week. It asks the right clarification questions instead of just guessing.",
              name: "Senior Cost Analyst",
              role: "Precision Machining Supplier",
              stars: 5,
              delay: 0.08,
            },
            {
              quote: "Bulk costing 40 parts overnight was a game-changer for our BOM review cycles. The assembly roll-up with deterministic margin is exactly what compliance needed.",
              name: "Procurement Manager",
              role: "Electronics Manufacturer",
              stars: 5,
              delay: 0.16,
            },
          ].map(({ quote, name, role, stars, delay }) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ delay, duration: 0.6 }}
              className="bg-white rounded-2xl border border-[#e5e8ef] p-6 flex flex-col gap-4
                         shadow-sm hover:shadow-lg transition-shadow duration-300"
            >
              {/* stars */}
              <div className="flex gap-0.5">
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-[#f5a623] text-[#f5a623]" />
                ))}
              </div>
              <p className="text-[14px] text-[#374151] leading-relaxed flex-1">"{quote}"</p>
              <div className="flex items-center gap-3 pt-3 border-t border-[#f4f6fb]">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e2d4e] to-[#2d6ac8]
                                flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                  {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0f1729]">{name}</p>
                  <p className="text-[11px] text-[#9aa3b2]">{role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* trust badges */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-12 flex flex-wrap justify-center gap-4"
        >
          {[
            { icon: ShieldCheck, label: 'On-premise · No cloud lock-in' },
            { icon: FileText,    label: 'GDPR-aware · Immutable audit log' },
            { icon: Cpu,         label: 'Offline-capable with Ollama' },
            { icon: TrendingUp,  label: 'SOC-2 aligned data practices' },
          ].map(({ icon: Icon, label }) => (
            <div key={label}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e8ef]
                         rounded-xl text-[12px] text-[#4a5568] font-medium shadow-sm">
              <Icon className="w-4 h-4 text-[#1e2d4e]" />
              {label}
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────── */}
      <section id="stats" ref={statsRef}
        className="relative py-28 overflow-hidden z-10">
        <div className="absolute inset-0 bg-[#1e2d4e]" />
        {/* animated 3D grid */}
        <motion.div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            transform: 'perspective(400px) rotateX(20deg)',
            transformOrigin: 'top center',
          }}
          animate={{ backgroundPositionY: ['0px', '48px'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #e85c1a 0%, transparent 60%)', filter: 'blur(60px)' }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={statsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-[12px] font-bold text-[#f5a623] uppercase tracking-[0.15em] mb-3">Results</p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Built for real engineering teams
            </h2>
            <p className="text-[#8ba5c8] max-w-xl mx-auto text-[16px]">
              Deployed in production. Used daily by the cost analyst team.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
            <StatCard value={80}  suffix="%" label="Reduction in quoting time" inView={statsInView} delay={0} />
            <StatCard value={50}  suffix=""  label="Parts in one bulk batch"   inView={statsInView} delay={0.1} />
            <StatCard value={98}  suffix="%" label="Target AI confidence score"inView={statsInView} delay={0.2} />
            <StatCard value={5}   suffix=""  label="AI providers supported"    inView={statsInView} delay={0.3} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: ShieldCheck, title: 'Soft-delete & full audit',
                desc: 'No data is ever hard-deleted. Every mutation is written to an immutable audit log — compliance built in.' },
              { icon: FileText,    title: 'Excel & PDF export',
                desc: 'One-click export of any quote, batch, or negotiation report. Server-side Excel, client-side PDF.' },
              { icon: Star,        title: 'Role-based approval flow',
                desc: 'Engineer → Cost Analyst → CEO. Each role sees what they need. Assembly approvals cascade to all children.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                animate={statsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm
                           hover:bg-white/8 transition-colors duration-300"
              >
                <Icon className="w-6 h-6 text-[#f5a623] mb-4" />
                <h4 className="text-[14px] font-semibold text-white mb-2">{title}</h4>
                <p className="text-[13px] text-[#8ba5c8] leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-28 max-w-6xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative bg-gradient-to-br from-[#1e2d4e] via-[#1e2d4e] to-[#2d3e5c]
                     rounded-3xl p-12 md:p-16 text-center overflow-hidden
                     shadow-2xl shadow-[#1e2d4e]/25"
        >
          {/* 3D decorative spheres */}
          <motion.div
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #e85c1a, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #2d6ac8, transparent 70%)' }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          />

          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <motion.div
                animate={{ rotateY: [0, 360] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                style={{ transformStyle: 'preserve-3d', perspective: '400px' }}
              >
                <LogoMark size={56} />
              </motion.div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/15
                            border border-[#f5a623]/30 rounded-full text-[12px] font-semibold
                            text-[#f5a623] mb-6">
              <Star className="w-3 h-3" />
              No credit card required
            </div>

            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
              Ready to cut your quoting<br />time by 80%?
            </h2>
            <p className="text-[#8ba5c8] text-[16px] max-w-lg mx-auto mb-10">
              Cost your first part in under 5 minutes.
              Start for free — upgrade when your team grows.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register"
                className="group relative flex items-center gap-2.5 px-9 py-4
                           bg-[#f5a623] text-[#1e2d4e] font-bold rounded-xl text-[15px]
                           hover:bg-[#f0962a] transition-all duration-200
                           shadow-lg shadow-[#f5a623]/25 hover:shadow-xl hover:shadow-[#f5a623]/35
                           hover:-translate-y-0.5 overflow-hidden">
                <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%]
                                 transition-transform duration-700
                                 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                Create free account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/login"
                className="px-9 py-4 bg-white/10 text-white font-semibold rounded-xl
                           border border-white/20 hover:bg-white/15 transition-colors text-[15px]">
                Sign in
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e5e8ef] bg-[#f4f6fb] py-10 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <Logo size="sm" variant="full" />
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#f5a623]/10
                               border border-[#f5a623]/30 text-[#c27a10] font-semibold">
                ProqrIQ.com · Coming Soon
              </span>
            </div>
            <div className="flex items-center gap-6 text-[12px] text-[#9aa3b2]">
              <Link to="/terms"   className="hover:text-[#4a5568] transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-[#4a5568] transition-colors">Privacy</Link>
              <Link to="/login"   className="hover:text-[#4a5568] transition-colors">Sign in</Link>
              <Link to="/register" className="hover:text-[#4a5568] transition-colors">Get started</Link>
            </div>
          </div>
          <div className="border-t border-[#e5e8ef] pt-5 flex flex-col sm:flex-row items-center
                          justify-between gap-2 text-[11px] text-[#c2c8d6]">
            <span>© {new Date().getFullYear()} ProqrIQ. All rights reserved.</span>
            <span>AI-Powered Cost Engineering · On-premise · Built for industrial manufacturers</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
