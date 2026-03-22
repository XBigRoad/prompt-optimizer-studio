import type { DatabaseSync } from 'node:sqlite'

import { assignConversationGroup } from '@/lib/engine/conversation-policy'
import { getDb } from '@/lib/server/db/index'
import { compactFeedback } from '@/lib/server/prompting'
import type { JudgeRunRecord, SteeringItem } from '@/lib/contracts'

import { JOB_CLAIM_STALE_AFTER_MS, serializeSteeringItems } from '@/lib/server/jobs/shared-internal'

export function listConversationGroups(db: DatabaseSync) {
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

export function upsertConversationGroup(db: DatabaseSync, group: ReturnType<typeof assignConversationGroup>['group']) {
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

export function selectJobRows() {
  return getDb().prepare(`
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
}

export function selectJobRowById(id: string) {
  return getDb().prepare(`
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
}

export function selectCandidateRowsByJobId(id: string) {
  return getDb().prepare(`
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
}

export function selectRoundRunRowsByJobId(id: string) {
  return getDb().prepare(`
    SELECT
      id,
      job_id,
      round_number,
      input_prompt,
      input_candidate_id,
      output_candidate_id,
      displayed_score,
      has_material_issues,
      summary,
      drift_labels_json,
      drift_explanation,
      findings_json,
      suggested_changes_json,
      round_status,
      optimizer_error,
      judge_error,
      pass_streak_after,
      optimizer_telemetry_json,
      judge_telemetry_json,
      created_at
    FROM round_runs
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
  `).all(id) as Record<string, unknown>[]
}

export function selectJudgeRowsByJobId(id: string) {
  return getDb().prepare(`
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
}

export function selectLatestCandidateSeed(jobId: string) {
  return getDb().prepare(`
    SELECT id, round_number, optimized_prompt
    FROM candidates
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
    LIMIT 1
  `).get(jobId) as Record<string, unknown> | undefined
}

export function selectLatestCandidateId(jobId: string) {
  return getDb().prepare(`
    SELECT id
    FROM candidates
    WHERE job_id = ?
    ORDER BY round_number DESC, datetime(created_at) DESC
    LIMIT 1
  `).get(jobId) as { id?: string } | undefined
}

export function readLegacyNextRoundInstructionUpdatedAt(jobId: string) {
  const row = getDb().prepare(`
    SELECT next_round_instruction_updated_at
    FROM jobs
    WHERE id = ?
  `).get(jobId) as { next_round_instruction_updated_at?: string | null } | undefined

  return row?.next_round_instruction_updated_at ? String(row.next_round_instruction_updated_at) : null
}

export function setPendingSteeringItems(jobId: string, items: SteeringItem[]) {
  getDb().prepare(`
    UPDATE jobs
    SET pending_steering_json = ?,
        next_round_instruction = NULL,
        next_round_instruction_updated_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(serializeSteeringItems(items), new Date().toISOString(), jobId)
}

export function insertCandidateAndJudgments(
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

export function claimNextRunnableJobRow(workerOwnerId: string) {
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

  return result.changes === 0 ? null : String(row.id)
}

export function heartbeatJobClaim(jobId: string, workerOwnerId: string) {
  getDb().prepare(`
    UPDATE jobs
    SET worker_heartbeat_at = ?
    WHERE id = ?
      AND status = 'running'
      AND active_worker_id = ?
  `).run(new Date().toISOString(), jobId, workerOwnerId)
}

export function releaseJobClaimInRepository(jobId: string, workerOwnerId: string) {
  const result = getDb().prepare(`
    UPDATE jobs
    SET active_worker_id = NULL,
        worker_heartbeat_at = NULL
    WHERE id = ?
      AND status = 'running'
      AND active_worker_id = ?
  `).run(jobId, workerOwnerId)

  return result.changes > 0
}
