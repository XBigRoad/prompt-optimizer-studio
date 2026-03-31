const REVIEW_FALLBACK_SUMMARIES = new Set([
  '本轮诊断已完成，但模型返回了异语言摘要。',
  'This diagnostic completed, but the model returned a different-language summary.',
  '本轮诊断已完成，但评分摘要字段无效；请以下方问题列表或运行信息为准。',
  '本轮诊断已完成，但评分器没有写出有效摘要；这轮结果不计入可信通过。',
  'This diagnostic completed, but the scoring summary field was invalid; use the issues or runtime details below as the source of truth.',
  'This diagnostic completed, but the judge did not return a usable summary; this round does not count as a credible pass.',
  '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。',
  '本轮诊断已完成，但评分器没有返回有效分项评分；这轮结果不计入可信通过。',
  'This diagnostic completed, but the structured dimension scores were invalid; use the issues or runtime details below as the source of truth.',
  'This diagnostic completed, but the judge did not return valid structured dimension scores; this round does not count as a credible pass.',
])

const REVIEW_FALLBACK_FINDINGS = new Set([
  '本轮发现若干问题，但模型返回了异语言诊断；请结合当前分数与上下文继续判断。',
  'Issues were detected, but the model returned diagnostics in another language; use the score and context to continue judging.',
])

const REVIEW_FALLBACK_SUGGESTED_CHANGES = new Set([
  '本轮给出了改进方向，但模型返回了异语言建议；请优先参考当前任务语境。',
  'Suggestions were produced, but they came back in another language; prioritize the current task context.',
])

const REVIEW_FALLBACK_MAJOR_CHANGES = new Set([
  '本轮已生成新版本，但模型返回了异语言改动摘要；请以上方新版本正文为准。',
  'A new version was generated, but the model returned a different-language change summary; use the prompt body as the source of truth.',
])

export function isReviewFallbackSummary(value: string) {
  return REVIEW_FALLBACK_SUMMARIES.has(value.trim())
}

export function getReviewFallbackSummary(language: 'zh-CN' | 'en') {
  return language === 'zh-CN'
    ? '本轮诊断已完成，但模型返回了异语言摘要。'
    : 'This diagnostic completed, but the model returned a different-language summary.'
}

export function getMissingReviewSummaryFallback(language: 'zh-CN' | 'en') {
  return language === 'zh-CN'
    ? '本轮诊断已完成，但评分摘要字段无效；请以下方问题列表或运行信息为准。'
    : 'This diagnostic completed, but the scoring summary field was invalid; use the issues or runtime details below as the source of truth.'
}

export function getInvalidStructuredScoreFallbackSummary(language: 'zh-CN' | 'en') {
  return language === 'zh-CN'
    ? '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。'
    : 'This diagnostic completed, but the structured dimension scores were invalid; use the issues or runtime details below as the source of truth.'
}

export function isReviewFallbackFinding(value: string) {
  return REVIEW_FALLBACK_FINDINGS.has(value.trim())
}

export function isReviewFallbackSuggestedChange(value: string) {
  return REVIEW_FALLBACK_SUGGESTED_CHANGES.has(value.trim())
}

export function isReviewFallbackMajorChange(value: string) {
  return REVIEW_FALLBACK_MAJOR_CHANGES.has(value.trim())
}

export function stripFallbackItems(
  items: string[],
  matcher: (value: string) => boolean,
) {
  return items
    .map((item) => item.trim())
    .filter((item) => item && !matcher(item))
}
