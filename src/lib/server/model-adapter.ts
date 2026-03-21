import type { ModelAdapter, OptimizationResult, RoundJudgment } from '@/lib/engine/optimization-cycle'
import { normalizeGoalAnchor, normalizeGoalAnchorExplanation } from '@/lib/server/goal-anchor/index'
import { createProviderAdapter } from '@/lib/server/providers/index'
import { normalizeReasoningEffort, resolveReasoningEffortTimeoutMs } from '@/lib/reasoning-effort'
import type { GoalAnchor, GoalAnchorExplanation, PromptPackVersion, AppSettings, SteeringItem } from '@/lib/contracts'
import { buildGoalAnchorPrompts, buildJudgePrompts, buildOptimizerPrompts } from '@/lib/server/prompting'

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
    previousFeedback: string[]
    goalAnchor: GoalAnchor
    pendingSteeringItems?: SteeringItem[]
    threshold: number
  }): Promise<OptimizationResult> {
    const { system, user } = buildOptimizerPrompts({
      pack: this.pack,
      currentPrompt: input.currentPrompt,
      previousFeedback: input.previousFeedback,
      goalAnchor: input.goalAnchor,
      pendingSteeringItems: input.pendingSteeringItems,
      threshold: input.threshold,
    })

    const payload = await this.requestJson(
      this.models.optimizerModel,
      this.models.optimizerReasoningEffort ?? 'default',
      system,
      user,
      resolveReasoningEffortTimeoutMs(180_000, normalizeReasoningEffort(this.models.optimizerReasoningEffort ?? 'default')),
    )
    return {
      optimizedPrompt: String(payload.optimizedPrompt ?? input.currentPrompt),
      strategy: payload.strategy === 'preserve' ? 'preserve' : 'rebuild',
      scoreBefore: normalizeNumericScore(payload.scoreBefore, 0),
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

    const payload = await this.requestJson(
      this.models.judgeModel,
      this.models.judgeReasoningEffort ?? 'default',
      system,
      user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(this.models.judgeReasoningEffort ?? 'default')),
    )
    return {
      score: normalizeNumericScore(payload.score, 0),
      hasMaterialIssues: Boolean(payload.hasMaterialIssues),
      summary: String(payload.summary ?? ''),
      driftLabels: normalizeTextArray(payload.driftLabels),
      driftExplanation: normalizeTextValue(payload.driftExplanation, ''),
      findings: normalizeTextArray(payload.findings),
      suggestedChanges: normalizeTextArray(payload.suggestedChanges),
    }
  }

  private async requestJson(
    model: string,
    reasoningEffort: AppSettings['defaultOptimizerReasoningEffort'],
    system: string,
    user: string,
    timeoutMs: number,
  ) {
    return this.providerAdapter.requestJson({ model, reasoningEffort, system, user, timeoutMs })
  }
}

export async function generateGoalAnchorWithModel(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey' | 'defaultOptimizerReasoningEffort'>,
  model: string,
  rawPrompt: string,
) {
  const { system, user } = buildGoalAnchorPrompts({ rawPrompt })
  const payload = await createProviderAdapter(settings).requestJson({
    model,
    reasoningEffort: settings.defaultOptimizerReasoningEffort,
    system,
    user,
    timeoutMs: resolveReasoningEffortTimeoutMs(20_000, normalizeReasoningEffort(settings.defaultOptimizerReasoningEffort)),
    maxAttempts: 2,
  })
  return {
    goalAnchor: normalizeGoalAnchor(payload as Partial<GoalAnchor>),
    explanation: normalizeGoalAnchorExplanation(payload as Partial<GoalAnchorExplanation>),
  }
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
