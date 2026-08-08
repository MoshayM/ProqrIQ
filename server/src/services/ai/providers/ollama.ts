import type { AIProvider, AIRequest, AIResponse } from './base'

export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

export class OllamaProvider implements AIProvider {
  id          = 'ollama'
  displayName = 'Ollama (Local LLM)'

  isAvailable(): boolean {
    return process.env.OLLAMA_ENABLED === 'true'
  }

  private baseUrl(): string {
    return (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetch(`${this.baseUrl()}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return []
      const data = await res.json() as { models?: OllamaModel[] }
      return data.models ?? []
    } catch {
      return []
    }
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const url = `${this.baseUrl()}/v1/chat/completions`

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }

    type Message =
      | { role: 'system' | 'user'; content: string }
      | { role: 'user'; content: ContentPart[] }

    const messages: Message[] = [{ role: 'system', content: req.systemPrompt }]

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      req.model,
        max_tokens: req.maxTokens ?? 4096,
        messages,
        stream:     false,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama request failed (${res.status}): ${text || res.statusText}`)
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[]
      usage?:   { prompt_tokens?: number; completion_tokens?: number }
    }

    return {
      content:      data.choices?.[0]?.message?.content ?? '',
      inputTokens:  data.usage?.prompt_tokens    ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model:        req.model,
      provider:     this.id,
    }
  }
}
