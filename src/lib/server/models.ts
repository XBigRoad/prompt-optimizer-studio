import { createProviderAdapter, normalizeProviderModelCatalog } from '@/lib/server/providers/index'
import { validateCpamcConnection } from '@/lib/server/settings/index'
import type { AppSettings, ModelCatalogItem } from '@/lib/contracts'

interface OpenAiModelListResponse {
  data?: Array<{
    id?: string
  }>
}

export function normalizeModelCatalog(payload: OpenAiModelListResponse): string[] {
  return normalizeProviderModelCatalog('openai-compatible', payload).map((item) => item.id)
}

export async function fetchCpamcModels(
  settings: Pick<AppSettings, 'cpamcBaseUrl' | 'cpamcApiKey'> & Partial<Pick<AppSettings, 'apiProtocol'>>,
): Promise<ModelCatalogItem[]> {
  validateCpamcConnection(settings)
  return createProviderAdapter(settings).listModels()
}
