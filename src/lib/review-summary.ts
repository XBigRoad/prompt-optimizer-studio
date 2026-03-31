import { sanitizeReviewFeedbackItems } from '@/lib/review-feedback'
import {
  isReviewFallbackFinding,
  isReviewFallbackSuggestedChange,
  stripFallbackItems,
} from '@/lib/review-fallbacks'

const TOP_BAND_GATEKEEPER_SUMMARY_PATTERNS = [
  /^本轮高分复核未完成，95\+\s*资格暂不成立。?$/u,
  /^本轮诊断已完成，但评分器没有写出有效摘要；这轮结果不计入可信通过。?$/u,
  /^本轮诊断已完成，但评分器没有返回有效分项评分；这轮结果不计入可信通过。?$/u,
  /^本轮诊断已完成，但模型返回了异语言摘要。?$/u,
  /^本轮高分复核未通过，关键高分前提仍未全部满足。?$/u,
  /^The high-score recheck did not complete, so 95\+ is not granted for this round\.?$/i,
  /^This diagnostic completed, but the judge did not return a usable summary; this round does not count as a credible pass\.?$/i,
  /^This diagnostic completed, but the judge did not return valid structured dimension scores; this round does not count as a credible pass\.?$/i,
  /^This diagnostic completed, but the model returned a different-language summary\.?$/i,
  /^The high-score recheck did not pass because the top-band prerequisites are still incomplete\.?$/i,
  /(?:综合得分\s*\d+\s*[，,]?\s*明显高于\s*\d+\s*阈值|高分通过段|高于\s*\d+\s*阈值|挡住\s*95\+|95\+)/iu,
  /(?:高分重评未返回可信结构化结果|高分复核未完成)/u,
  /(?:top band|high passing band|above the \d+\s*threshold)/i,
]

const TOP_BAND_GATEKEEPER_FINDING_PATTERNS = [
  /^95\+\s*高分复核未完成/u,
  /^95\+\s*高分复核未通过/u,
  /^高分复核未通过/u,
  /^高分重评未返回可信结构化结果/u,
  /^高分复核未完成/u,
  /^The high-score recheck did not pass/i,
  /^The 95\+ recheck did not complete/i,
  /^The 95\+ recheck did not pass/i,
  /(?:挡住\s*95\+|高于\s*\d+\s*阈值|高分通过段|95\+)/iu,
  /(?:top band|above the \d+\s*threshold|95\+)/i,
]

export function isTopBandGatekeeperSummary(value: string) {
  const normalized = value.trim()
  return TOP_BAND_GATEKEEPER_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isTopBandGatekeeperFinding(value: string) {
  const normalized = value.trim()
  return TOP_BAND_GATEKEEPER_FINDING_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function stripTopBandGatekeeperFindings(findings: string[]) {
  return findings
    .map((item) => item.trim())
    .filter((item) => item && !isTopBandGatekeeperFinding(item))
}

export function sanitizeVisibleReviewCopy(input: {
  summary: string
  findings: string[]
  suggestedChanges: string[]
  dimensionReasons?: string[]
}) {
  const summary = resolveNarrativeReviewSummary(
    input.summary,
    input.findings,
    input.dimensionReasons ?? [],
  )
  const findings = sanitizeVisibleFindings(input.findings, summary)
  const suggestedChanges = sanitizeReviewFeedbackItems(
    stripFallbackItems(input.suggestedChanges, isReviewFallbackSuggestedChange),
  )

  return {
    summary,
    findings,
    suggestedChanges,
  }
}

export function resolveNarrativeReviewSummary(summary: string, findings: string[], dimensionReasons: string[] = []) {
  const normalizedSummary = summary.trim()
  const rootCauseSummary = resolveRootCauseSummaryFromFindings(findings)
  if (rootCauseSummary) {
    return rootCauseSummary
  }

  if (normalizedSummary && !isTopBandGatekeeperSummary(normalizedSummary)) {
    return normalizedSummary
  }

  const synthesized = synthesizeNarrativeSummaryFromFindings(stripTopBandGatekeeperFindings(findings))
  if (synthesized) {
    return synthesized
  }

  const synthesizedFromReasons = synthesizeNarrativeSummaryFromDimensionReasons(dimensionReasons)
  if (synthesizedFromReasons) {
    return synthesizedFromReasons
  }

  return resolveRootCauseFallbackSummary(normalizedSummary)
}

function synthesizeNarrativeSummaryFromFindings(findings: string[]) {
  const narrativeItems = findings
    .map((item) => item.trim())
    .filter((item) => item && !isTopBandGatekeeperFinding(item))
    .slice(0, 4)

  if (narrativeItems.length === 0) {
    return ''
  }

  return narrativeItems
    .map((item) => item.replace(/[。.!?]+$/u, '').trim())
    .filter(Boolean)
    .join('；')
    .concat('。')
}

function synthesizeNarrativeSummaryFromDimensionReasons(dimensionReasons: string[]) {
  const narrativeItems = dimensionReasons
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[^：:\n]{1,20}[：:]\s*/u, '').trim())
    .map((item) => item.replace(/[。.!?]+$/u, '').trim())
    .filter(Boolean)
    .slice(0, 3)

  if (narrativeItems.length === 0) {
    return ''
  }

  return narrativeItems.join('；').concat('。')
}

