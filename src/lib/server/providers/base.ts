import type { ApiProtocol, AppSettings, ModelCatalogItem } from '@/lib/contracts'
import type {
  ProviderRequestLabel,
  ProviderRequestTelemetryEvent,
} from '@/lib/contracts/provider'
import { isGpt5FamilyModel, type ReasoningEffort } from '@/lib/reasoning-effort'

export type { ApiProtocol } from '@/lib/contracts'

export interface ProviderJsonRequest {
  model: string
  system: string
  user: string
  timeoutMs: number
  maxAttempts?: number
  attemptTimeoutCapMs?: number
  reasoningEffort?: ReasoningEffort
  requestLabel?: ProviderRequestLabel
  endpointMode?: 'auto' | 'chat' | 'responses' | 'responses_preferred'
  telemetryCollector?: (event: ProviderRequestTelemetryEvent) => void
}

export interface ProviderAdapter {
  protocol: Exclude<ApiProtocol, 'auto'>
  requestJson(input: ProviderJsonRequest): Promise<Record<string, unknown>>
  listModels(): Promise<ModelCatalogItem[]>
}

export type ProviderConnectionSettings = Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'> & Partial<Pick<AppSettings, 'apiProtocol'>>

export const DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS = 60_000
export const GPT5_MEDIUM_REQUEST_ATTEMPT_TIMEOUT_CAP_MS = 120_000
export const GPT5_HIGH_REQUEST_ATTEMPT_TIMEOUT_CAP_MS = 180_000
export const GPT5_XHIGH_REQUEST_ATTEMPT_TIMEOUT_CAP_MS = 240_000
export const DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS = 2

export function resolveDefaultModelRequestAttemptTimeoutCapMs(model: string, reasoningEffort: ReasoningEffort) {
  if (!isGpt5FamilyModel(model)) {
    return DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS
  }

  switch (reasoningEffort) {
    case 'medium':
      return GPT5_MEDIUM_REQUEST_ATTEMPT_TIMEOUT_CAP_MS
    case 'high':
      return GPT5_HIGH_REQUEST_ATTEMPT_TIMEOUT_CAP_MS
    case 'xhigh':
      return GPT5_XHIGH_REQUEST_ATTEMPT_TIMEOUT_CAP_MS
    default:
      return DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS
  }
}

export interface OpenAiModelListResponse {
  data?: Array<{ id?: string }>
}

export interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>
    }
  }>
  error?: { message?: string }
}

export interface OpenAiResponsesResponse {
  output?: Array<{
    type?: string
    role?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  error?: { message?: string }
}

export interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string
    text?: string
  }>
  error?: { message?: string }
}

export interface AnthropicModelListResponse {
  data?: Array<{ id?: string }>
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

export interface GeminiModelListResponse {
  models?: Array<{
    name?: string
    supportedGenerationMethods?: string[]
  }>
}

export interface CohereChatResponse {
  message?: {
    content?: Array<{
      type?: string
      text?: string
    }>
  }
  error?: { message?: string }
}

export interface CohereModelListResponse {
  models?: Array<{ name?: string }>
}
