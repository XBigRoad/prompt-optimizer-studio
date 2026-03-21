import { createHash } from 'node:crypto'

import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { deriveGoalAnchor, deriveGoalAnchorExplanation } from '@/lib/server/goal-anchor/index'
import { generateGoalAnchorWithModel } from '@/lib/server/model-adapter'
import { getSettings, validateTaskDefaults } from '@/lib/server/settings/index'
import type { JobInput, JobRecord, SteeringItem } from '@/lib/contracts'

export const JOB_CLAIM_STALE_AFTER_MS = 30_000

export function resolveJobModels(input: JobInput, settings: ReturnType<typeof getSettings>) {
  const optimizerModel = input.optimizerModel?.trim() ?? ''
  const judgeModel = input.judgeModel?.trim() ?? ''
  const optimizerReasoningEffort = input.optimizerReasoningEffort
  const judgeReasoningEffort = input.judgeReasoningEffort

  if (optimizerModel && judgeModel) {
    return {
      optimizerModel,
      judgeModel,
      optimizerReasoningEffort: normalizeReasoningEffort(optimizerReasoningEffort ?? settings.defaultOptimizerReasoningEffort),
      judgeReasoningEffort: normalizeReasoningEffort(judgeReasoningEffort ?? settings.defaultJudgeReasoningEffort),
    }
  }

  validateTaskDefaults(settings)
  return {
    optimizerModel: optimizerModel || settings.defaultOptimizerModel.trim(),
    judgeModel: judgeModel || settings.defaultJudgeModel.trim(),
    optimizerReasoningEffort: normalizeReasoningEffort(optimizerReasoningEffort ?? settings.defaultOptimizerReasoningEffort),
    judgeReasoningEffort: normalizeReasoningEffort(judgeReasoningEffort ?? settings.defaultJudgeReasoningEffort),
  }
}

export async function resolveInitialGoalAnchor(
  settings: Pick<ReturnType<typeof getSettings>, 'cpamcBaseUrl' | 'cpamcApiKey' | 'defaultOptimizerReasoningEffort'>,
  optimizerModel: string,
  rawPrompt: string,
) {
  try {
    return await generateGoalAnchorWithModel(settings, optimizerModel, rawPrompt)
  } catch {
    const goalAnchor = deriveGoalAnchor(rawPrompt)
    return {
      goalAnchor,
      explanation: deriveGoalAnchorExplanation(rawPrompt, goalAnchor),
    }
  }
}

export function normalizeTitle(title: string, rawPrompt: string) {
  const candidate = title.trim()
  if (candidate) {
    return candidate
  }
  return rawPrompt.replace(/\s+/g, ' ').slice(0, 48) || 'Untitled Prompt'
}

export function assertFiniteScore(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`候选稿分数字段无效：${fieldName}`)
  }
}

export function normalizeMaxRoundsOverride(value: number | null) {
  if (value === null) {
    return null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error('任务级最大轮数必须是数字。')
  }

  return Math.min(99, Math.max(1, Math.round(numeric)))
}

export function normalizeSteeringText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

export function normalizeTimestamp(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString()
}

export function buildLegacySteeringId(text: string, updatedAt: string | null) {
  return `legacy-${createHash('sha1').update(`${updatedAt ?? ''}:${text}`).digest('hex').slice(0, 12)}`
}

export function normalizeSteeringItems(items: SteeringItem[]) {
  const seen = new Set<string>()
  const result: SteeringItem[] = []

  for (const item of items) {
    const text = normalizeSteeringText(item.text ?? '')
    const id = item.id?.trim() || crypto.randomUUID()
    if (!text || seen.has(id)) {
      continue
    }

    seen.add(id)
    result.push({
      id,
      text,
      createdAt: normalizeTimestamp(item.createdAt),
    })
  }

  return result
}

export function serializeSteeringItems(items: SteeringItem[]) {
  return JSON.stringify(normalizeSteeringItems(items))
}

export function parseSteeringItems(value: unknown, legacyText?: string | null, legacyUpdatedAt?: string | null) {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        const normalized = normalizeSteeringItems(parsed.map((item) => ({
          id: typeof item?.id === 'string' ? item.id : '',
          text: typeof item?.text === 'string' ? item.text : '',
          createdAt: typeof item?.createdAt === 'string' ? item.createdAt : '',
        })))
        if (normalized.length > 0) {
          return normalized
        }
      }
    } catch {
      // Fall through to legacy compatibility mapping.
    }
  }

  const normalizedLegacyText = typeof legacyText === 'string' ? normalizeSteeringText(legacyText) : null
  if (!normalizedLegacyText) {
    return []
  }

  return [{
    id: buildLegacySteeringId(normalizedLegacyText, legacyUpdatedAt ?? null),
    text: normalizedLegacyText,
    createdAt: normalizeTimestamp(legacyUpdatedAt),
  }]
}

export function createNextInstructionUpdatedAt(previousUpdatedAt: string | null) {
  const now = new Date()
  if (!previousUpdatedAt) {
    return now.toISOString()
  }

  const previousTime = Date.parse(previousUpdatedAt)
  if (Number.isNaN(previousTime) || now.getTime() > previousTime) {
    return now.toISOString()
  }

  return new Date(previousTime + 1).toISOString()
}

export function uniqueOrderedStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function normalizeForCompare(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function sameNormalizedSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left.map(normalizeForCompare))
  const rightSet = new Set(right.map(normalizeForCompare))
  if (leftSet.size !== rightSet.size) {
    return false
  }

  return [...leftSet].every((item) => rightSet.has(item))
}

export function resolveEffectiveMaxRounds(job: Pick<JobRecord, 'maxRoundsOverride'>, defaultMaxRounds: number) {
  return job.maxRoundsOverride ?? defaultMaxRounds
}
