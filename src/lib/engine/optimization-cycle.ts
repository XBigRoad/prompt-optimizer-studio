import type { ProviderRequestTelemetryEvent } from '@/lib/contracts/provider'
import type { GoalAnchor, SteeringItem } from '@/lib/contracts'

export interface RoundJudgment {
  score: number
  hasMaterialIssues: boolean
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  requestTelemetry?: ProviderRequestTelemetryEvent[]
}

export interface OptimizationResult {
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  requestTelemetry?: ProviderRequestTelemetryEvent[]
}

export interface ModelAdapter {
  optimizePrompt(input: {
    currentPrompt: string
    goalAnchor: GoalAnchor
    pendingSteeringItems?: SteeringItem[]
    threshold: number
  }): Promise<OptimizationResult>
  judgePrompt(prompt: string, judgeIndex: number, goalAnchor: GoalAnchor): Promise<RoundJudgment>
}

export interface OptimizationCycleInput {
  adapter: ModelAdapter
  currentPrompt: string
  threshold: number
  goalAnchor: GoalAnchor
  pendingSteeringItems?: SteeringItem[]
  executionMode?: RoundExecutionMode
}

export interface OptimizationCycleResult {
  inputReview: RoundJudgment | null
  optimization: OptimizationResult | null
  aggregatedIssues: string[]
  reviewError: Error | null
  optimizationError: Error | null
  reviewTelemetry: ProviderRequestTelemetryEvent[]
  optimizationTelemetry: ProviderRequestTelemetryEvent[]
}

export type RoundExecutionMode = 'parallel' | 'sequential'

export function summarizeJudgments(judgments: RoundJudgment[], threshold: number) {
  const passCount = judgments.filter((judgment) => judgment.score >= threshold).length
  const averageScore = judgments.length === 0
    ? 0
    : Math.round((judgments.reduce((sum, judgment) => sum + judgment.score, 0) / judgments.length) * 100) / 100
  const hasMaterialIssues = judgments.some((judgment) => judgment.hasMaterialIssues)
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
  const passes = review.score >= threshold && !review.hasMaterialIssues
  return passes ? currentPassStreak + 1 : 0
}

export function shouldFinalizeAfterReview(currentPassStreak: number, review: RoundJudgment, threshold: number = 95) {
  return review.score >= threshold && !review.hasMaterialIssues && currentPassStreak + 1 >= 3
}

export async function runOptimizationCycle({
  adapter,
  currentPrompt,
  threshold,
  goalAnchor,
  pendingSteeringItems = [],
  executionMode = 'parallel',
}: OptimizationCycleInput): Promise<OptimizationCycleResult> {
  const optimize = () => adapter.optimizePrompt({
    currentPrompt,
    goalAnchor,
    pendingSteeringItems,
    threshold,
  })
  const judge = () => adapter.judgePrompt(currentPrompt, 0, goalAnchor)

  const [optimizationResult, reviewResult] = executionMode === 'sequential'
    ? [
        await settle(optimize),
        await settle(judge),
      ]
    : await Promise.all([
        settle(optimize),
        settle(judge),
      ])

  const optimization = optimizationResult.status === 'fulfilled' ? optimizationResult.value : null
  const review = reviewResult.status === 'fulfilled' ? reviewResult.value : null
  const summary = review ? summarizeJudgments([review], threshold) : { aggregatedIssues: [] }
  const reviewTelemetry = reviewResult.status === 'fulfilled'
    ? reviewResult.value.requestTelemetry ?? []
    : extractRequestTelemetry(reviewResult.reason)
  const optimizationTelemetry = optimizationResult.status === 'fulfilled'
    ? optimizationResult.value.requestTelemetry ?? []
    : extractRequestTelemetry(optimizationResult.reason)

  return {
    inputReview: review,
    optimization,
    aggregatedIssues: summary.aggregatedIssues,
    reviewError: reviewResult.status === 'rejected' ? normalizeCycleError(reviewResult.reason) : null,
    optimizationError: optimizationResult.status === 'rejected' ? normalizeCycleError(optimizationResult.reason) : null,
    reviewTelemetry,
    optimizationTelemetry,
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

function normalizeCycleError(error: unknown) {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error ?? 'Unknown cycle error'))
}

async function settle<T>(operation: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return {
      status: 'fulfilled',
      value: await operation(),
    }
  } catch (error) {
    return {
      status: 'rejected',
      reason: error,
    }
  }
}

function extractRequestTelemetry(error: unknown) {
  if (!error || typeof error !== 'object' || !('requestTelemetry' in error)) {
    return []
  }

  const telemetry = (error as { requestTelemetry?: unknown }).requestTelemetry
  return Array.isArray(telemetry) ? telemetry as ProviderRequestTelemetryEvent[] : []
}
