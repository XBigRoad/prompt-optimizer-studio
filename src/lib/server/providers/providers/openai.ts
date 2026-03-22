import { extractJsonObject } from '@/lib/server/json'
import {
  DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
  resolveDefaultModelRequestAttemptTimeoutCapMs,
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
  runRequestWithTimeout,
} from '@/lib/server/providers/transport'
import type {
  ProviderEndpointKind,
  ProviderRequestLabel,
  ProviderRequestTelemetryEvent,
} from '@/lib/contracts/provider'
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

    const response = await requestWithTelemetryRetry(({ attempt, maxAttempts, attemptTimeoutMs }) => (
      runProviderAttemptWithTelemetry({
        telemetryCollector: input.telemetryCollector,
        requestLabel: input.requestLabel ?? 'optimizer',
        protocol: this.protocol,
        endpointKind: 'chat_completions',
        endpoint,
        attempt,
        maxAttempts,
        timeoutMs: attemptTimeoutMs,
      }, () => runRequestWithTimeout('模型请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        })

        return {
          payload: await parseJsonResponse(result, '模型请求', attemptTimeoutMs) as OpenAiChatCompletionResponse,
          status: result.status,
        }
      }))
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort),
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
      onRetry: ({ attempt, maxAttempts, attemptTimeoutMs, delayMs, error }) => {
        emitRequestTelemetry(input.telemetryCollector, {
          kind: 'retry_scheduled',
          requestLabel: input.requestLabel ?? 'optimizer',
          protocol: this.protocol,
          endpointKind: 'chat_completions',
          endpoint,
          attempt,
          maxAttempts,
          timeoutMs: attemptTimeoutMs,
          elapsedMs: null,
          status: getTelemetryStatus(error),
          retriable: getTelemetryRetriable(error),
          message: `retry in ${delayMs}ms: ${getTelemetryMessage(error)}`,
        })
      },
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
      ...(reasoningEffort !== 'default' ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(shouldSendTemperature(input.model, reasoningEffort) ? { temperature: 0.2 } : {}),
    }

    const response = await requestWithTelemetryRetry(({ attempt, maxAttempts, attemptTimeoutMs }) => (
      runProviderAttemptWithTelemetry({
        telemetryCollector: input.telemetryCollector,
        requestLabel: input.requestLabel ?? 'optimizer',
        protocol: this.protocol,
        endpointKind: 'responses',
        endpoint,
        attempt,
        maxAttempts,
        timeoutMs: attemptTimeoutMs,
      }, () => runRequestWithTimeout('模型请求', attemptTimeoutMs, async (signal) => {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.cpamcApiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        })

        const payload = await parseOpenAiResponsesResponse(result, '模型请求', attemptTimeoutMs) as OpenAiResponsesResponse
        assertOpenAiResponsesPayloadSucceeded(payload)

        return {
          payload,
          status: result.status,
        }
      }))
    ), {
      maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
      attemptTimeoutCapMs: input.attemptTimeoutCapMs ?? resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort),
      timeoutMs: input.timeoutMs,
      actionLabel: '模型请求',
      onRetry: ({ attempt, maxAttempts, attemptTimeoutMs, delayMs, error }) => {
        emitRequestTelemetry(input.telemetryCollector, {
          kind: 'retry_scheduled',
          requestLabel: input.requestLabel ?? 'optimizer',
          protocol: this.protocol,
          endpointKind: 'responses',
          endpoint,
          attempt,
          maxAttempts,
          timeoutMs: attemptTimeoutMs,
          elapsedMs: null,
          status: getTelemetryStatus(error),
          retriable: getTelemetryRetriable(error),
          message: `retry in ${delayMs}ms: ${getTelemetryMessage(error)}`,
        })
      },
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
    const requestStartedAt = Date.now()

    if (input.endpointMode === 'responses') {
      return this.requestJsonViaResponsesApi(input, reasoningEffort)
    }

    if (input.endpointMode === 'responses_preferred') {
      const preferredInput = createOpenAiCompatibleResponsesPreferredInput(input, reasoningEffort)
      try {
        return await this.requestJsonViaResponsesApi(preferredInput, reasoningEffort)
      } catch (error) {
        if (!shouldFallbackOpenAiCompatibleResponsesPreferredError(error)) {
          throw error
        }
        emitRequestTelemetry(input.telemetryCollector, {
          kind: 'fallback',
          requestLabel: input.requestLabel ?? 'optimizer',
          protocol: this.protocol,
          endpointKind: 'responses',
          endpoint: appendToBasePath(this.settings.cpamcBaseUrl, 'responses'),
          attempt: null,
          maxAttempts: preferredInput.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
          timeoutMs: resolveOpenAiCompatibleChatFallbackTimeoutMs(preferredInput, reasoningEffort, error),
          elapsedMs: null,
          status: getTelemetryStatus(error),
          retriable: getTelemetryRetriable(error),
          message: buildOpenAiCompatibleResponsesFallbackMessage(error),
          fallbackEndpointKind: 'chat_completions',
        })

        return this.requestJsonViaChatCompletions(
          createOpenAiCompatibleChatFallbackInput(preferredInput, reasoningEffort, error),
          reasoningEffort,
        )
      }
    }

    if (input.endpointMode === 'chat') {
      return this.requestJsonViaChatCompletions(
        createOpenAiCompatibleChatPrimaryInput(input, reasoningEffort),
        reasoningEffort,
      )
    }

    if (shouldPreferResponsesApi(input.model, input.requestLabel)) {
      try {
        return await this.requestJsonViaResponsesApi(input, reasoningEffort)
      } catch (error) {
        if (!shouldFallbackOpenAiCompatibleResponsesError(error)) {
          throw error
        }
        emitRequestTelemetry(input.telemetryCollector, {
          kind: 'fallback',
          requestLabel: input.requestLabel ?? 'optimizer',
          protocol: this.protocol,
          endpointKind: 'responses',
          endpoint: appendToBasePath(this.settings.cpamcBaseUrl, 'responses'),
          attempt: null,
          maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
          timeoutMs: resolveOpenAiCompatibleChatFallbackTimeoutMs(input, reasoningEffort, error),
          elapsedMs: null,
          status: getTelemetryStatus(error),
          retriable: getTelemetryRetriable(error),
          message: buildOpenAiCompatibleResponsesFallbackMessage(error),
          fallbackEndpointKind: 'chat_completions',
        })

        return this.requestJsonViaChatCompletions(
          createOpenAiCompatibleChatFallbackInput(input, reasoningEffort, error),
          reasoningEffort,
        )
      }
    }

    try {
      return await this.requestJsonViaChatCompletions(
        createOpenAiCompatibleChatPrimaryInput(input, reasoningEffort),
        reasoningEffort,
      )
    } catch (error) {
      if (!shouldFallbackOpenAiCompatibleChatError(input, error)) {
        throw error
      }
      const fallbackTimeoutMs = resolveOpenAiCompatibleResponsesFallbackTimeoutMs(input, requestStartedAt)
      emitRequestTelemetry(input.telemetryCollector, {
        kind: 'fallback',
        requestLabel: input.requestLabel ?? 'optimizer',
        protocol: this.protocol,
        endpointKind: 'chat_completions',
        endpoint: appendToBasePath(this.settings.cpamcBaseUrl, 'chat/completions'),
        attempt: null,
        maxAttempts: input.maxAttempts ?? DEFAULT_MODEL_REQUEST_MAX_ATTEMPTS,
        timeoutMs: fallbackTimeoutMs,
        elapsedMs: null,
        status: getTelemetryStatus(error),
        retriable: getTelemetryRetriable(error),
        message: buildOpenAiCompatibleChatFallbackMessage(error),
        fallbackEndpointKind: 'responses',
      })

      return this.requestJsonViaResponsesApi(
        createOpenAiCompatibleResponsesFallbackInput(input, requestStartedAt),
        reasoningEffort,
      )
    }
  }
}

