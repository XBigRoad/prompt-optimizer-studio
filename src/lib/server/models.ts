import { createProviderAdapter, normalizeProviderModelCatalog } from '@/lib/server/provider-adapter'
import { validateCpamcConnection } from '@/lib/server/settings'
import type { AppSettings, ModelCatalogItem } from '@/lib/server/types'

interface OpenAiModelListResponse {
  data?: Array<{
    id?: string
  }>
}

export function normalizeModelCatalog(payload: OpenAiModelListResponse): string[] {
  return normalizeProviderModelCatalog('openai-compatible', payload).map((item) => item.id)
}

export async function fetchCpamcModels(settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'>): Promise<ModelCatalogItem[]> {
  validateCpamcConnection(settings)
  return createProviderAdapter(settings).listModels()
}
