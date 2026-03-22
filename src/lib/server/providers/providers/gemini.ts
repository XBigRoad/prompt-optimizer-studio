import { extractJsonObject } from '@/lib/server/json'
import {
  DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
  DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
  type GeminiGenerateContentResponse,
  type GeminiModelListResponse,
  type ProviderAdapter,
  type ProviderConnectionSettings,
  type ProviderJsonRequest,
} from '@/lib/server/providers/base'
import { normalizeProviderModelCatalog } from '@/lib/server/providers/catalog'
import { extractGeminiResponseText } from '@/lib/server/providers/parsers'
import { appendVersionedPath, normalizeGeminiModelPath } from '@/lib/server/providers/protocol'
import { parseJsonResponse, requestWithRetry, runRequestWithTimeout } from '@/lib/server/providers/transport'

export class GeminiNativeProviderAdapter implements ProviderAdapter {
  readonly protocol = 'gemini-native' as const

  constructor(private readonly settings: ProviderConnectionSettings) {}

  async requestJson(input: ProviderJsonRequest) {
    const modelPath = normalizeGeminiModelPath(input.model)
    const endpoint = appendVersionedPath(
      this.settings.cpamcBaseUrl,
      'v1beta',
      `models/${encodeURIComponent(modelPath)}:generateContent`,
    )
    const body = {
      systemInstruction: {
        parts: [{ text: input.system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input.user }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }

    const response = await requestWithRetry((attemptTimeoutMs) => (
      runRequestWithTimeout('Gemini 请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.settings.cpamcApiKey,
          },
          body: JSON.stringify(body),
          signal,
        })

        return parseJsonResponse(result, 'Gemini 请求', attemptTimeoutMs) as Promise<GeminiGenerateContentResponse>
      })
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? DEFAULT_MODEL_REQUEST_ATTEMPT_TIMEOUT_CAP_MS,
      timeoutMs: input.timeoutMs,
      actionLabel: 'Gemini 请求',
    })

    return extractJsonObject(extractGeminiResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1beta', 'models')
    const payload = await runRequestWithTimeout('拉取模型列表', 30_000, async (signal) => {
      const response = await fetch(endpoint, {
        headers: {
          'x-goog-api-key': this.settings.cpamcApiKey,
        },
        signal,
      })

      return parseJsonResponse(response, '拉取模型列表', 30_000) as Promise<GeminiModelListResponse>
    })
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}
