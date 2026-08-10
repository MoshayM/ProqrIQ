import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Minus, Bot, Send, User, Loader2, RotateCcw,
  FileStack, Zap, BookOpen, ShieldCheck, Layers, MapPin, ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { api, extractApiError } from '../../lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string }
type PanelTab = 'chat' | 'guide'

// ─── Content data ─────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  'How do I cost a new part?',
  'What does confidence score mean?',
  'How does bulk costing work?',
  'How do I compare a supplier quote?',
  'Why are clarification questions asked?',
  'What is source_tier?',
]

const FEATURE_CARDS = [
  {
    icon: FileStack,
    color: '#1e2d4e',
    bg: 'bg-navy/10',
    title: 'Part Costing',
    desc: '6-step wizard: enter specs → upload drawing → AI estimates → review → adjust → submit for approval.',
    shortcut: 'Press N to start',
  },
  {
    icon: Layers,
    color: '#e85c1a',
    bg: 'bg-[#e85c1a]/10',
    title: 'Bulk & Assembly',
    desc: 'Cost up to 50 parts in parallel. Build BOM assemblies with automatic parent cost roll-up.',
    shortcut: 'G → B for Bulk',
  },
  {
    icon: BookOpen,
    color: '#16a34a',
    bg: 'bg-emerald-100',
    title: 'Supplier Analysis',
    desc: 'AI-extract supplier quotes. Apple-to-apple comparison vs your should-cost. Auto negotiation report.',
    shortcut: 'G → S for Supplier Map',
  },
  {
    icon: ShieldCheck,
    color: '#7c3aed',
    bg: 'bg-purple-100',
    title: 'Approval Workflow',
    desc: 'Submitted quotes route to CEO for approval. Approved quotes are locked with full audit trail.',
    shortcut: null,
  },
  {
    icon: MapPin,
    color: '#0369a1',
    bg: 'bg-sky-100',
    title: 'Supplier Map',
    desc: 'Discover suppliers by region, compare capabilities, and manage your supplier directory.',
    shortcut: 'G → S',
  },
  {
    icon: Zap,
    color: '#ca8a04',
    bg: 'bg-amber-100',
    title: 'AI Knowledge Base',
    desc: 'Queries your internal PDF library of engineering standards before every cost estimate.',
    shortcut: null,
  },
]

