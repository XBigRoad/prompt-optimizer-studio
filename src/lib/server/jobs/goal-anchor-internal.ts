import { getDb } from '@/lib/server/db/index'
import { normalizeGoalAnchor, serializeGoalAnchor } from '@/lib/server/goal-anchor/index'
import type { GoalAnchor } from '@/lib/contracts'

import { requireJob } from '@/lib/server/jobs/queries-internal'
import { serializeSteeringItems, uniqueOrderedStrings } from '@/lib/server/jobs/shared-internal'

export function buildGoalAnchorDraftFromPendingSteering(jobId: string, selectedItemIds?: string[]) {
  const job = requireJob(jobId)
  if (job.pendingSteeringItems.length === 0) {
    throw new Error('当前没有待写入长期规则的人工引导。')
  }

  const selectedItemSet = selectedItemIds ? new Set(selectedItemIds) : null
  const selectedItems = selectedItemSet
    ? job.pendingSteeringItems.filter((item) => selectedItemSet.has(item.id))
    : job.pendingSteeringItems

  if (selectedItemSet && selectedItems.length === 0) {
    throw new Error('请至少选择一条要写入长期规则的引导。')
  }

  return {
    goalAnchor: {
      goal: job.goalAnchor.goal,
      deliverable: job.goalAnchor.deliverable,
      driftGuard: uniqueOrderedStrings([
        ...job.goalAnchor.driftGuard,
        ...selectedItems.map((item) => item.text),
      ]),
    },
    consumePendingSteeringIds: selectedItems.map((item) => item.id),
  }
}

export function updateJobGoalAnchor(
  jobId: string,
  goalAnchor: Partial<GoalAnchor>,
  options: { consumePendingSteeringIds?: string[] } = {},
) {
  const job = requireJob(jobId)
  if (job.status === 'completed') {
    throw new Error('已完成任务不能修改长期规则。')
  }

  const now = new Date().toISOString()
  const normalizedGoalAnchor = normalizeGoalAnchor(goalAnchor)
  const consumedSteeringIds = options.consumePendingSteeringIds?.length
    ? new Set(options.consumePendingSteeringIds)
    : null
  const nextPendingSteeringItems = consumedSteeringIds
    ? job.pendingSteeringItems.filter((item) => !consumedSteeringIds.has(item.id))
    : job.pendingSteeringItems

  getDb().prepare(`
    UPDATE jobs
    SET goal_anchor_json = ?,
        pending_steering_json = ?,
        next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(
    serializeGoalAnchor(normalizedGoalAnchor),
    serializeSteeringItems(nextPendingSteeringItems),
    now,
    jobId,
  )

  return requireJob(jobId)
}
