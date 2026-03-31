import type { ModelAdapter, OptimizationResult, RoundJudgment } from '@/lib/engine/optimization-cycle'
import { analyzePromptShape, describePromptShapeSignals } from '@/lib/prompt-shape'
import { areEquivalentPromptTexts } from '@/lib/prompt-text'
import {
  getInvalidStructuredScoreFallbackSummary,
  getMissingReviewSummaryFallback,
  getReviewFallbackSummary,
} from '@/lib/review-fallbacks'
import { sanitizeVisibleReviewCopy } from '@/lib/review-summary'
import { normalizeGoalAnchor } from '@/lib/server/goal-anchor'
import { normalizeGoalAnchorExplanation } from '@/lib/server/goal-anchor-explanation'
import { calibrateJudgeOutput } from '@/lib/server/judge-sanity'
import {
  collectBelowMaxDimensionReasons,
  isDefaultCompatibleRubricDimensions,
  normalizeDimensionReasons,
  normalizeDimensionScores,
  parseRubricDimensions,
  type RubricDimension,
} from '@/lib/server/rubric-dimensions'
import { createProviderAdapter } from '@/lib/server/provider-adapter'
import { normalizeReasoningEffort, resolveReasoningEffortTimeoutMs } from '@/lib/reasoning-effort'
import type { GoalAnchor, GoalAnchorExplanation, PromptPackVersion, AppSettings, SteeringItem } from '@/lib/server/types'
import {
  buildGoalAnchorPrompts,
  buildJudgeConsistencyRepairPrompts,
  buildJudgePrompts,
  buildJudgeTopBandRecheckPrompts,
  buildJudgeTopBandRegradePrompts,
  buildOptimizerPrompts,
} from '@/lib/server/prompting'

