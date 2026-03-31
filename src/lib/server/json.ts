export function extractJsonObject(payload: string) {
  const trimmed = payload.trim()
  if (!trimmed) {
    throw new Error('Model returned an empty response.')
  }

  for (const candidate of getJsonCandidates(trimmed)) {
    try {
      return JSON.parse(candidate)
    } catch {
    }
  }

  throw new Error(`Model did not return valid JSON. Payload: ${trimmed.slice(0, 400)}`)
}

function getJsonCandidates(payload: string) {
  const candidates = new Set<string>([
    payload,
    normalizeLooseJson(payload),
  ])
  const match = payload.match(/\{[\s\S]*\}/)
  if (match?.[0]) {
    candidates.add(match[0])
    candidates.add(normalizeLooseJson(match[0]))
  }

  return [...candidates]
}

function normalizeLooseJson(payload: string) {
  return payload
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/\uFEFF/g, '')
}
