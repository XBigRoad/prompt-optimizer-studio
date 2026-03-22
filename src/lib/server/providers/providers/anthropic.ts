import { extractJsonObject } from '@/lib/server/json'
import {
  DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
  DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
  type AnthropicMessagesResponse,
  type AnthropicModelListResponse,
  type ProviderAdapter,
  type ProviderConnectionSettings,
  type ProviderJsonRequest,
} from '@/lib/server/providers/base'
import { normalizeProviderModelCatalog } from '@/lib/server/providers/catalog'
import { extractAnthropicResponseText } from '@/lib/server/providers/parsers'
import { appendVersionedPath } from '@/lib/server/providers/protocol'
import { parseJsonResponse, requestWithRetry, runRequestWithTimeout } from '@/lib/server/providers/transport'

export class AnthropicNativeProviderAdapter implements ProviderAdapter {
  readonly protocol = 'anthropic-native' as const

  constructor(private readonly settings: ProviderConnectionSettings) {}

  async requestJson(input: ProviderJsonRequest) {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1', 'messages')
    const body = {
      model: input.model,
      system: input.system,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: input.user }],
        },
      ],
      temperature: 0.2,
    }

    const response = await requestWithRetry((attemptTimeoutMs) => (
      runRequestWithTimeout('Anthropic 请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.settings.cpamcApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal,
        })

        return parseJsonResponse(result, 'Anthropic 请求', attemptTimeoutMs) as Promise<AnthropicMessagesResponse>
      })
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
      timeoutMs: input.timeoutMs,
      actionLabel: 'Anthropic 请求',
    })

    return extractJsonObject(extractAnthropicResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1', 'models')
    const payload = await runRequestWithTimeout('拉取模型列表', 30_000, async (signal) => {
      const response = await fetch(endpoint, {
        headers: {
          'x-api-key': this.settings.cpamcApiKey,
          'anthropic-version': '2023-06-01',
        },
        signal,
      })

      return parseJsonResponse(response, '拉取模型列表', 30_000) as Promise<AnthropicModelListResponse>
    })
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}
