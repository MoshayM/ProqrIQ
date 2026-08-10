// Token costs in USD per 1M tokens
export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4-20250514':    { input: 3.00,  output: 15.00 },
  'anthropic/claude-sonnet-4-5':           { input: 3.00,  output: 15.00 },
  'anthropic/claude-haiku-4-5-20251001':   { input: 0.25,  output: 1.25  },
  'anthropic/claude-haiku-4-5':            { input: 0.25,  output: 1.25  },
  'anthropic/claude-opus-4-8':             { input: 15.00, output: 75.00 },
  'openai/gpt-4o':                         { input: 2.50,  output: 10.00 },
  'openai/gpt-4o-mini':                    { input: 0.15,  output: 0.60  },
  'openai/o1':                             { input: 15.00, output: 60.00 },
  'openai/o3-mini':                        { input: 1.10,  output: 4.40  },
  'google/gemini-2.0-flash':               { input: 0.10,  output: 0.40  },
  'google/gemini-2.0-pro':                 { input: 1.25,  output: 5.00  },
  'xai/grok-3':                            { input: 3.00,  output: 15.00 },
  'xai/grok-3-mini':                       { input: 0.30,  output: 0.50  },
  'azure/gpt-4o':                          { input: 2.50,  output: 10.00 },
}

export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  if (provider === 'ollama') return 0 // local inference — no token cost
  if (provider === 'groq')   return 0 // Groq free tier — no token cost
  const key = `${provider}/${model}`
  const costs = TOKEN_COSTS[key]
  if (!costs) return 0
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000
}
