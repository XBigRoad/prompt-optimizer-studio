import { formatGoalAnchorForPrompt } from '@/lib/server/goal-anchor'
import type { GoalAnchor, PromptPackVersion } from '@/lib/server/types'

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
  previousFeedback: string[]
  goalAnchor: GoalAnchor
  nextRoundInstruction?: string | null
  threshold: number
}) {
  const system = [
    'You are Prompt Optimizer Studio. Always follow the rule pack and return strict JSON only.',
    'Treat this run as a brand-new isolated conversation with no prior memory.',
    'Keep the user language consistent with the input prompt.',
    'Use preserve when the prompt is already structurally sound; use rebuild when it is weak.',
    'Required JSON fields: optimizedPrompt, strategy, scoreBefore, majorChanges, mve, deadEndSignals.',
    'Keep majorChanges and deadEndSignals concise. Prefer 3-6 short items, not long essays.',
    'Rule pack SKILL.md:',
    input.pack.skillMd,
    'Scoring rubric:',
    input.pack.rubricMd,
    'Universal rebuild template:',
    input.pack.templateMd,
  ].join('\n\n')

  const compactedFeedback = compactFeedback(input.previousFeedback)
  const user = [
    `Threshold: ${input.threshold}`,
    'Non-negotiable goal anchor:',
    formatGoalAnchorForPrompt(input.goalAnchor),
    'Current prompt:',
    input.currentPrompt,
    'High-signal feedback from the previous round:',
    compactedFeedback.length > 0
      ? compactedFeedback.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : 'None',
    'User steering for the next round:',
    input.nextRoundInstruction?.trim() || 'None',
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
  const system = [
    `You are isolated judge #${input.judgeIndex + 1} for Prompt Optimizer Studio.`,
    'You are not the optimizer. Critique strictly and independently.',
    'Assume this is a fresh new conversation with no prior chat context.',
    'Goal fidelity is a hard gate. If the candidate drifts from the goal, loses the deliverable, or violates the drift guard, you must set hasMaterialIssues=true and keep the score below 90.',
    'Return JSON only with fields: score, hasMaterialIssues, summary, findings, suggestedChanges.',
    'Keep findings and suggestedChanges concise strings only. Each array should contain at most 6 short items.',
    'Do not return nested objects inside findings or suggestedChanges.',
    'Scoring rubric:',
    input.pack.rubricMd,
    'Do not rewrite the full prompt. Point out only material issues.',
  ].join('\n\n')

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
