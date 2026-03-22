import { extractJsonObject } from '@/lib/server/json'
import {
  DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
  DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
  type CohereChatResponse,
  type CohereModelListResponse,
  type ProviderAdapter,
  type ProviderConnectionSettings,
  type ProviderJsonRequest,
} from '@/lib/server/providers/base'
import { normalizeProviderModelCatalog } from '@/lib/server/providers/catalog'
import { extractCohereResponseText } from '@/lib/server/providers/parsers'
import { appendVersionedPath } from '@/lib/server/providers/protocol'
import { parseJsonResponse, requestWithRetry, runRequestWithTimeout } from '@/lib/server/providers/transport'

export class CohereNativeProviderAdapter implements ProviderAdapter {
  readonly protocol = 'cohere-native' as const

  constructor(private readonly settings: ProviderConnectionSettings) {}

  async requestJson(input: ProviderJsonRequest) {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v2', 'chat')
    const body = {
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      temperature: 0.2,
    }

    const response = await requestWithRetry((attemptTimeoutMs) => (
      runRequestWithTimeout('Cohere 请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        })

        return parseJsonResponse(result, 'Cohere 请求', attemptTimeoutMs) as Promise<CohereChatResponse>
      })
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
      timeoutMs: input.timeoutMs,
      actionLabel: 'Cohere 请求',
    })

    return extractJsonObject(extractCohereResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v2', 'models')
    const payload = await runRequestWithTimeout('拉取模型列表', 30_000, async (signal) => {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.settings.cpamcApiKey}`,
        },
        signal,
      })

      return parseJsonResponse(response, '拉取模型列表', 30_000) as Promise<CohereModelListResponse>
    })
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}