const HIGH_BAND_DIMENSION_MINIMUMS: Record<string, number> = {
  d2: 9,
  d3: 14,
  d4: 14,
  d6: 9,
}

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
    reviewFeedbackItems?: string[]
  }): Promise<OptimizationResult> {
    const expectedLanguage = detectPromptLanguage(input.currentPrompt)
    const basePrompts = buildOptimizerPrompts({
      pack: this.pack,
      currentPrompt: input.currentPrompt,
      goalAnchor: input.goalAnchor,
      pendingSteeringItems: input.pendingSteeringItems,
      reviewFeedbackItems: input.reviewFeedbackItems,
    })

    const payload = await this.requestJson(
      this.models.optimizerModel,
      this.models.optimizerReasoningEffort ?? 'default',
      basePrompts.system,
      basePrompts.user,
      resolveReasoningEffortTimeoutMs(180_000, normalizeReasoningEffort(this.models.optimizerReasoningEffort ?? 'default')),
    )
    let result = parseOptimizationPayload(payload, input.currentPrompt, expectedLanguage)

    if (shouldRetryEquivalentOptimization(input.currentPrompt, result.optimizedPrompt, input.reviewFeedbackItems ?? [])) {
      const retryPrompts = buildEquivalentRetryPrompts(basePrompts, input.currentPrompt, expectedLanguage)
      const retryPayload = await this.requestJson(
        this.models.optimizerModel,
        this.models.optimizerReasoningEffort ?? 'default',
        retryPrompts.system,
        retryPrompts.user,
        resolveReasoningEffortTimeoutMs(180_000, normalizeReasoningEffort(this.models.optimizerReasoningEffort ?? 'default')),
      )
      result = parseOptimizationPayload(retryPayload, input.currentPrompt, expectedLanguage)
    }

    return result
  }

  async judgePrompt(prompt: string, judgeIndex: number, goalAnchor?: GoalAnchor): Promise<RoundJudgment> {
    const resolvedGoalAnchor = goalAnchor ?? {
      goal: 'Keep the original task goal.',
      deliverable: 'Preserve the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    }
    const prompts = buildJudgePrompts({
      pack: this.pack,
      candidatePrompt: prompt,
      goalAnchor: resolvedGoalAnchor,
      threshold: this.settings.scoreThreshold,
      judgeIndex,
    })
    const { system, user } = prompts
    const expectedLanguage = detectPromptLanguage(prompt)
    const rubricDimensions = parseRubricDimensions(this.pack.rubricMd)
    const usesDefaultTopBandPolicy = isDefaultCompatibleRubricDimensions(rubricDimensions)

    let payload = await this.requestJson(
      this.models.judgeModel,
      this.models.judgeReasoningEffort ?? 'default',
      system,
      user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(this.models.judgeReasoningEffort ?? 'default')),
    )
    let structuredSignals = readStructuredJudgeSignals(payload, rubricDimensions)
    if (rubricDimensions.length > 0 && !structuredSignals.isValid) {
      const repairPrompts = buildStructuredJudgeRepairPrompts(prompts, expectedLanguage, rubricDimensions)
      payload = await this.requestJson(
        this.models.judgeModel,
        this.models.judgeReasoningEffort ?? 'default',
        repairPrompts.system,
        repairPrompts.user,
        resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(this.models.judgeReasoningEffort ?? 'default')),
      )
      structuredSignals = readStructuredJudgeSignals(payload, rubricDimensions)
    }

    let baseReview = buildJudgeReviewFromPayload({
      payload,
      structuredSignals,
      rubricDimensions,
      expectedLanguage,
    })
    const suspiciousBaseStructuredReview = usesDefaultTopBandPolicy
      && isSuspiciousHighStructuredReview({
        score: baseReview.score,
        dimensionScores: baseReview.dimensionScores,
        dimensionReasons: baseReview.dimensionReasons,
        dimensions: rubricDimensions,
      })
    if (
      shouldApplyConsistencyRepair(prompt, baseReview, structuredSignals)
      || suspiciousBaseStructuredReview
    ) {
      const repaired = await applyEvidenceBoundConsistencyRepair({
        prompt,
        goalAnchor: resolvedGoalAnchor,
        judgeIndex,
        rubricDimensions,
        expectedLanguage,
        judgeReasoningEffort: this.models.judgeReasoningEffort ?? 'default',
        requestJson: (systemPrompt, userPrompt, timeoutMs) => this.requestJson(
          this.models.judgeModel,
          this.models.judgeReasoningEffort ?? 'default',
          systemPrompt,
          userPrompt,
          timeoutMs,
        ),
      })
      if (repaired) {
        payload = repaired.payload
        structuredSignals = repaired.structuredSignals
        baseReview = repaired.review
      } else if (suspiciousBaseStructuredReview) {
        baseReview = buildNonCredibleTopBandReview({
          expectedLanguage,
          review: baseReview,
          recheckFindings: [],
        })
      }
    }

    const topBandReviewed = usesDefaultTopBandPolicy
      ? await maybeApplyTopBandRecheck({
        prompt,
        judgeIndex,
        goalAnchor: resolvedGoalAnchor,
        structuredSignals,
        rubricDimensions,
        expectedLanguage,
        judgeReasoningEffort: this.models.judgeReasoningEffort ?? 'default',
        requestJson: (systemPrompt, userPrompt, timeoutMs) => this.requestJson(
          this.models.judgeModel,
          this.models.judgeReasoningEffort ?? 'default',
          systemPrompt,
          userPrompt,
          timeoutMs,
        ),
        review: baseReview,
      })
      : baseReview

    const calibratedReview = calibrateJudgeOutput({
      expectedLanguage,
      review: topBandReviewed,
    })
    const visibleReview = sanitizeVisibleReviewCopy({
      summary: normalizeReviewSummary(calibratedReview.summary, {
        expectedLanguage,
      }),
      findings: calibratedReview.findings,
      suggestedChanges: calibratedReview.suggestedChanges,
      dimensionReasons: calibratedReview.dimensionReasons ?? [],
    })

    return {
      score: calibratedReview.score,
      hasMaterialIssues: calibratedReview.hasMaterialIssues,
      summary: visibleReview.summary,
      driftLabels: calibratedReview.driftLabels,
      driftExplanation: calibratedReview.driftExplanation,
      findings: visibleReview.findings,
      suggestedChanges: visibleReview.suggestedChanges,
      dimensionScores: calibratedReview.dimensionScores ?? null,
      dimensionReasons: calibratedReview.dimensionReasons ?? [],
      rubricDimensionsSnapshot: rubricDimensions.length > 0 ? rubricDimensions : null,
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
    goalAnchor: normalizeGoalAnchor({
      goal: readPayloadValue(payload, 'goal'),
      deliverable: readPayloadValue(payload, 'deliverable'),
      driftGuard: readPayloadValue(payload, 'driftGuard', 'drift_guard'),
    } as Partial<GoalAnchor>),
    explanation: normalizeGoalAnchorExplanation({
      sourceSummary: readPayloadValue(payload, 'sourceSummary', 'source_summary'),
      rationale: readPayloadValue(payload, 'rationale'),
    } as Partial<GoalAnchorExplanation>),
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

function readPayloadValue(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in payload) {
      return payload[key]
    }
  }

  return undefined
}

function normalizeLocalizedTextArray(
  value: unknown,
  expectedLanguage: 'zh-CN' | 'en',
  fallback?: string,
) {
  const normalized = normalizeTextArray(value)
  const filtered = normalized.filter((item) => matchesExpectedLanguage(item, expectedLanguage))
  if (filtered.length > 0) {
    return filtered
  }
  return normalized.length > 0 && fallback ? [fallback] : []
}

function normalizeNumericScore(value: unknown, fallback: number) {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate) ? candidate : fallback
}

function normalizeScoreInRange(value: unknown, fallback: number) {
  return clampScore(normalizeNumericScore(value, fallback))
}

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score))
}

