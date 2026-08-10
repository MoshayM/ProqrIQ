import React, { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, BookOpen, Zap, FileStack, ShieldCheck, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { api, extractApiError } from '../../lib/api'
import { Button } from '../../components/ui/button'

type Message = { role: 'user' | 'assistant'; content: string }

const QUICK_QUESTIONS = [
  'How do I cost a new part?',
  'What does confidence score mean?',
  'How does assembly costing work?',
  'How do I compare a supplier quote?',
  'Why are clarification questions asked?',
  'What is source_tier?',
]

const FEATURE_CARDS = [
  {
    icon: <FileStack className="w-5 h-5 text-navy" />,
    title: 'Part Costing',
    desc: '6-step wizard: enter specs → upload drawing → AI estimates → review → adjust → submit for approval.',
  },
  {
    icon: <Zap className="w-5 h-5 text-amber-600" />,
    title: 'Bulk & Assembly',
    desc: 'Cost up to 50 parts in parallel or build a bill-of-materials assembly with automatic cost roll-up.',
  },
  {
    icon: <BookOpen className="w-5 h-5 text-emerald-600" />,
    title: 'Supplier Analysis',
    desc: 'Add suppliers, extract their quote with AI, get an apple-to-apple comparison and negotiation report.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5 text-purple-600" />,
    title: 'Approval Workflow',
    desc: 'Submitted quotes go to CEO for approval. Approved quotes are locked; rejected quotes can be revised.',
  },
]

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-navy" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-navy text-white rounded-br-sm'
            : 'bg-white border border-[#e5e8ef] text-[#0f1729] rounded-bl-sm',
        )}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-navy flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  )
}

export default function HelpTab() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const history = messages.slice(-16) // last 8 exchanges (16 messages)
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const { reply } = await api.help.chat({ message: trimmed, history })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Could not get a response. Please try again.'))
      // Remove the user message that failed
      setMessages(prev => prev.slice(0, -1))
      setInput(trimmed)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function reset() {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  const showWelcome = messages.length === 0

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">

      {/* Feature overview — shown at top always */}
      <div>
        <h2 className="text-base font-semibold text-[#0f1729] mb-4">ProqrIQ at a glance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURE_CARDS.map(c => (
            <div key={c.title} className="bg-white border border-[#e5e8ef] rounded-xl p-4 flex gap-3">
              <div className="flex-shrink-0 mt-0.5">{c.icon}</div>
              <div>
                <p className="text-sm font-semibold text-[#0f1729]">{c.title}</p>
                <p className="text-xs text-[#9aa3b2] mt-0.5 leading-relaxed">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="bg-white border border-[#e5e8ef] rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e8ef]">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-navy" />
            <span className="text-sm font-semibold text-[#0f1729]">ProqrIQ Assistant</span>
            <span className="text-xs text-[#9aa3b2]">· AI-powered · enterprise use only</span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-[#9aa3b2] hover:text-[#4a5568] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              New chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {showWelcome ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-navy/10 flex items-center justify-center mb-4">
                <Bot className="w-6 h-6 text-navy" />
              </div>
              <p className="text-sm font-semibold text-[#0f1729]">Ask me anything about ProqrIQ</p>
              <p className="text-xs text-[#9aa3b2] mt-1 max-w-xs leading-relaxed">
                I can walk you through workflows, explain features, and help you get the most out of the application.
              </p>
              {/* Quick-start chips */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-3 py-1.5 bg-surface-2 border border-[#e5e8ef] rounded-full text-xs text-[#4a5568] hover:border-navy hover:text-navy transition-colors"
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
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-navy" />
                  </div>
                  <div className="bg-white border border-[#e5e8ef] rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 className="w-4 h-4 text-[#9aa3b2] animate-spin" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[#e5e8ef] px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question… (Shift+Enter for new line)"
              rows={1}
              disabled={loading}
              className={cn(
                'flex-1 resize-none rounded-xl border border-[#e5e8ef] px-3 py-2.5 text-sm text-[#0f1729] placeholder-[#c8cdd8]',
                'focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition-all',
                'disabled:opacity-60',
              )}
              style={{ maxHeight: 120, overflowY: 'auto' }}
            />
            <Button
              variant="navy"
              size="sm"
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              iconLeft={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-[#c8cdd8] mt-2 text-center">
            Answers are AI-generated and limited to ProqrIQ topics only.
          </p>
        </div>
      </div>
    </div>
  )
}
