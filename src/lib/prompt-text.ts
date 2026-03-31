export function normalizeEscapedMultilineText(value: string) {
  if (value.includes('\n') || value.includes('\r')) {
    return value
  }

  if (!looksLikeEscapedJsonText(value)) {
    return value
  }

  let candidate = value
  for (let index = 0; index < 3; index += 1) {
    const decoded = tryDecodeJsonEscapes(candidate)
    if (!decoded || decoded === candidate) {
      break
    }
    candidate = decoded
  }

  return candidate === value ? value : candidate
}

export function areEquivalentPromptTexts(left: string, right: string) {
  return normalizeForPromptComparison(left) === normalizeForPromptComparison(right)
}

export function summarizePromptDelta(
  before: string,
  after: string,
  text: (zh: string, en: string) => string,
) {
  if (areEquivalentPromptTexts(before, after)) {
    return []
  }

  const beforeLines = normalizePromptLines(before)
  const afterLines = normalizePromptLines(after)

  if (beforeLines.length === 0 || afterLines.length === 0) {
    return []
  }

  const beforeSet = new Set(beforeLines)
  const addedLines = uniquePreserveOrder(afterLines.filter((line) => !beforeSet.has(line)))
  const structuralLines = addedLines.filter(isStructuralPromptLine)
  const summary: string[] = []

  if (structuralLines.length > 0) {
    const snippets = structuralLines
      .slice(0, 3)
      .map((line) => `「${shortenPromptSnippet(stripPromptLineMarkers(line))}」`)
      .join('')

    summary.push(
      text(
        `新增了${snippets}等结构段落。`,
        `Added structured sections such as ${snippets}.`,
      ),
    )
  } else {
    const contentLines = addedLines
      .filter((line) => line.length >= 6)
      .slice(0, 2)
      .map((line) => `「${shortenPromptSnippet(line)}」`)
      .join('')

    if (contentLines) {
      summary.push(
        text(
          `补充了${contentLines}等执行约束。`,
          `Added execution constraints such as ${contentLines}.`,
        ),
      )
    }
  }

  const lengthDelta = normalizeForPromptComparison(after).length - normalizeForPromptComparison(before).length
  const lineDelta = afterLines.length - beforeLines.length
  if (lengthDelta >= 20 || lineDelta >= 2) {
    summary.push(
      text(
        '把原本偏粗的要求扩成了更完整的可执行提示词。',
        'Expanded the rough prompt into a more complete, executable instruction set.',
      ),
    )
  } else if (lengthDelta <= -20 || lineDelta <= -2) {
    summary.push(
      text(
        '收掉了部分重复或松散表述，让整体结构更紧。',
        'Trimmed repeated or loose phrasing to keep the prompt tighter.',
      ),
    )
  }

  return summary.slice(0, 2)
}

function tryDecodeJsonEscapes(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string
  } catch {
    return null
  }
}

function looksLikeEscapedJsonText(value: string) {
  return /\\(?:u[0-9a-fA-F]{4}|r\\n|n|r|t|"|\\)/.test(value)
}

function normalizeForPromptComparison(value: string) {
  return normalizeEscapedMultilineText(value)
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizePromptLines(value: string) {
  return normalizeForPromptComparison(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function uniquePreserveOrder(items: string[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item)) {
      return false
    }
    seen.add(item)
    return true
  })
}

function isStructuralPromptLine(line: string) {
  return /^#{1,6}\s+/.test(line)
    || /^\d+[.)、]\s*/.test(line)
    || /^[一二三四五六七八九十]+[、.．）)]\s*/.test(line)
    || /^【.+】$/.test(line)
    || /^[^。！？!?]{2,24}[：:]$/.test(line)
    || (line.length <= 18 && !/[。！？!?，,]/.test(line))
}

function stripPromptLineMarkers(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .trim()
}

function shortenPromptSnippet(value: string) {
  if (value.length <= 18) {
    return value
  }
  return `${value.slice(0, 18).trimEnd()}…`
}
