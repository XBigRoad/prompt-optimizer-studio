import type { GoalAnchor } from '@/lib/server/types'

export interface RoundJudgment {
  score: number
  hasMaterialIssues: boolean
  summary: string
  findings: string[]
  suggestedChanges: string[]
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
    previousFeedback: string[]
    goalAnchor: GoalAnchor
    nextRoundInstruction?: string | null
    threshold: number
  }): Promise<OptimizationResult>
  judgePrompt(prompt: string, judgeIndex: number, goalAnchor: GoalAnchor): Promise<RoundJudgment>
}

export interface OptimizationCycleInput {
  adapter: ModelAdapter
  currentPrompt: string
  threshold: number
  previousBestScore: number
  previousFeedback?: string[]
  goalAnchor: GoalAnchor
  nextRoundInstruction?: string | null
}

export interface OptimizationCycleResult extends OptimizationResult {
  review: RoundJudgment
  aggregatedIssues: string[]
  bestScore: number
}

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
  previousBestScore,
  previousFeedback = [],
  goalAnchor,
  nextRoundInstruction = null,
}: OptimizationCycleInput): Promise<OptimizationCycleResult> {
  const optimization = await adapter.optimizePrompt({
    currentPrompt,
    previousFeedback,
    goalAnchor,
    nextRoundInstruction,
    threshold,
  })

  const review = await adapter.judgePrompt(optimization.optimizedPrompt, 0, goalAnchor)
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
