import type { ModelAdapter, OptimizationResult, RoundJudgment } from '@/lib/engine/optimization-cycle'
import type { GoalAnchor, PromptPackVersion, AppSettings } from '@/lib/server/types'
import { extractJsonObject } from '@/lib/server/json'
import { buildJudgePrompts, buildOptimizerPrompts } from '@/lib/server/prompting'

interface ChatCompletionChoice {
  message?: {
    content?: string | Array<{ text?: string; type?: string }>
  }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
  error?: {
    message?: string
  }
}

export class CpamcModelAdapter implements ModelAdapter {
  constructor(
    private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey' | 'scoreThreshold'>,
    private readonly pack: PromptPackVersion,
    private readonly models: { optimizerModel: string; judgeModel: string },
  ) {}

  async optimizePrompt(input: {
    currentPrompt: string
    previousFeedback: string[]
    goalAnchor: GoalAnchor
    nextRoundInstruction?: string | null
    threshold: number
  }): Promise<OptimizationResult> {
    const { system, user } = buildOptimizerPrompts({
      pack: this.pack,
      currentPrompt: input.currentPrompt,
      previousFeedback: input.previousFeedback,
      goalAnchor: input.goalAnchor,
      nextRoundInstruction: input.nextRoundInstruction,
      threshold: input.threshold,
    })

    const payload = await this.requestJson(this.models.optimizerModel, system, user, 180_000)
    return {
      optimizedPrompt: String(payload.optimizedPrompt ?? input.currentPrompt),
      strategy: payload.strategy === 'preserve' ? 'preserve' : 'rebuild',
      scoreBefore: Number(payload.scoreBefore ?? 0),
      majorChanges: normalizeTextArray(payload.majorChanges),
      mve: normalizeTextValue(payload.mve, 'Run a single-sample judge validation.'),
      deadEndSignals: normalizeTextArray(payload.deadEndSignals),
    }
  }

  async judgePrompt(prompt: string, judgeIndex: number, goalAnchor?: GoalAnchor): Promise<RoundJudgment> {
    const { system, user } = buildJudgePrompts({
      pack: this.pack,
      candidatePrompt: prompt,
      goalAnchor: goalAnchor ?? {
        goal: 'Keep the original task goal.',
        deliverable: 'Preserve the original requested deliverable.',
        driftGuard: ['Do not drift away from the original task.'],
      },
      threshold: this.settings.scoreThreshold,
      judgeIndex,
    })

    const payload = await this.requestJson(this.models.judgeModel, system, user, 120_000)
    return {
      score: Number(payload.score ?? 0),
      hasMaterialIssues: Boolean(payload.hasMaterialIssues),
      summary: String(payload.summary ?? ''),
      findings: normalizeTextArray(payload.findings),
      suggestedChanges: normalizeTextArray(payload.suggestedChanges),
    }
  }

  private async requestJson(model: string, system: string, user: string, timeoutMs: number) {
    const endpoint = `${this.settings.cpamcBaseUrl.replace(/\/$/, '')}/chat/completions`
    const body = {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
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
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!result.ok) {
        const text = await result.text()
        const error = new Error(`CPAMC request failed (${result.status}): ${text.slice(0, 500)}`)
        if (result.status === 408 || result.status === 429 || result.status >= 500) {
          ;(error as Error & { retriable?: boolean }).retriable = true
        }
        throw error
      }

      return result.json() as Promise<ChatCompletionResponse>
    })

    const content = extractText(response)
    return extractJsonObject(content) as Record<string, unknown>
  }
}

async function requestWithRetry<T>(operation: () => Promise<T>) {
  let attempt = 0
  let lastError: unknown

  while (attempt < 3) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      attempt += 1
      const retriable = error instanceof Error && 'retriable' in error ? Boolean((error as Error & { retriable?: boolean }).retriable) : true
      if (!retriable || attempt >= 3) {
        throw error
      }
      await wait(500 * 2 ** (attempt - 1))
    }
  }

  throw lastError
}

function extractText(response: ChatCompletionResponse) {
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
  throw new Error('CPAMC returned an empty completion.')
}

export function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => normalizeTextItem(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeTextValue(value: unknown, fallback: string) {
  const normalized = normalizeTextItem(value)
  return normalized ?? fallback
}

function normalizeTextItem(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferredKeys = ['text', 'message', 'content', 'summary', 'issue', 'finding', 'suggestion', 'reason']
    for (const key of preferredKeys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }

    try {
      return JSON.stringify(record)
    } catch {
      return null
    }
  }

  if (value == null) {
    return null
  }

  return String(value)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
