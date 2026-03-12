import { DEFAULT_SETTINGS } from '@/lib/server/constants'
import { getDb } from '@/lib/server/db'
import type { AppSettings } from '@/lib/server/types'

export function normalizeApiProtocol(value: unknown): AppSettings['apiProtocol'] {
  const allowed: AppSettings['apiProtocol'][] = [
    'auto',
    'openai-compatible',
    'anthropic-native',
    'gemini-native',
    'mistral-native',
    'cohere-native',
  ]
  const candidate = String(value ?? '').trim()
  if (allowed.includes(candidate as AppSettings['apiProtocol'])) {
    return candidate as AppSettings['apiProtocol']
  }
  return DEFAULT_SETTINGS.apiProtocol
}

export function getSettings(): AppSettings {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      cpamc_base_url,
      cpamc_api_key,
      api_protocol,
      default_optimizer_model,
      default_judge_model,
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

export function validateCpamcConnection(settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>) {
  if (!settings.cpamcBaseUrl.trim()) {
    throw new Error('请先配置 Base URL。')
  }

  if (!settings.cpamcApiKey.trim()) {
    throw new Error('请先配置 API Key。')
  }
}

export function validateTaskDefaults(settings: Pick<AppSettings, 'defaultOptimizerModel' | 'defaultJudgeModel'>) {
  if (!settings.defaultOptimizerModel.trim()) {
    throw new Error('请先配置默认优化模型，或在任务里显式指定。')
  }

  if (!settings.defaultJudgeModel.trim()) {
    throw new Error('请先配置默认裁判模型，或在任务里显式指定。')
  }
}
