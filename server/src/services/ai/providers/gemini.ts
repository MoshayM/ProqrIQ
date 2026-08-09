import type { AIProvider, AIRequest, AIResponse } from './base'
import { getStoredKey } from '../keyStore'

export class GeminiProvider implements AIProvider {
  id          = 'google'
  displayName = 'Google (Gemini)'

  isAvailable(): boolean {
    return !!(getStoredKey('google') ?? process.env.GEMINI_API_KEY)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    const apiKey = getStoredKey('google') ?? process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not set')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let GoogleGenerativeAI: any
    try {
      // Dynamic require — package is optional
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@google/generative-ai')
      GoogleGenerativeAI = mod.GoogleGenerativeAI ?? mod.default?.GoogleGenerativeAI
    } catch {
      throw new Error("@google/generative-ai not installed — run: npm install @google/generative-ai --workspace=server")
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: req.model })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []
    if (req.imageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: req.imageBase64 } })
    }
    parts.push({ text: `${req.systemPrompt}\n\n${req.userPrompt}` })

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] })
    const text   = result.response.text()
    const usage  = result.response.usageMetadata

    return {
      content:      text,
      inputTokens:  usage?.promptTokenCount    ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      model:        req.model,
      provider:     this.id,
    }
  }
}