const KEYBOARD_SHORTCUTS = [
  { keys: ['N'],      label: 'New quote' },
  { keys: ['G', 'D'], label: 'Go to Dashboard' },
  { keys: ['G', 'Q'], label: 'Go to Quotations' },
  { keys: ['G', 'B'], label: 'Go to Bulk Costing' },
  { keys: ['G', 'A'], label: 'Go to Assemblies' },
  { keys: ['G', 'S'], label: 'Go to Supplier Map' },
  { keys: ['?'],      label: 'Show all shortcuts' },
]

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-navy" />
        </div>
      )}
      <div className={cn(
        'max-w-[82%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap',
        isUser
          ? 'bg-navy text-white rounded-br-sm'
          : 'bg-[#f1f3f7] text-[#0f1729] rounded-bl-sm',
      )}>
        {msg.content}
      </div>
      {isUser && (
        <div className="w-6 h-6 rounded-full bg-navy flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  )
}

// ─── HelpPanel ────────────────────────────────────────────────────────────────

interface HelpPanelProps {
  open: boolean
  minimized: boolean
  onClose: () => void
  onToggleMinimize: () => void
}

export function HelpPanel({ open, minimized, onClose, onToggleMinimize }: HelpPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [tab, setTab]           = useState<PanelTab>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (messages.length > 0 || loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  useEffect(() => {
    if (open && !minimized) {
      const t = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(t)
    }
  }, [open, minimized])

  // Esc closes panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const userMsg: Message = { role: 'user', content: trimmed }
    const history = messages.slice(-16)
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const { reply } = await api.help.chat({ message: trimmed, history })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Could not get a response. Please try again.'))
      setMessages(prev => prev.slice(0, -1))
      setInput(trimmed)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [loading, messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  function reset() { setMessages([]); setInput('') }

  const showWelcome = messages.length === 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="help-panel"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed right-6 z-[99999] w-[370px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl overflow-hidden"
          style={{
            bottom: 'calc(5.5rem + var(--safe-bottom, 0px))',
            background: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: '0 28px 56px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)',
            maxHeight: minimized ? 60 : 'min(560px, calc(100dvh - 120px))',
            transition: 'max-height 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0 cursor-pointer select-none"
            style={{ borderBottom: minimized ? 'none' : '1px solid rgba(0,0,0,0.07)' }}
            onClick={onToggleMinimize}
          >
            {/* Bot avatar */}
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1e2d4e 0%, #2d4070 100%)' }}>
              <Bot className="w-4 h-4 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#0f1729] leading-tight">ProqrIQ Assistant</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-[10px] text-[#9aa3b2]">AI-powered · always available</span>
              </div>
            </div>

            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
              <button
                onClick={onToggleMinimize}
                className="p-1.5 rounded-lg hover:bg-black/[0.06] text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
                title={minimized ? 'Expand' : 'Minimise'}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/[0.06] text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
                title="Close (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Body (hidden when minimized) ── */}
          {!minimized && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

              {/* Tab strip */}
              <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                {(['chat', 'guide'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'flex-1 py-2.5 text-xs font-medium transition-colors',
                      tab === t
                        ? 'text-[#1e2d4e] border-b-2 border-[#1e2d4e]'
                        : 'text-[#9aa3b2] hover:text-[#4a5568]',
                    )}
                  >
                    {t === 'chat' ? '💬 AI Chat' : '📖 Feature Guide'}
                  </button>
                ))}
              </div>

              {/* ── Chat tab ── */}
              {tab === 'chat' && (
                <>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 scroll-area">
                    {showWelcome ? (
                      <div className="flex flex-col items-center text-center py-6 gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, rgba(30,45,78,0.1) 0%, rgba(30,45,78,0.05) 100%)' }}>
                          <Bot className="w-6 h-6 text-navy" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#0f1729]">Ask me anything</p>
                          <p className="text-[11px] text-[#9aa3b2] mt-1 leading-relaxed max-w-[240px]">
                            I can walk you through workflows, explain features, or help you get unstuck.
                          </p>
                        </div>
                        <div className="w-full flex flex-wrap gap-1.5 justify-center">
                          {QUICK_QUESTIONS.map(q => (
                            <button
                              key={q}
                              onClick={() => { setTab('chat'); send(q) }}
                              className="px-2.5 py-1.5 bg-[#f8f9fc] border border-[#e5e8ef] rounded-full text-[11px] text-[#4a5568] hover:border-navy/30 hover:text-navy transition-colors"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
                        {loading && (
                          <div className="flex gap-2 justify-start">
                            <div className="w-6 h-6 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0">
                              <Bot className="w-3.5 h-3.5 text-navy" />
                            </div>
                            <div className="bg-[#f1f3f7] rounded-2xl rounded-bl-sm px-3 py-2.5">
                              <div className="flex gap-1">
                                {[0, 1, 2].map(i => (
                                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#9aa3b2]"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={bottomRef} />
                      </>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="flex-shrink-0 px-3 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                    <div className="flex gap-2 items-end">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question…"
                        rows={1}
                        disabled={loading}
                        className="flex-1 resize-none rounded-xl border border-[#e5e8ef] bg-white/80 px-3 py-2 text-sm text-[#0f1729] placeholder-[#c8cdd8] focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30 transition-all disabled:opacity-50"
                        style={{ maxHeight: 80, overflowY: 'auto', fontSize: '16px' }}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                      <button
                        onClick={() => send(input)}
                        disabled={!input.trim() || loading}
                        className="p-2 rounded-xl bg-navy text-white hover:bg-[#2d4070] disabled:opacity-40 transition-all flex-shrink-0 shadow-sm"
                      >
                        {loading
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2 px-0.5">
                      {messages.length > 0 ? (
                        <button onClick={reset}
                          className="flex items-center gap-1 text-[10px] text-[#9aa3b2] hover:text-[#4a5568] transition-colors">
                          <RotateCcw className="w-2.5 h-2.5" /> New chat
                        </button>
                      ) : <span />}
                      <p className="text-[10px] text-[#c8cdd8]">Shift+Enter for new line</p>
                    </div>
                  </div>
                </>
              )}

              {/* ── Guide tab ── */}
              {tab === 'guide' && (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
                  <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wider mb-3">Core features</p>
                  {FEATURE_CARDS.map(c => {
                    const Icon = c.icon
                    return (
                      <div key={c.title}
                        className="flex gap-3 p-3 rounded-xl bg-white border border-[#e5e8ef] hover:border-[#c8cdd8] transition-colors">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', c.bg)}>
                          <Icon className="w-4 h-4" style={{ color: c.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[12px] font-semibold text-[#0f1729]">{c.title}</p>
                            {c.shortcut && (
                              <span className="text-[9px] font-mono bg-[#f1f3f7] text-[#9aa3b2] px-1.5 py-0.5 rounded">{c.shortcut}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#9aa3b2] mt-0.5 leading-relaxed">{c.desc}</p>
                        </div>
                      </div>
                    )
                  })}

                  <div className="mt-4">
                    <p className="text-[10px] font-semibold text-[#9aa3b2] uppercase tracking-wider mb-2">Keyboard shortcuts</p>
                    <div className="bg-white border border-[#e5e8ef] rounded-xl divide-y divide-[#f1f3f7] overflow-hidden">
                      {KEYBOARD_SHORTCUTS.map(({ keys, label }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2">
                          <span className="text-[11px] text-[#4a5568]">{label}</span>
                          <div className="flex items-center gap-1">
                            {keys.map((k, i) => (
                              <React.Fragment key={k}>
                                {i > 0 && <span className="text-[9px] text-[#9aa3b2]">then</span>}
                                <kbd className="text-[10px] font-mono bg-[#f1f3f7] text-[#4a5568] px-1.5 py-0.5 rounded border border-[#e5e8ef]">{k}</kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 pb-1 text-center">
                    <button
                      onClick={() => setTab('chat')}
                      className="inline-flex items-center gap-1 text-[11px] text-navy hover:underline font-medium"
                    >
                      Have a question? Ask the AI <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
