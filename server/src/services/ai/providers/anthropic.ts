import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

export class AnthropicProvider implements AIProvider {
  id          = 'anthropic'
  displayName = 'Anthropic (Claude)'

  private client:    Anthropic | null = null
  private clientKey: string | null    = null

  isAvailable(): boolean {
    return !!(getStoredKey('anthropic') ?? process.env.ANTHROPIC_API_KEY)
  }

  private getClient(): Anthropic {
    const key = getStoredKey('anthropic') ?? process.env.ANTHROPIC_API_KEY ?? ''
    if (!this.client || this.clientKey !== key) {
      this.client    = new Anthropic({ apiKey: key })
      this.clientKey = key
    }
    return this.client
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const client = this.getClient()

    // Build user content array
    const userContent: Anthropic.MessageParam['content'] = []

    if (req.imageBase64) {
      const mediaType = req.imageMediaType ?? 'image/jpeg'
      if (mediaType === 'application/pdf') {
        // PDFs use the document content block type
        userContent.push({
          type:   'document',
          source: { type: 'base64', media_type: 'application/pdf', data: req.imageBase64 },
        } as unknown as Anthropic.ImageBlockParam)
      } else {
        const imgType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
          ? mediaType
          : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
        userContent.push({
          type:   'image',
          source: { type: 'base64', media_type: imgType, data: req.imageBase64 },
        })
      }
    }

    userContent.push({ type: 'text', text: req.userPrompt })

    // For prompt caching the system prompt, we pass it as a string
    // (cache_control requires the beta header which may not be in this SDK version)
    const response = await client.messages.create({
      model:      req.model,
      max_tokens: req.maxTokens ?? 4096,
      system:     req.systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    })

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      content,
      inputTokens:  response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model:        req.model,
      provider:     this.id,
    }
  }
}
