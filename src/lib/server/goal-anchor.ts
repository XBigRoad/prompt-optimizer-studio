import type { GoalAnchor } from '@/lib/server/types'

const DEFAULT_DRIFT_GUARD = [
  '不要把原任务改写成更安全但更泛化的任务。',
  '不要删除原任务要求的关键输出或核心判断。',
  '不要退化成泛泛说明、免责声明或合规套话。',
]

export function deriveGoalAnchor(rawPrompt: string): GoalAnchor {
  const normalizedPrompt = normalizeText(rawPrompt)
  const sentences = splitSentences(normalizedPrompt)
  const goal = sentences[0] ?? normalizedPrompt.slice(0, 220)
  const deliverable = findDeliverableSentence(sentences) ?? '保持原任务要求的主要输出产物与完成目标。'

  return normalizeGoalAnchor({
    goal,
    deliverable,
    driftGuard: DEFAULT_DRIFT_GUARD,
  })
}

export function normalizeGoalAnchor(input: Partial<GoalAnchor>): GoalAnchor {
  const goal = normalizeText(input.goal ?? '') || '保持原始任务目标不变。'
  const deliverable = normalizeText(input.deliverable ?? '') || '保持原任务要求的主要输出产物与完成目标。'
  const driftGuard = Array.isArray(input.driftGuard)
    ? input.driftGuard.map((item) => normalizeText(item)).filter(Boolean)
    : []

  return {
    goal,
    deliverable,
    driftGuard: driftGuard.length > 0 ? driftGuard : DEFAULT_DRIFT_GUARD,
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

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[。！？.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function findDeliverableSentence(sentences: string[]) {
  const pattern = /(输出|返回|生成|给出|产出|deliver|output|return)/iu
  return sentences.find((sentence) => pattern.test(sentence)) ?? null
}
