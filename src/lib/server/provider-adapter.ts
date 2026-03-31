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
  attemptTimeoutCapMs?: number
  reasoningEffort?: ReasoningEffort
}

export interface ProviderAdapter {
  protocol: Exclude<ApiProtocol, 'auto'>
  requestJson(input: ProviderJsonRequest): Promise<Record<string, unknown>>
  listModels(): Promise<ModelCatalogItem[]>
}

type ProviderConnectionSettings = Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'> & Partial<Pick<AppSettings, 'apiProtocol'>>

const DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS = 2
const GPT5_RESPONSES_PROBE_TIMEOUT_MS = 180_000
const DEFAULT_JSON_RESPONSE_MAX_TOKENS = 4_096

function resolveAttemptTimeoutCapMs(input: Pick<ProviderJsonRequest, 'attemptTimeoutCapMs' | 'timeoutMs'>) {
  return input.attemptTimeoutCapMs ?? input.timeoutMs
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
    const chatReasoningEffort = resolveChatCompletionsReasoningEffort(input.model, reasoningEffort)
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'chat/completions')
    const body = {
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      max_tokens: DEFAULT_JSON_RESPONSE_MAX_TOKENS,
      ...(chatReasoningEffort !== 'default' ? { reasoning_effort: chatReasoningEffort } : {}),
      ...(shouldSendTemperature(input.model, chatReasoningEffort) ? { temperature: 0.2 } : {}),
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
      attemptTimeoutCapMs: resolveAttemptTimeoutCapMs(input),
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
    })

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
      max_output_tokens: DEFAULT_JSON_RESPONSE_MAX_TOKENS,
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
      attemptTimeoutCapMs: resolveAttemptTimeoutCapMs(input),
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
    })

    return extractJsonObject(extractOpenAiResponsesText(response)) as Record<string, unknown>
  }

  async listModels() {
    const endpoint = appendToBasePath(this.settings.cpamcBaseUrl, 'models')
    const payload = await runRequestWithTimeout('拉取模型列表', 30_000, async (signal) => {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.settings.cpamcApiKey}`,
        },
        signal,
      })

      if (response.status === 404 && this.protocol === 'openai-compatible') {
        return null
      }

      return parseJsonResponse(response, '拉取模型列表', 30_000) as Promise<OpenAiModelListResponse>
    })

    if (payload === null) {
      return []
    }

    return normalizeProviderModelCatalog(this.protocol, payload)
  }
}

function shouldSendTemperature(model: string, reasoningEffort: ReasoningEffort) {
  if (isGpt5FamilyModel(model) && reasoningEffort !== 'default' && reasoningEffort !== 'none') {
    return false
  }

  return true
}

function shouldPreferResponsesApi(model: string, reasoningEffort: ReasoningEffort) {
  return isGpt5FamilyModel(model) && (reasoningEffort === 'high' || reasoningEffort === 'xhigh')
}

function resolveResponsesProbeTimeoutMs(totalTimeoutMs: number) {
  return Math.min(
    totalTimeoutMs,
    Math.max(GPT5_RESPONSES_PROBE_TIMEOUT_MS, Math.round(totalTimeoutMs * 0.66)),
  )
}

function resolveChatCompletionsReasoningEffort(model: string, reasoningEffort: ReasoningEffort) {
  if (isGpt5FamilyModel(model) && reasoningEffort === 'xhigh') {
    return 'high' as const
  }

  return reasoningEffort
}

class OpenAiCompatibleProviderAdapter extends OpenAiStyleProviderAdapter {
  constructor(settings: ProviderConnectionSettings) {
    super(settings, 'openai-compatible')
  }

  async requestJson(input: ProviderJsonRequest) {
    const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)

    try {
      return await this.requestJsonWithTransportStrategy(input, reasoningEffort)
    } catch (error) {
      if (!shouldRetryWithLowerReasoning(error)) {
        throw error
      }

      let downgradedEffort = nextLowerReasoningEffort(reasoningEffort)
      let lastError = error

      while (downgradedEffort) {
        try {
          return await this.requestJsonViaChatCompletions({
            ...input,
            timeoutMs: Math.min(input.timeoutMs, resolveLowerReasoningRetryTimeoutMs(downgradedEffort)),
            maxAttempts: 1,
            attemptTimeoutCapMs: undefined,
          }, downgradedEffort)
        } catch (retryError) {
          lastError = retryError
          if (!shouldRetryWithLowerReasoning(retryError)) {
            throw retryError
          }
          downgradedEffort = nextLowerReasoningEffort(downgradedEffort)
        }
      }

      throw lastError
    }
  }

  private async requestJsonWithTransportStrategy(
    input: ProviderJsonRequest,
    reasoningEffort: ReasoningEffort,
  ) {
    
    if (shouldPreferResponsesApi(input.model, reasoningEffort)) {
      const startedAt = Date.now()
      const probeTimeoutMs = resolveResponsesProbeTimeoutMs(input.timeoutMs)
      try {
        return await this.requestJsonViaResponsesApi({
          ...input,
          timeoutMs: probeTimeoutMs,
          maxAttempts: 1,
          attemptTimeoutCapMs: input.attemptTimeoutCapMs === undefined
            ? undefined
            : Math.min(input.attemptTimeoutCapMs, probeTimeoutMs),
        }, reasoningEffort)
      } catch (error) {
        if (!shouldFallbackFromResponses(error)) {
          throw error
        }

        const remainingTimeoutMs = Math.max(1, input.timeoutMs - (Date.now() - startedAt))
        return this.requestJsonViaChatCompletions({
          ...input,
          timeoutMs: remainingTimeoutMs,
          attemptTimeoutCapMs: input.attemptTimeoutCapMs === undefined
            ? undefined
            : Math.min(input.attemptTimeoutCapMs, remainingTimeoutMs),
        }, reasoningEffort)
      }
    }

    try {
      return await this.requestJsonViaChatCompletions(input, reasoningEffort)
    } catch (error) {
      if (!shouldFallbackFromChatCompletions(error)) {
        throw error
      }

      return this.requestJsonViaResponsesApi(input, reasoningEffort)
    }
  }
}

function nextLowerReasoningEffort(reasoningEffort: ReasoningEffort): ReasoningEffort | null {
  switch (reasoningEffort) {
    case 'xhigh':
      return 'high'
    case 'high':
      return 'medium'
    default:
      return null
  }
}

function resolveLowerReasoningRetryTimeoutMs(reasoningEffort: ReasoningEffort) {
  switch (reasoningEffort) {
    case 'high':
      return 240_000
    case 'medium':
      return 180_000
    default:
      return 120_000
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
      attemptTimeoutCapMs: resolveAttemptTimeoutCapMs(input),
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
        maxOutputTokens: DEFAULT_JSON_RESPONSE_MAX_TOKENS,
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
      attemptTimeoutCapMs: resolveAttemptTimeoutCapMs(input),
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
      max_tokens: DEFAULT_JSON_RESPONSE_MAX_TOKENS,
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
      attemptTimeoutCapMs: resolveAttemptTimeoutCapMs(input),
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

async function parseJsonResponse(response: Response, actionLabel: string, timeoutMs: number) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel, timeoutMs)
  }

  return readResponseJsonWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
}

async function parseOpenAiResponsesResponse(response: Response, actionLabel: string, timeoutMs: number) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel, timeoutMs)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/event-stream')) {
    return readResponseJsonWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs)) as Promise<OpenAiResponsesResponse>
  }

  const payload = await readResponseTextWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
  return parseOpenAiResponsesEventStream(payload)
}

async function createHttpError(response: Response, actionLabel: string, timeoutMs: number) {
  const text = await readResponseTextWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
  const error = new Error(`${actionLabel}失败 (${response.status}): ${text.slice(0, 500)}`) as Error & {
    retriable?: boolean
    status?: number
  }
  error.status = response.status
  error.retriable = isRetriableHttpFailure(response.status, text)
  return error
}

function resolveBodyReadTimeoutMs(timeoutMs: number) {
  return Math.max(1, timeoutMs - 10)
}

function readResponseJsonWithTimeout(response: Response, actionLabel: string, timeoutMs: number) {
  return readResponseBodyWithTimeout(response, actionLabel, timeoutMs, () => response.json() as Promise<unknown>)
}

function readResponseTextWithTimeout(response: Response, actionLabel: string, timeoutMs: number) {
  return readResponseBodyWithTimeout(response, actionLabel, timeoutMs, () => response.text())
}

async function readResponseBodyWithTimeout<T>(
  response: Response,
  actionLabel: string,
  timeoutMs: number,
  readBody: () => Promise<T>,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      readBody(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          void response.body?.cancel().catch(() => {})
          const error = new Error(`${actionLabel}失败：response body timeout after ${timeoutMs}ms`) as Error & {
            retriable?: boolean
            status?: number
          }
          error.retriable = true
          error.status = 408
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function requestWithRetry<T>(
  operation: (attemptTimeoutMs: number) => Promise<T>,
  options: { maxAttempts: number; attemptTimeoutCapMs?: number; timeoutMs: number; actionLabel: string },
) {
  let attempt = 0
  let lastError: unknown
  const startedAt = Date.now()

  while (attempt < options.maxAttempts) {
    const attemptTimeoutMs = resolveAttemptTimeoutMs(startedAt, options.timeoutMs, options.attemptTimeoutCapMs)
    if (attemptTimeoutMs <= 0) {
      throw lastError ?? createRequestTimeoutError(options.actionLabel, options.timeoutMs)
    }
    try {
      return await operation(attemptTimeoutMs)
    } catch (error) {
      lastError = error
      attempt += 1
      const retriable = isRetriableRequestError(error)
      if (!retriable || attempt >= options.maxAttempts) {
        throw error
      }
      const remainingTimeoutMs = resolveRemainingTimeoutMs(startedAt, options.timeoutMs)
      const retryDelayMs = resolveRetryDelayMs(attempt, remainingTimeoutMs, options.maxAttempts)
      if (retryDelayMs <= 0) {
        throw error
      }
      await wait(retryDelayMs)
    }
  }

  throw lastError
}

function resolveRemainingTimeoutMs(startedAt: number, totalTimeoutMs: number) {
  return Math.max(0, totalTimeoutMs - (Date.now() - startedAt))
}

function resolveAttemptTimeoutMs(startedAt: number, totalTimeoutMs: number, attemptTimeoutCapMs?: number) {
  const remainingTimeoutMs = resolveRemainingTimeoutMs(startedAt, totalTimeoutMs)
  const normalizedCapMs = Math.max(1, attemptTimeoutCapMs ?? totalTimeoutMs)
  return Math.max(0, Math.min(remainingTimeoutMs, normalizedCapMs))
}

function resolveRetryDelayMs(attempt: number, remainingTimeoutMs: number, maxAttempts: number) {
  const remainingAttempts = Math.max(0, maxAttempts - attempt)
  const reservedMs = remainingAttempts * 10
  if (remainingTimeoutMs <= reservedMs) {
    return 0
  }

  return Math.min(500 * 2 ** (attempt - 1), remainingTimeoutMs - reservedMs)
}

function createRequestTimeoutError(actionLabel: string, timeoutMs: number) {
  const error = new Error(`${actionLabel}失败：request timeout after ${timeoutMs}ms`) as Error & {
    retriable?: boolean
    status?: number
  }
  error.retriable = true
  error.status = 408
  return error
}

async function runRequestWithTimeout<T>(
  actionLabel: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          const error = new Error(`${actionLabel}失败：request timeout after ${timeoutMs}ms`) as Error & {
            retriable?: boolean
            status?: number
          }
          error.retriable = true
          error.status = 408
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function isRetriableRequestError(error: unknown) {
  if (error instanceof Error && 'retriable' in error) {
    return Boolean((error as Error & { retriable?: boolean }).retriable)
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  return isRetriableTransientMessage(message)
}

function isRetriableHttpFailure(status: number, bodyText: string) {
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true
  }

  if (status === 403) {
    return isRecoverableGatewayForbiddenMessage(bodyText)
  }

  if (status !== 500) {
    return false
  }

  return isRetriableTransientMessage(bodyText)
}

function isRecoverableGatewayForbiddenMessage(message: string) {
  return /((cloudflare|gateway|proxy|waf|security).*(forbidden|access denied|blocked))|((forbidden|access denied|blocked).*(cloudflare|gateway|proxy|waf|security))|attention required|request blocked/i.test(message)
}

function isRetriableTransientMessage(message: string) {
  return /(fetch failed|timeout|timed out|gateway time-?out|bad gateway|service unavailable|the operation was aborted|aborterror|etimedout|econnreset|econnrefused|socket hang up|\beof\b|upstream connect|upstream timed out|network|\bhttp 000\b|stream error|internal[_ ]error|server[_ ]error|received from peer|cloudflare|auth_unavailable|no auth available|authentication unavailable)/i.test(message)
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

function isMissingResponsesEndpoint(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'status' in error
    && (error as { status?: number }).status === 404,
  )
}

function isRecoverableGatewayForbiddenError(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error) || (error as { status?: number }).status !== 403) {
    return false
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  return isRecoverableGatewayForbiddenMessage(message)
}

function shouldFallbackFromResponses(error: unknown) {
  return isMissingResponsesEndpoint(error) || isRetriableRequestError(error)
}

function shouldFallbackFromChatCompletions(error: unknown) {
  return isMissingChatCompletionsEndpoint(error) || isRecoverableGatewayForbiddenError(error)
}

function shouldRetryWithLowerReasoning(error: unknown) {
  return isRetriableRequestError(error)
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