function normalizeTextValue(value: unknown, fallback: string) {
  const normalized = normalizeTextItem(value)
  return normalized ?? fallback
}

function normalizeLocalizedTextValue(
  value: unknown,
  fallback: string,
  expectedLanguage: 'zh-CN' | 'en',
) {
  const normalized = normalizeTextValue(value, fallback)
  if (!normalized.trim()) {
    return fallback
  }

  return matchesExpectedLanguage(normalized, expectedLanguage) ? normalized : fallback
}

function normalizeReviewSummary(
  value: unknown,
  input: {
    expectedLanguage: 'zh-CN' | 'en'
  },
) {
  const normalized = normalizeTextItem(value)
  if (normalized && matchesExpectedLanguage(normalized, input.expectedLanguage)) {
    return normalized
  }

  if (normalized) {
    return getReviewFallbackSummary(input.expectedLanguage)
  }

  return getMissingReviewSummaryFallback(input.expectedLanguage)
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

function detectPromptLanguage(value: string): 'zh-CN' | 'en' {
  return /[\u3400-\u9fff]/.test(value) ? 'zh-CN' : 'en'
}

function matchesExpectedLanguage(value: string, expectedLanguage: 'zh-CN' | 'en') {
  const hasCjk = /[\u3400-\u9fff]/.test(value)
  const hasLatin = /[A-Za-z]/.test(value)

  if (expectedLanguage === 'zh-CN') {
    return hasCjk || !hasLatin
  }

  return hasLatin || !hasCjk
}

function sanitizeOptimizedPrompt(value: string, currentPrompt: string) {
  const lines = value.split(/\r?\n/)
  const cleaned: string[] = []
  let strippingGoalAnchor = false
  let strippingSteering = false
  let strippingLint = false

  for (const line of lines) {
    const trimmed = line.trim()
    const normalized = trimmed.toLowerCase()

    if (!trimmed) {
      strippingGoalAnchor = false
      strippingSteering = false
      strippingLint = false
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== '') {
        cleaned.push('')
      }
      continue
    }

    if (matchesWrapperInstruction(trimmed) && !currentPrompt.includes(trimmed)) {
      strippingGoalAnchor = normalized.startsWith('non-negotiable goal anchor') || normalized === 'goal anchor:'
      strippingSteering = normalized.startsWith('user steering for the next round')
      strippingLint = normalized.startsWith('local lint findings to resolve before broad rewrites')
        || trimmed.startsWith('本地结构提示')
      continue
    }

    if ((strippingGoalAnchor && looksLikeGoalAnchorLine(trimmed)) || (strippingSteering && looksLikeEnumeratedSupportLine(trimmed)) || (strippingLint && looksLikeEnumeratedSupportLine(trimmed))) {
      continue
    }

    if (/^<<<BEGIN .*>>>$/i.test(trimmed) || /^<<<END .*>>>$/i.test(trimmed)) {
      continue
    }

    cleaned.push(line)
    strippingGoalAnchor = false
    strippingSteering = false
    strippingLint = false
  }

  const normalized = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return normalized || currentPrompt
}

function parseOptimizationPayload(
  payload: Record<string, unknown>,
  currentPrompt: string,
  expectedLanguage: 'zh-CN' | 'en',
): OptimizationResult {
  return {
    optimizedPrompt: sanitizeOptimizedPrompt(
      String(readPayloadValue(payload, 'optimizedPrompt', 'optimized_prompt') ?? currentPrompt),
      currentPrompt,
    ),
    strategy: payload.strategy === 'preserve' ? 'preserve' : 'rebuild',
    scoreBefore: normalizeNumericScore(readPayloadValue(payload, 'scoreBefore', 'score_before'), 0),
    majorChanges: normalizeLocalizedTextArray(
      readPayloadValue(payload, 'majorChanges', 'major_changes'),
      expectedLanguage,
      expectedLanguage === 'zh-CN'
        ? '本轮已生成新版本，但模型返回了异语言改动摘要；请以上方新版本正文为准。'
        : 'A new version was generated, but the model returned a different-language change summary; use the prompt body as the source of truth.',
    ),
    mve: normalizeLocalizedTextValue(
      readPayloadValue(payload, 'mve'),
      expectedLanguage === 'zh-CN' ? '先做一轮最小验证。' : 'Run one minimal verification pass.',
      expectedLanguage,
    ),
    deadEndSignals: normalizeLocalizedTextArray(readPayloadValue(payload, 'deadEndSignals', 'dead_end_signals'), expectedLanguage),
  }
}

