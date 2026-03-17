import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import { assignConversationGroup } from '@/lib/engine/conversation-policy'
import { getJobDisplayError } from '@/lib/presentation'
import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { getDb } from '@/lib/server/db'
import {
  deriveGoalAnchor,
  LEGACY_GENERIC_DELIVERABLE,
  LEGACY_GENERIC_DRIFT_GUARD,
  normalizeGoalAnchor,
  parseGoalAnchor,
  serializeGoalAnchor,
} from '@/lib/server/goal-anchor'
import {
  deriveGoalAnchorExplanation,
  LEGACY_GENERIC_SOURCE_SUMMARIES,
  parseGoalAnchorExplanation,
  serializeGoalAnchorExplanation,
} from '@/lib/server/goal-anchor-explanation'
import { generateGoalAnchorWithModel } from '@/lib/server/model-adapter'
import { ensurePromptPackVersion } from '@/lib/server/prompt-pack'
import { compactFeedback } from '@/lib/server/prompting'
import { getSettings, validateCpamcConnection, validateTaskDefaults } from '@/lib/server/settings'
import type {
  CandidateRecord,
  GoalAnchor,
  GoalAnchorExplanation,
  JobDetail,
  JobInput,
  JobRunMode,
  JobRecord,
  JudgeRunRecord,
  SteeringItem,
} from '@/lib/server/types'

export { getJobDisplayError }

const JOB_CLAIM_STALE_AFTER_MS = 30_000

export async function createJobs(inputs: JobInput[]) {
  const settings = getSettings()
  validateCpamcConnection(settings)

  const db = getDb()
  const pack = ensurePromptPackVersion()
  const now = new Date().toISOString()
  const groups = listConversationGroups(db)
  const jobs: JobRecord[] = []

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

export function listJobs() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      jobs.id,
      jobs.title,
      jobs.raw_prompt,
      jobs.optimizer_model,
      jobs.judge_model,
      jobs.optimizer_reasoning_effort,
      jobs.judge_reasoning_effort,
      jobs.pending_optimizer_model,
      jobs.pending_judge_model,
      jobs.pending_optimizer_reasoning_effort,
      jobs.pending_judge_reasoning_effort,
      jobs.status,
      jobs.run_mode,
      jobs.pack_version_id,
      jobs.current_round,
      (
        SELECT COUNT(*)
        FROM candidates
        WHERE candidates.job_id = jobs.id
      ) AS candidate_count,
      jobs.best_average_score,
      COALESCE(latest_candidate.optimized_prompt, jobs.raw_prompt) AS latest_prompt,
      jobs.goal_anchor_json,
      jobs.goal_anchor_explanation_json,
      jobs.max_rounds_override,
      jobs.next_round_instruction,
      jobs.next_round_instruction_updated_at,
      jobs.pending_steering_json,
      jobs.pass_streak,
      jobs.last_review_score,
      jobs.last_review_patch_json,
      jobs.final_candidate_id,
      jobs.conversation_policy,
      jobs.conversation_group_id,
      jobs.cancel_requested_at,
      jobs.pause_requested_at,
      jobs.custom_rubric_md,
      jobs.error_message,
      jobs.created_at,
      jobs.updated_at
    FROM jobs
    LEFT JOIN candidates AS latest_candidate
      ON latest_candidate.id = (
        SELECT candidates.id
        FROM candidates
        WHERE candidates.job_id = jobs.id
        ORDER BY candidates.round_number DESC, datetime(candidates.created_at) DESC
        LIMIT 1
      )
    ORDER BY datetime(jobs.created_at) DESC
  `).all() as Record<string, unknown>[]

  return rows
    .map((row) => maybeRepairLegacyGoalAnchorRow(db, row))
    .map(mapJobRow)
}

export function getJobById(id: string) {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      jobs.id,
      jobs.title,
      jobs.raw_prompt,
      jobs.optimizer_model,
      jobs.judge_model,
      jobs.optimizer_reasoning_effort,
      jobs.judge_reasoning_effort,
      jobs.pending_optimizer_model,
      jobs.pending_judge_model,
      jobs.pending_optimizer_reasoning_effort,
      jobs.pending_judge_reasoning_effort,
      jobs.status,
      jobs.run_mode,
      jobs.pack_version_id,
      jobs.current_round,
      (
        SELECT COUNT(*)
        FROM candidates
        WHERE candidates.job_id = jobs.id
      ) AS candidate_count,
      jobs.best_average_score,
      COALESCE(latest_candidate.optimized_prompt, jobs.raw_prompt) AS latest_prompt,
      jobs.goal_anchor_json,
      jobs.goal_anchor_explanation_json,
      jobs.max_rounds_override,
      jobs.next_round_instruction,
      jobs.next_round_instruction_updated_at,
      jobs.pending_steering_json,
      jobs.pass_streak,
      jobs.last_review_score,
      jobs.last_review_patch_json,
      jobs.final_candidate_id,
      jobs.conversation_policy,
      jobs.conversation_group_id,
      jobs.cancel_requested_at,
      jobs.pause_requested_at,
      jobs.custom_rubric_md,
      jobs.error_message,
      jobs.created_at,
      jobs.updated_at
    FROM jobs
    LEFT JOIN candidates AS latest_candidate
      ON latest_candidate.id = (
        SELECT candidates.id
        FROM candidates
        WHERE candidates.job_id = jobs.id
        ORDER BY candidates.round_number DESC, datetime(candidates.created_at) DESC
        LIMIT 1
      )
    WHERE jobs.id = ?
  `).get(id) as Record<string, unknown> | undefined

  return row ? mapJobRow(maybeRepairLegacyGoalAnchorRow(db, row)) : null
}

