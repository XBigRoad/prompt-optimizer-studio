import { assignConversationGroup } from '@/lib/engine/conversation-policy'
import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { getDb } from '@/lib/server/db/index'
import { serializeGoalAnchor, serializeGoalAnchorExplanation } from '@/lib/server/goal-anchor/index'
import { ensurePromptPackVersion } from '@/lib/server/prompt-pack/index'
import { getSettings, validateCpamcConnection } from '@/lib/server/settings/index'
import type { JobInput } from '@/lib/contracts'

import { getJobById, requireJob } from '@/lib/server/jobs/queries-internal'
import { listConversationGroups, upsertConversationGroup } from '@/lib/server/jobs/repository'
import { normalizeMaxRoundsOverride, normalizeTitle, resolveInitialGoalAnchor, resolveJobModels } from '@/lib/server/jobs/shared-internal'

export async function createJobs(inputs: JobInput[]) {
  const settings = getSettings()
  validateCpamcConnection(settings)

  const db = getDb()
  const pack = ensurePromptPackVersion()
  const now = new Date().toISOString()
  const groups = listConversationGroups(db)
  const jobs = []

  for (const input of inputs) {
    const normalizedPrompt = input.rawPrompt.trim()
    if (!normalizedPrompt) {
      continue
    }

    const models = resolveJobModels(input, settings)
    const normalizedCustomRubric = typeof input.customRubricMd === 'string' ? input.customRubricMd.trim() : ''
    const assignment = assignConversationGroup(settings.conversationPolicy, groups)
    if (assignment.group) {
      upsertConversationGroup(db, assignment.group)
      const index = groups.findIndex((group) => group.id === assignment.group?.id)
      if (index >= 0) {
        groups[index] = assignment.group
      } else {
        groups.push(assignment.group)
      }
    }

    const id = crypto.randomUUID()
    const goalAnchor = await resolveInitialGoalAnchor(settings, models.optimizerModel, normalizedPrompt)
    db.prepare(`
      INSERT INTO jobs (
        id,
        title,
        raw_prompt,
        optimizer_model,
        judge_model,
        optimizer_reasoning_effort,
        judge_reasoning_effort,
        pending_optimizer_model,
        pending_judge_model,
        status,
        run_mode,
        pack_version_id,
        current_round,
        best_average_score,
        goal_anchor_json,
        goal_anchor_explanation_json,
        max_rounds_override,
        next_round_instruction,
        next_round_instruction_updated_at,
        pending_steering_json,
        pass_streak,
        last_review_score,
        last_review_patch_json,
        final_candidate_id,
        conversation_policy,
        conversation_group_id,
        cancel_requested_at,
        pause_requested_at,
        custom_rubric_md,
        error_message,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', 'auto', ?, 0, 0, ?, ?, NULL, NULL, NULL, '[]', 0, 0, '[]', NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?)
    `).run(
      id,
      normalizeTitle(input.title, normalizedPrompt),
      normalizedPrompt,
      models.optimizerModel,
      models.judgeModel,
      models.optimizerReasoningEffort,
      models.judgeReasoningEffort,
      pack.id,
      serializeGoalAnchor(goalAnchor.goalAnchor),
      serializeGoalAnchorExplanation(goalAnchor.explanation),
      settings.conversationPolicy,
      assignment.group?.id ?? null,
      normalizedCustomRubric || null,
      now,
      now,
    )

    jobs.push(getJobById(id)!)
  }

  return jobs
}

export function updateJobModels(jobId: string, models: {
  optimizerModel: string
  judgeModel: string
  optimizerReasoningEffort?: JobInput['optimizerReasoningEffort']
  judgeReasoningEffort?: JobInput['judgeReasoningEffort']
}) {
  const job = requireJob(jobId)
  const optimizerModel = models.optimizerModel.trim()
  const judgeModel = models.judgeModel.trim()
  const optimizerReasoningEffort = models.optimizerReasoningEffort === undefined
    ? job.optimizerReasoningEffort
    : normalizeReasoningEffort(models.optimizerReasoningEffort)
  const judgeReasoningEffort = models.judgeReasoningEffort === undefined
    ? job.judgeReasoningEffort
    : normalizeReasoningEffort(models.judgeReasoningEffort)

  if (!optimizerModel || !judgeModel) {
    throw new Error('请同时选择优化模型和裁判模型。')
  }

  if (job.status === 'completed') {
    throw new Error('已完成任务不能直接修改模型。')
  }

  const db = getDb()
  const now = new Date().toISOString()

  if (job.status === 'running') {
    db.prepare(`
      UPDATE jobs
      SET pending_optimizer_model = ?,
          pending_judge_model = ?,
          pending_optimizer_reasoning_effort = ?,
          pending_judge_reasoning_effort = ?,
          updated_at = ?
      WHERE id = ?
    `).run(optimizerModel, judgeModel, optimizerReasoningEffort, judgeReasoningEffort, now, jobId)
    return requireJob(jobId)
  }

  db.prepare(`
    UPDATE jobs
    SET optimizer_model = ?,
        judge_model = ?,
        optimizer_reasoning_effort = ?,
        judge_reasoning_effort = ?,
        pending_optimizer_model = NULL,
        pending_judge_model = NULL,
        pending_optimizer_reasoning_effort = NULL,
        pending_judge_reasoning_effort = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(optimizerModel, judgeModel, optimizerReasoningEffort, judgeReasoningEffort, now, jobId)

  return requireJob(jobId)
}

export function updateJobMaxRoundsOverride(jobId: string, maxRoundsOverride: number | null) {
  const job = requireJob(jobId)
  if (job.status === 'completed') {
    throw new Error('已完成任务不能修改任务级最大轮数。')
  }

  getDb().prepare(`
    UPDATE jobs
    SET max_rounds_override = ?,
        updated_at = ?
    WHERE id = ?
  `).run(normalizeMaxRoundsOverride(maxRoundsOverride), new Date().toISOString(), jobId)

  return requireJob(jobId)
}

export function updateJobCustomRubricMd(jobId: string, customRubricMd: string | null) {
  const job = requireJob(jobId)
  if (job.status === 'completed') {
    throw new Error('已完成任务不能修改任务级评分标准。')
  }

  if (job.status === 'cancelled') {
    throw new Error('已取消任务不能修改任务级评分标准。')
  }

  const normalizedRubric = typeof customRubricMd === 'string' ? customRubricMd.trim() : ''
  getDb().prepare(`
    UPDATE jobs
    SET custom_rubric_md = ?,
        updated_at = ?
    WHERE id = ?
  `).run(normalizedRubric || null, new Date().toISOString(), jobId)

  return requireJob(jobId)
}
