import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

// Ollama-style model name → Together AI hosted model name
const MODEL_MAP: Record<string, string> = {
  'qwen2.5:7b':   'Qwen/Qwen2.5-7B-Instruct-Turbo',
  'qwen2.5:14b':  'Qwen/Qwen2.5-14B-Instruct-Turbo',
  'qwen2.5:72b':  'Qwen/Qwen2.5-72B-Instruct-Turbo',
  'llama3.1:8b':  'meta-llama/Llama-3.1-8B-Instruct-Turbo',
  'llama3.2:3b':  'meta-llama/Llama-3.2-3B-Instruct-Turbo',
  'gemma2:9b':    'google/gemma-2-9b-it',
  'llama3.1:70b': 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
}

export function toTogetherModel(model: string): string {
  // Already a Together-style name (contains /)
  if (model.includes('/')) return model
  return MODEL_MAP[model] ?? model
}

export class TogetherProvider implements AIProvider {
  id          = 'together'
  displayName = 'Together AI (Cloud LLMs)'

  isAvailable(): boolean {
    return !!(getStoredKey('together') || process.env.TOGETHER_API_KEY)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const key = getStoredKey('together') || process.env.TOGETHER_API_KEY
    if (!key) throw new Error('TOGETHER_API_KEY not set')

    const model = toTogetherModel(req.model)
    const url   = 'https://api.together.xyz/v1/chat/completions'

    const messages: { role: string; content: unknown }[] = [
      { role: 'system', content: req.systemPrompt },
    ]

    if (req.imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.imageBase64}` } },
          { type: 'text', text: req.userPrompt },
        ],
      })
    } else {
      messages.push({ role: 'user', content: req.userPrompt })
    }

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens:  req.maxTokens ?? 4096,
        temperature: 0,
        messages,
        stream:      false,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Together AI request failed (${res.status}): ${text || res.statusText}`)
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[]
      usage?:   { prompt_tokens?: number; completion_tokens?: number }
    }

    return {
      content:      data.choices?.[0]?.message?.content ?? '',
      inputTokens:  data.usage?.prompt_tokens    ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model,
      provider:     this.id,
    }
  }
}
