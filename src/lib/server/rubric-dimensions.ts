export interface RubricDimension {
  id: string
  label: string
  max: number
}

const RUBRIC_DIMENSION_LINE_RE = /^\s*(\d+)\.\s+(.+?)\s*[（(]\s*(\d{1,3})\s*[)）]\s*$/u

export const DEFAULT_COMPATIBLE_RUBRIC_DIMENSIONS: ReadonlyArray<RubricDimension> = [
  { id: 'd1', label: '目标清晰度', max: 15 },
  { id: 'd2', label: '输入约束完整度', max: 10 },
  { id: 'd3', label: '输出契约明确度', max: 15 },
  { id: 'd4', label: '逻辑闭环', max: 15 },
  { id: 'd5', label: '可执行性', max: 10 },
  { id: 'd6', label: '鲁棒性', max: 10 },
  { id: 'd7', label: '防幻觉与证据约束', max: 10 },
  { id: 'd8', label: '反死胡同能力', max: 10 },
  { id: 'd9', label: '可迭代性', max: 5 },
]

export function parseRubricDimensions(markdown: string): RubricDimension[] {
  const dimensions: RubricDimension[] = []

  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(RUBRIC_DIMENSION_LINE_RE)
    if (!match) {
      continue
    }

    const label = match[2]?.trim()
    const max = Number(match[3])
    if (!label || !Number.isFinite(max) || max <= 0) {
      continue
    }

    dimensions.push({
      id: `d${dimensions.length + 1}`,
      label,
      max,
    })
  }

  return dimensions
}

export function isDefaultCompatibleRubricDimensions(dimensions: RubricDimension[]) {
  if (dimensions.length !== DEFAULT_COMPATIBLE_RUBRIC_DIMENSIONS.length) {
    return false
  }

  return dimensions.every((dimension, index) => {
    const canonical = DEFAULT_COMPATIBLE_RUBRIC_DIMENSIONS[index]
    if (!canonical) {
      return false
    }

    return dimension.id === canonical.id
      && normalizeDimensionLabel(dimension.label) === normalizeDimensionLabel(canonical.label)
      && dimension.max === canonical.max
  })
}

export function sumDimensionScores(value: unknown, dimensions: RubricDimension[]): number | null {
  if (dimensions.length === 0) {
    return null
  }

  const scoreMap = normalizeDimensionScores(value, dimensions)
  if (!scoreMap) {
    return null
  }

  let total = 0
  for (const dimension of dimensions) {
    total += scoreMap[dimension.id] ?? 0
  }

  return total
}

export function normalizeDimensionScores(
  value: unknown,
  dimensions: RubricDimension[],
): Record<string, number> | null {
  if (dimensions.length === 0) {
    return null
  }

  const scoreMap = normalizeDimensionScoreMap(value)
  if (!scoreMap) {
    return null
  }

  const normalized: Record<string, number> = {}
  for (const dimension of dimensions) {
    const rawScore = scoreMap[dimension.id]
    if (rawScore === undefined) {
      return null
    }

    const numericScore = typeof rawScore === 'number' ? rawScore : Number(rawScore)
    if (!Number.isFinite(numericScore)) {
      return null
    }

    const roundedScore = Math.round(numericScore)
    if (roundedScore < 0 || roundedScore > dimension.max) {
      return null
    }

    normalized[dimension.id] = roundedScore
  }

  return normalized
}

export function normalizeDimensionReasons(
  value: unknown,
  dimensions: RubricDimension[],
): Record<string, string> | null {
  if (dimensions.length === 0) {
    return null
  }

  const normalizedMap = normalizeDimensionTextMap(value)
  if (!normalizedMap) {
    return null
  }

  const reasons: Record<string, string> = {}
  for (const dimension of dimensions) {
    const reason = normalizedMap[dimension.id]
    if (!reason) {
      return null
    }
    reasons[dimension.id] = reason
  }

  return reasons
}

export function collectBelowMaxDimensionReasons(input: {
  dimensions: RubricDimension[]
  scores: Record<string, number> | null
  reasons: Record<string, string> | null
}) {
  if (!input.scores || !input.reasons) {
    return []
  }

  return input.dimensions
    .filter((dimension) => (input.scores?.[dimension.id] ?? 0) < dimension.max)
    .map((dimension) => `${dimension.label}：${input.reasons?.[dimension.id] ?? ''}`.trim())
    .filter((item) => !/[:：]\s*$/.test(item))
}

function normalizeDimensionScoreMap(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const record = item as Record<string, unknown>
        const key = readDimensionKey(record)
        if (!key) {
          return null
        }
        return [key, record.score] as const
      })
      .filter((entry): entry is readonly [string, unknown] => Boolean(entry))

    return entries.length > 0 ? Object.fromEntries(entries) : null
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }

  return null
}

function normalizeDimensionTextMap(value: unknown): Record<string, string> | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const record = item as Record<string, unknown>
        const key = readDimensionKey(record)
        const rawText = record.reason ?? record.text ?? record.message ?? record.content
        if (!key || typeof rawText !== 'string' || !rawText.trim()) {
          return null
        }

        return [key, rawText.trim()] as const
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry))

    return entries.length > 0 ? Object.fromEntries(entries) : null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const normalized: Record<string, string> = {}
    for (const [key, rawValue] of Object.entries(record)) {
      if (typeof rawValue === 'string' && rawValue.trim()) {
        normalized[key] = rawValue.trim()
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : null
  }

  return null
}

function readDimensionKey(record: Record<string, unknown>) {
  const candidate = record.id ?? record.key ?? record.dimensionId ?? record.dimension_id
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function normalizeDimensionLabel(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}
