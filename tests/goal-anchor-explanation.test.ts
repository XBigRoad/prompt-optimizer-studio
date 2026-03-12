import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveGoalAnchorExplanation,
  normalizeGoalAnchorExplanation,
  parseGoalAnchorExplanation,
  serializeGoalAnchorExplanation,
} from '../src/lib/server/goal-anchor-explanation'

test('deriveGoalAnchorExplanation creates a fallback explanation from raw prompt and goal anchor', () => {
  const explanation = deriveGoalAnchorExplanation(
    '请优化一个医疗分诊提示词，要求输出结构化分诊结论和风险等级。',
    {
      goal: '保持医疗分诊任务目标',
      deliverable: '输出结构化分诊结论和风险等级',
      driftGuard: ['不要退化成泛化安全建议'],
    },
  )

  assert.match(explanation.sourceSummary, /医疗分诊/)
  assert.equal(explanation.rationale.length >= 2, true)
})

test('deriveGoalAnchorExplanation stays prompt-specific for a cooking help prompt', () => {
  const explanation = deriveGoalAnchorExplanation(
    '帮助用户做美味的寿喜烧',
    {
      goal: '帮助用户做美味的寿喜烧',
      deliverable: '一份寿喜烧的做法指导，包含关键步骤、所需食材与注意事项。',
      driftGuard: ['不要改成泛泛的做菜建议，必须继续聚焦寿喜烧。'],
    },
  )

  assert.match(explanation.sourceSummary, /寿喜烧/)
  assert.equal(explanation.rationale.some((item) => item.includes('寿喜烧')), true)
  assert.equal(explanation.rationale.some((item) => item.includes('一份寿喜烧的做法指导')), true)
  assert.equal(explanation.rationale.some((item) => /偏离|泛化|关键产出/.test(item)), true)
})

test('normalizeGoalAnchorExplanation trims fields and drops empty rationale lines', () => {
  const explanation = normalizeGoalAnchorExplanation({
    sourceSummary: '  保持原始任务摘要  ',
    rationale: ['  保留关键交付物  ', '   ', '避免目标漂移'],
  })

  assert.deepEqual(explanation, {
    sourceSummary: '保持原始任务摘要',
    rationale: ['保留关键交付物', '避免目标漂移'],
  })
})

test('serializeGoalAnchorExplanation and parseGoalAnchorExplanation round-trip safely', () => {
  const original = {
    sourceSummary: '系统识别为结构化分诊任务',
    rationale: ['原始 prompt 明确要求结构化结果', '原始 prompt 明确要求风险等级'],
  }

  const parsed = parseGoalAnchorExplanation(serializeGoalAnchorExplanation(original))
  assert.deepEqual(parsed, original)
})