function buildJudgeReviewFromPayload(input: {
  payload: Record<string, unknown>
  structuredSignals: ReturnType<typeof readStructuredJudgeSignals>
  rubricDimensions: RubricDimension[]
  expectedLanguage: 'zh-CN' | 'en'
}) {
  const driftLabels = normalizeTextArray(readPayloadValue(input.payload, 'driftLabels', 'drift_labels'))
  const reviewCore = {
    hasMaterialIssues: Boolean(readPayloadValue(input.payload, 'hasMaterialIssues', 'has_material_issues')),
    summary: normalizeTextValue(readPayloadValue(input.payload, 'summary'), ''),
    driftLabels,
    driftExplanation: normalizeLocalizedTextValue(readPayloadValue(input.payload, 'driftExplanation', 'drift_explanation'), '', input.expectedLanguage),
    findings: normalizeLocalizedTextArray(
      readPayloadValue(input.payload, 'findings'),
      input.expectedLanguage,
      input.expectedLanguage === 'zh-CN'
        ? '本轮发现若干问题，但模型返回了异语言诊断；请结合当前分数与上下文继续判断。'
        : 'Issues were detected, but the model returned diagnostics in another language; use the score and context to continue judging.',
    ),
    suggestedChanges: normalizeLocalizedTextArray(
      readPayloadValue(input.payload, 'suggestedChanges', 'suggested_changes'),
      input.expectedLanguage,
      input.expectedLanguage === 'zh-CN'
        ? '本轮给出了改进方向，但模型返回了异语言建议；请优先参考当前任务语境。'
        : 'Suggestions were produced, but they came back in another language; prioritize the current task context.',
    ),
  }

  if (input.rubricDimensions.length === 0) {
    return {
      score: normalizeScoreInRange(readPayloadValue(input.payload, 'score'), 0),
      ...reviewCore,
      dimensionScores: null,
      dimensionReasons: [] as string[],
    }
  }

  if (!input.structuredSignals.isValid) {
    return {
      score: 0,
      ...reviewCore,
      hasMaterialIssues: true,
      summary: getInvalidStructuredScoreFallbackSummary(input.expectedLanguage),
      dimensionScores: null,
      dimensionReasons: [] as string[],
    }
  }

  return {
    score: normalizeScoreInRange(input.structuredSignals.totalScore, 0),
    ...reviewCore,
    dimensionScores: input.structuredSignals.dimensionScores,
    dimensionReasons: input.structuredSignals.belowMaxDimensionReasons,
  }
}

function readStructuredJudgeSignals(
  payload: Record<string, unknown>,
  dimensions: RubricDimension[],
) {
  if (dimensions.length === 0) {
    return {
      isValid: false,
      totalScore: null,
      dimensionScores: null,
      dimensionReasonsMap: null,
      belowMaxDimensionReasons: [] as string[],
    }
  }

  const dimensionScores = normalizeDimensionScores(
    readPayloadValue(payload, 'dimensionScores', 'dimension_scores'),
    dimensions,
  )
  const dimensionReasonsMap = normalizeDimensionReasons(
    readPayloadValue(payload, 'dimensionReasons', 'dimension_reasons'),
    dimensions,
  )

  if (!dimensionScores || !dimensionReasonsMap) {
    return {
      isValid: false,
      totalScore: null,
      dimensionScores: null,
      dimensionReasonsMap: null,
      belowMaxDimensionReasons: [] as string[],
    }
  }

  return {
    isValid: true,
    totalScore: Object.values(dimensionScores).reduce((sum, score) => sum + score, 0),
    dimensionScores,
    dimensionReasonsMap,
    belowMaxDimensionReasons: collectBelowMaxDimensionReasons({
      dimensions,
      scores: dimensionScores,
      reasons: dimensionReasonsMap,
    }),
  }
}

async function applyEvidenceBoundConsistencyRepair(input: {
  prompt: string
  goalAnchor: GoalAnchor
  judgeIndex: number
  rubricDimensions: RubricDimension[]
  expectedLanguage: 'zh-CN' | 'en'
  judgeReasoningEffort: AppSettings['defaultJudgeReasoningEffort']
  requestJson: (system: string, user: string, timeoutMs: number) => Promise<Record<string, unknown>>
}) {
  const repairPrompts = buildJudgeConsistencyRepairPrompts({
    candidatePrompt: input.prompt,
    goalAnchor: input.goalAnchor,
    judgeIndex: input.judgeIndex,
    dimensionIds: input.rubricDimensions.map((dimension) => dimension.id),
    dimensionLimits: input.rubricDimensions.map((dimension) => `${dimension.id}<=${dimension.max}`),
    missingSignals: describePromptShapeSignals(analyzePromptShape(input.prompt), input.expectedLanguage),
  })
  let repairedPayload: Record<string, unknown>
  try {
    repairedPayload = await input.requestJson(
      repairPrompts.system,
      repairPrompts.user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(input.judgeReasoningEffort ?? 'default')),
    )
  } catch {
    return null
  }
  const repairedSignals = readStructuredJudgeSignals(repairedPayload, input.rubricDimensions)
  if (!repairedSignals.isValid) {
    return null
  }

  return {
    payload: repairedPayload,
    structuredSignals: repairedSignals,
    review: buildJudgeReviewFromPayload({
      payload: repairedPayload,
      structuredSignals: repairedSignals,
      rubricDimensions: input.rubricDimensions,
      expectedLanguage: input.expectedLanguage,
    }),
  }
}

