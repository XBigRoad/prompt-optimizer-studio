export type ApiProtocol =
  | 'auto'
  | 'openai-compatible'
  | 'anthropic-native'
  | 'gemini-native'
  | 'mistral-native'
  | 'cohere-native'

export interface ModelCatalogItem {
  id: string
  label: string
}

export type ProviderRequestLabel = 'optimizer' | 'judge' | 'goal_anchor'

export type ProviderRequestTelemetryKind =
  | 'attempt_started'
  | 'attempt_succeeded'
  | 'attempt_failed'
  | 'retry_scheduled'
  | 'fallback'

export type ProviderEndpointKind =
  | 'chat_completions'
  | 'responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'cohere_chat'

export interface ProviderRequestTelemetryEvent {
  kind: ProviderRequestTelemetryKind
  requestLabel: ProviderRequestLabel
  protocol: string
  endpointKind: ProviderEndpointKind
  endpoint: string
  attempt: number | null
  maxAttempts: number | null
  timeoutMs: number | null
  elapsedMs: number | null
  status: number | null
  retriable: boolean | null
  message: string
  at: string
  fallbackEndpointKind?: ProviderEndpointKind | null
}