function resolveRootCauseFallbackSummary(summary: string) {
  if (!summary) {
    return ''
  }

  if (/异语言摘要|different-language summary/i.test(summary)) {
    return /[A-Za-z]/.test(summary) && !/[\u4e00-\u9fff]/.test(summary)
      ? 'This diagnostic completed, but the model returned a different-language summary.'
      : '本轮诊断已完成，但模型返回了异语言摘要。'
  }

  if (/结构化分项评分无效|分项评分结果无效|有效分项评分|valid structured dimension scores/i.test(summary)) {
    return /[A-Za-z]/.test(summary) && !/[\u4e00-\u9fff]/.test(summary)
      ? 'This diagnostic completed, but the structured dimension scores were invalid; use the issues or runtime details below as the source of truth.'
      : '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。'
  }

  if (/评分摘要字段无效|有效摘要|usable summary/i.test(summary)) {
    return /[A-Za-z]/.test(summary) && !/[\u4e00-\u9fff]/.test(summary)
      ? 'This diagnostic completed, but the scoring summary field was invalid; use the issues or runtime details below as the source of truth.'
      : '本轮诊断已完成，但评分摘要字段无效；请以下方问题列表或运行信息为准。'
  }

  return /[A-Za-z]/.test(summary) && !/[\u4e00-\u9fff]/.test(summary)
    ? 'This diagnostic completed, but the stored summary still does not explain the real blocking gaps. Use the findings or dimension reasons below as the source of truth.'
    : '本轮诊断已完成，但当前摘要没有直接写出真实缺口；请以下方问题列表或分项原因为准。'
}

function resolveRootCauseSummaryFromFindings(findings: string[]) {
  const signals = findings
    .map((item) => item.trim())
    .filter(Boolean)

  if (signals.length === 0) {
    return ''
  }

  const source = signals.join('\n')

  if (signals.some((item) => /异语言摘要|异语言诊断|different-language summary|diagnostics in another language/i.test(item))) {
    return resolveRootCauseFallbackSummary(localizeRootCauseSeed(source, 'language'))
  }

  if (
    signals.some((item) => /高分重评未返回可信结构化结果|有效分项评分|valid structured dimension scores/i.test(item))
  ) {
    return resolveRootCauseFallbackSummary(localizeRootCauseSeed(source, 'dimension_scores'))
  }

  if (signals.some((item) => /有效摘要|usable summary/i.test(item))) {
    return resolveRootCauseFallbackSummary(localizeRootCauseSeed(source, 'summary'))
  }

  return ''
}

function localizeRootCauseSeed(source: string, kind: 'language' | 'dimension_scores' | 'summary') {
  const englishOnly = /[A-Za-z]/.test(source) && !/[\u4e00-\u9fff]/.test(source)
  if (kind === 'language') {
    return englishOnly
      ? 'This diagnostic completed, but the model returned a different-language summary.'
      : '本轮诊断已完成，但模型返回了异语言摘要。'
  }

  if (kind === 'dimension_scores') {
    return englishOnly
      ? 'This diagnostic completed, but the structured dimension scores were invalid; use the issues or runtime details below as the source of truth.'
      : '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。'
  }

  return englishOnly
    ? 'This diagnostic completed, but the scoring summary field was invalid; use the issues or runtime details below as the source of truth.'
    : '本轮诊断已完成，但评分摘要字段无效；请以下方问题列表或运行信息为准。'
}

function sanitizeVisibleFindings(findings: string[], summary: string) {
  const filtered = dedupeVisibleItems(
    stripFallbackItems(
      stripTopBandGatekeeperFindings(findings),
      isReviewFallbackFinding,
    ),
  )

  if (
    isStructuredScoreRootCauseSummary(summary)
    && filtered.length > 0
  ) {
    return filtered.filter((item) => !isLikelyPraiseOnlyFinding(item))
  }

  return filtered
}

function dedupeVisibleItems(items: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    if (seen.has(item)) {
      continue
    }
    seen.add(item)
    result.push(item)
  }

  return result
}

function isStructuredScoreRootCauseSummary(summary: string) {
  return /结构化分项评分无效|structured dimension scores were invalid/i.test(summary)
}

function isLikelyPraiseOnlyFinding(value: string) {
  if (/[；;:]/u.test(value)) {
    return false
  }

  return !/(仍|补|写|明确|细化|加强|收紧|分支|规则|标准|格式|缺|不足|不够|问题|风险|冲突|异常|失败|回退|fallback|missing|lack|lacks|needs?|gap|issue|risk|conflict|invalid|错误|薄弱|兜底|约束)/iu.test(value)
}
