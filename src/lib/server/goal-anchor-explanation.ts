import { analyzeGoalAnchorPrompt } from '@/lib/server/goal-anchor'
import type { GoalAnchor, GoalAnchorExplanation } from '@/lib/server/types'

export const LEGACY_GENERIC_SOURCE_SUMMARIES = [
  '系统识别到原始任务要求保留核心目标。',
  '系统保留了原始任务中最核心的目标描述。',
]

export function deriveGoalAnchorExplanation(rawPrompt: string, goalAnchor: GoalAnchor): GoalAnchorExplanation {
  const analysis = analyzeGoalAnchorPrompt(rawPrompt)
  const sourceSummary = summarizeSource(analysis.prompt)
  const rationaleFocus = analysis.directiveSummary?.objective || analysis.focus

  return normalizeGoalAnchorExplanation({
    sourceSummary,
    rationale: [
      buildGoalRationale(rationaleFocus),
      `从原始表达可判断，最终交付应是：${goalAnchor.deliverable}`,
      '这些边界用于防止多轮优化后偏离主题、丢掉关键产出，或退化成更空泛的说明。',
    ],
  })
}

export function normalizeGoalAnchorExplanation(input: Partial<GoalAnchorExplanation>): GoalAnchorExplanation {
  const sourceSummary = normalizeText(input.sourceSummary ?? '') || LEGACY_GENERIC_SOURCE_SUMMARIES[1]
  const rationale = Array.isArray(input.rationale)
    ? input.rationale.map((item) => normalizeText(item)).filter(Boolean)
    : []

  return {
    sourceSummary,
    rationale: rationale.length > 0 ? rationale : [
      '系统优先保留原始任务目标。',
      '系统明确保留关键交付物，避免多轮优化后偏题。',
    ],
  }
}

export function serializeGoalAnchorExplanation(explanation: Partial<GoalAnchorExplanation>) {
  return JSON.stringify(normalizeGoalAnchorExplanation(explanation))
}

export function parseGoalAnchorExplanation(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return normalizeGoalAnchorExplanation({})
  }

  try {
    return normalizeGoalAnchorExplanation(JSON.parse(value) as Partial<GoalAnchorExplanation>)
  } catch {
    return normalizeGoalAnchorExplanation({})
  }
}

function summarizeSource(rawPrompt: string) {
  const normalized = normalizeText(rawPrompt)
  if (!normalized) {
    return LEGACY_GENERIC_SOURCE_SUMMARIES[1]
  }

  const content = normalized.length <= 150 ? normalized : `${normalized.slice(0, 150).trimEnd()}...`
  return `用户要求：${ensureTerminalPunctuation(content)}`
}

function buildGoalRationale(focus: string) {
  return `原始任务明确围绕“${normalizeText(focus) || '原任务'}”展开，核心目标不是泛化建议。`
}

function ensureTerminalPunctuation(value: string) {
  return /[。！？.!?]$/u.test(value) ? value : `${value}。`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}