function shouldSendTemperature(model: string, reasoningEffort: ReasoningEffort) {
  if (isGpt5FamilyModel(model) && reasoningEffort !== 'default' && reasoningEffort !== 'none') {
    return false
  }

  return true
}

function shouldPreferResponsesApi(model: string, requestLabel?: ProviderRequestLabel) {
  if (!isGpt5FamilyModel(model)) {
    return false
  }

  return requestLabel === 'judge' || requestLabel === 'goal_anchor'
}

function shouldFallbackOpenAiCompatibleResponsesError(error: unknown) {
  if (isMissingChatCompletionsEndpoint(error)) {
    return true
  }

  const message = getTelemetryMessage(error)
  return /(request timeout|response body timeout|auth_unavailable|internal_error|internal server error|internal_server_error|received from peer|\beof\b)/i.test(message)
}

function resolveOpenAiCompatibleChatFallbackTimeoutMs(
  input: ProviderJsonRequest,
  reasoningEffort: ReasoningEffort,
  error: unknown,
) {
  if (isMissingChatCompletionsEndpoint(error)) {
    return input.timeoutMs
  }

  return Math.min(
    input.timeoutMs,
    input.attemptTimeoutCapMs ?? resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort),
    Math.max(1, Math.floor(input.timeoutMs / 2)),
  )
}

