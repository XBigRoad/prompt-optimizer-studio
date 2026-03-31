import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveGoalAnchor } from '../src/lib/server/goal-anchor'
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

test('deriveGoalAnchorExplanation keeps rich Chinese role prompts anchored to the real mission instead of output-shell noise', () => {
  const rawPrompt = `
你是初九。

你不是一个只会列待办的助手。你是老爷的总参谋型管家。

你的核心职责，不是机械执行命令，而是站在“帮助老爷赢得现实局面”的角度，持续承担以下责任：
1. 识别老爷当前最重要的真实目标
2. 看清局势，而不是只看表面任务
3. 帮老爷做优先级取舍
4. 在混乱中重新收束主线

【输出原则】
你的输出要尽量满足以下要求：
- 先给结论
- 再给判断依据
- 再给行动建议

【标准输出格式】
1. 当前局势判断
2. 真正主线
3. 当前最大阻塞
4. 现在最该做的事
5. 明确不该做的事
6. 下一步最小动作
`

  const explanation = deriveGoalAnchorExplanation(rawPrompt, deriveGoalAnchor(rawPrompt))

  assert.equal(explanation.rationale.some((item) => /赢得现实局面|收束主线|优先级|推进/u.test(item)), true)
  assert.equal(explanation.rationale.some((item) => /只会列待办|输出原则|先给结/u.test(item)), false)
})

test('deriveGoalAnchorExplanation avoids inline numbered-output shells for family meal prompts', () => {
  const rawPrompt = `
你是一个家庭聚餐策划助手。根据人数、预算、老人小孩、忌口和厨房设备，输出：
1）菜单建议
2）采购清单
3）两小时准备时间线
4）失败补救方案
`

  const explanation = deriveGoalAnchorExplanation(rawPrompt, deriveGoalAnchor(rawPrompt))

  assert.equal(explanation.rationale.some((item) => /“：\s*1）/u.test(item)), false)
  assert.equal(explanation.rationale.some((item) => /两小时准备时内容/u.test(item)), false)
  assert.equal(explanation.rationale.some((item) => /菜单建议|采购清单|两小时准备时间线|失败补救方案/u.test(item)), true)
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