export function getJobDetail(id: string): JobDetail | null {
  const job = getJobById(id)
  if (!job) {
    return null
  }

  const db = getDb()
  const candidateRows = db.prepare(`
    SELECT
      id,
      job_id,
      round_number,
      optimized_prompt,
      strategy,
      score_before,
      average_score,
      major_changes_json,
      mve,
      dead_end_signals_json,
      aggregated_issues_json,
      applied_steering_json,
      created_at
    FROM candidates
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
  `).all(id) as Record<string, unknown>[]

  const judgeRows = db.prepare(`
    SELECT
      id,
      job_id,
      candidate_id,
      judge_index,
      score,
      has_material_issues,
      summary,
      drift_labels_json,
      drift_explanation,
      findings_json,
      suggested_changes_json,
      created_at
    FROM judge_runs
    WHERE job_id = ?
    ORDER BY candidate_id, judge_index ASC
  `).all(id) as Record<string, unknown>[]

  const judgesByCandidate = new Map<string, JudgeRunRecord[]>()
  for (const row of judgeRows) {
    const judge = mapJudgeRow(row)
    const list = judgesByCandidate.get(judge.candidateId) ?? []
    list.push(judge)
    judgesByCandidate.set(judge.candidateId, list)
  }

  const collapsedCandidateRows = collapseCandidateRowsByRound(candidateRows)

  return {
    job,
    candidates: collapsedCandidateRows.map((row) => {
      const candidate = mapCandidateRow(row)
      return {
        ...candidate,
        judges: judgesByCandidate.get(candidate.id) ?? [],
      }
    }),
  }
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

  const db = getDb()
  db.prepare(`
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
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET custom_rubric_md = ?,
        updated_at = ?
    WHERE id = ?
  `).run(normalizedRubric || null, new Date().toISOString(), jobId)

  return requireJob(jobId)
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
  const db = getDb()
  const normalizedGoalAnchor = normalizeGoalAnchor(goalAnchor)
  const consumedSteeringIds = options.consumePendingSteeringIds?.length
    ? new Set(options.consumePendingSteeringIds)
    : null
  const nextPendingSteeringItems = consumedSteeringIds
    ? job.pendingSteeringItems.filter((item) => !consumedSteeringIds.has(item.id))
    : job.pendingSteeringItems

  db.prepare(`
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

  return setPendingSteeringItems(jobId, nextItems)
}

export function removePendingSteeringItem(jobId: string, itemId: string) {
  const job = requireSteerableJob(jobId)
  return setPendingSteeringItems(jobId, job.pendingSteeringItems.filter((item) => item.id !== itemId))
}

export function clearPendingSteeringItems(jobId: string) {
  requireSteerableJob(jobId)
  return setPendingSteeringItems(jobId, [])
}

export function consumePendingSteeringItems(jobId: string, consumedItemIds: string[]) {
  const job = requireJob(jobId)
  if (consumedItemIds.length === 0) {
    return job
  }

  const consumedSet = new Set(consumedItemIds)
  return setPendingSteeringItems(jobId, job.pendingSteeringItems.filter((item) => !consumedSet.has(item.id)))
}

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

export function updateJobNextRoundInstruction(jobId: string, nextRoundInstruction: string) {
  const job = requireSteerableJob(jobId)
  const normalizedInstruction = normalizeSteeringText(nextRoundInstruction)
  const updatedAt = normalizedInstruction
    ? createNextInstructionUpdatedAt(readLegacyNextRoundInstructionUpdatedAt(jobId))
    : null
  const db = getDb()
  db.prepare(`
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

  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        updated_at = ?
    WHERE id = ?
      AND next_round_instruction_updated_at = ?
  `).run(new Date().toISOString(), jobId, expectedUpdatedAt)

  return requireJob(jobId)
}

export function pauseJob(jobId: string) {
  const job = requireJob(jobId)
  const db = getDb()
  const now = new Date().toISOString()

  if (job.status === 'completed') {
    throw new Error('已完成任务不能暂停。')
  }

  if (job.status === 'cancelled') {
    throw new Error('已取消任务不能暂停。')
  }

  if (job.status === 'paused') {
    return job
  }

  if (job.status === 'running') {
    db.prepare(`
      UPDATE jobs
      SET pause_requested_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, jobId)
    return requireJob(jobId)
  }

  db.prepare(`
    UPDATE jobs
    SET status = 'paused',
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        pause_requested_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(now, jobId)

  return requireJob(jobId)
}

export function resumeJobStep(jobId: string) {
  return resumeJob(jobId, 'step')
}

export function resumeJobAuto(jobId: string) {
  return resumeJob(jobId, 'auto')
}

export function cancelJob(jobId: string) {
  const job = requireJob(jobId)
  const db = getDb()
  const now = new Date().toISOString()

  if (job.status === 'completed') {
    throw new Error('已完成任务不能取消。')
  }

  if (job.status === 'cancelled') {
    return job
  }

  if (job.status === 'running') {
    db.prepare(`
      UPDATE jobs
      SET cancel_requested_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, jobId)
    return requireJob(jobId)
  }

  db.prepare(`
    UPDATE jobs
    SET status = 'cancelled',
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        cancel_requested_at = NULL,
        pause_requested_at = NULL,
        error_message = '任务已取消。',
        updated_at = ?
    WHERE id = ?
  `).run(now, jobId)

  return requireJob(jobId)
}

