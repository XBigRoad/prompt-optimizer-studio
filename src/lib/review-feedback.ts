const FEEDBACK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^这版已经进入高分次高档，但/u, ''],
  [/^这版已经有较强结构，但/u, ''],
  [/^这版仍挡在\s*95\+\s*外，/u, ''],
  [/^This version already sits in the upper high band, but /i, ''],
  [/^This version already has a strong structure, but /i, ''],
  [/^This version is still outside 95\+, /i, ''],
  [/还挡着\s*95\+。?$/u, '仍需补强。'],
  [/仍低于\s*95\+\s*门槛。?$/u, '仍需补强。'],
  [/当前为\s*(\d+\/\d+)[，,]\s*未达到\s*95\+\s*所需的\s*\d+\/\d+。?$/u, '当前为 $1，仍需补强。'],
  [/still blocks 95\+\.?$/i, 'still needs reinforcement.'],
  [/remains below the 95\+ gate\.?$/i, 'still needs reinforcement.'],
  [/is\s+(\d+\/\d+),\s+below the\s+\d+\/\d+\s+required for 95\+\.?$/i, 'is currently $1 and still needs reinforcement.'],
]

const FEEDBACK_DROP_PATTERNS = [
  /综合得分\s*\d+\s*[，,]?\s*明显高于\s*\d+\s*阈值/iu,
  /高于\s*\d+\s*阈值/iu,
  /高分通过段/u,
  /高分复核未(?:通过|完成)/u,
  /高分重评未返回可信结构化结果/u,
  /Decision Threshold/i,
  /Dead-End Signals/i,
  /above the\s+\d+\s*threshold/i,
  /high-score recheck did not/i,
  /top band/i,
  /95\+/i,
]

function sanitizeReviewFeedbackItem(value: string) {
  let normalized = value.trim()
  if (!normalized) {
    return ''
  }

  for (const [pattern, replacement] of FEEDBACK_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement).trim()
  }
  normalized = normalized.replace(/\s{2,}/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  if (FEEDBACK_DROP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ''
  }

  return normalized
}

export function sanitizeReviewFeedbackItems(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = sanitizeReviewFeedbackItem(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}
