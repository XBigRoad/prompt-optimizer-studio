import { DEFAULT_SETTINGS } from '@/lib/server/constants'
import { getDb } from '@/lib/server/db/index'
import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import type { AppSettings } from '@/lib/contracts'
import { normalizeApiProtocol } from '@/lib/server/settings/validation'

export function getSettings(): AppSettings {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      cpamc_base_url,
      cpamc_api_key,
      api_protocol,
      default_optimizer_model,
      default_judge_model,
      default_optimizer_reasoning_effort,
      default_judge_reasoning_effort,
      score_threshold,
      judge_pass_count,
      max_rounds,
      no_improvement_limit,
      worker_concurrency,
      conversation_policy,
      custom_rubric_md,
      updated_at
    FROM settings
    WHERE id = 1
  `).get() as Record<string, unknown>

  return {
    cpamcBaseUrl: String(row.cpamc_base_url ?? ''),
    cpamcApiKey: String(row.cpamc_api_key ?? ''),
    apiProtocol: normalizeApiProtocol(row.api_protocol),
    defaultOptimizerModel: String(row.default_optimizer_model ?? ''),
    defaultJudgeModel: String(row.default_judge_model ?? ''),
    defaultOptimizerReasoningEffort: normalizeReasoningEffort(row.default_optimizer_reasoning_effort),
    defaultJudgeReasoningEffort: normalizeReasoningEffort(row.default_judge_reasoning_effort),
    scoreThreshold: Number(row.score_threshold ?? DEFAULT_SETTINGS.scoreThreshold),
    judgePassCount: Number(row.judge_pass_count ?? DEFAULT_SETTINGS.judgePassCount),
    maxRounds: Number(row.max_rounds ?? DEFAULT_SETTINGS.maxRounds),
    noImprovementLimit: Number(row.no_improvement_limit ?? DEFAULT_SETTINGS.noImprovementLimit),
    workerConcurrency: Number(row.worker_concurrency ?? DEFAULT_SETTINGS.workerConcurrency),
    conversationPolicy: (row.conversation_policy ?? DEFAULT_SETTINGS.conversationPolicy) as AppSettings['conversationPolicy'],
    customRubricMd: String(row.custom_rubric_md ?? ''),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export function saveSettings(input: Partial<AppSettings>) {
  const next = {
    ...getSettings(),
    ...input,
    updatedAt: new Date().toISOString(),
  }

  const db = getDb()
  db.prepare(`
    UPDATE settings
    SET cpamc_base_url = ?,
        cpamc_api_key = ?,
        api_protocol = ?,
        default_optimizer_model = ?,
        default_judge_model = ?,
        default_optimizer_reasoning_effort = ?,
        default_judge_reasoning_effort = ?,
        score_threshold = ?,
        judge_pass_count = ?,
        max_rounds = ?,
        no_improvement_limit = ?,
        worker_concurrency = ?,
        conversation_policy = ?,
        custom_rubric_md = ?,
        updated_at = ?
    WHERE id = 1
  `).run(
    next.cpamcBaseUrl,
    next.cpamcApiKey,
    normalizeApiProtocol(next.apiProtocol),
    next.defaultOptimizerModel,
    next.defaultJudgeModel,
    normalizeReasoningEffort(next.defaultOptimizerReasoningEffort),
    normalizeReasoningEffort(next.defaultJudgeReasoningEffort),
    next.scoreThreshold,
    next.judgePassCount,
    next.maxRounds,
    next.noImprovementLimit,
    next.workerConcurrency,
    next.conversationPolicy,
    next.customRubricMd,
    next.updatedAt,
  )

  return next
}
