import { extractJsonObject } from '@/lib/server/json'
import type { AppSettings, ModelCatalogItem } from '@/lib/server/types'

export type ApiProtocol = 'openai-compatible' | 'anthropic-native' | 'gemini-native'

export interface ProviderJsonRequest {
  model: string
  system: string
  user: string
  timeoutMs: number
  maxAttempts?: number
}

export interface ProviderAdapter {
  protocol: ApiProtocol
  requestJson(input: ProviderJsonRequest): Promise<Record<string, unknown>>
  listModels(): Promise<ModelCatalogItem[]>
}

interface OpenAiModelListResponse {
  data?: Array<{
    id?: string
  }>
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>
    }
  }>
  error?: {
    message?: string
  }
}

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string
    text?: string
  }>
  error?: {
    message?: string
  }
}

interface AnthropicModelListResponse {
  data?: Array<{
    id?: string
  }>
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  promptFeedback?: {
    blockReason?: string
  }
  error?: {
    message?: string
  }
}

interface GeminiModelListResponse {
  models?: Array<{
    name?: string
    supportedGenerationMethods?: string[]
  }>
}

export function inferApiProtocol(baseUrl: string): ApiProtocol {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return 'openai-compatible'
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    if (path.includes('/openai')) {
      return 'openai-compatible'
    }

    if (host === 'api.anthropic.com') {
      return 'anthropic-native'
    }

    if (host === 'generativelanguage.googleapis.com') {
      return 'gemini-native'
    }
  } catch {
    return 'openai-compatible'
  }

  return 'openai-compatible'
}

export function createProviderAdapter(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>,
): ProviderAdapter {
  const protocol = inferApiProtocol(settings.cpamcBaseUrl)

  switch (protocol) {
    case 'anthropic-native':
      return new AnthropicNativeProviderAdapter(settings)
    case 'gemini-native':
      return new GeminiNativeProviderAdapter(settings)
    case 'openai-compatible':
    default:
      return new OpenAiCompatibleProviderAdapter(settings)
  }
}

export function normalizeProviderModelCatalog(protocol: ApiProtocol, payload: unknown): ModelCatalogItem[] {
  switch (protocol) {
    case 'anthropic-native':
      return normalizeAnthropicModelCatalog(payload as AnthropicModelListResponse)
    case 'gemini-native':
      return normalizeGeminiModelCatalog(payload as GeminiModelListResponse)
    case 'openai-compatible':
    default:
      return normalizeOpenAiModelCatalog(payload as OpenAiModelListResponse)
  }
}

class OpenAiCompatibleProviderAdapter implements ProviderAdapter {
  readonly protocol = 'openai-compatible' as const

  constructor(private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>) {}

  async requestJson(input: ProviderJsonRequest) {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'chat/completions')
    const body = {
      model: input.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }

    const response = await requestWithRetry(async () => {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.settings.cpamcApiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs),
      })

      return parseJsonResponse(result, '模型请求') as Promise<OpenAiChatCompletionResponse>
    }, input.maxAttempts ?? 3)

    return extractJsonObject(extractOpenAiResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'models')
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${this.settings.cpamcApiKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    })

    const payload = await parseJsonResponse(response, '拉取模型列表') as OpenAiModelListResponse
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}

class AnthropicNativeProviderAdapter implements ProviderAdapter {
  readonly protocol = 'anthropic-native' as const

  constructor(private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>) {}

  async requestJson(input: ProviderJsonRequest) {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1', 'messages')
    const body = {
      model: input.model,
      system: input.system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: input.user,
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 2_048,
    }

    const response = await requestWithRetry(async () => {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.cpamcApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs),
      })

      return parseJsonResponse(result, 'Anthropic 请求') as Promise<AnthropicMessagesResponse>
    }, input.maxAttempts ?? 3)

    return extractJsonObject(extractAnthropicResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1', 'models')
    const response = await fetch(endpoint, {
      headers: {
        'x-api-key': this.settings.cpamcApiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(30_000),
    })

    const payload = await parseJsonResponse(response, '拉取模型列表') as AnthropicModelListResponse
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}

class GeminiNativeProviderAdapter implements ProviderAdapter {
  readonly protocol = 'gemini-native' as const

  constructor(private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>) {}

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

    const response = await requestWithRetry(async () => {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.settings.cpamcApiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(input.timeoutMs),
      })

      return parseJsonResponse(result, 'Gemini 请求') as Promise<GeminiGenerateContentResponse>
    }, input.maxAttempts ?? 3)

    return extractJsonObject(extractGeminiResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v1beta', 'models')
    const response = await fetch(endpoint, {
      headers: {
        'x-goog-api-key': this.settings.cpamcApiKey,
      },
      signal: AbortSignal.timeout(30_000),
    })

    const payload = await parseJsonResponse(response, '拉取模型列表') as GeminiModelListResponse
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}