export function finalizeCancelledJob(jobId: string) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET status = 'cancelled',
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        cancel_requested_at = NULL,
        pause_requested_at = NULL,
        error_message = '任务已取消。',
        updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), jobId)

  return requireJob(jobId)
}

export function completeJob(jobId: string) {
  const job = requireJob(jobId)

  if (job.status === 'completed') {
    return job
  }

  if (job.status === 'running') {
    throw new Error('运行中的任务不能手动完成，请先暂停后再完成。')
  }

  if (job.status === 'pending') {
    throw new Error('任务还未开始运行，无法完成。请先跑至少一轮或取消任务。')
  }

  if (job.status === 'cancelled') {
    throw new Error('已取消任务不能完成。')
  }

  if (job.status !== 'paused' && job.status !== 'manual_review' && job.status !== 'failed') {
    throw new Error('当前状态不支持手动完成任务。')
  }

  const db = getDb()
  const latestCandidate = db.prepare(`
    SELECT id
    FROM candidates
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
    LIMIT 1
  `).get(jobId) as { id?: string } | undefined

  if (!latestCandidate?.id) {
    throw new Error('请先跑至少一轮生成候选稿；如果只是想归档，请直接取消任务。')
  }

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE jobs
    SET status = 'completed',
        final_candidate_id = ?,
        pending_optimizer_model = NULL,
        pending_judge_model = NULL,
        pending_optimizer_reasoning_effort = NULL,
        pending_judge_reasoning_effort = NULL,
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        cancel_requested_at = NULL,
        pause_requested_at = NULL,
        error_message = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(String(latestCandidate.id), now, jobId)

  return requireJob(jobId)
}

export function applyPendingJobModels(jobId: string) {
  const job = requireJob(jobId)
  if (
    !job.pendingOptimizerModel
    && !job.pendingJudgeModel
    && job.pendingOptimizerReasoningEffort === null
    && job.pendingJudgeReasoningEffort === null
  ) {
    return job
  }

  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET optimizer_model = COALESCE(NULLIF(pending_optimizer_model, ''), optimizer_model),
        judge_model = COALESCE(NULLIF(pending_judge_model, ''), judge_model),
        optimizer_reasoning_effort = COALESCE(NULLIF(pending_optimizer_reasoning_effort, ''), optimizer_reasoning_effort),
        judge_reasoning_effort = COALESCE(NULLIF(pending_judge_reasoning_effort, ''), judge_reasoning_effort),
        pending_optimizer_model = NULL,
        pending_judge_model = NULL,
        pending_optimizer_reasoning_effort = NULL,
        pending_judge_reasoning_effort = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), jobId)

  return requireJob(jobId)
}

