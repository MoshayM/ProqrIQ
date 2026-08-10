import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

// xAI Grok — OpenAI-compatible API at https://api.x.ai/v1
// Docs: https://docs.x.ai/api/integrations#openai-compatibility
// Key env var: GROK_API_KEY (stored in DB under provider id 'xai')
export const GROK_MODELS = [
  'grok-3',
  'grok-3-fast',
  'grok-3-mini',
  'grok-3-mini-fast',
  'grok-2-vision-1212',
  'grok-2-1212',
] as const

export class GrokProvider implements AIProvider {
  id          = 'xai'
  displayName = 'xAI (Grok)'

  isAvailable(): boolean {
    return !!(getStoredKey('xai') || process.env.GROK_API_KEY)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const apiKey = getStoredKey('xai') || process.env.GROK_API_KEY
    if (!apiKey) throw new Error('GROK_API_KEY not set')

    const messages: { role: string; content: unknown }[] = [
      { role: 'system', content: req.systemPrompt },
    ]

    if (req.imageBase64) {
      const mediaType = req.imageMediaType ?? 'image/jpeg'
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${req.imageBase64}` } },
          { type: 'text', text: req.userPrompt },
        ],
      })
    } else {
      messages.push({ role: 'user', content: req.userPrompt })
    }

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
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
      throw new Error(`xAI Grok request failed (${res.status}): ${text || res.statusText}`)
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
