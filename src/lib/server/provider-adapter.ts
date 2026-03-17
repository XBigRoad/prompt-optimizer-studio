import { extractJsonObject } from '@/lib/server/json'
import type { ApiProtocol, AppSettings, ModelCatalogItem } from '@/lib/server/types'
import { isGpt5FamilyModel, normalizeReasoningEffort, type ReasoningEffort } from '@/lib/reasoning-effort'

export type { ApiProtocol } from '@/lib/server/types'

export interface ProviderJsonRequest {
  model: string
  system: string
  user: string
  timeoutMs: number
  maxAttempts?: number
  reasoningEffort?: ReasoningEffort
}

export interface ProviderAdapter {
  protocol: Exclude<ApiProtocol, 'auto'>
  requestJson(input: ProviderJsonRequest): Promise<Record<string, unknown>>
  listModels(): Promise<ModelCatalogItem[]>
}

type ProviderConnectionSettings = Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'> & Partial<Pick<AppSettings, 'apiProtocol'>>

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

interface OpenAiResponsesResponse {
  output?: Array<{
    type?: string
    role?: string
    content?: Array<{
      type?: string
      text?: string
    }>
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

interface CohereChatResponse {
  message?: {
    content?: Array<{
      type?: string
      text?: string
    }>
  }
  error?: {
    message?: string
  }
}

interface CohereModelListResponse {
  models?: Array<{
    name?: string
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

    if (host === 'api.mistral.ai') {
      return 'mistral-native'
    }

    if (host === 'api.cohere.com') {
      return 'cohere-native'
    }
  } catch {
    return 'openai-compatible'
  }

  return 'openai-compatible'
}

export function createProviderAdapter(
  settings: ProviderConnectionSettings,
): ProviderAdapter {
  const protocol = settings.apiProtocol && settings.apiProtocol !== 'auto'
    ? settings.apiProtocol
    : inferApiProtocol(settings.cpamcBaseUrl)

  switch (protocol) {
    case 'anthropic-native':
      return new AnthropicNativeProviderAdapter(settings)
    case 'gemini-native':
      return new GeminiNativeProviderAdapter(settings)
    case 'mistral-native':
      return new MistralNativeProviderAdapter(settings)
    case 'cohere-native':
      return new CohereNativeProviderAdapter(settings)
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
    case 'mistral-native':
      return normalizeOpenAiModelCatalog(payload as OpenAiModelListResponse)
    case 'cohere-native':
      return normalizeCohereModelCatalog(payload as CohereModelListResponse)
    case 'openai-compatible':
    default:
      return normalizeOpenAiModelCatalog(payload as OpenAiModelListResponse)
  }
}

class OpenAiStyleProviderAdapter implements ProviderAdapter {
  readonly protocol: 'openai-compatible' | 'mistral-native'

  constructor(
    private readonly settings: ProviderConnectionSettings,
    protocol: 'openai-compatible' | 'mistral-native',
  ) {
    this.protocol = protocol
  }

  async requestJson(input: ProviderJsonRequest) {
    const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)
    return this.requestJsonViaChatCompletions(input, reasoningEffort)
  }

  protected async requestJsonViaChatCompletions(
    input: ProviderJsonRequest,
    reasoningEffort: ReasoningEffort,
  ) {
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

  protected async requestJsonViaResponsesApi(
    input: ProviderJsonRequest,
    reasoningEffort: ReasoningEffort,
  ) {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'responses')
    const body = {
      model: input.model,
      instructions: input.system,
      input: input.user,
      ...(reasoningEffort !== 'default' ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(shouldSendTemperature(input.model, reasoningEffort) ? { temperature: 0.2 } : {}),
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

      return parseOpenAiResponsesResponse(result, '模型请求') as Promise<OpenAiResponsesResponse>
    }, input.maxAttempts ?? 3)

    return extractJsonObject(extractOpenAiResponsesText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'models')
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${this.settings.cpamcApiKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (response.status === 404 && this.protocol === 'openai-compatible') {
      return []
    }

    const payload = await parseJsonResponse(response, '拉取模型列表') as OpenAiModelListResponse
    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}

function shouldSendTemperature(model: string, reasoningEffort: ReasoningEffort) {
  if (isGpt5FamilyModel(model) && reasoningEffort !== 'default' && reasoningEffort !== 'none') {
    return false
  }

  return true
}

class OpenAiCompatibleProviderAdapter extends OpenAiStyleProviderAdapter {
  constructor(settings: ProviderConnectionSettings) {
    super(settings, 'openai-compatible')
  }

  async requestJson(input: ProviderJsonRequest) {
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

class MistralNativeProviderAdapter extends OpenAiStyleProviderAdapter {
  constructor(settings: ProviderConnectionSettings) {
    super(settings, 'mistral-native')
  }
}

class AnthropicNativeProviderAdapter implements ProviderAdapter {
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

class CohereNativeProviderAdapter implements ProviderAdapter {
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

      return parseJsonResponse(result, 'Cohere 请求') as Promise<CohereChatResponse>
    }, input.maxAttempts ?? 3)

    return extractJsonObject(extractCohereResponseText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendVersionedPath(this.settings.cpamcBaseUrl, 'v2', 'models')
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${this.settings.cpamcApiKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    })

    const payload = await parseJsonResponse(response, '拉取模型列表') as CohereModelListResponse
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

function normalizeCohereModelCatalog(payload: CohereModelListResponse): ModelCatalogItem[] {
  return dedupeModelIds((payload.models ?? []).map((item) => item.name))
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

function extractOpenAiResponsesText(response: OpenAiResponsesResponse) {
  const text = (response.output ?? [])
    .flatMap((item) => item.type === 'message' ? item.content ?? [] : [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()

  if (text) {
    return text
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }

  throw new Error('OpenAI Responses API 返回了空响应。')
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

function extractCohereResponseText(response: CohereChatResponse) {
  const text = (response.message?.content ?? [])
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

  throw new Error('Cohere 返回了空响应。')
}

async function parseJsonResponse(response: Response, actionLabel: string) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel)
  }

  return response.json() as Promise<unknown>
}

async function parseOpenAiResponsesResponse(response: Response, actionLabel: string) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/event-stream')) {
    return response.json() as Promise<OpenAiResponsesResponse>
  }

  const payload = await response.text()
  return parseOpenAiResponsesEventStream(payload)
}

async function createHttpError(response: Response, actionLabel: string) {
  const text = await response.text()
  const error = new Error(`${actionLabel}失败 (${response.status}): ${text.slice(0, 500)}`) as Error & {
    retriable?: boolean
    status?: number
  }
  error.status = response.status
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    error.retriable = true
  }
  return error
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

function parseOpenAiResponsesEventStream(payload: string): OpenAiResponsesResponse {
  const blocks = payload
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)

  let finalResponse: OpenAiResponsesResponse | null = null
  let lastPayload: unknown = null

  for (const block of blocks) {
    const lines = block.split('\n')
    const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')

    if (!data || data === '[DONE]') {
      continue
    }

    const parsed = JSON.parse(data) as { response?: OpenAiResponsesResponse }
    lastPayload = parsed
    if ((event === 'response.completed' || event === 'response.failed') && parsed.response) {
      finalResponse = parsed.response
    }
  }

  if (finalResponse) {
    return finalResponse
  }

  if (isOpenAiResponsesWrapper(lastPayload)) {
    return lastPayload.response
  }

  if (isOpenAiResponsesResponse(lastPayload)) {
    return lastPayload
  }

  throw new Error('OpenAI Responses API 返回了无法解析的事件流。')
}

function isOpenAiResponsesWrapper(payload: unknown): payload is { response: OpenAiResponsesResponse } {
  return typeof payload === 'object' && payload !== null && 'response' in payload
}

function isOpenAiResponsesResponse(payload: unknown): payload is OpenAiResponsesResponse {
  return typeof payload === 'object' && payload !== null
}

function isMissingChatCompletionsEndpoint(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'status' in error
    && (error as { status?: number }).status === 404,
  )
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