function isSuspiciousHighStructuredReview(input: {
  score: number
  dimensionScores: Record<string, number> | null
  dimensionReasons: string[]
  dimensions: RubricDimension[]
}) {
  if (input.score < 95 || !input.dimensionScores || input.dimensions.length === 0) {
    return false
  }

  const maxedDimensionCount = input.dimensions
    .filter((dimension) => (input.dimensionScores?.[dimension.id] ?? 0) >= dimension.max)
    .length

  return input.dimensionReasons.length <= 2 || maxedDimensionCount >= input.dimensions.length - 2
}

function shouldApplyConsistencyRepair(
  prompt: string,
  review: {
    score: number
    hasMaterialIssues: boolean
    dimensionReasons: string[]
  },
  structuredSignals: ReturnType<typeof readStructuredJudgeSignals>,
) {
  if (!structuredSignals.isValid) {
    return false
  }

  const analysis = analyzePromptShape(prompt)
  const hasHighScoreShapeGaps = analysis.missingTopBandSignals.length >= 3
  if (!analysis.isThinShell && !analysis.looksLikeBareRequest && !analysis.isUnderSpecified && !hasHighScoreShapeGaps) {
    return false
  }

  return review.score >= 85
    || (!review.hasMaterialIssues && review.dimensionReasons.length === 0)
}

function buildStructuredJudgeRepairPrompts(
  prompts: { system: string; user: string },
  expectedLanguage: 'zh-CN' | 'en',
  dimensions: RubricDimension[],
) {
  const ids = dimensions.map((dimension) => dimension.id).join(',')
  const limits = dimensions.map((dimension) => `${dimension.id}<=${dimension.max}`).join(',')
  const scoreTemplate = dimensions.map((dimension) => `"${dimension.id}": 0`).join(', ')
  const reasonTemplate = dimensions.map((dimension) => `"${dimension.id}": ""`).join(', ')
  const driftVocabulary = 'goal_changed, deliverable_missing, over_safety_generalization, constraint_loss, focus_shift'
  const template = [
    '{',
    '  "score": 0,',
    `  "dimensionScores": {${scoreTemplate}},`,
    `  "dimensionReasons": {${reasonTemplate}},`,
    '  "hasMaterialIssues": true,',
    '  "summary": "",',
    '  "driftLabels": [],',
    '  "driftExplanation": "",',
    '  "findings": [],',
    '  "suggestedChanges": []',
    '}',
  ].join('\n')
  const note = expectedLanguage === 'zh-CN'
    ? [
      '你上一版返回了错误 schema。现在必须重新评审，并完全按下面这个固定 JSON 模板返回。',
      '不要新增字段，不要改键名，也不要使用 topicRetention、coverage 之类自定义维度名。',
      `dimensionScores 与 dimensionReasons 的键必须严格使用：${ids}。`,
      `分数上限必须严格遵守：${limits}。所有分数都必须是整数。`,
      `driftLabels 只能从这个固定词表里选：${driftVocabulary}。没有 drift 就返回 []。`,
      '只允许返回下面这个 JSON 结构：',
      template,
    ].join('\n')
    : [
      'Your previous response used the wrong schema. Re-evaluate and return exactly the fixed JSON template below.',
      'Do not add fields, rename keys, or use custom dimension ids like topicRetention or coverage.',
      `dimensionScores and dimensionReasons must use these exact keys: ${ids}.`,
      `Strictly obey these score ceilings: ${limits}. Every score must be an integer.`,
      `driftLabels must use only this fixed vocabulary: ${driftVocabulary}. Return [] when there is no drift.`,
      'Return only this JSON shape:',
      template,
    ].join('\n')

  return {
    system: `${prompts.system}\n\n${note}`,
    user: `${prompts.user}\n\n${note}`,
  }
}