export function updateJobReviewState(jobId: string, input: {
  passStreak: number
  bestAverageScore: number
  lastReviewScore: number
  lastReviewPatch: string[]
  currentRound: number
  finalCandidateId?: string | null
  status: JobRecord['status']
  errorMessage?: string | null
}) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET pass_streak = ?,
        best_average_score = ?,
        last_review_score = ?,
        last_review_patch_json = ?,
        current_round = ?,
        final_candidate_id = ?,
        status = ?,
        active_worker_id = CASE WHEN ? = 'running' THEN active_worker_id ELSE NULL END,
        worker_heartbeat_at = CASE WHEN ? = 'running' THEN ? ELSE NULL END,
        pause_requested_at = NULL,
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    input.passStreak,
    input.bestAverageScore,
    input.lastReviewScore,
    JSON.stringify(compactFeedback(input.lastReviewPatch, { maxItems: 5, maxItemLength: 180 })),
    input.currentRound,
    input.finalCandidateId ?? null,
    input.status,
    input.status,
    input.status,
    new Date().toISOString(),
    input.errorMessage ?? null,
    new Date().toISOString(),
    jobId,
  )
}

export function resetJobForRetry(id: string) {
  const job = requireJob(id)
  if (job.status === 'running') {
    throw new Error('运行中的任务请先取消，或等待当前轮结束。')
  }
  if (job.status === 'completed') {
    throw new Error('已完成任务不能直接重新开始。')
  }

  applyPendingJobModels(id)
  const db = getDb()
  db.prepare('DELETE FROM judge_runs WHERE job_id = ?').run(id)
  db.prepare('DELETE FROM candidates WHERE job_id = ?').run(id)
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        run_mode = 'auto',
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        current_round = 0,
        best_average_score = 0,
        next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        pending_steering_json = '[]',
        pass_streak = 0,
        last_review_score = 0,
        last_review_patch_json = '[]',
        final_candidate_id = NULL,
        cancel_requested_at = NULL,
        pause_requested_at = NULL,
        error_message = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id)

  return requireJob(id)
}

export function getOptimizerSeed(jobId: string) {
  const job = requireJob(jobId)
  const db = getDb()
  const candidate = db.prepare(`
    SELECT round_number, optimized_prompt
    FROM candidates
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
    LIMIT 1
  `).get(jobId) as Record<string, unknown> | undefined

  const legacyUpdatedAt = readLegacyNextRoundInstructionUpdatedAt(jobId)

  return {
    currentPrompt: candidate ? String(candidate.optimized_prompt) : job.rawPrompt,
    latestRoundNumber: candidate ? Number(candidate.round_number ?? 0) : 0,
    previousFeedback: job.lastReviewPatch,
    goalAnchor: job.goalAnchor,
    pendingSteeringItems: job.pendingSteeringItems,
    nextRoundInstruction: job.pendingSteeringItems[0]?.text ?? null,
    nextRoundInstructionUpdatedAt: legacyUpdatedAt,
  }
}

export function createCandidateWithJudges(jobId: string, input: {
  roundNumber: number
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  averageScore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  aggregatedIssues: string[]
  appliedSteeringItems?: SteeringItem[]
  judgments: JudgeRunRecord[]
}) {
  validateCandidateWriteInput(input)

  const db = getDb()
  const candidateId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  insertCandidateAndJudgments(db, jobId, candidateId, input.roundNumber, input, createdAt)
  return candidateId
}

export function createCandidateWithJudgesForActiveWorker(jobId: string, workerOwnerId: string, input: {
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  averageScore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  aggregatedIssues: string[]
  appliedSteeringItems?: SteeringItem[]
  judgments: JudgeRunRecord[]
}) {
  validateCandidateWriteInput(input)

  const db = getDb()
  const candidateId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  let transactionOpen = false

  try {
    db.exec('BEGIN IMMEDIATE')
    transactionOpen = true

    const jobRow = db.prepare(`
      SELECT status, active_worker_id, current_round
      FROM jobs
      WHERE id = ?
    `).get(jobId) as { status?: string; active_worker_id?: string | null; current_round?: number } | undefined

    if (!jobRow || String(jobRow.status ?? '') !== 'running' || String(jobRow.active_worker_id ?? '') !== workerOwnerId) {
      db.exec('ROLLBACK')
      transactionOpen = false
      return null
    }

    const maxRoundRow = db.prepare(`
      SELECT COALESCE(MAX(round_number), 0) AS max_round
      FROM candidates
      WHERE job_id = ?
    `).get(jobId) as { max_round?: number } | undefined

    const nextRound = Math.max(Number(jobRow.current_round ?? 0), Number(maxRoundRow?.max_round ?? 0)) + 1
    insertCandidateAndJudgments(db, jobId, candidateId, nextRound, input, createdAt)

    db.exec('COMMIT')
    transactionOpen = false
    return { candidateId, roundNumber: nextRound }
  } catch (error) {
    if (transactionOpen) {
      try {
        db.exec('ROLLBACK')
      } catch {
      }
    }
    throw error
  }
}

