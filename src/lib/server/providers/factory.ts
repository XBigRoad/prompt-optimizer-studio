import type { ProviderAdapter, ProviderConnectionSettings } from '@/lib/server/providers/base'
import { inferApiProtocol } from '@/lib/server/providers/protocol'
import { AnthropicNativeProviderAdapter } from '@/lib/server/providers/providers/anthropic'
import { CohereNativeProviderAdapter } from '@/lib/server/providers/providers/cohere'
import { GeminiNativeProviderAdapter } from '@/lib/server/providers/providers/gemini'
import { MistralNativeProviderAdapter } from '@/lib/server/providers/providers/mistral'
import { OpenAiCompatibleProviderAdapter } from '@/lib/server/providers/providers/openai'

export function createProviderAdapter(settings: ProviderConnectionSettings): ProviderAdapter {
  const protocol = settings.apiProtocol && settings.apiProtocol !== 'auto'
    ? settings.apiProtocol
    : inferApiProtocol(settings.cpamcBaseUrl)

  switch (protocol) {
    case 'anthropic-native':
      return new AnthropicNativeProviderAdapter(settings)
    case 'gemini-native':
      return new GeminiNativeProviderAdapter(settings)
    case 'mistral-native':
      return new MistralNativeProviderAdapter(settings)
    case 'cohere-native':
      return new CohereNativeProviderAdapter(settings)
    case 'openai-compatible':
    default:
      return new OpenAiCompatibleProviderAdapter(settings)
  }
}
