import type { ModelAdapter, OptimizationResult, RoundJudgment } from '@/lib/engine/optimization-cycle'
import { normalizeEscapedMultilineText } from '@/lib/prompt-text'
import { normalizeGoalAnchor } from '@/lib/server/goal-anchor'
import { normalizeGoalAnchorExplanation } from '@/lib/server/goal-anchor-explanation'
import { createProviderAdapter, inferApiProtocol } from '@/lib/server/provider-adapter'
import type { ProviderRequestLabel, ProviderRequestTelemetryEvent } from '@/lib/server/request-telemetry'
import { isGpt5FamilyModel, normalizeReasoningEffort, resolveReasoningEffortTimeoutMs } from '@/lib/reasoning-effort'
import type { GoalAnchor, GoalAnchorExplanation, PromptPackVersion, AppSettings, SteeringItem } from '@/lib/server/types'
import { buildGoalAnchorPrompts, buildJudgePrompts, buildOptimizerPrompts } from '@/lib/server/prompting'

const DEEP_ROUND_OPTIMIZER_RESPONSES_PROMPT_LENGTH = 2600
const DEEP_ROUND_OPTIMIZER_RESPONSES_SYSTEM_LENGTH = 4200

export class CpamcModelAdapter implements ModelAdapter {
  private readonly providerAdapter: ReturnType<typeof createProviderAdapter>

  constructor(
    private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey' | 'scoreThreshold'>,
    private readonly pack: PromptPackVersion,
    private readonly models: {
      optimizerModel: string
      judgeModel: string
      optimizerReasoningEffort?: AppSettings['defaultOptimizerReasoningEffort']
      judgeReasoningEffort?: AppSettings['defaultJudgeReasoningEffort']
    },
  ) {
    this.providerAdapter = createProviderAdapter(settings)
  }

  async optimizePrompt(input: {
    currentPrompt: string
    goalAnchor: GoalAnchor
    pendingSteeringItems?: SteeringItem[]
    threshold: number
  }): Promise<OptimizationResult> {
    const { system, user } = buildOptimizerPrompts({
      pack: this.pack,
      currentPrompt: input.currentPrompt,
      goalAnchor: input.goalAnchor,
      pendingSteeringItems: input.pendingSteeringItems,
      threshold: input.threshold,
    })

    const { payload, requestTelemetry } = await this.requestJson(
      this.models.optimizerModel,
      this.models.optimizerReasoningEffort ?? 'default',
      system,
      user,
      resolveReasoningEffortTimeoutMs(180_000, normalizeReasoningEffort(this.models.optimizerReasoningEffort ?? 'default')),
      'optimizer',
      resolveEndpointModeForOptimizer(this.settings.cpamcBaseUrl, {
        currentPrompt: input.currentPrompt,
        systemPrompt: system,
        model: this.models.optimizerModel,
        reasoningEffort: this.models.optimizerReasoningEffort ?? 'default',
      }),
    )
    return {
      optimizedPrompt: normalizeOptimizedPromptValue(payload, input.currentPrompt),
      strategy: payload.strategy === 'preserve' ? 'preserve' : 'rebuild',
      scoreBefore: normalizeNumericScore(payload.scoreBefore, 0),
      majorChanges: normalizeTextArray(payload.majorChanges),
      mve: normalizeTextValue(payload.mve, 'single run'),
      deadEndSignals: normalizeTextArray(payload.deadEndSignals),
      requestTelemetry,
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

    const { payload, requestTelemetry } = await this.requestJson(
      this.models.judgeModel,
      this.models.judgeReasoningEffort ?? 'default',
      system,
      user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(this.models.judgeReasoningEffort ?? 'default')),
      'judge',
    )
    return {
      score: normalizeNumericScore(payload.score, 0),
      hasMaterialIssues: Boolean(payload.hasMaterialIssues),
      summary: String(payload.summary ?? ''),
      driftLabels: normalizeTextArray(payload.driftLabels),
      driftExplanation: normalizeTextValue(payload.driftExplanation, ''),
      findings: normalizeTextArray(payload.findings),
      suggestedChanges: normalizeTextArray(payload.suggestedChanges),
      requestTelemetry,
    }
  }