async function maybeApplyTopBandRecheck(input: {
  prompt: string
  judgeIndex: number
  goalAnchor: GoalAnchor
  structuredSignals: ReturnType<typeof readStructuredJudgeSignals>
  rubricDimensions: RubricDimension[]
  expectedLanguage: 'zh-CN' | 'en'
  judgeReasoningEffort: AppSettings['defaultJudgeReasoningEffort']
  requestJson: (system: string, user: string, timeoutMs: number) => Promise<Record<string, unknown>>
  review: {
    score: number
    hasMaterialIssues: boolean
    summary: string
    driftLabels: string[]
    driftExplanation: string
    findings: string[]
    suggestedChanges: string[]
    dimensionScores: Record<string, number> | null
    dimensionReasons: string[]
  }
}) {
  if (
    !input.structuredSignals.isValid
    || input.review.score < 95
    || input.review.hasMaterialIssues
    || input.review.driftLabels.length > 0
  ) {
    return input.review
  }

  const highBandBlockers = getHighBandDimensionBlockers({
    dimensions: input.rubricDimensions,
    scores: input.structuredSignals.dimensionScores,
    expectedLanguage: input.expectedLanguage,
  })
  if (highBandBlockers.length > 0) {
    const regraded = await regradeTopBandReview({
      ...input,
      highBandBlockers,
      missingSignals: [],
      recheckFindings: [],
    })
    return maybeApplySuspiciousHighStructuredRescore({
      ...input,
      review: regraded,
      recheckFindings: [],
    })
  }

  const prompts = buildJudgeTopBandRecheckPrompts({
    candidatePrompt: input.prompt,
    goalAnchor: input.goalAnchor,
    dimensionScores: input.structuredSignals.dimensionScores ?? {},
    dimensionReasons: input.review.dimensionReasons,
    judgeIndex: input.judgeIndex,
  })
  let payload: Record<string, unknown>
  try {
    payload = await input.requestJson(
      prompts.system,
      prompts.user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(input.judgeReasoningEffort ?? 'default')),
    )
  } catch {
    const regraded = await regradeTopBandReview({
      ...input,
      highBandBlockers: [],
      missingSignals: [],
      recheckFindings: [buildTopBandRecheckFinding(input.expectedLanguage, 'incomplete')],
    })
    return maybeApplySuspiciousHighStructuredRescore({
      ...input,
      review: regraded,
      recheckFindings: [buildTopBandRecheckFinding(input.expectedLanguage, 'incomplete')],
    })
  }

  const qualifies = Boolean(readPayloadValue(payload, 'qualifies', 'qualifiesForTopBand', 'qualifies_for_top_band'))
  if (qualifies) {
    return input.review
  }

  const findings = normalizeLocalizedTextArray(
    readPayloadValue(payload, 'findings'),
    input.expectedLanguage,
  )
  const missingSignals = normalizeTopBandMissingSignals(readPayloadValue(payload, 'missingSignals', 'missing_signals'))

  const regraded = await regradeTopBandReview({
    ...input,
    highBandBlockers: [],
    missingSignals,
    recheckFindings: [
      buildTopBandRecheckFinding(input.expectedLanguage, 'failed'),
      ...findings,
    ],
  })
  return maybeApplySuspiciousHighStructuredRescore({
    ...input,
    review: regraded,
    recheckFindings: [
      buildTopBandRecheckFinding(input.expectedLanguage, 'failed'),
      ...findings,
    ],
  })
}

function preservePrimaryDiagnosticSummary(primarySummary: string, recheckSummary: string) {
  const normalizedPrimary = primarySummary.trim()
  if (normalizedPrimary) {
    return normalizedPrimary
  }

  return recheckSummary.trim()
}

function buildTopBandRecheckFinding(
  language: 'zh-CN' | 'en',
  status: 'failed' | 'incomplete' | 'non_credible',
) {
  if (language === 'zh-CN') {
    return status === 'incomplete'
      ? '高分复核未完成：本轮仍有关键结构缺口未确认，不覆盖原始任务诊断。'
      : status === 'failed'
        ? '高分复核未通过：关键结构前提仍未全部满足。'
        : '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。'
  }

  return status === 'incomplete'
    ? 'The high-score recheck did not complete, so key structural gaps are still unconfirmed and the primary diagnostic summary stays in place.'
    : status === 'failed'
      ? 'The high-score recheck did not pass because the structural prerequisites are still incomplete.'
      : 'The high-score regrade did not return a credible structured result, so this review cannot be trusted as a passing result.'
}

