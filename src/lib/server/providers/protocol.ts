import type { ApiProtocol } from '@/lib/contracts'

export function inferApiProtocol(baseUrl: string): ApiProtocol {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return 'openai-compatible'
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()

    if (path.includes('/openai')) {
      return 'openai-compatible'
    }

    if (host === 'api.anthropic.com') {
      return 'anthropic-native'
    }

    if (host === 'generativelanguage.googleapis.com') {
      return 'gemini-native'
    }

    if (host === 'api.mistral.ai') {
      return 'mistral-native'
    }

    if (host === 'api.cohere.com') {
      return 'cohere-native'
    }
  } catch {
    return 'openai-compatible'
  }

  return 'openai-compatible'
}

export function appendToBasePath(baseUrl: string, tail: string) {
  const url = parseBaseUrl(baseUrl)
  const segments = [
    ...url.pathname.split('/').filter(Boolean),
    ...tail.split('/').filter(Boolean),
  ]
  url.pathname = `/${segments.join('/')}`
  url.search = ''
  return url.toString()
}

export function appendVersionedPath(baseUrl: string, versionSegment: string, tail: string) {
  const url = parseBaseUrl(baseUrl)
  const baseSegments = url.pathname.split('/').filter(Boolean)
  const segments = baseSegments.at(-1) === versionSegment
    ? baseSegments
    : [...baseSegments, versionSegment].filter(Boolean)

  url.pathname = `/${[...segments, ...tail.split('/').filter(Boolean)].join('/')}`
  url.search = ''
  return url.toString()
}

export function parseBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl.trim())
  } catch {
    throw new Error('Base URL 格式不正确。')
  }
}

export function normalizeGeminiModelPath(model: string) {
  return model.trim().replace(/^models\//i, '')
}
