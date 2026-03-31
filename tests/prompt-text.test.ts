import assert from 'node:assert/strict'
import test from 'node:test'

import { areEquivalentPromptTexts, normalizeEscapedMultilineText, summarizePromptDelta } from '../src/lib/prompt-text'

test('normalizeEscapedMultilineText decodes a single escaped newline', () => {
  assert.equal(
    normalizeEscapedMultilineText('第一条长期边界：不要漂移\\n第二条长期边界：保留交付'),
    '第一条长期边界：不要漂移\n第二条长期边界：保留交付',
  )
})

test('normalizeEscapedMultilineText decodes unicode escapes for stable-rule text', () => {
  assert.equal(
    normalizeEscapedMultilineText('\\u957f\\u671f\\u8fb9\\u754c'),
    '长期边界',
  )
})

test('areEquivalentPromptTexts ignores escaped-newline vs real-newline differences', () => {
  assert.equal(
    areEquivalentPromptTexts('第一条长期边界：不要漂移\\n第二条长期边界：保留交付', '第一条长期边界：不要漂移\n第二条长期边界：保留交付'),
    true,
  )
})

test('summarizePromptDelta surfaces new structure when model omitted explicit major changes', () => {
  const summary = summarizePromptDelta(
    '你是初九。\n帮我处理复杂任务。',
    [
      '你是初九。',
      '1. 当前局势判断',
      '2. 真正主线',
      '3. 当前最大阻塞',
      '4. 下一步最小动作',
    ].join('\n'),
    (zh) => zh,
  )

  assert.deepEqual(summary, [
    '新增了「1. 当前局势判断」「2. 真正主线」「3. 当前最大阻塞」等结构段落。',
    '把原本偏粗的要求扩成了更完整的可执行提示词。',
  ])
})

test('summarizePromptDelta returns empty for equivalent prompt bodies', () => {
  const summary = summarizePromptDelta(
    '你是初九。\n请直接给结论。',
    '你是初九。\n请直接给结论。',
    (zh) => zh,
  )

  assert.deepEqual(summary, [])
})
