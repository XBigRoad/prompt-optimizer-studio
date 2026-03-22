import { DEFAULT_SETTINGS } from '@/lib/server/constants'
import type { AppSettings } from '@/lib/contracts'

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
