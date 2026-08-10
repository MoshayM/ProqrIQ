import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

// Groq free-tier models (as of 2025)
// Groq uses OpenAI-compatible API at https://api.groq.com/openai/v1
// Docs: https://console.groq.com/docs/models
export const GROQ_MODELS = {
  'llama-3.3-70b-versatile':       'Llama 3.3 70B — quality (1,000 req/day free)',
  'llama-3.1-8b-instant':          'Llama 3.1 8B  — fast (6,000 req/day free)',
  'llama-3.2-3b-preview':          'Llama 3.2 3B  — ultra-fast',
  'mixtral-8x7b-32768':            'Mixtral 8x7B  — long context (32K)',
  'gemma2-9b-it':                  'Gemma 2 9B    — Google',
  'deepseek-r1-distill-llama-70b': 'DeepSeek R1 distill (70B)',
} as const

export class GroqProvider implements AIProvider {
  id          = 'groq'
  displayName = 'Groq (Free Cloud LLMs)'

  isAvailable(): boolean {
    return !!(getStoredKey('groq') || process.env.GROQ_API_KEY)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const key = getStoredKey('groq') || process.env.GROQ_API_KEY
    if (!key) throw new Error('GROQ_API_KEY not set')

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: req.systemPrompt },
      { role: 'user',   content: req.userPrompt   },
    ]
    // Groq LPU does not support vision on free models — ignore imageBase64

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:      req.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: 0,
        messages,
        stream: false,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Groq request failed (${res.status}): ${text || res.statusText}`)
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[]
      usage?:   { prompt_tokens?: number; completion_tokens?: number }
      model?:   string
    }

    return {
      content:      data.choices?.[0]?.message?.content ?? '',
      inputTokens:  data.usage?.prompt_tokens    ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model:        data.model ?? req.model,
      provider:     this.id,
    }
  }
}
