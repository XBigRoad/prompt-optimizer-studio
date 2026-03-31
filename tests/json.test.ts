import assert from 'node:assert/strict'
import test from 'node:test'

import { extractJsonObject } from '../src/lib/server/json'

test('extractJsonObject tolerates smart quotes inside JSON-like payloads', () => {
  const payload = `{
    “optimizedPrompt”: “你是初九。保持主线判断。”,
    “strategy”: “rebuild”,
    “majorChanges”: [“补强主线判断”, “保留六段结构”]
  }`

  const parsed = extractJsonObject(payload)

  assert.equal(parsed.optimizedPrompt, '你是初九。保持主线判断。')
  assert.equal(parsed.strategy, 'rebuild')
  assert.deepEqual(parsed.majorChanges, ['补强主线判断', '保留六段结构'])
})

test('extractJsonObject can recover smart-quoted JSON embedded in prose fences', () => {
  const payload = [
    '下面是结果：',
    '```json',
    '{',
    '  “summary”: “当前主线清晰，但还可以继续收紧。”',
    '}',
    '```',
  ].join('\n')

  const parsed = extractJsonObject(payload)

  assert.equal(parsed.summary, '当前主线清晰，但还可以继续收紧。')
})
