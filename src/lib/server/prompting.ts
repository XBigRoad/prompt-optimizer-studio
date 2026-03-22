import { formatGoalAnchorForPrompt } from '@/lib/server/goal-anchor/index'
import type { GoalAnchor, PromptPackVersion, SteeringItem } from '@/lib/contracts'

const optimizerSystemPromptCache = new Map<string, string>()
const judgeSystemPromptCache = new Map<string, string>()

export function compactFeedback(
  feedback: string[],
  options: { maxItems?: number; maxItemLength?: number } = {},
) {
  const maxItems = options.maxItems ?? 8
  const maxItemLength = options.maxItemLength ?? 220
  const seen = new Set<string>()
  const result: string[] = []

  for (const rawItem of feedback) {
    const item = rawItem.trim()
    if (!item || item === '[object Object]' || seen.has(item)) {
      continue
    }
    seen.add(item)
    result.push(item.length > maxItemLength ? `${item.slice(0, maxItemLength)}...` : item)
    if (result.length >= maxItems) {
      break
    }
  }

  return result
}

export function buildOptimizerPrompts(input: {
  pack: PromptPackVersion
  currentPrompt: string
  goalAnchor: GoalAnchor
  pendingSteeringItems?: SteeringItem[]
  threshold: number
}) {
  const system = getCompiledOptimizerSystemPrompt(input.pack)

  const steeringText = formatSteeringItemsForPrompt(input.pendingSteeringItems ?? [])
  const user = [
    `Threshold: ${input.threshold}`,
    'Non-negotiable goal anchor:',
    formatGoalAnchorForPrompt(input.goalAnchor),
    'Current prompt:',
    input.currentPrompt,
    'User steering for the next round:',
    steeringText,
    'Return only JSON.',
  ].join('\n\n')

  return { system, user }
}

export function buildJudgePrompts(input: {
  pack: PromptPackVersion
  candidatePrompt: string
  goalAnchor: GoalAnchor
  threshold: number
  judgeIndex: number
}) {
  const system = getCompiledJudgeSystemPrompt(input.pack, input.judgeIndex)

  const user = [
    `Passing threshold: ${input.threshold}`,
    'Goal anchor:',
    formatGoalAnchorForPrompt(input.goalAnchor),
    'Prompt to judge:',
    input.candidatePrompt,
    'Return only JSON.',
  ].join('\n\n')

  return { system, user }
}

export function buildGoalAnchorPrompts(input: {
  rawPrompt: string
}) {
  const system = [
    'You are extracting a stable goal anchor for Prompt Optimizer Studio.',
    'Do not rewrite the task into a safer but more generic goal.',
    'Your job is to preserve the original task.',
    'Return JSON only with fields: goal, deliverable, driftGuard, sourceSummary, rationale.',
    'driftGuard must be an array of 2-4 concise strings that define what counts as drift.',
    'rationale must be an array of 2-4 concise strings explaining why this goal anchor matches the original task.',
    'Do not remove the core objective, do not remove the key deliverable, and do not replace the task with generic safety advice.',
  ].join('\n\n')

  const user = [
    'Original task prompt:',
    input.rawPrompt,
    'Extract the stable goal anchor. Return only JSON.',
  ].join('\n\n')

  return { system, user }
}

function formatSteeringItemsForPrompt(items: SteeringItem[]) {
  if (items.length === 0) {
    return 'None'
  }

  return items
    .map((item, index) => `${index + 1}. ${item.text}`)
    .join('\n')
}

function getCompiledOptimizerSystemPrompt(pack: PromptPackVersion) {
  const cacheKey = `optimizer:${pack.hash}`
  const cached = optimizerSystemPromptCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const compiled = [
    'You are Prompt Optimizer Studio. Always follow the rule pack and return strict JSON only.',
    'Treat this run as a brand-new isolated conversation with no prior memory.',
    'Keep the user language consistent with the input prompt.',
    'Use preserve when the prompt is already structurally sound; use rebuild when it is weak.',
    'Required JSON fields: optimizedPrompt, strategy, scoreBefore, majorChanges, mve, deadEndSignals.',
    'Keep majorChanges and deadEndSignals concise. Prefer 3-6 short items, not long essays.',
    'Rule pack SKILL.md:',
    pack.skillMd,
    'Scoring rubric:',
    pack.rubricMd,
    'Universal rebuild template:',
    pack.templateMd,
  ].join('\n\n')

  optimizerSystemPromptCache.set(cacheKey, compiled)
  return compiled
}

function getCompiledJudgeSystemPrompt(pack: PromptPackVersion, judgeIndex: number) {
  const cacheKey = `judge:${pack.hash}:${judgeIndex}`
  const cached = judgeSystemPromptCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const compiled = [
    `You are isolated judge #${judgeIndex + 1} for Prompt Optimizer Studio.`,
    'You are not the optimizer. Critique strictly and independently.',
    'Assume this is a fresh new conversation with no prior chat context.',
    'Goal fidelity is a hard gate. If the candidate drifts from the goal, loses the deliverable, or violates the drift guard, you must set hasMaterialIssues=true and keep the score below 90.',
    'Use drift labels only from this fixed vocabulary: goal_changed, deliverable_missing, over_safety_generalization, constraint_loss, focus_shift.',
    'Return JSON only with fields: score, hasMaterialIssues, summary, driftLabels, driftExplanation, findings, suggestedChanges.',
    'Keep findings and suggestedChanges concise strings only. Each array should contain at most 6 short items.',
    'If there is no drift, return driftLabels as [] and driftExplanation as an empty string.',
    'Do not return nested objects inside findings or suggestedChanges.',
    'Scoring rubric:',
    pack.rubricMd,
    'Do not rewrite the full prompt. Point out only material issues.',
  ].join('\n\n')

  judgeSystemPromptCache.set(cacheKey, compiled)
  return compiled
}

export function clearCompiledPromptSystemCacheForTests() {
  optimizerSystemPromptCache.clear()
  judgeSystemPromptCache.clear()
}

export function getCompiledPromptSystemCacheStatsForTests() {
  return {
    optimizerEntries: optimizerSystemPromptCache.size,
    judgeEntries: judgeSystemPromptCache.size,
  }
}
