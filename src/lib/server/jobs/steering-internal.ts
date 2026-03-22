import { getDb } from '@/lib/server/db/index'

import { requireJob } from '@/lib/server/jobs/queries-internal'
import { readLegacyNextRoundInstructionUpdatedAt, setPendingSteeringItems } from '@/lib/server/jobs/repository'
import { createNextInstructionUpdatedAt, normalizeSteeringText } from '@/lib/server/jobs/shared-internal'

function requireSteerableJob(jobId: string) {
  const job = requireJob(jobId)
  if (job.status === 'completed') {
    throw new Error('已完成任务不能再写入下一轮人工引导。')
  }

  if (job.status === 'cancelled') {
    throw new Error('已取消任务不能再写入下一轮人工引导。')
  }

  return job
}

export function addPendingSteeringItem(jobId: string, text: string) {
  const job = requireSteerableJob(jobId)
  const normalizedText = normalizeSteeringText(text)
  if (!normalizedText) {
    throw new Error('请先输入一条人工引导。')
  }

  const nextItems = [
    ...job.pendingSteeringItems,
    {
      id: crypto.randomUUID(),
      text: normalizedText,
      createdAt: new Date().toISOString(),
    },
  ]

  setPendingSteeringItems(jobId, nextItems)
  return requireJob(jobId)
}

export function removePendingSteeringItem(jobId: string, itemId: string) {
  const job = requireSteerableJob(jobId)
  setPendingSteeringItems(jobId, job.pendingSteeringItems.filter((item) => item.id !== itemId))
  return requireJob(jobId)
}

export function clearPendingSteeringItems(jobId: string) {
  requireSteerableJob(jobId)
  setPendingSteeringItems(jobId, [])
  return requireJob(jobId)
}

export function consumePendingSteeringItems(jobId: string, consumedItemIds: string[]) {
  const job = requireJob(jobId)
  if (consumedItemIds.length === 0) {
    return job
  }

  const consumedSet = new Set(consumedItemIds)
  setPendingSteeringItems(jobId, job.pendingSteeringItems.filter((item) => !consumedSet.has(item.id)))
  return requireJob(jobId)
}

export function updateJobNextRoundInstruction(jobId: string, nextRoundInstruction: string) {
  requireSteerableJob(jobId)
  const normalizedInstruction = normalizeSteeringText(nextRoundInstruction)
  const updatedAt = normalizedInstruction
    ? createNextInstructionUpdatedAt(readLegacyNextRoundInstructionUpdatedAt(jobId))
    : null

  getDb().prepare(`
    UPDATE jobs
    SET next_round_instruction = ?,
        next_round_instruction_updated_at = ?,
        pending_steering_json = '[]',
        updated_at = ?
    WHERE id = ?
  `).run(normalizedInstruction, updatedAt, new Date().toISOString(), jobId)

  return requireJob(jobId)
}

export function clearConsumedNextRoundInstruction(jobId: string, expectedUpdatedAt: string | null) {
  if (!expectedUpdatedAt) {
    return requireJob(jobId)
  }

  getDb().prepare(`
    UPDATE jobs
    SET next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        updated_at = ?
    WHERE id = ?
      AND next_round_instruction_updated_at = ?
  `).run(new Date().toISOString(), jobId, expectedUpdatedAt)

  return requireJob(jobId)
}
