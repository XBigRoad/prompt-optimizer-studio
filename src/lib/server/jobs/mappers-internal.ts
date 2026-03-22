import type { DatabaseSync } from 'node:sqlite'

import { getJobDisplayError } from '@/lib/presentation'
import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { normalizeProviderRequestTelemetryEvents } from '@/lib/server/request-telemetry'
import {
  deriveGoalAnchor,
  LEGACY_GENERIC_DELIVERABLE,
  LEGACY_GENERIC_DRIFT_GUARD,
  parseGoalAnchor,
  serializeGoalAnchor,
} from '@/lib/server/goal-anchor/index'
import {
  deriveGoalAnchorExplanation,
  LEGACY_GENERIC_SOURCE_SUMMARIES,
  parseGoalAnchorExplanation,
  serializeGoalAnchorExplanation,
} from '@/lib/server/goal-anchor/index'
import type {
  CandidateRecord,
  GoalAnchor,
  GoalAnchorExplanation,
  JobRunMode,
  JobRecord,
  JudgeRunRecord,
  RoundRunRecord,
} from '@/lib/contracts'

import { normalizeForCompare, parseSteeringItems, sameNormalizedSet } from '@/lib/server/jobs/shared-internal'

export { getJobDisplayError }

export function maybeRepairLegacyGoalAnchorRow(db: DatabaseSync, row: Record<string, unknown>) {
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

export function mapJobRow(row: Record<string, unknown>): JobRecord {
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

export function collapseCandidateRowsByRound(rows: Record<string, unknown>[]) {
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

export function mapCandidateRow(row: Record<string, unknown>): CandidateRecord {
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

export function mapJudgeRow(row: Record<string, unknown>): JudgeRunRecord {
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

export function mapRoundRunRows(
  rows: Record<string, unknown>[],
  candidates: Array<CandidateRecord & { judges: JudgeRunRecord[] }>,
): RoundRunRecord[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const judgedCandidateIds = new Set(
    rows
      .map((row) => row.input_candidate_id ? String(row.input_candidate_id) : null)
      .filter((value): value is string => Boolean(value)),
  )

  return rows.map((row) => {
    const outputCandidateId = row.output_candidate_id ? String(row.output_candidate_id) : null
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      roundNumber: Number(row.round_number),
      semantics: 'input-judged-output-handed-off',
      inputPrompt: String(row.input_prompt ?? ''),
      inputCandidateId: row.input_candidate_id ? String(row.input_candidate_id) : null,
      outputCandidateId,
      displayScore: row.displayed_score === null || row.displayed_score === undefined
        ? null
        : Number(row.displayed_score),
      hasMaterialIssues: row.has_material_issues === null || row.has_material_issues === undefined
        ? null
        : Boolean(row.has_material_issues),
      summary: String(row.summary ?? ''),
      driftLabels: parseJsonArray(row.drift_labels_json),
      driftExplanation: row.drift_explanation ? String(row.drift_explanation) : '',
      findings: parseJsonArray(row.findings_json),
      suggestedChanges: parseJsonArray(row.suggested_changes_json),
      outcome: (row.round_status ?? 'settled') as RoundRunRecord['outcome'],
      optimizerError: row.optimizer_error ? String(row.optimizer_error) : null,
      judgeError: row.judge_error ? String(row.judge_error) : null,
      passStreakAfter: Number(row.pass_streak_after ?? 0),
      outputJudged: outputCandidateId ? judgedCandidateIds.has(outputCandidateId) : false,
      outputCandidate: outputCandidateId
        ? sanitizeInputJudgedOutputCandidate(candidatesById.get(outputCandidateId) ?? null)
        : null,
      optimizerTelemetry: normalizeProviderRequestTelemetryEvents(parseJsonValue(row.optimizer_telemetry_json)),
      judgeTelemetry: normalizeProviderRequestTelemetryEvents(parseJsonValue(row.judge_telemetry_json)),
      createdAt: String(row.created_at),
    }
  })
}

export function synthesizeLegacyRoundRuns(
  candidates: Array<CandidateRecord & { judges: JudgeRunRecord[] }>,
): RoundRunRecord[] {
  return candidates.map((candidate) => {
    const review = candidate.judges[0] ?? null
    return {
      id: `legacy-${candidate.id}`,
      jobId: candidate.jobId,
      roundNumber: candidate.roundNumber,
      semantics: 'legacy-output-judged',
      inputPrompt: candidate.optimizedPrompt,
      inputCandidateId: candidate.id,
      outputCandidateId: candidate.id,
      displayScore: review?.score ?? candidate.averageScore,
      hasMaterialIssues: review?.hasMaterialIssues ?? null,
      summary: review?.summary ?? '',
      driftLabels: review?.driftLabels ?? [],
      driftExplanation: review?.driftExplanation ?? '',
      findings: review?.findings ?? [],
      suggestedChanges: review?.suggestedChanges ?? [],
      outcome: 'legacy',
      optimizerError: null,
      judgeError: null,
      passStreakAfter: 0,
      outputJudged: true,
      outputCandidate: candidate,
      optimizerTelemetry: [],
      judgeTelemetry: [],
      createdAt: candidate.createdAt,
    }
  })
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

function parseJsonValue(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return []
  }

  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function sanitizeInputJudgedOutputCandidate(
  candidate: (CandidateRecord & { judges: JudgeRunRecord[] }) | null,
): CandidateRecord | null {
  if (!candidate) {
    return null
  }

  return {
    ...candidate,
    averageScore: 0,
  }
}