  private async requestJson(
    model: string,
    reasoningEffort: AppSettings['defaultOptimizerReasoningEffort'],
    system: string,
    user: string,
    timeoutMs: number,
    requestLabel: ProviderRequestLabel,
    endpointMode: 'auto' | 'chat' | 'responses' | 'responses_preferred' = 'auto',
  ) {
    const requestTelemetry: ProviderRequestTelemetryEvent[] = []

    try {
      const payload = await this.providerAdapter.requestJson({
        model,
        reasoningEffort,
        system,
        user,
        timeoutMs,
        requestLabel,
        endpointMode,
        telemetryCollector: (event) => requestTelemetry.push(event),
      })

      return { payload, requestTelemetry }
    } catch (error) {
      throw attachRequestTelemetry(error, requestTelemetry)
    }
  }
}

function resolveEndpointModeForOptimizer(
  baseUrl: string,
  input: {
    currentPrompt: string
    systemPrompt: string
    model: string
    reasoningEffort: AppSettings['defaultOptimizerReasoningEffort']
  },
): 'auto' | 'responses_preferred' {
  if (inferApiProtocol(baseUrl) !== 'openai-compatible') {
    return 'auto'
  }

  if (!isGpt5FamilyModel(input.model)) {
    return 'auto'
  }

  if (normalizeReasoningEffort(input.reasoningEffort) !== 'xhigh') {
    return 'auto'
  }

  if (input.currentPrompt.length < DEEP_ROUND_OPTIMIZER_RESPONSES_PROMPT_LENGTH) {
    if (input.systemPrompt.length < DEEP_ROUND_OPTIMIZER_RESPONSES_SYSTEM_LENGTH) {
      return 'auto'
    }
  }

  return 'responses_preferred'
}

export async function generateGoalAnchorWithModel(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey' | 'defaultOptimizerReasoningEffort'>,
  model: string,
  rawPrompt: string,
) {
  const { system, user } = buildGoalAnchorPrompts({ rawPrompt })
  const requestTelemetry: ProviderRequestTelemetryEvent[] = []
  const providerAdapter = createProviderAdapter(settings)
  const payload = await providerAdapter.requestJson({
    model,
    reasoningEffort: settings.defaultOptimizerReasoningEffort,
    system,
    user,
    timeoutMs: resolveReasoningEffortTimeoutMs(20_000, normalizeReasoningEffort(settings.defaultOptimizerReasoningEffort)),
    maxAttempts: 2,
    requestLabel: 'goal_anchor',
    telemetryCollector: (event) => requestTelemetry.push(event),
  })
  return {
    goalAnchor: normalizeGoalAnchor(payload as Partial<GoalAnchor>),
    explanation: normalizeGoalAnchorExplanation(payload as Partial<GoalAnchorExplanation>),
  }
}

function attachRequestTelemetry(error: unknown, requestTelemetry: ProviderRequestTelemetryEvent[]) {
  if (error instanceof Error) {
    ;(error as Error & { requestTelemetry?: ProviderRequestTelemetryEvent[] }).requestTelemetry = requestTelemetry
    return error
  }

  const normalizedError = new Error(String(error ?? 'Unknown request error')) as Error & {
    requestTelemetry?: ProviderRequestTelemetryEvent[]
  }
  normalizedError.requestTelemetry = requestTelemetry
  return normalizedError
}

export function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => normalizeTextItem(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeNumericScore(value: unknown, fallback: number) {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate) ? candidate : fallback
}

function normalizeTextValue(value: unknown, fallback: string) {
  const normalized = normalizeTextItem(value)
  return normalized ?? fallback
}

function normalizeOptimizedPromptValue(payload: Record<string, unknown>, fallback: string) {
  const preferredKeys = [
    'optimizedPrompt',
    'optimized_prompt',
    'prompt',
    'rewrittenPrompt',
    'finalPrompt',
    'candidatePrompt',
  ]

  for (const key of preferredKeys) {
    const normalized = normalizeTextItem(payload[key])
    if (normalized) {
      return normalizeEscapedMultilineText(normalized)
    }
  }

  return fallback
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
