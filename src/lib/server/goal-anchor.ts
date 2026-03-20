import type { GoalAnchor } from '@/lib/contracts'

export const LEGACY_GENERIC_DELIVERABLE = '保持原任务要求的主要输出产物与完成目标。'
export const LEGACY_GENERIC_DRIFT_GUARD = [
  '不要把原任务改写成更安全但更泛化的任务。',
  '不要删除原任务要求的关键输出或核心判断。',
  '不要退化成泛泛说明、免责声明或合规套话。',
]

export type GoalAnchorPromptKind = 'optimize_prompt' | 'cooking_help' | 'generate' | 'role' | 'analysis' | 'general'

type StructuredPromptSummary = {
  goalText: string
  deliverableText: string
  focus: string
  topic: string | null
}

type ReviewPromptSummary = {
  targetText: string
  topic: string
  directAction: string
  painPoint: string | null
}

export type GoalAnchorPromptAnalysis = {
  prompt: string
  strippedPrompt: string
  kind: GoalAnchorPromptKind
  focus: string
  role: string | null
  topic: string | null
  structuredSummary: StructuredPromptSummary | null
  reviewSummary: ReviewPromptSummary | null
}

export function deriveGoalAnchor(rawPrompt: string): GoalAnchor {
  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const goal = deriveGoalText(analysis)
  const deliverable = deriveDeliverableText(analysis)
  const driftGuard = deriveDriftGuard(analysis, deliverable)

  return normalizeGoalAnchor({
    goal,
    deliverable,
    driftGuard,
  })
}

export function analyzeGoalAnchorPrompt(rawPrompt: string): GoalAnchorPromptAnalysis {
  const prompt = normalizeText(rawPrompt)
  const strippedPrompt = stripLeadIn(prompt) || prompt
  const structuredSummary = summarizeStructuredPrompt(rawPrompt)
  const reviewSummary = summarizeReviewPrompt(strippedPrompt)
  const role = extractRoleSubject(strippedPrompt)
  const optimizeTopic = structuredSummary?.topic
    ?? reviewSummary?.topic
    ?? extractOptimizeTopic(strippedPrompt)
    ?? extractPromptSystemTopic(strippedPrompt)
  const cookingTopic = extractCookingTopic(strippedPrompt)
  const generatedTopic = extractGeneratedTopic(strippedPrompt)
  const fallbackTopic = extractFallbackTopic(strippedPrompt)
  const topic = optimizeTopic ?? cookingTopic ?? generatedTopic ?? fallbackTopic

  const kind: GoalAnchorPromptKind = structuredSummary || optimizeTopic
    ? 'optimize_prompt'
    : cookingTopic && /(帮助|帮|请帮|做|制作|烹饪|cook|make)/iu.test(strippedPrompt)
      ? 'cooking_help'
      : generatedTopic
        ? 'generate'
        : role
          ? 'role'
          : /(分析|诊断|评估|review|analy[sz]e|triag|judge|评分|复核)/iu.test(strippedPrompt)
            ? 'analysis'
            : 'general'

  const focus = structuredSummary?.focus ?? reviewSummary?.topic ?? topic ?? role ?? compactTopic(strippedPrompt)

  return {
    prompt,
    strippedPrompt,
    kind,
    focus,
    role,
    topic,
    structuredSummary,
    reviewSummary,
  }
}

export function normalizeGoalAnchor(input: Partial<GoalAnchor>): GoalAnchor {
  const goal = normalizeText(input.goal ?? '') || '保持原始任务目标不变。'
  const deliverable = normalizeText(input.deliverable ?? '') || LEGACY_GENERIC_DELIVERABLE
  const driftGuard = Array.isArray(input.driftGuard)
    ? input.driftGuard.map((item) => normalizeText(item)).filter(Boolean)
    : []

  return {
    goal,
    deliverable,
    driftGuard: driftGuard.length > 0 ? driftGuard : LEGACY_GENERIC_DRIFT_GUARD,
  }
}

export function serializeGoalAnchor(anchor: Partial<GoalAnchor>) {
  return JSON.stringify(normalizeGoalAnchor(anchor))
}

