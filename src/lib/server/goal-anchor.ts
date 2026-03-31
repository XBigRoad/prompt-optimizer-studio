import type { GoalAnchor } from '@/lib/server/types'

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

type DirectivePromptSummary = {
  mode: 'persona_coaching' | 'plan' | 'guide'
  objective: string
  sectionHeadings: string[]
  preservePersona: boolean
}

export type GoalAnchorPromptAnalysis = {
  prompt: string
  strippedPrompt: string
  kind: GoalAnchorPromptKind
  focus: string
  richRoleFormat: boolean
  role: string | null
  topic: string | null
  structuredSummary: StructuredPromptSummary | null
  reviewSummary: ReviewPromptSummary | null
  directiveSummary: DirectivePromptSummary | null
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
  const directiveSummary = summarizeDirectivePrompt(rawPrompt, strippedPrompt)
  const roleTaskGoal = extractRoleTaskGoal(rawPrompt)
  const role = extractRoleSubject(strippedPrompt)
  const richRoleFormat = isRichRoleFormatPrompt(strippedPrompt, role, directiveSummary)
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
      : richRoleFormat || (directiveSummary && role)
        ? 'role'
        : generatedTopic
        ? 'generate'
        : role
          ? 'role'
          : /(分析|诊断|评估|review|analy[sz]e|triag|judge|评分|复核)/iu.test(strippedPrompt)
            ? 'analysis'
            : 'general'

  const focus = structuredSummary?.focus ?? reviewSummary?.topic ?? directiveSummary?.objective ?? roleTaskGoal ?? topic ?? role ?? compactTopic(strippedPrompt)

  return {
    prompt,
    strippedPrompt,
    kind,
    focus,
    richRoleFormat,
    role,
    topic,
    structuredSummary,
    reviewSummary,
    directiveSummary,
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

export function isMalformedGoalAnchorForPrompt(rawPrompt: string, goalAnchor: GoalAnchor) {
  const prompt = normalizeLineBreaks(rawPrompt)
  const promptHasInlineEnumeratedOutputs = extractInlineNumberedOutputItems(prompt).length >= 2
  const goalLooksPurePersona = isPurePersonaIdentitySentence(goalAnchor.goal)
  const goalLooksLikeFormatShell = looksLikeOutputFormatShell(goalAnchor.goal)
    || looksLikeEnumeratedOutputFragment(goalAnchor.goal)
  const deliverableLooksLikeFormatShell = looksLikeOutputFormatShell(goalAnchor.deliverable)
    || looksLikeEnumeratedOutputFragment(goalAnchor.deliverable)
  const goalLooksGenericDirectiveShell = /^(?:围绕.+(?:提供可执行指导|提供实战指导|制定可执行计划)|(?:provide|deliver).+(?:practical guidance|actionable guidance|actionable plan))/iu.test(goalAnchor.goal)
  const deliverableLooksGenericDirectiveShell = /^(?:一份围绕.+(?:可执行指南|可执行计划)|a[n]? .+(?:actionable guide|actionable plan))/iu.test(goalAnchor.deliverable)
  const anchorLooksCooking = looksLikeCookingAnchor(goalAnchor)
  const barePersonaSeed = extractBarePersonaSeed(prompt)
  const deliverableLooksGenericFallback = /(?:与原任务一致的完整结果|主要输出产物与完成目标)/u.test(goalAnchor.deliverable)

  if (goalLooksPurePersona && deliverableLooksLikeFormatShell) {
    return true
  }

  if (anchorLooksCooking && !looksLikeCookingPrompt(prompt)) {
    return true
  }

  if (barePersonaSeed && deliverableLooksGenericFallback) {
    return true
  }

  if (promptHasInlineEnumeratedOutputs && deliverableLooksLikeFormatShell) {
    return true
  }

  if (
    goalLooksGenericDirectiveShell
    && deliverableLooksGenericDirectiveShell
    && /(核心职责|核心使命|最终目标|工作方式|标准输出格式|输出原则)/u.test(prompt)
  ) {
    return true
  }

  const isRoleFormatPrompt = /(?:你是|作为|扮演|role[:：]|角色[:：])/iu.test(prompt)
    && /(?:标准输出格式|固定输出格式|默认优先采用以下结构|输出格式|默认输出)/u.test(prompt)

  return isRoleFormatPrompt && (
    goalLooksPurePersona
    || goalLooksLikeFormatShell
    || deliverableLooksLikeFormatShell
  )
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

  if (analysis.richRoleFormat) {
    return restoreSentencePunctuation(buildRichRoleGoal(analysis))
  }

  if (analysis.directiveSummary) {
    return restoreSentencePunctuation(buildDirectiveGoal(analysis.directiveSummary))
  }

  if (analysis.strippedPrompt.length <= 120) {
    return restoreSentencePunctuation(analysis.strippedPrompt)
  }

  const firstSentence = splitSentences(analysis.strippedPrompt)[0] ?? analysis.strippedPrompt
  if (analysis.role && isPurePersonaIdentitySentence(firstSentence)) {
    const roleTaskGoal = extractRoleTaskGoal(analysis.prompt)
    if (roleTaskGoal) {
      return restoreSentencePunctuation(roleTaskGoal)
    }
  }
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

  if (analysis.richRoleFormat) {
    return restoreSentencePunctuation(buildRichRoleDeliverable(analysis))
  }

  if (analysis.directiveSummary) {
    return restoreSentencePunctuation(buildDirectiveDeliverable(analysis.directiveSummary))
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
      const explicitDeliverable = extractExplicitTaskDeliverable(analysis.prompt)
      if (explicitDeliverable) {
        return explicitDeliverable
      }
      if (/中医|问诊|症状|诊断|图片/iu.test(analysis.strippedPrompt)) {
        return '一个能够结合问诊与图片分析症状、给出诊断建议并主动追问的中医助手设定。'
      }
      if (/拆到.*现在就能做|最小启动动作|下一步|推进/u.test(analysis.prompt)) {
        return '一份把复杂任务拆到可立即执行的行动方案，明确当前阻塞、第一步和下一步。'
      }
      const role = analysis.role ?? analysis.focus
      if (looksLikeBarePersonaPrompt(analysis.strippedPrompt, role)) {
        return restoreSentencePunctuation(`一条可直接使用的角色提示词，使模型稳定扮演${role}并在完成用户任务时保持该人设`)
      }
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

  if (analysis.richRoleFormat) {
    return buildRichRoleDriftGuard(analysis, deliverable)
  }

  if (analysis.directiveSummary) {
    return buildDirectiveDriftGuard(analysis.directiveSummary, deliverable)
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
      {
        const explicitOutputGuard = extractExplicitRoleOutputGuard(analysis.prompt, deliverable)
        return [
          analysis.role
            ? `不要把“${compactTopic(analysis.role, 20)}”弱化成泛化助手、顾问或说明文。`
            : '不要把角色弱化成泛化助手、顾问或说明文。',
          explicitOutputGuard,
          '不要把最终结果改成空泛建议，必须保留角色型任务的实际输出。',
        ]
      }
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
    /(?:帮(?:我|用户)?|帮助(?:我|用户)?|请帮(?:我|用户)?|为)?[^。！？!\n]{0,16}(?:写|生成|设计|制作|做)(?:一份|一个|一条|一段)?([^，。！？!\n]{2,40})提示词/iu,
    /(?:做|制作)(?:一份|一个|一条|一段)?([^，。！？!\n]{2,40}\bprompt)\b/iu,
    /(?:prompt for|prompt to)([^,.!?\n]{1,28})/iu,
  ])
}

function extractCookingTopic(value: string) {
  const directCookingTopic = extractTopic(value, [
    /(?:帮助(?:用户)?|帮(?:用户|我)?|请帮(?:用户|我)?)(?:做|制作|烹饪|煮|烧)(?:出)?([^，。！？.!?\n]{1,22})/iu,
    /^(?:请(?:帮(?:用户|我)?|帮助(?:用户|我)?)?\s*)?(?:做|制作|烹饪|煮|烧)(?:出)?([^，。！？.!?\n]{1,22})/iu,
  ])
  if (
    directCookingTopic
    && !looksLikePromptArtifactTopic(directCookingTopic)
    && looksLikeChineseCookingRequest(value, directCookingTopic)
  ) {
    return directCookingTopic
  }

  const englishCookingTopic = extractTopic(value, [
    /(?:make|cook)\s+([^,.!?\n]{1,28})/iu,
  ])

  return englishCookingTopic && looksLikeEnglishCookingRequest(value, englishCookingTopic)
    ? englishCookingTopic
    : null
}

function extractGeneratedTopic(value: string) {
  if (extractInlineNumberedOutputItems(value).length >= 2) {
    return null
  }

  const candidate = extractTopic(value, [
    /(?:生成|撰写|创作|产出|输出)([^，。！？.!?\n]{1,24})/iu,
    /^(?:请(?:帮(?:我|用户)?)?\s*)?写(?:出)?([^，。！？.!?\n]{1,24})/iu,
    /(?:generate|write|create|draft)\s+([^,.!?\n]{1,28})/iu,
  ])
  return candidate && !looksLikeOutputFormatShell(candidate) && !looksLikeDirectiveOutputNoise(candidate) ? candidate : null
}

function extractRoleSubject(value: string) {
  return extractTopic(value, [
    /(?:作为|扮演|你是)([^，。！？.!?\n]{1,28})/iu,
    /(?:act as|you are)\s+([^,.!?\n]{1,28})/iu,
  ]) ?? extractBarePersonaSeed(value)
}

function extractRoleTaskGoal(rawPrompt: string) {
  const lines = normalizeLineBreaks(rawPrompt)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const preferredHeadings = [
    /核心使命/u,
    /核心职责/u,
    /你的职责/u,
    /工作方式/u,
    /最终目标/u,
  ]

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!preferredHeadings.some((pattern) => pattern.test(line))) {
      continue
    }

    const inlineObjective = extractInlineRoleHeadingObjective(line)
    if (inlineObjective) {
      return inlineObjective
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = cleanStructuredLine(lines[nextIndex])
      if (!candidate || isStructuredHeading({ raw: lines[nextIndex], clean: candidate })) {
        break
      }
      if (!looksLikeActionableRoleTaskGoal(candidate)) {
        continue
      }
      return candidate
    }
  }

  const inlineRoleTaskGoal = extractTopic(rawPrompt, [
    /(?:你是|作为|扮演)[^。！？.!?\n]{1,28}[。.]?\s*((?:根据|围绕|结合|面向)[^。！？!\n]{8,120})/u,
    /(?:你是|作为|扮演)[^。！？.!?\n]{1,28}[。.]?\s*([^。！？!\n]{8,120}(?:输出|给出|提供|返回)[^。！？!\n]{4,120})/u,
  ])
  if (inlineRoleTaskGoal && looksLikeActionableRoleTaskGoal(inlineRoleTaskGoal)) {
    return inlineRoleTaskGoal
  }

  return lines
    .map((line) => cleanStructuredLine(line))
    .find((candidate) => Boolean(candidate) && looksLikeActionableRoleTaskGoal(candidate!))
    ?? extractRoleTaskGoalFromInlineSections(rawPrompt)
}

