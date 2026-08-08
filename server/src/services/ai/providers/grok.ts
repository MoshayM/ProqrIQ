import type { AIProvider, AIRequest, AIResponse } from './base'

export class GrokProvider implements AIProvider {
  id          = 'xai'
  displayName = 'xAI (Grok)'

  isAvailable(): boolean {
    return !!process.env.GROK_API_KEY
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    if (!process.env.GROK_API_KEY) throw new Error('GROK_API_KEY not set')

    // Grok uses an OpenAI-compatible API at api.x.ai
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let OpenAI: any
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      OpenAI = require('openai')
      if (OpenAI.default) OpenAI = OpenAI.default
    } catch {
      throw new Error("openai package not installed — run: npm install openai --workspace=server")
    }

    const client = new OpenAI({
      apiKey:  process.env.GROK_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: 'system', content: req.systemPrompt }]
    messages.push({ role: 'user', content: req.userPrompt })

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
