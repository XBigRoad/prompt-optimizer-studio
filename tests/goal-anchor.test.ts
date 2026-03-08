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
