import { AnthropicProvider } from './anthropic'
import { OpenAIProvider }   from './openai'
import { GeminiProvider }   from './gemini'
import { GrokProvider }     from './grok'
import { CopilotProvider }  from './copilot'
import { OllamaProvider }   from './ollama'
import { TogetherProvider } from './together'
import type { AIProvider }  from './base'

export * from './base'
export * from './costs'

export const ALL_PROVIDERS: AIProvider[] = [
  new AnthropicProvider(),
  new OpenAIProvider(),
  new GeminiProvider(),
  new GrokProvider(),
  new CopilotProvider(),
  new OllamaProvider(),
  new TogetherProvider(),
]

export function activeProviders(): AIProvider[] {
  return ALL_PROVIDERS.filter(p => p.isAvailable())
}

export function getProvider(id: string): AIProvider {
  const p = ALL_PROVIDERS.find(p => p.id === id)
  if (!p) throw new Error(`Unknown AI provider: ${id}`)
  if (!p.isAvailable()) throw new Error(`Provider '${id}' is not configured — set OLLAMA_ENABLED=true or the relevant API key`)
  return p
}
