import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

export class OpenAIProvider implements AIProvider {
  id          = 'openai'
  displayName = 'OpenAI (GPT)'

  isAvailable(): boolean {
    return !!(getStoredKey('openai') ?? process.env.OPENAI_API_KEY)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const apiKey = getStoredKey('openai') ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let OpenAI: any
    try {
      // Dynamic require — package is optional
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      OpenAI = require('openai')
      if (OpenAI.default) OpenAI = OpenAI.default
    } catch {
      throw new Error("openai package not installed — run: npm install openai --workspace=server")
    }

    const client = new OpenAI({ apiKey })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: 'system', content: req.systemPrompt }]

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

    const completion = await client.chat.completions.create({
      model:      req.model,
      max_tokens: req.maxTokens ?? 4096,
      messages,
    })

    return {
      content:      completion.choices[0]?.message?.content ?? '',
      inputTokens:  completion.usage?.prompt_tokens    ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      model:        req.model,
      provider:     this.id,
    }
  }
}