export function parseGoalAnchor(value: unknown): GoalAnchor {
  if (typeof value !== 'string' || !value.trim()) {
    return normalizeGoalAnchor({})
  }

  try {
    const parsed = JSON.parse(value) as Partial<GoalAnchor>
    return normalizeGoalAnchor(parsed)
  } catch {
    return normalizeGoalAnchor({})
  }
}

export function formatGoalAnchorForPrompt(anchor: GoalAnchor) {
  return [
    `Goal: ${anchor.goal}`,
    `Deliverable: ${anchor.deliverable}`,
    'Drift guard:',
    ...anchor.driftGuard.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n')
}

function deriveGoalText(analysis: GoalAnchorPromptAnalysis) {
  if (analysis.structuredSummary) {
    return analysis.structuredSummary.goalText
  }

  if (analysis.reviewSummary) {
    const topicLabel = formatReviewTopicLabel(analysis.reviewSummary.topic)
    const painText = analysis.reviewSummary.painPoint
      ? `，重点解决当前${analysis.reviewSummary.painPoint}的问题`
      : ''
    return restoreSentencePunctuation(`评审并优化一条用于${topicLabel}的提示词${painText}`)
  }

  if (analysis.strippedPrompt.length <= 120) {
    return restoreSentencePunctuation(analysis.strippedPrompt)
  }

  const firstSentence = splitSentences(analysis.strippedPrompt)[0] ?? analysis.strippedPrompt
  if (firstSentence.length <= 140) {
    return restoreSentencePunctuation(firstSentence)
  }

  const firstClause = firstSentence.split(/[，,；;]/u)[0]?.trim()
  if (firstClause && firstClause.length >= 18) {
    return restoreSentencePunctuation(firstClause)
  }

  return `${analysis.strippedPrompt.slice(0, 136).trimEnd()}…`
}

function deriveDeliverableText(analysis: GoalAnchorPromptAnalysis) {
  if (analysis.structuredSummary) {
    return analysis.structuredSummary.deliverableText
  }

  if (analysis.reviewSummary) {
    const topicLabel = formatReviewTopicLabel(analysis.reviewSummary.topic)
    const improvementText = buildReviewImprovementText(analysis.reviewSummary)
    return restoreSentencePunctuation(
      `一份针对该${topicLabel}提示词的评审与优化结果，并交付${improvementText}的改进版提示词`,
    )
  }

  switch (analysis.kind) {
    case 'optimize_prompt': {
      const topic = analysis.topic ? `用于${analysis.topic.replace(/的$/u, '')}的` : ''
      const outputRequirement = extractOutputRequirement(analysis.strippedPrompt)
      return restoreSentencePunctuation(
        `一版${topic}完整提示词${outputRequirement ? `，${outputRequirement}` : '，可直接复制使用'}`,
      )
    }
    case 'cooking_help': {
      const topic = analysis.topic ?? analysis.focus
      return restoreSentencePunctuation(
        `一份${topic}的做法指导，包含关键步骤、所需食材与注意事项`,
      )
    }
    case 'generate': {
      const topic = analysis.topic ?? analysis.focus
      return restoreSentencePunctuation(`可直接使用的${topic}内容`)
    }
    case 'role': {
      if (/中医|问诊|症状|诊断|图片/iu.test(analysis.strippedPrompt)) {
        return '一个能够结合问诊与图片分析症状、给出诊断建议并主动追问的中医助手设定。'
      }
      const role = analysis.role ?? analysis.focus
      return restoreSentencePunctuation(`一个围绕${role}角色与原任务要求的可执行助手设定`)
    }
    case 'analysis': {
      const outputRequirement = extractOutputRequirement(analysis.strippedPrompt)
      return restoreSentencePunctuation(
        outputRequirement ? outputRequirement : `围绕${analysis.focus}给出结构清晰、可执行的分析结果`,
      )
    }
    case 'general':
    default:
      return restoreSentencePunctuation(`围绕${analysis.focus}给出与原任务一致的完整结果`)
  }
}

function deriveDriftGuard(analysis: GoalAnchorPromptAnalysis, deliverable: string) {
  if (analysis.reviewSummary) {
    const topicLabel = formatReviewTopicLabel(analysis.reviewSummary.topic)
    const directAction = compactTopic(analysis.reviewSummary.directAction, 20)
    const painGuard = analysis.reviewSummary.painPoint
      ? `不要忽略原始痛点，必须围绕“${analysis.reviewSummary.painPoint}”进行优化。`
      : `不要忽略${topicLabel}提示词的真实问题。`

    return [
      `不要把任务改成“直接${directAction}”，核心是评审并优化提示词。`,
      painGuard,
      `不要泛化为任意提示词优化，场景必须保留${topicLabel}。`,
      '不要只给解释或优化方向而不交付改进版提示词。',
    ]
  }

  switch (analysis.kind) {
    case 'optimize_prompt':
      return [
        '不要把任务改写成泛泛的提示词建议或方法论说明。',
        '必须输出一版完整、可直接复制的提示词，而不是只给点评。',
        analysis.topic
          ? `不要丢掉原提示词要解决的核心任务：${analysis.topic.replace(/的$/u, '')}。`
          : '不要丢掉原提示词要解决的核心任务。',
      ]
    case 'cooking_help': {
      const topic = analysis.topic ?? analysis.focus
      return [
        `不要改成泛泛的做菜建议，必须继续聚焦${topic}。`,
        '不要只给概述或食材清单，必须保留可执行步骤与关键要点。',
        '不要偏离到无关的背景科普或其他料理。',
      ]
    }
    case 'generate': {
      const topic = analysis.topic ?? analysis.focus
      return [
        `不要改成其他主题或类型的内容，必须继续产出${topic}。`,
        '不要只给创作建议、解释或评价标准，必须直接给出成品。',
        '不要把任务泛化成空泛说明。',
      ]
    }
    case 'role':
      return [
        '不要把角色弱化成泛化助手、顾问或说明文。',
        '不要删掉原任务中明确要求的输入依据、判断动作或交互方式。',
        '不要把最终结果改成空泛建议，必须保留角色型任务的实际输出。',
      ]
    case 'analysis':
      return [
        `不要把${analysis.focus}改写成别的主题或更泛化的问题。`,
        `不要丢掉原任务要求的关键分析产出：${compactTopic(deliverable, 26)}。`,
        '不要退化成空泛结论、免责声明或没有可执行性的概述。',
      ]
    case 'general':
    default:
      return [
        `不要把“${compactTopic(analysis.focus, 24)}”改写成别的主题或更泛化的任务。`,
        `不要丢掉原任务要求的关键产出：${compactTopic(deliverable, 26)}。`,
        '不要退化成空泛说明、方法论或免责声明。',
      ]
  }
}

function stripLeadIn(value: string) {
  return value
    .replace(/^(请(?:你)?|请帮我|请帮助我|请帮用户|帮我|请先|please)\s*/iu, '')
    .trim()
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[。！？.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractOptimizeTopic(value: string) {
  return extractTopic(value, [
    /(?:用于|面向)([^，。！？.!?\n]{1,28})的提示词/iu,
    /(?:优化|改进|完善)(?:一个|一版|这个|这段)?(?:用于)?([^，。！？.!?\n]{1,24})提示词/iu,
    /(?:prompt for|prompt to)([^,.!?\n]{1,28})/iu,
  ])
}

function extractCookingTopic(value: string) {
  return extractTopic(value, [
    /(?:帮助(?:用户)?|帮(?:用户|我)?|请帮(?:用户|我)?)(?:做|制作|烹饪|煮|烧)(?:出)?([^，。！？.!?\n]{1,22})/iu,
    /^(?:请(?:帮(?:用户|我)?|帮助(?:用户|我)?)?\s*)?(?:做|制作|烹饪|煮|烧)(?:出)?([^，。！？.!?\n]{1,22})/iu,
    /(?:make|cook)\s+([^,.!?\n]{1,22})/iu,
  ])
}

function extractGeneratedTopic(value: string) {
  return extractTopic(value, [
    /(?:生成|撰写|创作|产出|输出)([^，。！？.!?\n]{1,24})/iu,
    /^(?:请(?:帮(?:我|用户)?)?\s*)?写(?:出)?([^，。！？.!?\n]{1,24})/iu,
    /(?:generate|write|create|draft)\s+([^,.!?\n]{1,28})/iu,
  ])
}

function extractRoleSubject(value: string) {
  return extractTopic(value, [
    /(?:作为|扮演|你是)([^，。！？.!?\n]{1,28})/iu,
    /(?:act as|you are)\s+([^,.!?\n]{1,28})/iu,
  ])
}

function extractFallbackTopic(value: string) {
  return extractTopic(value, [
    /([^，。！？.!?\n]{2,28})(?:任务|方案|流程|指南|提示词|助手|角色|结果)/u,
  ])
}

function extractTopic(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern)
    const raw = match?.[1]
    const normalized = raw ? cleanTopic(raw) : null
    if (normalized) {
      return normalized
    }
  }
  return null
}

function extractOutputRequirement(value: string) {
  const match = value.match(/(?:要求|需要|并|最终)?(输出[^，。！？.!?\n]{2,48})/u)
  const normalized = match?.[1] ? cleanTopic(match[1]) : null
  return normalized ? restoreSentencePunctuation(normalized, '') : null
}

function extractPromptSystemTopic(value: string) {
  if (/(?:提示词优化|prompt optimizer|prompt architect)/iu.test(value) && /(?:流程|体系|版本|prompt|提示词)/iu.test(value)) {
    if (/(?:工程审计流程|审计流程)/u.test(value)) {
      return '提示词优化工程审计流程'
    }
    if (/(?:prompt\s*体系|提示词体系)/iu.test(value)) {
      return '高质量 Prompt 体系'
    }
    return '提示词优化'
  }

  return null
}

function summarizeReviewPrompt(value: string): ReviewPromptSummary | null {
  if (!/(?:评审|审查|review|评分|打分|优化).{0,24}(?:提示词|prompt)/iu.test(value)) {
    return null
  }

  const targetText = extractTopic(value, [
    /(?:这条|这个|该|现有)?提示词[:：]\s*([^。！？!\n]{4,80})/u,
    /(?:prompt|Prompt)[:：]\s*([^。！？!\n]{4,80})/u,
  ])

  if (!targetText) {
    return null
  }

  const painPoint = extractReviewPainPoint(value)
  const primaryTarget = stripReviewPainTail(targetText)
  const directAction = inferReviewDirectAction(primaryTarget)
  const topic = inferReviewTopic(primaryTarget, directAction)

  if (!topic) {
    return null
  }

  return {
    targetText,
    topic,
    directAction,
    painPoint,
  }
}

function summarizeStructuredPrompt(rawPrompt: string): StructuredPromptSummary | null {
  const normalizedRaw = normalizeLineBreaks(rawPrompt)
  if (!looksLikeStructuredPromptPack(normalizedRaw)) {
    return null
  }

  const lines = normalizedRaw
    .split('\n')
    .map((line) => ({
      raw: line.trim(),
      clean: cleanStructuredLine(line),
    }))
    .filter((item) => item.raw.length > 0 || item.clean.length > 0)

  const goalCandidate = pickStructuredGoalLine(lines)
  const deliverableCandidate = pickStructuredDeliverableLine(lines, goalCandidate)
  const topic = extractStructuredTopic(goalCandidate, deliverableCandidate)
  const goalText = restoreSentencePunctuation(goalCandidate ?? topic ?? '保持原始 Prompt 体系的核心目标')
  const deliverableText = restoreSentencePunctuation(buildStructuredDeliverable(deliverableCandidate, goalCandidate, topic))

  return {
    goalText,
    deliverableText,
    focus: topic ?? compactTopic(goalText, 28),
    topic,
  }
}

function looksLikeStructuredPromptPack(value: string) {
  const headingCount = (value.match(/^#{1,6}\s+/gmu) ?? []).length
  const hasPromptSignals = /(提示词|prompt|Prompt)/u.test(value)
  const hasSpecSignals = /(核心目标|任务定义|策略总则|核心原则|最终版本|可直接使用|互斥路径|路由)/u.test(value)
  return headingCount >= 2 && hasPromptSignals && hasSpecSignals
}

function cleanStructuredLine(value: string) {
  return normalizeText(value)
    .replace(/^#{1,6}\s*/u, '')
    .replace(/^[-*+]\s*/u, '')
    .replace(/^\d+\.\s*/u, '')
    .replace(/^[（(【[]?[A-ZＡ-Ｚa-zａ-ｚ0-9]+[）)】\].:：]+\s*/u, '')
    .trim()
}

function isStructuredHeading(line: { raw: string; clean: string }) {
  if (/^#{1,6}\s+/u.test(line.raw)) {
    return true
  }

  return /^(?:\d+\.\s*)?(?:初始化与身份锁定|语言规则|任务定义|变量校验池|核心目标|策略总则|核心原则|MVE|交付要求|输出要求)$/u.test(line.clean)
}

function isStructuredNoiseLine(value: string) {
  return !value
    || /^(?:时间锚点|Current_Date|role|prompt architect)\b/iu.test(value)
    || /^\{.+\}$/u.test(value)
    || /^\d+$/u.test(value)
}

function pickStructuredGoalLine(lines: Array<{ raw: string; clean: string }>) {
  const tagged = pickLineAfterHeading(lines, ['核心目标', '任务定义', '核心原则'])
  if (tagged) {
    return tagged
  }

  return pickBestStructuredLine(lines, [
    '唯一职责',
    '互斥路径',
    '工程审计流程',
    'prompt 体系',
    '提示词优化',
    '可直接使用',
    '最小验证实验',
  ])
}

function pickStructuredDeliverableLine(
  lines: Array<{ raw: string; clean: string }>,
  goalCandidate: string | null,
) {
  const tagged = pickLineAfterHeading(lines, ['交付要求', '输出要求', '策略总则'])
  if (tagged) {
    return tagged
  }

  return pickBestStructuredLine(lines, [
    '最终版本',
    '可直接落地',
    '可直接使用',
    'prompt 体系',
    '交付',
    '候选 prompt',
    '单一最终版本',
  ]) ?? goalCandidate
}

function pickLineAfterHeading(lines: Array<{ raw: string; clean: string }>, headings: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!headings.some((heading) => line.clean.includes(heading) || line.raw.includes(heading))) {
      continue
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]
      if (isStructuredHeading(nextLine)) {
        break
      }

      if (!isStructuredNoiseLine(nextLine.clean)) {
        return nextLine.clean
      }
    }
  }

  return null
}

function pickBestStructuredLine(lines: Array<{ raw: string; clean: string }>, keywords: string[]) {
  let bestLine: string | null = null
  let bestScore = -1

  for (const line of lines) {
    if (isStructuredHeading(line) || isStructuredNoiseLine(line.clean)) {
      continue
    }

    const normalized = line.clean
    const lowered = normalized.toLowerCase()
    let score = 0

    for (const keyword of keywords) {
      if (lowered.includes(keyword.toLowerCase())) {
        score += 3
      }
    }

    if (/prompt|提示词|体系|版本|交付|输出|可直接/u.test(normalized)) {
      score += 2
    }
    if (normalized.length >= 24) {
      score += 1
    }
    if (/退化|降级|泛化/u.test(normalized)) {
      score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestLine = normalized
    }
  }

  return bestScore > 0 ? bestLine : null
}

function extractStructuredTopic(goalCandidate: string | null, deliverableCandidate: string | null) {
  const combined = normalizeText(`${goalCandidate ?? ''} ${deliverableCandidate ?? ''}`)
  if (!combined) {
    return null
  }

  if (/(?:提示词优化|prompt optimizer)/iu.test(combined) && /(?:工程审计流程|审计流程)/u.test(combined)) {
    return '提示词优化工程审计流程'
  }
  if (/(?:prompt\s*体系|提示词体系)/iu.test(combined)) {
    return /最小验证实验/u.test(combined) ? '最小验证实验 Prompt 体系' : '高质量 Prompt 体系'
  }
  if (/最小验证实验/u.test(combined)) {
    return '最小验证实验'
  }
  if (/互斥路径/u.test(combined)) {
    return '多路径 Prompt 路由'
  }
  return compactTopic(combined, 24)
}

function buildStructuredDeliverable(
  deliverableCandidate: string | null,
  goalCandidate: string | null,
  topic: string | null,
) {
  const combined = normalizeText(`${deliverableCandidate ?? ''} ${goalCandidate ?? ''} ${topic ?? ''}`)
  const mentionsPromptSystem = /(?:prompt\s*体系|提示词体系|高质量 prompt 体系)/iu.test(combined)
  const mentionsFinalVersion = /(?:最终版本|单一最终版本|唯一|不(?:得|并列).*候选\s*prompt|不并列多个候选)/iu.test(combined)
  const mentionsDirectUse = /(?:可直接使用|可直接落地|直接落地)/u.test(combined)

  if (mentionsPromptSystem && mentionsFinalVersion) {
    return `一套结构化、${mentionsDirectUse ? '可直接使用' : '可直接落地'}的 Prompt 体系，并最终收敛为单一最终版本`
  }
  if (mentionsPromptSystem) {
    return `一套结构化、${mentionsDirectUse ? '可直接使用' : '可直接落地'}的 Prompt 体系`
  }
  if (mentionsFinalVersion) {
    return `一版${mentionsDirectUse ? '可直接落地' : '可直接使用'}的最终 Prompt 版本，不并列多个候选`
  }
  if (/(?:提示词优化|prompt optimizer|工程审计流程)/iu.test(combined)) {
    return '一版可直接落地的最终 Prompt 版本，体现提示词优化的工程审计流程'
  }

  return `一套围绕${topic ?? '原任务'}的结构化最终结果`
}

function stripReviewPainTail(value: string) {
  return normalizeText(value)
    .split(/(?:，|,|但|但是|不过|然而)/u)[0]
    ?.trim() ?? normalizeText(value)
}

function inferReviewDirectAction(value: string) {
  return normalizeText(value)
    .replace(/^(?:让\s*)?AI\s*(?:帮(?:我|用户)?|帮助(?:我|用户)?)?/iu, '')
    .replace(/^(?:帮(?:我|用户)?|帮助(?:我|用户)?|替(?:我|用户)?)/u, '')
    .trim() || normalizeText(value)
}

function inferReviewTopic(primaryTarget: string, directAction: string) {
  const writeMatch = directAction.match(/写([^，。！？!?]{1,18})/u)
  if (writeMatch?.[1]) {
    return `${cleanTopic(writeMatch[1])}生成`
  }

  const generateMatch = directAction.match(/生成([^，。！？!?]{1,18})/u)
  if (generateMatch?.[1]) {
    return `${cleanTopic(generateMatch[1])}生成`
  }

  if (/优化器|Prompt Optimizer|提示词优化/iu.test(primaryTarget)) {
    return 'Prompt Optimizer Review 模式'
  }

  const normalized = cleanTopic(directAction) || cleanTopic(primaryTarget)
  return normalized ? compactTopic(normalized, 20) : null
}

function extractReviewPainPoint(value: string) {
  const normalized = normalizeText(value)

  if (/输出[^。！？!?]{0,12}空洞/u.test(normalized)) {
    return '输出内容空洞'
  }
  if (/(?:漏字段|缺字段)/u.test(normalized)) {
    return '字段缺失'
  }
  if (/不具体/u.test(normalized)) {
    return '输出不具体'
  }
  if (/泛泛而谈|空泛/u.test(normalized)) {
    return '输出过于空泛'
  }

  return null
}

function formatReviewTopicLabel(topic: string) {
  return /提示词$/u.test(topic) ? topic : `${topic}`
}

function buildReviewImprovementText(reviewSummary: ReviewPromptSummary) {
  if (reviewSummary.painPoint === '输出内容空洞') {
    return '更能生成具体、充实周报内容'
  }
  if (reviewSummary.painPoint === '字段缺失') {
    return '字段契约更稳定'
  }
  if (reviewSummary.painPoint === '输出不具体' || reviewSummary.painPoint === '输出过于空泛') {
    return '更贴合原任务目标'
  }
  return '更贴合原任务目标'
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n?/g, '\n').trim()
}

function cleanTopic(value: string) {
  return value
    .replace(/^(?:\[|[“"'`【])+/u, '')
    .replace(/(?:\]|[”"'`】])+$/u, '')
    .replace(/[。！？.!?]+$/u, '')
    .replace(/^(一个|一份|一种|一些)/u, '')
    .trim()
}

function compactTopic(value: string, maxLength = 20) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return '原任务'
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

function restoreSentencePunctuation(value: string, punctuation = '。') {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }
  return /[。！？.!?]$/u.test(normalized) ? normalized : `${normalized}${punctuation}`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}
