export function normalizeEscapedMultilineText(value: string) {
  if (value.includes('\n') || value.includes('\r')) {
    return value
  }

  const escapedBreakCount = value.match(/\\r\\n|\\n|\\r/g)?.length ?? 0
  if (escapedBreakCount < 2) {
    return value
  }

  const decoded = tryDecodeJsonEscapes(value)
  if (!decoded) {
    return value
  }

  return decoded.includes('\n') || decoded.includes('\r') ? decoded : value
}

export function humanizePlaceholderMve(value: string, locale: 'zh-CN' | 'en') {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (isPlaceholderMveText(trimmed)) {
    return locale === 'zh-CN'
      ? '再抽 1 个样例快速复核'
      : 'Re-check with 1 quick sample'
  }

  return trimmed
}

export function isPlaceholderMveText(value: string) {
  return /^(?:run a single(?:[-\s])sample(?:\s+judge\s+validation\.?)?|single(?:[-\s])run|mve)$/i.test(value.trim())
}

function tryDecodeJsonEscapes(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string
  } catch {
    return null
  }
}
