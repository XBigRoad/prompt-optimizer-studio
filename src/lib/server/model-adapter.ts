import type { ModelAdapter, OptimizationResult, RoundJudgment } from '@/lib/engine/optimization-cycle'
import { normalizeGoalAnchor } from '@/lib/server/goal-anchor'
import { normalizeGoalAnchorExplanation } from '@/lib/server/goal-anchor-explanation'
import { createProviderAdapter } from '@/lib/server/provider-adapter'
import type { GoalAnchor, GoalAnchorExplanation, PromptPackVersion, AppSettings, SteeringItem } from '@/lib/server/types'
import { buildGoalAnchorPrompts, buildJudgePrompts, buildOptimizerPrompts } from '@/lib/server/prompting'

export class CpamcModelAdapter implements ModelAdapter {
  private readonly providerAdapter: ReturnType<typeof createProviderAdapter>

  constructor(
    private readonly settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey' | 'scoreThreshold'>,
    private readonly pack: PromptPackVersion,
    private readonly models: { optimizerModel: string; judgeModel: string },
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
      driftLabels: normalizeTextArray(payload.driftLabels),
      driftExplanation: normalizeTextValue(payload.driftExplanation, ''),
      findings: normalizeTextArray(payload.findings),
      suggestedChanges: normalizeTextArray(payload.suggestedChanges),
    }
  }

  private async requestJson(model: string, system: string, user: string, timeoutMs: number) {
    return this.providerAdapter.requestJson({ model, system, user, timeoutMs })
  }
}

export async function generateGoalAnchorWithModel(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>,
  model: string,
  rawPrompt: string,
) {
  const { system, user } = buildGoalAnchorPrompts({ rawPrompt })
  const payload = await createProviderAdapter(settings).requestJson({
    model,
    system,
    user,
    timeoutMs: 12_000,
    maxAttempts: 1,
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
