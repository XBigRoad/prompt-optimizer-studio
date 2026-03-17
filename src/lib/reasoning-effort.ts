export const REASONING_EFFORT_VALUES = [
  'default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number]

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  const candidate = String(value ?? '').trim().toLowerCase()
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(candidate)
    ? candidate as ReasoningEffort
    : 'default'
}

export function buildReasoningEffortOptions(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return REASONING_EFFORT_VALUES.map((value) => ({
    value,
    label: getReasoningEffortLabel(value, locale),
  }))
}

export function getReasoningEffortLabel(
  effort: ReasoningEffort,
  locale: 'zh-CN' | 'en' = 'zh-CN',
) {
  if (effort === 'default') {
    return locale === 'en' ? 'Default' : '默认'
  }

  return effort
}

export function isGpt5FamilyModel(model: string) {
  const normalized = model.trim().toLowerCase()
  return normalized.startsWith('gpt-5')
}

export function resolveReasoningEffortTimeoutMs(baseTimeoutMs: number, effort: ReasoningEffort) {
  switch (effort) {
    case 'high':
      return Math.round(baseTimeoutMs * 1.5)
    case 'xhigh':
      return baseTimeoutMs * 2
    default:
      return baseTimeoutMs
  }
}
