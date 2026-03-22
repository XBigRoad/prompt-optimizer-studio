export async function parseJsonResponse(response: Response, actionLabel: string, timeoutMs: number) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel, timeoutMs)
  }

  return readResponseJsonWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
}

export async function parseOpenAiResponsesResponse(response: Response, actionLabel: string, timeoutMs: number) {
  if (!response.ok) {
    throw await createHttpError(response, actionLabel, timeoutMs)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/event-stream')) {
    return readResponseJsonWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
  }

  const payload = await readResponseTextWithTimeout(response, actionLabel, resolveBodyReadTimeoutMs(timeoutMs))
  const { parseOpenAiResponsesEventStream } = await import('@/lib/server/providers/parsers')
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

export async function requestWithRetry<T>(
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

  return Math.min(100 * 2 ** (attempt - 1), remainingTimeoutMs - reservedMs)
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

export async function runRequestWithTimeout<T>(
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

  if (status !== 500) {
    return false
  }

  return isRetriableTransientMessage(bodyText)
}

function isRetriableTransientMessage(message: string) {
  return /(fetch failed|timeout|timed out|gateway time-?out|bad gateway|service unavailable|the operation was aborted|aborterror|etimedout|econnreset|econnrefused|socket hang up|\beof\b|upstream connect|upstream timed out|network|\bhttp 000\b)/i.test(message)
}

export function isMissingChatCompletionsEndpoint(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'status' in error
    && (error as { status?: number }).status === 404,
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
