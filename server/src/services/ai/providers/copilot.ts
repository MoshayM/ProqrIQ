import type { AIProvider, AIRequest, AIResponse } from './base'

export class CopilotProvider implements AIProvider {
  id          = 'azure'
  displayName = 'Azure OpenAI (Copilot)'

  isAvailable(): boolean {
    return !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT)
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    if (!this.isAvailable()) throw new Error('AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_DEPLOYMENT not set')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let AzureOpenAI: any
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('openai')
      AzureOpenAI = mod.AzureOpenAI ?? mod.default?.AzureOpenAI
      if (!AzureOpenAI) throw new Error('AzureOpenAI not exported')
    } catch {
      throw new Error("openai package not installed or too old — run: npm install openai --workspace=server")
    }

    const client = new AzureOpenAI({
      apiKey:     process.env.AZURE_OPENAI_API_KEY,
      endpoint:   process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: '2024-02-01',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: 'system', content: req.systemPrompt }]

    if (req.imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.imageBase64}` } },
          { type: 'text',      text: req.userPrompt },
        ],
      })
    } else {
      messages.push({ role: 'user', content: req.userPrompt })
    }

    const completion = await client.chat.completions.create({
      model:      process.env.AZURE_OPENAI_DEPLOYMENT!,
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
