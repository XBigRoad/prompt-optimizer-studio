import type { ProviderConnectionSettings } from '@/lib/server/providers/base'
import { OpenAiStyleProviderAdapter } from '@/lib/server/providers/providers/openai'

export class MistralNativeProviderAdapter extends OpenAiStyleProviderAdapter {
  constructor(settings: ProviderConnectionSettings) {
    super(settings, 'mistral-native')
  }
}
