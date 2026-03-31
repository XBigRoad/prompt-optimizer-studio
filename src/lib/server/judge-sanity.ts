interface JudgeReviewInput {
  score: number
  hasMaterialIssues: boolean
  dimensionScores?: Record<string, number> | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  dimensionReasons?: string[]
}

interface JudgeSanityGuardInput {
  review: JudgeReviewInput
  expectedLanguage: 'zh-CN' | 'en'
}

export function calibrateJudgeOutput(input: JudgeSanityGuardInput): JudgeReviewInput {
  if (input.review.driftLabels.length === 0) {
    return input.review
  }

  return {
    ...input.review,
    score: Math.min(input.review.score, 89),
    hasMaterialIssues: true,
    summary: input.review.summary.trim() || buildDriftGuardSummary(input.expectedLanguage),
    driftExplanation: input.review.driftExplanation,
    findings: mergeLocalizedItems(buildDriftGuardFindings(input.expectedLanguage), input.review.findings),
    suggestedChanges: mergeLocalizedItems(buildDriftGuardSuggestions(input.expectedLanguage), input.review.suggestedChanges),
  }
}

function buildDriftGuardSummary(language: 'zh-CN' | 'en') {
  return language === 'zh-CN'
    ? '这版仍有目标漂移或约束丢失，必须先修正这些实质问题。'
    : 'This prompt still shows drift or constraint loss, so those material issues need to be fixed first.'
}

function buildDriftGuardFindings(language: 'zh-CN' | 'en') {
  return [
    language === 'zh-CN'
      ? '已检测到偏题或约束丢失信号，高分与“无实质问题”结论不能同时成立。'
      : 'Drift or constraint-loss signals were detected, so a high-score “no issues” conclusion is not credible.',
  ]
}

function buildDriftGuardSuggestions(language: 'zh-CN' | 'en') {
  return [
    language === 'zh-CN'
      ? '先修正偏离目标或遗漏约束的部分，再重新评估整体质量。'
      : 'Fix the drift or missing constraints first, then reassess the overall prompt quality.',
  ]
}

function mergeLocalizedItems(prefix: string[], existing: string[]) {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const item of [...prefix, ...existing]) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    merged.push(normalized)
  }

  return merged
}
