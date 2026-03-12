import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveGoalAnchor,
  normalizeGoalAnchor,
  parseGoalAnchor,
  serializeGoalAnchor,
} from '../src/lib/server/goal-anchor'

test('deriveGoalAnchor creates a stable initial anchor from raw prompt', () => {
  const anchor = deriveGoalAnchor('请帮我优化一个用于医疗分诊的提示词，要求输出结构化分诊结论和风险等级。')

  assert.match(anchor.goal, /医疗分诊/)
  assert.ok(anchor.deliverable.length > 0)
  assert.equal(anchor.driftGuard.length >= 2, true)
})

test('deriveGoalAnchor infers a prompt-specific deliverable and guardrails for a cooking help prompt', () => {
  const anchor = deriveGoalAnchor('帮助用户做美味的寿喜烧')

  assert.match(anchor.goal, /寿喜烧/)
  assert.match(anchor.deliverable, /寿喜烧/)
  assert.doesNotMatch(anchor.deliverable, /主要输出产物与完成目标/)
  assert.equal(anchor.driftGuard.some((item) => /寿喜烧/.test(item)), true)
  assert.equal(anchor.driftGuard.some((item) => /步骤|做法|食材|火候/.test(item)), true)
})

test('deriveGoalAnchor keeps role prompts specific instead of falling back to a generic deliverable', () => {
  const anchor = deriveGoalAnchor('作为最顶级的中医，结合问诊和图片分析症状，给出诊断建议，并在需要时继续向用户提问。')

  assert.match(anchor.goal, /中医/)
  assert.match(anchor.deliverable, /诊断建议|问诊|图片|助手设定/)
  assert.doesNotMatch(anchor.deliverable, /主要输出产物与完成目标/)
  assert.equal(anchor.driftGuard.some((item) => /中医|问诊|图片|角色/.test(item)), true)
})

test('normalizeGoalAnchor trims fields and drops empty drift guards', () => {
  const anchor = normalizeGoalAnchor({
    goal: '  保持原任务目标  ',
    deliverable: '  输出结构化结果  ',
    driftGuard: ['  不要改成泛化建议  ', '   ', '不要删掉关键输出'],
  })

  assert.deepEqual(anchor, {
    goal: '保持原任务目标',
    deliverable: '输出结构化结果',
    driftGuard: ['不要改成泛化建议', '不要删掉关键输出'],
  })
})

test('serializeGoalAnchor and parseGoalAnchor round-trip safely', () => {
  const original = {
    goal: '保持原始分诊目标',
    deliverable: '输出结构化分诊结果',
    driftGuard: ['不要退化成泛化科普', '不要移除风险判断'],
  }

  const parsed = parseGoalAnchor(serializeGoalAnchor(original))
  assert.deepEqual(parsed, original)
})