async function regradeTopBandReview(input: {
  prompt: string
  judgeIndex: number
  goalAnchor: GoalAnchor
  structuredSignals: ReturnType<typeof readStructuredJudgeSignals>
  rubricDimensions: RubricDimension[]
  expectedLanguage: 'zh-CN' | 'en'
  judgeReasoningEffort: AppSettings['defaultJudgeReasoningEffort']
  requestJson: (system: string, user: string, timeoutMs: number) => Promise<Record<string, unknown>>
  review: {
    score: number
    hasMaterialIssues: boolean
    summary: string
    driftLabels: string[]
    driftExplanation: string
    findings: string[]
    suggestedChanges: string[]
    dimensionScores: Record<string, number> | null
    dimensionReasons: string[]
  }
  highBandBlockers: string[]
  missingSignals: string[]
  recheckFindings: string[]
}) {
  const prompts = buildJudgeTopBandRegradePrompts({
    candidatePrompt: input.prompt,
    goalAnchor: input.goalAnchor,
    judgeIndex: input.judgeIndex,
    dimensions: input.rubricDimensions,
    priorDimensionScores: input.structuredSignals.dimensionScores ?? {},
    priorDimensionReasons: input.review.dimensionReasons,
    highBandBlockers: input.highBandBlockers,
    missingSignals: input.missingSignals,
  })

  let payload: Record<string, unknown>
  try {
    payload = await input.requestJson(
      prompts.system,
      prompts.user,
      resolveReasoningEffortTimeoutMs(120_000, normalizeReasoningEffort(input.judgeReasoningEffort ?? 'default')),
    )
  } catch {
    return buildNonCredibleTopBandReview(input)
  }

  const regradedSignals = readStructuredJudgeSignals(payload, input.rubricDimensions)
  if (!regradedSignals.isValid) {
    return buildNonCredibleTopBandReview(input)
  }

  const regradedReview = buildJudgeReviewFromPayload({
    payload,
    structuredSignals: regradedSignals,
    rubricDimensions: input.rubricDimensions,
    expectedLanguage: input.expectedLanguage,
  })
  const remainingBlockers = getHighBandDimensionBlockers({
    dimensions: input.rubricDimensions,
    scores: regradedSignals.dimensionScores,
    expectedLanguage: input.expectedLanguage,
  })
  if (regradedReview.score >= 95 && remainingBlockers.length > 0) {
    return buildNonCredibleTopBandReview(input)
  }

  return {
    ...regradedReview,
    summary: preservePrimaryDiagnosticSummary(input.review.summary, regradedReview.summary),
    findings: dedupeTextItems([
      ...input.review.findings,
      ...input.recheckFindings,
      ...regradedReview.findings,
    ]),
    suggestedChanges: dedupeTextItems([
      ...input.review.suggestedChanges,
      ...regradedReview.suggestedChanges,
    ]),
  }
}

async function maybeApplySuspiciousHighStructuredRescore(input: {
  prompt: string
  judgeIndex: number
  goalAnchor: GoalAnchor
  rubricDimensions: RubricDimension[]
  expectedLanguage: 'zh-CN' | 'en'
  judgeReasoningEffort: AppSettings['defaultJudgeReasoningEffort']
  requestJson: (system: string, user: string, timeoutMs: number) => Promise<Record<string, unknown>>
  review: {
    score: number
    hasMaterialIssues: boolean
    summary: string
    driftLabels: string[]
    driftExplanation: string
    findings: string[]
    suggestedChanges: string[]
    dimensionScores: Record<string, number> | null
    dimensionReasons: string[]
  }
  recheckFindings: string[]
}) {
  if (!isSuspiciousHighStructuredReview({
    score: input.review.score,
    dimensionScores: input.review.dimensionScores,
    dimensionReasons: input.review.dimensionReasons,
    dimensions: input.rubricDimensions,
  })) {
    return input.review
  }

  let repaired: Awaited<ReturnType<typeof applyEvidenceBoundConsistencyRepair>>
  try {
    repaired = await applyEvidenceBoundConsistencyRepair({
      prompt: input.prompt,
      goalAnchor: input.goalAnchor,
      judgeIndex: input.judgeIndex,
      rubricDimensions: input.rubricDimensions,
      expectedLanguage: input.expectedLanguage,
      judgeReasoningEffort: input.judgeReasoningEffort,
      requestJson: input.requestJson,
    })
  } catch {
    return buildNonCredibleTopBandReview(input)
  }

  if (!repaired) {
    return buildNonCredibleTopBandReview(input)
  }

  const remainingBlockers = getHighBandDimensionBlockers({
    dimensions: input.rubricDimensions,
    scores: repaired.review.dimensionScores,
    expectedLanguage: input.expectedLanguage,
  })
  if (repaired.review.score >= 95 && remainingBlockers.length > 0) {
    return buildNonCredibleTopBandReview(input)
  }

  return {
    ...repaired.review,
    summary: repaired.review.summary.trim() || preservePrimaryDiagnosticSummary(input.review.summary, repaired.review.summary),
    findings: dedupeTextItems([
      ...input.review.findings,
      ...input.recheckFindings,
      ...repaired.review.findings,
    ]),
    suggestedChanges: dedupeTextItems([
      ...input.review.suggestedChanges,
      ...repaired.review.suggestedChanges,
    ]),
  }
}

function buildNonCredibleTopBandReview(input: {
  expectedLanguage: 'zh-CN' | 'en'
  review: {
    summary: string
    findings: string[]
    suggestedChanges: string[]
    driftLabels: string[]
    driftExplanation: string
  }
  recheckFindings: string[]
}) {
  return {
    score: 0,
    hasMaterialIssues: true,
    summary: preservePrimaryDiagnosticSummary(
      input.review.summary,
      getInvalidStructuredScoreFallbackSummary(input.expectedLanguage),
    ),
    driftLabels: input.review.driftLabels,
    driftExplanation: input.review.driftExplanation,
    findings: dedupeTextItems([
      buildTopBandRecheckFinding(input.expectedLanguage, 'non_credible'),
      ...input.recheckFindings,
      ...input.review.findings,
    ]),
    suggestedChanges: input.review.suggestedChanges,
    dimensionScores: null,
    dimensionReasons: [] as string[],
  }
}