function validateCandidateWriteInput(input: {
  scoreBefore: number
  averageScore: number
  judgments: JudgeRunRecord[]
}) {
  assertFiniteScore(input.scoreBefore, 'scoreBefore')
  assertFiniteScore(input.averageScore, 'averageScore')
  for (const judgment of input.judgments) {
    assertFiniteScore(judgment.score, `judgments[${judgment.judgeIndex}].score`)
  }
}

function insertCandidateAndJudgments(
  db: DatabaseSync,
  jobId: string,
  candidateId: string,
  roundNumber: number,
  input: {
    optimizedPrompt: string
    strategy: 'preserve' | 'rebuild'
    scoreBefore: number
    averageScore: number
    majorChanges: string[]
    mve: string
    deadEndSignals: string[]
    aggregatedIssues: string[]
    appliedSteeringItems?: SteeringItem[]
    judgments: JudgeRunRecord[]
  },
  createdAt: string,
) {
  db.prepare(`
    INSERT INTO candidates (
      id,
      job_id,
      round_number,
      optimized_prompt,
      strategy,
      score_before,
      average_score,
      major_changes_json,
      mve,
      dead_end_signals_json,
      aggregated_issues_json,
      applied_steering_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candidateId,
    jobId,
    roundNumber,
    input.optimizedPrompt,
    input.strategy,
    input.scoreBefore,
    input.averageScore,
    JSON.stringify(compactFeedback(input.majorChanges, { maxItems: 6, maxItemLength: 180 })),
    input.mve,
    JSON.stringify(compactFeedback(input.deadEndSignals, { maxItems: 6, maxItemLength: 140 })),
    JSON.stringify(compactFeedback(input.aggregatedIssues, { maxItems: 8, maxItemLength: 180 })),
    serializeSteeringItems(input.appliedSteeringItems ?? []),
    createdAt,
  )

  for (const judgment of input.judgments) {
    db.prepare(`
      INSERT INTO judge_runs (
        id,
        job_id,
        candidate_id,
        judge_index,
        score,
        has_material_issues,
        summary,
        drift_labels_json,
        drift_explanation,
        findings_json,
        suggested_changes_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      judgment.id,
      jobId,
      candidateId,
      judgment.judgeIndex,
      judgment.score,
      judgment.hasMaterialIssues ? 1 : 0,
      judgment.summary,
      JSON.stringify(compactFeedback(judgment.driftLabels, { maxItems: 3, maxItemLength: 60 })),
      judgment.driftExplanation,
      JSON.stringify(compactFeedback(judgment.findings, { maxItems: 6, maxItemLength: 180 })),
      JSON.stringify(compactFeedback(judgment.suggestedChanges, { maxItems: 6, maxItemLength: 180 })),
      judgment.createdAt,
    )
  }
}

export function updateJobProgress(jobId: string, input: {
  status: JobRecord['status']
  currentRound: number
  bestAverageScore: number
  finalCandidateId?: string | null
  errorMessage?: string | null
}) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET status = ?,
        current_round = ?,
        best_average_score = ?,
        final_candidate_id = ?,
        active_worker_id = CASE WHEN ? = 'running' THEN active_worker_id ELSE NULL END,
        worker_heartbeat_at = CASE WHEN ? = 'running' THEN worker_heartbeat_at ELSE NULL END,
        pause_requested_at = CASE WHEN ? = 'running' THEN pause_requested_at ELSE NULL END,
        error_message = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    input.status,
    input.currentRound,
    input.bestAverageScore,
    input.finalCandidateId ?? null,
    input.status,
    input.status,
    input.status,
    input.errorMessage ?? null,
    new Date().toISOString(),
    jobId,
  )
}

