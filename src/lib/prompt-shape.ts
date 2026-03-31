export type MissingTopBandSignal = 'input' | 'decision' | 'edge' | 'verification'

export interface PromptShapeAnalysis {
  isThinShell: boolean
  looksLikeBareRequest: boolean
  isUnderSpecified: boolean
  needsDepthFollowup: boolean
  missingTopBandSignals: MissingTopBandSignal[]
}

export function analyzePromptShape(prompt: string): PromptShapeAnalysis {
  const normalized = prompt.replace(/\r\n/g, '\n').trim()
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const length = normalized.length
  const sectionCount = lines.filter(isStructuralLine).length
  const bulletCount = lines.filter((line) => /^[-*•]|\d+[.)、]/.test(line)).length
  const inputSignalCount = countMatches(normalized, INPUT_SIGNAL_PATTERNS)
  const decisionSignalCount = countMatches(normalized, DECISION_SIGNAL_PATTERNS)
  const edgeSignalCount = countMatches(normalized, EDGE_SIGNAL_PATTERNS)
  const verificationSignalCount = countMatches(normalized, VERIFICATION_SIGNAL_PATTERNS)
  const hasPersonaLead = /(?:^|\n)\s*(?:你是(?:[^\n。！？!?]*)|You are\b)/.test(normalized)
  const looksLikeBareRequest =
    !hasPersonaLead
    && length < 160
    && lines.length <= 4
    && sectionCount === 0
    && bulletCount === 0
    && inputSignalCount <= 1
    && decisionSignalCount === 0
    && edgeSignalCount === 0
    && verificationSignalCount === 0

  const isThinShell =
    hasPersonaLead
    && length < 140
    && lines.length <= 3
    && sectionCount === 0
    && bulletCount === 0
    && decisionSignalCount === 0
    && edgeSignalCount === 0
    && verificationSignalCount === 0

  const isUnderSpecified =
    length < 260
    && lines.length <= 8
    && sectionCount <= 2
    && decisionSignalCount === 0
    && edgeSignalCount <= 1
    && verificationSignalCount === 0

  const missingTopBandSignals: MissingTopBandSignal[] = [
    ...(inputSignalCount > 0 ? [] : ['input' as const]),
    ...(decisionSignalCount > 0 ? [] : ['decision' as const]),
    ...(edgeSignalCount > 0 ? [] : ['edge' as const]),
    ...(verificationSignalCount > 0 ? [] : ['verification' as const]),
  ]

  return {
    isThinShell,
    looksLikeBareRequest,
    isUnderSpecified,
    needsDepthFollowup:
      !isThinShell
      && !looksLikeBareRequest
      && !isUnderSpecified
      && missingTopBandSignals.length === 0
      && length >= 700
      && length < 1800
      && sectionCount >= 1
      && bulletCount >= 6,
    missingTopBandSignals,
  }
}

export function describePromptShapeSignals(
  analysis: PromptShapeAnalysis,
  language: 'zh-CN' | 'en',
) {
  return analysis.missingTopBandSignals.map((signal) => signalDescription(signal, language))
}

function signalDescription(signal: MissingTopBandSignal, language: 'zh-CN' | 'en') {
  const mapping = {
    input: [
      '缺少更明确的输入变量、边界条件或前提约束。',
      'The prompt still needs clearer input variables, boundary conditions, or prerequisite constraints.',
    ],
    decision: [
      '缺少任务特有的选择逻辑、优先级或取舍规则。',
      'The prompt still needs task-specific decision logic, priorities, or trade-off rules.',
    ],
    edge: [
      '缺少信息不足、约束冲突、失败场景或不确定时的处理办法。',
      'The prompt still needs handling for missing information, constraint conflicts, failure cases, or uncertainty.',
    ],
    verification: [
      '缺少可判定的输出完成标准、自检点或一致性检查。',
      'The prompt still needs verifiable completion criteria, self-checks, or consistency checks.',
    ],
  } as const

  return language === 'zh-CN' ? mapping[signal][0] : mapping[signal][1]
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0)
}

function isStructuralLine(line: string) {
  return /^#{1,6}\s+/.test(line)
    || /^\d+[.)、]\s*/.test(line)
    || /^[一二三四五六七八九十]+[、.．）)]\s*/.test(line)
    || /^【.+】$/.test(line)
    || /^[^。！？!?]{2,24}[：:]$/.test(line)
}

const INPUT_SIGNAL_PATTERNS = [
  /(?:输入|提供|给定|参数|变量|前提|默认假设|约束边界|边界条件|信息缺失|补充信息|字段|格式|来源)/,
  /(?:人数|预算|忌口|日期|场景|对象)\s*(?:[:：=]|为|\[|（|\()/u,
  /\b(?:input|provide|given|parameter|variable|precondition|constraint boundary|missing information|data source|field|format)\b/i,
]

const DECISION_SIGNAL_PATTERNS = [
  /(?:优先|取舍|排序|标准|依据|分档|先[^。！？\n]{0,20}再|权衡|矩阵|主线|阻塞)/,
  /\b(?:priority|prioritize|trade[- ]?off|criteria|decision|rank|order|blocking|main line)\b/i,
]

const EDGE_SIGNAL_PATTERNS = [
  /(?:如果|若|当|否则|异常|冲突|缺失|不足|不确定|无法|失败|兜底|回退|澄清|默认假设)/,
  /\b(?:if|when|otherwise|edge|exception|conflict|missing|insufficient|uncertain|fallback|retry|clarify)\b/i,
]

const VERIFICATION_SIGNAL_PATTERNS = [
  /(?:自检|检查|核对|验证|验收|确保|一致性|完成标准|通过标准|判定)/,
  /\b(?:self-check|verify|validation|acceptance|consistency|completion criteria|quality gate|checklist)\b/i,
]