function normalizeTopBandMissingSignals(value: unknown) {
  const allowed = new Set(['input', 'decision', 'edge', 'verification'])
  return normalizeTextArray(value).filter((item) => allowed.has(item))
}

function getHighBandDimensionBlockers(input: {
  dimensions: RubricDimension[]
  scores: Record<string, number> | null
  expectedLanguage: 'zh-CN' | 'en'
}) {
  if (!input.scores) {
    return []
  }

  return input.dimensions
    .filter((dimension) => {
      const minimum = HIGH_BAND_DIMENSION_MINIMUMS[dimension.id]
      if (minimum === undefined) {
        return false
      }
      return (input.scores?.[dimension.id] ?? 0) < minimum
    })
    .map((dimension) => {
      const minimum = HIGH_BAND_DIMENSION_MINIMUMS[dimension.id] ?? 0
      const actual = input.scores?.[dimension.id] ?? 0
      return input.expectedLanguage === 'zh-CN'
        ? `${dimension.label} 当前为 ${actual}/${dimension.max}，未达到 95+ 所需的 ${minimum}/${dimension.max}。`
        : `${dimension.label} is ${actual}/${dimension.max}, below the ${minimum}/${dimension.max} required for 95+.`
    })
}

function shouldRetryEquivalentOptimization(
  currentPrompt: string,
  optimizedPrompt: string,
  reviewFeedbackItems: string[],
) {
  if (!areEquivalentPromptTexts(currentPrompt, optimizedPrompt)) {
    return false
  }

  if (reviewFeedbackItems.some((item) => item.trim())) {
    return true
  }

  const analysis = analyzePromptShape(currentPrompt)
  return analysis.isThinShell || analysis.isUnderSpecified || analysis.needsDepthFollowup
}

function buildEquivalentRetryPrompts(
  prompts: { system: string; user: string },
  currentPrompt: string,
  language: 'zh-CN' | 'en',
) {
  const analysis = analyzePromptShape(currentPrompt)
  const signalLines = describePromptShapeSignals(analysis, language)
    .slice(0, 4)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')

  const retryNote = language === 'zh-CN'
    ? [
      '上一版返回了与输入等价的结果，这次必须做出实质修订。',
      analysis.needsDepthFollowup
        ? '不要再次原样返回；当前版本还停在表面完整，至少补上更具体的任务特有映射、冲突分支或执行细节。'
        : '不要再次原样返回；至少补上输入中缺失的任务特有决策规则、异常处理或完成标准。',
      signalLines ? `优先修这些结构缺口：\n${signalLines}` : '',
    ].filter(Boolean).join('\n\n')
    : [
      'The previous attempt returned an equivalent result. This retry must make a material revision.',
      analysis.needsDepthFollowup
        ? 'Do not return the prompt unchanged again; it is still stopping at surface completeness, so add more concrete task-specific mappings, conflict branches, or execution detail.'
        : 'Do not return the prompt unchanged again; add the missing task-specific decision rules, edge handling, or completion criteria.',
      signalLines ? `Prioritize these structural gaps:\n${signalLines}` : '',
    ].filter(Boolean).join('\n\n')

  return {
    system: `${prompts.system}\n\n${retryNote}`,
    user: `${prompts.user}\n\n${retryNote}`,
  }
}

function matchesWrapperInstruction(value: string) {
  return [
    /^Return only JSON\.?$/i,
    /^return strict JSON\.?$/i,
    /^Threshold:\s*/i,
    /^Passing threshold:\s*/i,
    /^Non-negotiable goal anchor:?$/i,
    /^Goal anchor:?$/i,
    /^Stable goal anchor:?$/i,
    /^User steering for the next round:?$/i,
    /^Local lint findings to resolve before broad rewrites:?$/i,
    /^本地结构提示（仅供优化器减法\/补强参考，不是评分反馈）：?$/u,
    /^For this response envelope only:?$/i,
    /^CURRENT PROMPT block:?$/i,
    /^CANDIDATE PROMPT block:?$/i,
  ].some((pattern) => pattern.test(value))
}

function looksLikeGoalAnchorLine(value: string) {
  return /^(?:Goal:|Deliverable:|\d+\.\s)/i.test(value)
}

function looksLikeEnumeratedSupportLine(value: string) {
  return /^\d+\.\s/.test(value)
}

function dedupeTextItems(items: string[]) {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const item of items) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped
}
