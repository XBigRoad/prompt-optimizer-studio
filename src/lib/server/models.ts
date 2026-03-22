import { createProviderAdapter } from '@/lib/server/providers/index'
import { validateCpamcConnection } from '@/lib/server/settings/index'
import type { AppSettings, ModelCatalogItem } from '@/lib/contracts'

interface OpenAiModelListResponse {
  data?: Array<{
    id?: string
  }>
}

export function normalizeModelCatalog(payload: OpenAiModelListResponse): string[] {
  const normalizedIds = (payload.data ?? [])
    .map((item) => typeof item.id === 'string' ? item.id.trim().replace(/^models\//i, '') : '')
    .filter(Boolean)

  const qualifiedSuffixes = new Set(
    normalizedIds
      .filter((item) => item.includes('/'))
      .map((item) => item.split('/').filter(Boolean).at(-1) ?? item),
  )

  const seen = new Set<string>()
  const models: string[] = []
  for (const id of normalizedIds) {
    if (!id.includes('/') && qualifiedSuffixes.has(id)) {
      continue
    }

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    models.push(id)
  }

  return models
}

export async function fetchCpamcModels(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'> & Partial<Pick<AppSettings, 'apiProtocol'>>,
): Promise<ModelCatalogItem[]> {
  validateCpamcConnection(settings)
  return createProviderAdapter(settings).listModels()
}