function createOpenAiCompatibleChatFallbackInput(
  input: ProviderJsonRequest,
  reasoningEffort: ReasoningEffort,
  error: unknown,
): ProviderJsonRequest {
  if (isMissingChatCompletionsEndpoint(error)) {
    return input
  }

  return {
    ...input,
    maxAttempts: 1,
    timeoutMs: resolveOpenAiCompatibleChatFallbackTimeoutMs(input, reasoningEffort, error),
    attemptTimeoutCapMs: resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort),
  }
}

function createOpenAiCompatibleChatPrimaryInput(
  input: ProviderJsonRequest,
  reasoningEffort: ReasoningEffort,
) {
  if (input.requestLabel !== 'optimizer' || !isGpt5FamilyModel(input.model)) {
    return input
  }

  const attemptTimeoutCapMs = input.attemptTimeoutCapMs
    ?? resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort)

  return {
    ...input,
    maxAttempts: 1,
    attemptTimeoutCapMs: Math.max(attemptTimeoutCapMs, input.timeoutMs),
  }
}

function createOpenAiCompatibleResponsesPreferredInput(
  input: ProviderJsonRequest,
  reasoningEffort: ReasoningEffort,
) {
  if (input.requestLabel !== 'optimizer' || !isGpt5FamilyModel(input.model)) {
    return input
  }

  const attemptTimeoutCapMs = input.attemptTimeoutCapMs
    ?? resolveDefaultModelRequestAttemptTimeoutCapMs(input.model, reasoningEffort)

  return {
    ...input,
    attemptTimeoutCapMs: Math.max(attemptTimeoutCapMs, input.timeoutMs),
  }
}

function buildOpenAiCompatibleResponsesFallbackMessage(error: unknown) {
  if (isMissingChatCompletionsEndpoint(error)) {
    return getTelemetryMessage(error)
  }

  return `responses request failed; falling back to chat/completions: ${getTelemetryMessage(error)}`
}

function shouldFallbackOpenAiCompatibleResponsesPreferredError(error: unknown) {
  return isMissingChatCompletionsEndpoint(error)
}

function shouldFallbackOpenAiCompatibleChatError(
  input: ProviderJsonRequest,
  error: unknown,
) {
  if (isMissingChatCompletionsEndpoint(error)) {
    return true
  }

  if (input.requestLabel !== 'optimizer' || !isGpt5FamilyModel(input.model)) {
    return false
  }

  if (isOpenAiCompatibleChatCapabilityMismatch(error)) {
    return true
  }

  return false
}

function isOpenAiCompatibleChatCapabilityMismatch(error: unknown) {
  const status = getTelemetryStatus(error)
  if (status !== 400 && status !== 404 && status !== 422) {
    return false
  }

  const message = getTelemetryMessage(error)
  return /(unsupported|not supported|unknown parameter|unknown field|invalid parameter|reasoning[_ ]?effort|capability mismatch|responses api only)/i.test(message)
}

function buildOpenAiCompatibleChatFallbackMessage(error: unknown) {
  if (isMissingChatCompletionsEndpoint(error)) {
    return getTelemetryMessage(error)
  }

  return `chat/completions request failed; falling back to responses: ${getTelemetryMessage(error)}`
}

function resolveOpenAiCompatibleResponsesFallbackTimeoutMs(
  input: ProviderJsonRequest,
  requestStartedAt: number,
) {
  return Math.max(1, resolveRemainingTimeoutMs(requestStartedAt, input.timeoutMs))
}

function createOpenAiCompatibleResponsesFallbackInput(
  input: ProviderJsonRequest,
  requestStartedAt: number,
): ProviderJsonRequest {
  const fallbackTimeoutMs = resolveOpenAiCompatibleResponsesFallbackTimeoutMs(input, requestStartedAt)

  return {
    ...input,
    maxAttempts: 1,
    timeoutMs: fallbackTimeoutMs,
    attemptTimeoutCapMs: fallbackTimeoutMs,
  }
}

function assertOpenAiResponsesPayloadSucceeded(response: OpenAiResponsesResponse) {
  const text = extractOpenAiResponsesText(response)
  if (text) {
    return
  }

  if (response.error?.message) {
    throw new Error(response.error.message)
  }
}

