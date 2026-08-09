export interface AIRequest {
  model:              string
  systemPrompt:       string
  userPrompt:         string
  imageBase64?:       string
  imageMediaType?:    string  // e.g. 'image/png', 'image/jpeg', 'application/pdf'
  maxTokens?:         number
  temperature?:       number
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
