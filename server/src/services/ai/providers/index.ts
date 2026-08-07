import { AnthropicProvider } from './anthropic'
import { OpenAIProvider }   from './openai'
import { GeminiProvider }   from './gemini'
import type { AIProvider }  from './base'

export * from './base'
export * from './costs'

export const ALL_PROVIDERS: AIProvider[] = [
  new AnthropicProvider(),
  new OpenAIProvider(),
  new GeminiProvider(),
]

export function activeProviders(): AIProvider[] {
  return ALL_PROVIDERS.filter(p => p.isAvailable())
}

export function getProvider(id: string): AIProvider {
  const p = ALL_PROVIDERS.find(p => p.id === id)
  if (!p) throw new Error(`Unknown AI provider: ${id}`)
  if (!p.isAvailable()) throw new Error(`Provider '${id}' is not configured (missing API key)`)
  return p
}
