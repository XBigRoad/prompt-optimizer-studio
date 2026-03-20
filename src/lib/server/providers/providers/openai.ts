import { extractJsonObject } from '@/lib/server/json'
import {
  DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
  DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
  type OpenAiChatCompletionResponse,
  type OpenAiModelListResponse,
  type OpenAiResponsesResponse,
  type ProviderAdapter,
  type ProviderConnectionSettings,
  type ProviderJsonRequest,
} from '@/lib/server/providers/base'
import { normalizeProviderModelCatalog } from '@/lib/server/providers/catalog'
import { extractOpenAiResponseText, extractOpenAiResponsesText } from '@/lib/server/providers/parsers'
import { appendToBasePath } from '@/lib/server/providers/protocol'
import {
  isMissingChatCompletionsEndpoint,
  parseJsonResponse,
  parseOpenAiResponsesResponse,
  requestWithRetry,
  runRequestWithTimeout,
} from '@/lib/server/providers/transport'
import { isGpt5FamilyModel, normalizeReasoningEffort, type ReasoningEffort } from '@/lib/reasoning-effort'

export class OpenAiStyleProviderAdapter implements ProviderAdapter {
  readonly protocol: 'openai-compatible' | 'mistral-native'

  constructor(
    protected readonly settings: ProviderConnectionSettings,
    protocol: 'openai-compatible' | 'mistral-native',
  ) {
    this.protocol = protocol
  }

  async requestJson(input: ProviderJsonRequest) {
    const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)
    return this.requestJsonViaChatCompletions(input, reasoningEffort)
  }

  async listModels() {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'models')
    try {
      const payload = await runRequestWithTimeout('拉取模型列表', 30_000, async (signal) => {
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          signal,
        })

        return parseJsonResponse(response, '拉取模型列表', 30_000) as Promise<OpenAiModelListResponse>
      })
      return normalizeProviderModelCatalog(this.protocol, payload)
    } catch (error) {
      if (this.protocol === 'openai-compatible' && isMissingChatCompletionsEndpoint(error)) {
        return []
      }
      throw error
    }
  }

  protected async requestJsonViaChatCompletions(input: ProviderJsonRequest, reasoningEffort: ReasoningEffort) {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'chat/completions')
    const body = {
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      ...(reasoningEffort !== 'default' ? { reasoning_effort: reasoningEffort } : {}),
      ...(shouldSendTemperature(input.model, reasoningEffort) ? { temperature: 0.2 } : {}),
    }

    const response = await requestWithRetry((attemptTimeoutMs) => (
      runRequestWithTimeout('模型请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        })

        return parseJsonResponse(result, '模型请求', attemptTimeoutMs) as Promise<OpenAiChatCompletionResponse>
      })
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
    })

    return extractJsonObject(extractOpenAiResponseText(response)) as Record<string, unknown>
  }

  protected async requestJsonViaResponsesApi(input: ProviderJsonRequest, reasoningEffort: ReasoningEffort) {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'responses')
    const body = {
      model: input.model,
      instructions: input.system,
      input: input.user,
      ...(reasoningEffort !== 'default' ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(shouldSendTemperature(input.model, reasoningEffort) ? { temperature: 0.2 } : {}),
    }

    const response = await requestWithRetry((attemptTimeoutMs) => (
      runRequestWithTimeout('模型请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        })

        return parseOpenAiResponsesResponse(result, '模型请求', attemptTimeoutMs) as Promise<OpenAiResponsesResponse>
      })
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
    })

    return extractJsonObject(extractOpenAiResponsesText(response)) as Record<string, unknown>
  }
}

export class OpenAiCompatibleProviderAdapter extends OpenAiStyleProviderAdapter {
  constructor(settings: ProviderConnectionSettings) {
    super(settings, 'openai-compatible')
  }

  override async requestJson(input: ProviderJsonRequest) {
    const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)
    try {
      return await this.requestJsonViaChatCompletions(input, reasoningEffort)
    } catch (error) {
      if (!isMissingChatCompletionsEndpoint(error)) {
        throw error
      }
      return this.requestJsonViaResponsesApi(input, reasoningEffort)
    }
  }
}

function shouldSendTemperature(model: string, reasoningEffort: ReasoningEffort) {
  return !isGpt5FamilyModel(model) && reasoningEffort === 'default'
}
