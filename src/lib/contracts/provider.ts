export type ApiProtocol =
  | 'auto'
  | 'openai-compatible'
  | 'anthropic-native'
  | 'gemini-native'
  | 'mistral-native'
  | 'cohere-native'

export interface ModelCatalogItem {
  id: string
  label: string
}
