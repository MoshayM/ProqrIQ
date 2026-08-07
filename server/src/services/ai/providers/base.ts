export interface AIRequest {
  model:             string
  systemPrompt:      string
  userPrompt:        string
  imageBase64?:      string
  maxTokens?:        number
  cacheSystemPrompt?: boolean
}

export interface AIResponse {
  content:      string
  inputTokens:  number
  outputTokens: number
  model:        string
  provider:     string
}

export interface AIProvider {
  id:          string
  displayName: string
  isAvailable(): boolean
  complete(req: AIRequest): Promise<AIResponse>
}