export function heartbeatJobClaim(jobId: string, workerOwnerId: string) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET worker_heartbeat_at = ?
    WHERE id = ?
      AND status = 'running'
      AND active_worker_id = ?
  `).run(new Date().toISOString(), jobId, workerOwnerId)
}

export function claimNextRunnableJob(workerOwnerId: string) {
  const db = getDb()
  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - JOB_CLAIM_STALE_AFTER_MS).toISOString()
  const row = db.prepare(`
    SELECT id
    FROM jobs
    WHERE status = 'pending'
       OR (
         status = 'running'
         AND (
           active_worker_id IS NULL
           OR active_worker_id = ''
           OR worker_heartbeat_at IS NULL
           OR worker_heartbeat_at <= ?
         )
       )
    ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, datetime(created_at) ASC
    LIMIT 1
  `).get(staleBefore) as { id?: string } | undefined

  if (!row?.id) {
    return null
  }

  const result = db.prepare(`
    UPDATE jobs
    SET status = 'running',
        active_worker_id = ?,
        worker_heartbeat_at = ?,
        updated_at = ?
    WHERE id = ?
      AND (
        status = 'pending'
        OR (
          status = 'running'
          AND (
            active_worker_id IS NULL
            OR active_worker_id = ''
            OR worker_heartbeat_at IS NULL
            OR worker_heartbeat_at <= ?
          )
        )
      )
  `).run(workerOwnerId, now, now, row.id, staleBefore)

  if (result.changes === 0) {
    return null
  }

  return requireJob(row.id)
}

function resumeJob(jobId: string, runMode: JobRunMode) {
  const job = requireJob(jobId)

  if (job.status === 'running') {
    throw new Error('任务正在运行中，无需重复继续。')
  }

  if (job.status === 'completed') {
    throw new Error('已完成任务不能继续运行。')
  }

  if (job.status === 'cancelled') {
    throw new Error('已取消任务不能继续运行。')
  }

  const effectiveMaxRounds = resolveEffectiveMaxRounds(job, getSettings().maxRounds)
  if (job.currentRound >= effectiveMaxRounds) {
    throw new Error('请先提高任务级最大轮数后再继续运行。')
  }

  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        run_mode = ?,
        active_worker_id = NULL,
        worker_heartbeat_at = NULL,
        cancel_requested_at = NULL,
        pause_requested_at = NULL,
        error_message = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(runMode, new Date().toISOString(), jobId)

  return requireJob(jobId)
}

function resolveJobModels(input: JobInput, settings: ReturnType<typeof getSettings>) {
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

async function resolveInitialGoalAnchor(
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

function maybeRepairLegacyGoalAnchorRow(db: DatabaseSync, row: Record<string, unknown>) {
  const rawPrompt = String(row.raw_prompt ?? '')
  const goalAnchor = parseGoalAnchor(row.goal_anchor_json)
  const explanation = parseGoalAnchorExplanation(row.goal_anchor_explanation_json)

  if (!shouldRepairLegacyGoalAnchor(rawPrompt, goalAnchor, explanation)) {
    return row
  }

  const repairedGoalAnchor = deriveGoalAnchor(rawPrompt)
  const repairedExplanation = deriveGoalAnchorExplanation(rawPrompt, repairedGoalAnchor)
  const goalAnchorJson = serializeGoalAnchor(repairedGoalAnchor)
  const explanationJson = serializeGoalAnchorExplanation(repairedExplanation)
  const updatedAt = new Date().toISOString()

  db.prepare(`
    UPDATE jobs
    SET goal_anchor_json = ?,
        goal_anchor_explanation_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(goalAnchorJson, explanationJson, updatedAt, String(row.id))

  return {
    ...row,
    goal_anchor_json: goalAnchorJson,
    goal_anchor_explanation_json: explanationJson,
    updated_at: updatedAt,
  }
}

function shouldRepairLegacyGoalAnchor(
  rawPrompt: string,
  goalAnchor: GoalAnchor,
  explanation: GoalAnchorExplanation,
) {
  if (shouldRepairMalformedStructuredPromptAnchor(rawPrompt, goalAnchor, explanation)) {
    return true
  }

  const hasLegacyDeliverable = normalizeForCompare(goalAnchor.deliverable) === normalizeForCompare(LEGACY_GENERIC_DELIVERABLE)
  if (!hasLegacyDeliverable) {
    return false
  }

  const hasLegacyGuards = sameNormalizedSet(goalAnchor.driftGuard, LEGACY_GENERIC_DRIFT_GUARD)
  if (!hasLegacyGuards) {
    return false
  }

  const normalizedSource = normalizeForCompare(explanation.sourceSummary)
  const normalizedPrompt = normalizeForCompare(rawPrompt)
  const sourceLooksLegacy = normalizedSource === normalizedPrompt
    || LEGACY_GENERIC_SOURCE_SUMMARIES.some((item) => normalizeForCompare(item) === normalizedSource)
  const rationaleLooksLegacy = explanation.rationale.some((item) => item.includes('防漂移条款用于防止优化过程'))
    || explanation.rationale.some((item) => item.includes('系统把任务理解为：'))

  return sourceLooksLegacy || rationaleLooksLegacy
}