async function requestWithTelemetryRetry<T>(
  operation: (input: { attempt: number; maxAttempts: number; attemptTimeoutMs: number }) => Promise<T>,
  options: {
    maxAttempts: number
    attemptTimeoutCapMs?: number
    timeoutMs: number
    actionLabel: string
    onRetry?: (input: {
      attempt: number
      maxAttempts: number
      attemptTimeoutMs: number
      delayMs: number
      error: unknown
    }) => void
  },
) {
  let attempt = 0
  let lastError: unknown
  const startedAt = Date.now()

  while (attempt < options.maxAttempts) {
    const currentAttempt = attempt + 1
    const attemptTimeoutMs = resolveAttemptTimeoutMs(startedAt, options.timeoutMs, options.attemptTimeoutCapMs)
    if (attemptTimeoutMs <= 0) {
      throw lastError ?? createRequestTimeoutError(options.actionLabel, options.timeoutMs)
    }

    try {
      return await operation({
        attempt: currentAttempt,
        maxAttempts: options.maxAttempts,
        attemptTimeoutMs,
      })
    } catch (error) {
      lastError = error
      attempt = currentAttempt
      const retriable = isRetriableRequestError(error)
      if (!retriable || attempt >= options.maxAttempts) {
        throw error
      }
      const remainingTimeoutMs = resolveRemainingTimeoutMs(startedAt, options.timeoutMs)
      const retryDelayMs = resolveRetryDelayMs(attempt, remainingTimeoutMs, options.maxAttempts)
      if (retryDelayMs <= 0) {
        throw error
      }
      options.onRetry?.({
        attempt: currentAttempt,
        maxAttempts: options.maxAttempts,
        attemptTimeoutMs,
        delayMs: retryDelayMs,
        error,
      })
      await wait(retryDelayMs)
    }
  }

  throw lastError
}

async function runProviderAttemptWithTelemetry<T>(input: {
  telemetryCollector?: (event: ProviderRequestTelemetryEvent) => void
  requestLabel: ProviderRequestLabel
  protocol: string
  endpointKind: ProviderEndpointKind
  endpoint: string
  attempt: number
  maxAttempts: number
  timeoutMs: number
}, operation: () => Promise<{ payload: T; status: number }>) {
  const startedAt = Date.now()
  emitRequestTelemetry(input.telemetryCollector, {
    kind: 'attempt_started',
    requestLabel: input.requestLabel,
    protocol: input.protocol,
    endpointKind: input.endpointKind,
    endpoint: input.endpoint,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    timeoutMs: input.timeoutMs,
    elapsedMs: null,
    status: null,
    retriable: null,
    message: 'attempt started',
  })

  try {
    const result = await operation()
    emitRequestTelemetry(input.telemetryCollector, {
      kind: 'attempt_succeeded',
      requestLabel: input.requestLabel,
      protocol: input.protocol,
      endpointKind: input.endpointKind,
      endpoint: input.endpoint,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
      elapsedMs: Date.now() - startedAt,
      status: result.status,
      retriable: false,
      message: 'attempt succeeded',
    })
    return result.payload
  } catch (error) {
    emitRequestTelemetry(input.telemetryCollector, {
      kind: 'attempt_failed',
      requestLabel: input.requestLabel,
      protocol: input.protocol,
      endpointKind: input.endpointKind,
      endpoint: input.endpoint,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
      elapsedMs: Date.now() - startedAt,
      status: getTelemetryStatus(error),
      retriable: getTelemetryRetriable(error),
      message: getTelemetryMessage(error),
    })
    throw error
  }
}

function emitRequestTelemetry(
  collector: ProviderJsonRequest['telemetryCollector'],
  event: Omit<ProviderRequestTelemetryEvent, 'at'>,
) {
  collector?.({
    ...event,
    at: new Date().toISOString(),
  })
}

function getTelemetryStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null
  }

  const numeric = Number((error as { status?: unknown }).status)
  return Number.isFinite(numeric) ? numeric : null
}

function getTelemetryRetriable(error: unknown) {
  if (!error || typeof error !== 'object' || !('retriable' in error)) {
    return null
  }

  return Boolean((error as { retriable?: unknown }).retriable)
}

function getTelemetryMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? 'unknown error')
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

function isRetriableRequestError(error: unknown) {
  if (error instanceof Error && 'retriable' in error) {
    return Boolean((error as Error & { retriable?: boolean }).retriable)
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  return /(fetch failed|timeout|timed out|gateway time-?out|bad gateway|service unavailable|the operation was aborted|aborterror|etimedout|econnreset|econnrefused|socket hang up|\beof\b|upstream connect|upstream timed out|network|\bhttp 000\b)/i.test(message)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
