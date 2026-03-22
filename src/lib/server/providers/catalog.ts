import type { ApiProtocol, ModelCatalogItem } from '@/lib/contracts'
import type {
  AnthropicModelListResponse,
  CohereModelListResponse,
  GeminiModelListResponse,
  OpenAiModelListResponse,
} from '@/lib/server/providers/base'

export function normalizeProviderModelCatalog(protocol: ApiProtocol, payload: unknown): ModelCatalogItem[] {
  switch (protocol) {
    case 'anthropic-native':
      return normalizeAnthropicModelCatalog(payload as AnthropicModelListResponse)
    case 'gemini-native':
      return normalizeGeminiModelCatalog(payload as GeminiModelListResponse)
    case 'mistral-native':
      return normalizeOpenAiModelCatalog(payload as OpenAiModelListResponse)
    case 'cohere-native':
      return normalizeCohereModelCatalog(payload as CohereModelListResponse)
    case 'openai-compatible':
    default:
      return normalizeOpenAiModelCatalog(payload as OpenAiModelListResponse)
  }
}

function normalizeOpenAiModelCatalog(payload: OpenAiModelListResponse): ModelCatalogItem[] {
  const normalizedIds = (payload.data ?? [])
    .map((item) => normalizeOpenAiCompatibleModelAlias(item.id))
    .filter((item): item is string => Boolean(item))

  const qualifiedSuffixes = new Set(
    normalizedIds
      .filter((item) => item.includes('/'))
      .map((item) => item.split('/').filter(Boolean).at(-1) ?? item),
  )

  const seen = new Set<string>()
  const models: ModelCatalogItem[] = []
  for (const id of normalizedIds) {
    if (!id.includes('/') && qualifiedSuffixes.has(id)) {
      continue
    }

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    models.push({ id, label: id })
  }

  return models
}

function normalizeAnthropicModelCatalog(payload: AnthropicModelListResponse): ModelCatalogItem[] {
  return dedupeModelIds((payload.data ?? []).map((item) => item.id))
}

function normalizeGeminiModelCatalog(payload: GeminiModelListResponse): ModelCatalogItem[] {
  const ids = (payload.models ?? [])
    .filter((item) => {
      const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : null
      return !methods || methods.includes('generateContent')
    })
    .map((item) => item.name)

  return dedupeModelIds(ids)
}

function normalizeCohereModelCatalog(payload: CohereModelListResponse): ModelCatalogItem[] {
  return dedupeModelIds((payload.models ?? []).map((item) => item.name))
}

export function dedupeModelIds(ids: Array<string | undefined>): ModelCatalogItem[] {
  const seen = new Set<string>()
  const models: ModelCatalogItem[] = []

  for (const id of ids) {
    const alias = normalizeModelAlias(id)
    if (!alias || seen.has(alias)) {
      continue
    }

    seen.add(alias)
    models.push({ id: alias, label: alias })
  }

  return models
}

export function normalizeModelAlias(value: string | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().replace(/^models\//i, '')
  if (!trimmed) {
    return null
  }

  const parts = trimmed.split('/').filter(Boolean)
  const alias = parts.at(-1)?.trim()
  return alias || null
}

function normalizeOpenAiCompatibleModelAlias(value: string | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().replace(/^models\//i, '')
  return trimmed || null
}