function shouldRepairMalformedStructuredPromptAnchor(
  rawPrompt: string,
  goalAnchor: GoalAnchor,
  explanation: GoalAnchorExplanation,
) {
  const normalizedPrompt = normalizeForCompare(rawPrompt)
  const looksLikeStructuredPrompt = /(?:#|##)\s/.test(rawPrompt)
    && /(?:提示词|prompt)/iu.test(rawPrompt)
    && /(?:核心目标|任务定义|策略总则|核心原则|最终版本|可直接使用|互斥路径|工程审计流程)/u.test(rawPrompt)

  if (!looksLikeStructuredPrompt) {
    return false
  }

  const goalLooksMalformed = /^#/.test(goalAnchor.goal)
    || /(?:Role:|##\s*\d|初始化与身份锁定|语言规则)/iu.test(goalAnchor.goal)
  const deliverableLooksMalformed = /(?:做法指导|食材|料理|用于后的完整提示词)/u.test(goalAnchor.deliverable)
  const guardsLookMalformed = goalAnchor.driftGuard.some((item) => /(?:做菜建议|食材清单|其他料理|聚焦法指导)/u.test(item))
  const sourceLooksRawPrompt = normalizeForCompare(explanation.sourceSummary) === normalizedPrompt
  const rationaleLooksMalformed = explanation.rationale.some((item) => /(?:系统把任务理解为：#|做法指导|食材与注意事项)/u.test(item))

  return goalLooksMalformed || deliverableLooksMalformed || guardsLookMalformed || (sourceLooksRawPrompt && rationaleLooksMalformed)
}

function listConversationGroups(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT id, jobs_assigned, max_jobs, retired, created_at, retired_at
    FROM conversation_groups
    ORDER BY datetime(created_at) ASC
  `).all() as Record<string, unknown>[]

  return rows.map((row) => ({
    id: String(row.id),
    jobsAssigned: Number(row.jobs_assigned),
    maxJobs: Number(row.max_jobs),
    retired: Boolean(row.retired),
    createdAt: String(row.created_at),
    retiredAt: row.retired_at ? String(row.retired_at) : null,
  }))
}

function upsertConversationGroup(db: DatabaseSync, group: ReturnType<typeof assignConversationGroup>['group']) {
  if (!group) {
    return
  }

  const exists = db.prepare('SELECT id FROM conversation_groups WHERE id = ?').get(group.id) as { id?: string } | undefined
  if (exists) {
    db.prepare(`
      UPDATE conversation_groups
      SET jobs_assigned = ?, retired = ?, retired_at = ?
      WHERE id = ?
    `).run(group.jobsAssigned, group.retired ? 1 : 0, group.retiredAt, group.id)
    return
  }

  db.prepare(`
    INSERT INTO conversation_groups (id, policy, jobs_assigned, max_jobs, retired, created_at, retired_at)
    VALUES (?, 'pooled-3x', ?, ?, ?, ?, ?)
  `).run(group.id, group.jobsAssigned, group.maxJobs, group.retired ? 1 : 0, group.createdAt, group.retiredAt)
}

function normalizeTitle(title: string, rawPrompt: string) {
  const candidate = title.trim()
  if (candidate) {
    return candidate
  }
  return rawPrompt.replace(/\s+/g, ' ').slice(0, 48) || 'Untitled Prompt'
}

function requireJob(jobId: string) {
  const job = getJobById(jobId)
  if (!job) {
    throw new Error(`Job not found: ${jobId}`)
  }
  return job
}

function assertFiniteScore(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`候选稿分数字段无效：${fieldName}`)
  }
}

function normalizeMaxRoundsOverride(value: number | null) {
  if (value === null) {
    return null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error('任务级最大轮数必须是数字。')
  }

  return Math.min(99, Math.max(1, Math.round(numeric)))
}

function normalizeSteeringText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function normalizeNextRoundInstruction(value: string) {
  return normalizeSteeringText(value)
}

function normalizeSteeringItems(items: SteeringItem[]) {
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

function serializeSteeringItems(items: SteeringItem[]) {
  return JSON.stringify(normalizeSteeringItems(items))
}

function parseSteeringItems(value: unknown, legacyText?: string | null, legacyUpdatedAt?: string | null) {
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

function setPendingSteeringItems(jobId: string, items: SteeringItem[]) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs
    SET pending_steering_json = ?,
        next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(serializeSteeringItems(items), new Date().toISOString(), jobId)

  return requireJob(jobId)
}

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

function readLegacyNextRoundInstructionUpdatedAt(jobId: string) {
  const row = getDb().prepare(`
    SELECT next_round_instruction_updated_at
    FROM jobs
    WHERE id = ?
  `).get(jobId) as { next_round_instruction_updated_at?: string | null } | undefined

  return row?.next_round_instruction_updated_at ? String(row.next_round_instruction_updated_at) : null
}

function createNextInstructionUpdatedAt(previousUpdatedAt: string | null) {
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

function buildLegacySteeringId(text: string, updatedAt: string | null) {
  return `legacy-${createHash('sha1').update(`${updatedAt ?? ''}:${text}`).digest('hex').slice(0, 12)}`
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString()
}

function uniqueOrderedStrings(values: string[]) {
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

function sameNormalizedSet(left: string[], right: string[]) {
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

function normalizeForCompare(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function resolveEffectiveMaxRounds(job: Pick<JobRecord, 'maxRoundsOverride'>, defaultMaxRounds: number) {
  return job.maxRoundsOverride ?? defaultMaxRounds
}

function mapJobRow(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    rawPrompt: String(row.raw_prompt),
    optimizerModel: String(row.optimizer_model ?? ''),
    judgeModel: String(row.judge_model ?? ''),
    optimizerReasoningEffort: normalizeReasoningEffort(row.optimizer_reasoning_effort),
    judgeReasoningEffort: normalizeReasoningEffort(row.judge_reasoning_effort),
    pendingOptimizerModel: row.pending_optimizer_model ? String(row.pending_optimizer_model) : null,
    pendingJudgeModel: row.pending_judge_model ? String(row.pending_judge_model) : null,
    pendingOptimizerReasoningEffort: row.pending_optimizer_reasoning_effort
      ? normalizeReasoningEffort(row.pending_optimizer_reasoning_effort)
      : null,
    pendingJudgeReasoningEffort: row.pending_judge_reasoning_effort
      ? normalizeReasoningEffort(row.pending_judge_reasoning_effort)
      : null,
    status: row.status as JobRecord['status'],
    runMode: (row.run_mode ?? 'auto') as JobRunMode,
    packVersionId: String(row.pack_version_id),
    currentRound: Number(row.current_round),
    candidateCount: Number(row.candidate_count ?? 0),
    bestAverageScore: Number(row.best_average_score),
    latestPrompt: String(row.latest_prompt ?? row.raw_prompt ?? ''),
    goalAnchor: parseGoalAnchor(row.goal_anchor_json),
    goalAnchorExplanation: parseGoalAnchorExplanation(row.goal_anchor_explanation_json),
    maxRoundsOverride: row.max_rounds_override === null || row.max_rounds_override === undefined
      ? null
      : Number(row.max_rounds_override),
    pendingSteeringItems: parseSteeringItems(
      row.pending_steering_json,
      row.next_round_instruction ? String(row.next_round_instruction) : null,
      row.next_round_instruction_updated_at ? String(row.next_round_instruction_updated_at) : null,
    ),
    passStreak: Number(row.pass_streak ?? 0),
    lastReviewScore: Number(row.last_review_score ?? 0),
    lastReviewPatch: parseJsonArray(row.last_review_patch_json),
    finalCandidateId: row.final_candidate_id ? String(row.final_candidate_id) : null,
    conversationPolicy: row.conversation_policy as JobRecord['conversationPolicy'],
    conversationGroupId: row.conversation_group_id ? String(row.conversation_group_id) : null,
    cancelRequestedAt: row.cancel_requested_at ? String(row.cancel_requested_at) : null,
    pauseRequestedAt: row.pause_requested_at ? String(row.pause_requested_at) : null,
    customRubricMd: row.custom_rubric_md ? String(row.custom_rubric_md) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function collapseCandidateRowsByRound(rows: Record<string, unknown>[]) {
  const seenRounds = new Set<number>()
  const result: Record<string, unknown>[] = []

  for (const row of rows) {
    const roundNumber = Number(row.round_number)
    if (seenRounds.has(roundNumber)) {
      continue
    }

    seenRounds.add(roundNumber)
    result.push(row)
  }

  return result
}

function mapCandidateRow(row: Record<string, unknown>): CandidateRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    roundNumber: Number(row.round_number),
    optimizedPrompt: String(row.optimized_prompt),
    strategy: row.strategy as CandidateRecord['strategy'],
    scoreBefore: Number(row.score_before),
    averageScore: Number(row.average_score),
    majorChanges: parseJsonArray(row.major_changes_json),
    mve: String(row.mve),
    deadEndSignals: parseJsonArray(row.dead_end_signals_json),
    aggregatedIssues: parseJsonArray(row.aggregated_issues_json),
    appliedSteeringItems: parseSteeringItems(row.applied_steering_json),
    createdAt: String(row.created_at),
  }
}

function mapJudgeRow(row: Record<string, unknown>): JudgeRunRecord {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    candidateId: String(row.candidate_id),
    judgeIndex: Number(row.judge_index),
    score: Number(row.score),
    hasMaterialIssues: Boolean(row.has_material_issues),
    summary: String(row.summary),
    driftLabels: parseJsonArray(row.drift_labels_json),
    driftExplanation: row.drift_explanation ? String(row.drift_explanation) : '',
    findings: parseJsonArray(row.findings_json),
    suggestedChanges: parseJsonArray(row.suggested_changes_json),
    createdAt: String(row.created_at),
  }
}

function parseJsonArray(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return []
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}