function normalizeOpenAiModelCatalog(payload: OpenAiModelListResponse): ModelCatalogItem[] {
  return dedupeModelIds((payload.data ?? []).map((item) => item.id))
}

function normalizeAnthropicModelCatalog(payload: AnthropicModelListResponse): ModelCatalogItem[] {
  return dedupeModelIds((payload.data ?? []).map((item) => item.id))
}

function normalizeGeminiModelCatalog(payload: GeminiModelListResponse): ModelCatalogItem[] {
  const ids = (payload.models ?? [])
    .filter((item) => {
      const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : null
      return !methods || methods.includes('generateContent')
    })
    .map((item) => item.name)

  return dedupeModelIds(ids)
}

function dedupeModelIds(ids: Array<string | undefined>): ModelCatalogItem[] {
  const seen = new Set<string>()
  const models: ModelCatalogItem[] = []

  for (const id of ids) {
    const alias = normalizeModelAlias(id)
    if (!alias || seen.has(alias)) {
      continue
    }
    seen.add(alias)
    models.push({ id: alias, label: alias })
  }

  return models
}

function normalizeModelAlias(value: string | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().replace(/^models\//i, '')
  if (!trimmed) {
    return null
  }

  const parts = trimmed.split('/').filter(Boolean)
  const alias = parts.at(-1)?.trim()
  return alias || null
}

function normalizeGeminiModelPath(model: string) {
  return model.trim().replace(/^models\//i, '')
}

function extractOpenAiResponseText(response: OpenAiChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('\n')
  }
  if (response.error?.message) {
    throw new Error(response.error.message)
  }
  throw new Error('模型返回了空响应。')
}

function extractAnthropicResponseText(response: AnthropicMessagesResponse) {
  const text = (response.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  throw new Error('Anthropic 返回了空响应。')
}

function extractGeminiResponseText(response: GeminiGenerateContentResponse) {
  const text = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error(`Gemini 阻止了该请求：${response.promptFeedback.blockReason}`)
  }

  throw new Error('Gemini 返回了空响应。')
}

async function parseJsonResponse(response: Response, actionLabel: string) {
  if (!response.ok) {
    const text = await response.text()
    const error = new Error(`${actionLabel}失败 (${response.status}): ${text.slice(0, 500)}`)
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      ;(error as Error & { retriable?: boolean }).retriable = true
    }
    throw error
  }

  return response.json() as Promise<unknown>
}

async function requestWithRetry<T>(operation: () => Promise<T>, maxAttempts: number) {
  let attempt = 0
  let lastError: unknown

  while (attempt < maxAttempts) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      attempt += 1
      const retriable = error instanceof Error && 'retriable' in error ? Boolean((error as Error & { retriable?: boolean }).retriable) : true
      if (!retriable || attempt >= maxAttempts) {
        throw error
      }
      await wait(500 * 2 ** (attempt - 1))
    }
  }

  throw lastError
}

function appendToBasePath(baseUrl: string, tail: string) {
  const url = parseBaseUrl(baseUrl)
  const segments = [
    ...url.pathname.split('/').filter(Boolean),
    ...tail.split('/').filter(Boolean),
  ]
  url.pathname = `/${segments.join('/')}`
  url.search = ''
  return url.toString()
}

function appendVersionedPath(baseUrl: string, versionSegment: string, tail: string) {
  const url = parseBaseUrl(baseUrl)
  const baseSegments = url.pathname.split('/').filter(Boolean)
  const segments = baseSegments.at(-1) === versionSegment
    ? baseSegments
    : [...baseSegments, versionSegment].filter(Boolean)

  url.pathname = `/${[...segments, ...tail.split('/').filter(Boolean)].join('/')}`
  url.search = ''
  return url.toString()
}

function parseBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl.trim())
  } catch {
    throw new Error('Base URL 格式不正确。')
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