function extractFallbackTopic(value: string) {
  return extractTopic(value, [
    /([^，。！？.!?\n]{2,28})(?:任务|方案|流程|指南|提示词|助手|角色|结果)/u,
  ])
}

function extractBarePersonaSeed(value: string) {
  const normalized = normalizeText(value)
  if (!normalized || /(?:帮|请|输出|生成|写|做|分析|优化|提示词|方案|任务|如何|步骤|结构)/u.test(normalized)) {
    return null
  }

  const sentences = normalized
    .split(/[。！？.!?]+\s*/u)
    .map((item) => item.trim())
    .filter(Boolean)
  const firstSentence = sentences[0]?.trim() ?? ''
  const secondSentence = sentences[1]?.trim() ?? ''

  if (
    firstSentence
    && firstSentence.length <= 12
    && !/[，,；;：:]/u.test(firstSentence)
    && /(?:角色|人设|口吻|风格|persona)/iu.test(secondSentence)
  ) {
    return firstSentence
  }

  if (/^[\u3400-\u9fffA-Za-z]{2,12}(?:狂人|客服|教练|老师|助手|军师|顾问|秘书|分析师|角色)$/u.test(normalized)) {
    return normalized
  }

  return null
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

function extractExplicitTaskDeliverable(value: string) {
  const inlineOutputs = extractInlineNumberedOutputItems(value)
  if (inlineOutputs.length >= 2) {
    return restoreSentencePunctuation(`一份${formatEnumeratedOutputItems(inlineOutputs)}`)
  }

  const candidate = extractTopic(value, [
    /(?:给出|提供|输出|返回|安排|规划|制定|设计)([^。！？!\n]{4,72})/u,
  ])

  if (!candidate || looksLikeOutputFormatShell(candidate) || looksLikeEnumeratedOutputFragment(candidate)) {
    return null
  }

  return restoreSentencePunctuation(`一份${candidate}`)
}

function extractExplicitRoleOutputGuard(prompt: string, deliverable: string) {
  const inlineOutputs = extractInlineNumberedOutputItems(prompt)
  if (inlineOutputs.length >= 2) {
    return `不要删掉原任务明确要求的输出：${compactTopic(formatEnumeratedOutputItems(inlineOutputs), 30)}。`
  }

  const candidate = extractTopic(prompt, [
    /(?:给出|提供|输出|返回)([^。！？!\n]{4,72})/u,
  ])

  if (candidate && !looksLikeOutputFormatShell(candidate) && !looksLikeEnumeratedOutputFragment(candidate)) {
    return `不要删掉原任务明确要求的输出：${compactTopic(candidate, 30)}。`
  }

  return `不要丢掉原任务要求的关键产出：${compactTopic(deliverable, 28)}。`
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

function summarizeDirectivePrompt(rawPrompt: string, strippedPrompt: string): DirectivePromptSummary | null {
  const objective = extractDirectiveObjective(strippedPrompt)
    ?? extractRoleTaskGoal(rawPrompt)
    ?? extractRoleTaskGoalFromInlineSections(rawPrompt)
  const sectionHeadings = extractSectionHeadings(rawPrompt)
  const preservePersona = /(?:respond as|stay in character|speak in first person|in-?character|以第一人称|保持角色|保持人设|角色口吻)/iu.test(strippedPrompt)
  const hasCoachingSignals = /(?:coach me|coaching|指导|打法|战术|strategy|win condition|maximize my chances|beat faker|击败|对线)/iu.test(strippedPrompt)
  const hasPlanSignals = /(?:study plan|roadmap|milestone|schedule|weekly|plan|规划|计划|时间安排|周计划|学习计划)/iu.test(strippedPrompt)
  const hasGuideSignals = /(?:how to|guide|指南|教程|walk me through|步骤|step-by-step)/iu.test(strippedPrompt)

  if (!objective && sectionHeadings.length < 3 && !preservePersona) {
    return null
  }

  if (preservePersona && (hasCoachingSignals || sectionHeadings.length >= 3)) {
    return {
      mode: 'persona_coaching',
      objective: objective ?? compactTopic(strippedPrompt, 40),
      sectionHeadings,
      preservePersona,
    }
  }

  if (hasPlanSignals || sectionHeadings.some((item) => /schedule|milestone|plan|timeline|fallback|weekly|计划|时间|里程碑/u.test(item))) {
    return {
      mode: 'plan',
      objective: objective ?? compactTopic(strippedPrompt, 40),
      sectionHeadings,
      preservePersona,
    }
  }

  if (hasGuideSignals || sectionHeadings.length >= 3) {
    return {
      mode: 'guide',
      objective: objective ?? compactTopic(strippedPrompt, 40),
      sectionHeadings,
      preservePersona,
    }
  }

  return null
}

function isRichRoleFormatPrompt(
  prompt: string,
  role: string | null,
  directiveSummary: DirectivePromptSummary | null,
) {
  if (!role || !directiveSummary) {
    return false
  }

  return /(?:核心职责|核心使命|你的职责|工作方式|最终目标)/u.test(prompt)
    && /(?:标准输出格式|默认输出|固定输出格式|输出格式)/u.test(prompt)
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

function buildDirectiveGoal(summary: DirectivePromptSummary) {
  const objective = compactTopic(summary.objective, 48)

  switch (summary.mode) {
    case 'persona_coaching':
      return `保持角色口吻与第一人称视角，围绕${objective}提供实战指导`
    case 'plan':
      return `围绕${objective}制定可执行计划`
    case 'guide':
    default:
      return `围绕${objective}提供可执行指导`
  }
}

function buildRichRoleGoal(analysis: GoalAnchorPromptAnalysis) {
  const objective = resolveRichRoleObjective(analysis)
  return `保持该角色的工作方式与判断重点，核心目标是${objective}`
}

function buildRichRoleDeliverable(analysis: GoalAnchorPromptAnalysis) {
  const objective = resolveRichRoleObjective(analysis)
  const sectionHeadings = analysis.directiveSummary?.sectionHeadings ?? []
  const sectionText = sectionHeadings.length > 0
    ? `，默认覆盖${formatSectionList(sectionHeadings, 6)}`
    : ''

  return `一份保留该角色工作方式的完整回应，目标是${objective}${sectionText}，并给出可立即执行的判断与动作`
}

function buildRichRoleDriftGuard(analysis: GoalAnchorPromptAnalysis, deliverable: string) {
  const objective = compactTopic(resolveRichRoleObjective(analysis), 28)
  const sectionHeadings = analysis.directiveSummary?.sectionHeadings ?? []
  const sectionGuard = sectionHeadings.length > 0
    ? `不要删掉默认输出结构：${formatSectionList(sectionHeadings, 6)}。`
    : `不要丢掉原任务要求的关键产出：${compactTopic(deliverable, 28)}。`

  return [
    `不要把核心目标缩成单一子问题或单一步骤，仍要服务于${objective}。`,
    sectionGuard,
    '不要只剩下人设口号或空泛安慰，必须保留判断、取舍与可执行动作。',
  ]
}

function buildDirectiveDeliverable(summary: DirectivePromptSummary) {
  const objective = compactTopic(summary.objective, 48)
  const sectionText = buildSectionCoverageText(summary.sectionHeadings)

  switch (summary.mode) {
    case 'persona_coaching':
      return [
        `一份${summary.preservePersona ? '保持角色口吻与第一人称视角的' : ''}实战指导方案，围绕${objective}`,
        sectionText,
      ].filter(Boolean).join('，')
    case 'plan':
      return [
        looksLikePlanPhrase(summary.objective)
          ? `一份${objective}`
          : `一份围绕${objective}的可执行计划`,
        sectionText,
      ].filter(Boolean).join('，')
    case 'guide':
    default:
      return [
        `一份围绕${objective}的可执行指南`,
        sectionText,
      ].filter(Boolean).join('，')
  }
}

function buildDirectiveDriftGuard(summary: DirectivePromptSummary, deliverable: string) {
  const objective = compactTopic(summary.objective, 28)
  const sectionGuard = summary.sectionHeadings.length > 0
    ? `不要删掉原任务要求的关键版块：${formatSectionList(summary.sectionHeadings, 4)}。`
    : `不要丢掉原任务要求的关键产出：${compactTopic(deliverable, 28)}。`

  if (summary.mode === 'persona_coaching') {
    return [
      '不要丢掉角色口吻、第一人称视角或既定人设。',
      `不要把任务改写成泛化建议，仍要围绕${objective}展开。`,
      sectionGuard,
    ]
  }

  if (summary.mode === 'plan') {
    return [
      `不要把任务改写成别的主题，仍要围绕${objective}制定计划。`,
      sectionGuard,
      '不要退化成空泛建议，必须保留顺序、安排、里程碑或兜底动作。',
    ]
  }

  return [
    `不要把任务改写成更泛化的问题，仍要围绕${objective}展开。`,
    sectionGuard,
    '不要退化成空泛说明，必须保留可执行步骤、判断或输出结构。',
  ]
}

function resolveRichRoleObjective(analysis: GoalAnchorPromptAnalysis) {
  return compactTopic(
    analysis.directiveSummary?.objective
      ?? analysis.focus
      ?? analysis.role
      ?? '完成原任务要求',
    72,
  )
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
    return 'Prompt Optimizer 提示词评分与优化任务'
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

function extractDirectiveObjective(value: string) {
  return extractTopic(value, [
    /coach me on how to\s+([^.!?\n]{6,96})/iu,
    /help me\s+(?:build|create|draft|plan|prepare|design|write)\s+([^.!?\n]{4,96})/iu,
    /(?:how to|guide me to)\s+([^.!?\n]{6,96})/iu,
    /(?:帮我|帮助我|请帮我)(?:制定|做|写|规划|设计|准备)([^。！？!\n]{4,72})/u,
    /(?:制定|规划|设计)([^。！？!\n]{4,72})(?:计划|方案|路线图)/u,
  ])
}

function extractSectionHeadings(rawPrompt: string) {
  const lines = normalizeLineBreaks(rawPrompt)
    .split('\n')
    .map((line) => line.trim())

  const headings: string[] = []
  let capture = false

  for (const line of lines) {
    if (!line) {
      if (capture && headings.length > 0) {
        break
      }
      continue
    }

    if (/(?:cover these sections|include these sections|sections to cover|output format|standard output|标准输出格式|输出格式|包括以下部分|覆盖这些部分)/iu.test(line)) {
      capture = true
      continue
    }

    if (!capture) {
      continue
    }

    if (/^(?:##?|【.+】|[A-Z][^:：]{0,30}[:：])/.test(line) && !/^(?:-|\*|\d+[.)、])/.test(line)) {
      if (headings.length > 0) {
        break
      }
      continue
    }

    const cleaned = cleanSectionHeading(line)
    if (!cleaned || looksLikeOutputFormatShell(cleaned) || looksLikeEnumeratedOutputFragment(cleaned)) {
      continue
    }

    headings.push(cleaned)
    if (headings.length >= 6) {
      break
    }
  }

  return uniqueOrderedStrings(headings)
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n?/g, '\n').trim()
}

function cleanTopic(value: string) {
  return value
    .replace(/^[“"'`【\[]+/u, '')
    .replace(/[”"'`】\]]+$/u, '')
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

function buildSectionCoverageText(sectionHeadings: string[]) {
  if (sectionHeadings.length === 0) {
    return ''
  }
  return `覆盖${formatSectionList(sectionHeadings, 4)}`
}

function formatSectionList(sectionHeadings: string[], limit = 4) {
  const items = sectionHeadings
    .map((item) => compactTopic(item, 26))
    .slice(0, limit)

  if (items.length <= 1) {
    return items[0] ?? ''
  }

  if (items.length === 2) {
    return `${items[0]}与${items[1]}`
  }

  return `${items.slice(0, -1).join('、')}与${items.at(-1)}`
}

function looksLikePlanPhrase(value: string) {
  return /(?:plan|schedule|roadmap|timeline|study plan|规划|计划|路线图)/iu.test(value)
}

function isPurePersonaIdentitySentence(value: string) {
  const normalized = normalizeText(value)
    .replace(/^#\s*/u, '')
    .replace(/^(?:角色|Role)[:：]\s*/iu, '')
    .trim()

  if (!normalized) {
    return false
  }

  if (/(?:负责|需要|要|必须|结合|分析|输出|帮助|给出|处理|判断|拆|推进|开始|生成|写|提供|完成|执行)/u.test(normalized)) {
    return false
  }

  return /^(?:你是|作为|扮演|act as|you are)\s*[^，,。.!?]{1,28}[。.!?]?$/iu.test(normalized)
}

function looksLikeOutputFormatShell(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return false
  }

  return [
    /(?:标准输出格式|固定输出格式|默认优先采用以下结构|按以下格式|输出格式)/u,
    /^(?:格式|结构|栏目|标题|正文|标签)[:：】\]]/u,
    /(?:目标是什么|真正卡点是什么|这件事应该怎么拆|现在第一步做什么|今天做到哪算合格|下一步会自然接什么)/u,
  ].some((pattern) => pattern.test(normalized))
}

function looksLikeDirectiveOutputNoise(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return false
  }

  return /(?:^原则[】\]]?|^格式[】\]]?|输出要尽量满足以下要求|标准输出格式|默认输出|先给结论|再给判断依据|再给行动建议)/u.test(normalized)
}

function looksLikeEnumeratedOutputFragment(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return false
  }

  return [
    /(?:默认输出|标准输出格式|固定输出格式|输出格式|以下结构).{0,24}(?:[:：]\s*1(?:[.．]|、)?|1内容)/u,
    /(?:^|[：:])\s*1[）)]/u,
    /1[）)]\s*[^。！？!?]{1,24}\s+2[）)]/u,
    /(?:^|[：:])\s*1(?:[.．]|、)?$/u,
    /(?:^|[：:])\s*\d+内容[。.!?]?$/u,
  ].some((pattern) => pattern.test(normalized))
}

function extractInlineNumberedOutputItems(value: string) {
  const normalized = normalizeText(value)
  if (!/(?:输出|产出|给出|提供|返回)\s*[：:]/u.test(normalized)) {
    return []
  }

  const segment = normalized
    .split(/(?:输出|产出|给出|提供|返回)\s*[：:]/u)
    .at(-1)
    ?.split(/(?:默认条件|默认输入|默认参数|若用户|如果用户|若多个条件|【|#)/u)[0]
    ?.trim() ?? ''

  if (!segment) {
    return []
  }

  return uniqueOrderedStrings(
    Array.from(segment.matchAll(/\d+[）).、]\s*([^。！？!?]{1,24}?)(?=\s*(?:\d+[）).、]|$|[。！？!?]))/gu))
      .map((match) => cleanTopic(match[1] ?? ''))
      .filter((item) => item && !looksLikeOutputFormatShell(item) && !looksLikeDirectiveOutputNoise(item)),
  )
}

function formatEnumeratedOutputItems(items: string[]) {
  const normalized = uniqueOrderedStrings(items.map((item) => cleanTopic(item)).filter(Boolean))
  if (normalized.length === 0) {
    return '原任务要求的结果'
  }
  if (normalized.length === 1) {
    return normalized[0]
  }
  if (normalized.length === 2) {
    return `${normalized[0]}与${normalized[1]}`
  }

  return `${normalized.slice(0, -1).join('、')}与${normalized.at(-1)}`
}

function looksLikeCookingAnchor(goalAnchor: GoalAnchor) {
  const normalized = normalizeText([
    goalAnchor.goal,
    goalAnchor.deliverable,
    ...goalAnchor.driftGuard,
  ].join(' '))

  return /(?:做法指导|食材|料理|做菜建议|食材清单|火候|菜谱|recipe|ingredients?|dish|meal)/iu.test(normalized)
}

function looksLikeCookingPrompt(value: string) {
  return extractCookingTopic(value) !== null
    || looksLikeChineseCookingRequest(value, value)
    || looksLikeEnglishCookingRequest(value, value)
}

function looksLikeChineseCookingRequest(prompt: string, topic: string) {
  const normalizedPrompt = normalizeText(prompt)
  const normalizedTopic = normalizeText(topic)

  if (!/(?:做|制作|烹饪|煮|烧)/u.test(normalizedPrompt)) {
    return false
  }

  return /(?:菜|饭|面|汤|粥|锅|饺|包|蛋糕|甜点|饮品|食材|料理|火锅|寿喜烧|菜谱|菜单|调料|早餐|午餐|晚餐|家常|厨房)/u.test(normalizedPrompt)
    || /(?:菜|饭|面|汤|粥|锅|饺|包|蛋糕|甜点|饮品|食材|料理|火锅|寿喜烧|菜谱|菜单)/u.test(normalizedTopic)
}

function looksLikeEnglishCookingRequest(prompt: string, topic: string) {
  const normalizedPrompt = normalizeText(prompt)
  const normalizedTopic = normalizeText(topic)

  if (!/\b(?:cook|make|recipe|ingredient|ingredients|dish|meal|bake|boil|fry|roast|grill)\b/iu.test(normalizedPrompt)) {
    return false
  }

  return /(recipe|ingredient|ingredients|dish|meal|breakfast|lunch|dinner|dessert|soup|stew|salad|pasta|noodle|rice|bread|cake|cookie|sandwich|curry|pizza|sauce|miso|ramen|omelet|omelette|dumpling|taco|bake|boil|fry|roast|grill|kitchen)/iu.test(normalizedPrompt)
    || /(recipe|ingredient|ingredients|dish|meal|breakfast|lunch|dinner|dessert|soup|stew|salad|pasta|noodle|rice|bread|cake|cookie|sandwich|curry|pizza|sauce|miso|ramen|omelet|omelette|dumpling|taco)/iu.test(normalizedTopic)
}

function cleanSectionHeading(value: string) {
  return normalizeText(value)
    .replace(/^[-*+]\s*/u, '')
    .replace(/^\d+[.)、]\s*/u, '')
    .replace(/^[A-Za-z]\.\s*/u, '')
    .replace(/\s*[:：]\s*$/u, '')
    .trim()
}

function uniqueOrderedStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function extractRoleTaskGoalFromInlineSections(rawPrompt: string) {
  const normalized = normalizeText(rawPrompt)
  const patterns = [
    /(?:【?你的核心使命】?|核心使命)[：:]?\s*([^【]{8,180})/u,
    /(?:【?你的核心职责】?|核心职责)[：:]?\s*([^【]{8,180})/u,
    /(?:【?你的职责】?|你的职责)[：:]?\s*([^【]{8,180})/u,
    /(?:【?最终目标】?|最终目标)[：:]?\s*([^【]{8,180})/u,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = match?.[1]
      ?.split(/\s+\d+\.\s*/u)[0]
      ?.trim()
    if (candidate && looksLikeActionableRoleTaskGoal(candidate)) {
      return candidate
    }
  }

  return null
}

function extractInlineRoleHeadingObjective(line: string) {
  const normalized = normalizeText(line)
  if (!/(?:核心职责|核心使命|你的职责|工作方式|最终目标)/u.test(normalized)) {
    return null
  }

  let candidate = normalized
    .replace(/^【?(?:你的核心职责|核心职责|你的核心使命|核心使命|你的职责|工作方式|最终目标)】?[：:\s]*/u, '')
    .trim()

  if (!candidate || candidate === normalized) {
    candidate = normalized
  }

  if (/不是.+而是/u.test(candidate)) {
    candidate = candidate.split(/而是/u).at(-1)?.trim() ?? candidate
  }

  const quoted = candidate.match(/[“"]([^”"]{4,72})[”"]/u)?.[1]?.trim()
  if (quoted) {
    return quoted
  }

  candidate = candidate
    .replace(/^站在/u, '')
    .replace(/的角度.*$/u, '')
    .replace(/(?:持续承担以下责任|承担以下责任|负责以下事项|你要负责|自动调用本模块).*$/u, '')
    .replace(/^(?:是|为|围绕)/u, '')
    .replace(/[：:，,。；;]+$/u, '')
    .trim()

  return candidate.length >= 6 ? candidate : null
}

function looksLikeActionableRoleTaskGoal(value: string) {
  const normalized = normalizeText(value)
  if (!normalized || looksLikeOutputFormatShell(normalized) || isPurePersonaIdentitySentence(normalized)) {
    return false
  }

  if (/(?:拆|推进|开始|阻塞|优先级|行动|执行|主线|收束|判断|找出|帮助|赢得|解决|识别|看清)/u.test(normalized)) {
    return true
  }

  return /负责/u.test(normalized) && !/负责[:：]?$/u.test(normalized) && normalized.length >= 18
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

function looksLikePromptArtifactTopic(value: string) {
  return /(?:提示词|prompt|system prompt|话术|模板|指令|脚本|提示模板)/iu.test(normalizeText(value))
}

function looksLikeBarePersonaPrompt(prompt: string, role: string) {
  const normalized = normalizeText(prompt)
  if (!normalized || normalized.length > 36) {
    return false
  }

  if (/(?:帮|请|输出|生成|写|做|分析|优化|提示词|方案|任务|如何|步骤|结构)/u.test(normalized)) {
    return false
  }

  return normalized === role
    || normalized.startsWith(`${role}。`)
    || normalized.startsWith(`${role}.`)
    || /(?:角色|人设|口吻|风格|persona)/iu.test(normalized)
}
