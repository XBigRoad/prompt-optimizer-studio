import type { RubricDimension } from '@/lib/server/rubric-dimensions'
import type { GoalAnchor, SteeringItem } from '@/lib/server/types'
import { sanitizeReviewFeedbackItems } from '@/lib/review-feedback'

export interface RoundJudgment {
  score: number
  hasMaterialIssues: boolean
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  dimensionScores?: Record<string, number> | null
  dimensionReasons?: string[]
  rubricDimensionsSnapshot?: RubricDimension[] | null
}

export interface OptimizationResult {
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
}

export interface ModelAdapter {
  optimizePrompt(input: {
    currentPrompt: string
    goalAnchor: GoalAnchor
    pendingSteeringItems?: SteeringItem[]
    reviewFeedbackItems?: string[]
  }): Promise<OptimizationResult>
  judgePrompt(prompt: string, judgeIndex: number, goalAnchor: GoalAnchor): Promise<RoundJudgment>
}

export interface OptimizationCycleInput {
  adapter: ModelAdapter
  currentPrompt: string
  threshold: number
  previousBestScore: number
  goalAnchor: GoalAnchor
  pendingSteeringItems?: SteeringItem[]
}

export interface OptimizationCycleResult extends OptimizationResult {
  review: RoundJudgment
  aggregatedIssues: string[]
  bestScore: number
}

export function summarizeJudgments(judgments: RoundJudgment[], threshold: number) {
  const passCount = judgments.filter((judgment) => judgment.score >= threshold && judgment.driftLabels.length === 0).length
  const averageScore = judgments.length === 0
    ? 0
    : Math.round((judgments.reduce((sum, judgment) => sum + judgment.score, 0) / judgments.length) * 100) / 100
  const hasMaterialIssues = judgments.some((judgment) => judgment.hasMaterialIssues || judgment.driftLabels.length > 0)
  const aggregatedIssues = uniqueOrdered(
    judgments.flatMap((judgment) => [...judgment.findings, ...judgment.suggestedChanges]),
  )

  return {
    passCount,
    averageScore,
    aggregatedIssues,
    shouldComplete: passCount === judgments.length && !hasMaterialIssues,
  }
}

export function nextPassStreak(currentPassStreak: number, review: RoundJudgment, threshold: number = 95) {
  const passes = review.score >= threshold && !review.hasMaterialIssues && review.driftLabels.length === 0
  return passes ? currentPassStreak + 1 : 0
}

export function shouldFinalizeAfterReview(
  currentPassStreak: number,
  review: RoundJudgment,
  threshold: number = 95,
  requiredPassCount: number = 3,
) {
  return review.score >= threshold
    && !review.hasMaterialIssues
    && review.driftLabels.length === 0
    && currentPassStreak + 1 >= requiredPassCount
}

export async function runOptimizationCycle({
  adapter,
  currentPrompt,
  threshold,
  previousBestScore,
  goalAnchor,
  pendingSteeringItems = [],
}: OptimizationCycleInput): Promise<OptimizationCycleResult> {
  const review = await adapter.judgePrompt(currentPrompt, 0, goalAnchor)
  const optimization = await adapter.optimizePrompt({
    currentPrompt,
    goalAnchor,
    pendingSteeringItems,
    reviewFeedbackItems: sanitizeReviewFeedbackItems([
      ...(review.dimensionReasons ?? []),
      ...review.findings,
      ...review.suggestedChanges,
    ]),
  })
  const summary = summarizeJudgments([review], threshold)
  const bestScore = summary.averageScore > previousBestScore ? summary.averageScore : previousBestScore

  return {
    ...optimization,
    review,
    aggregatedIssues: summary.aggregatedIssues,
    bestScore,
  }
}

function uniqueOrdered(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}
