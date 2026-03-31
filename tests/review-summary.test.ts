import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTopBandGatekeeperFinding,
  isTopBandGatekeeperSummary,
  resolveNarrativeReviewSummary,
  sanitizeVisibleReviewCopy,
  stripTopBandGatekeeperFindings,
} from '../src/lib/review-summary'

test('review summary treats threshold-bound boilerplate as gatekeeper copy', () => {
  assert.equal(isTopBandGatekeeperSummary('综合得分97，明显高于95阈值。'), true)
  assert.equal(isTopBandGatekeeperSummary('该提示词仍存在目标漂移或约束丢失，必须继续优化，不能进入高分通过段。'), true)
  assert.equal(isTopBandGatekeeperFinding('95+ 高分复核未完成：本轮只确认暂不授予高分资格，不覆盖原始任务诊断。'), true)
  assert.equal(isTopBandGatekeeperFinding('这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。'), true)
})

test('review summary synthesizes a narrative fallback from real findings when summary is threshold-bound boilerplate', () => {
  const summary = resolveNarrativeReviewSummary(
    '综合得分97，明显高于95阈值。',
    [
      '输出契约已经很完整，但预算冲突时的降级规则仍不够明确。',
      '时间线与采购清单基本对齐，但异常处理还不够稳。',
      '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
    ],
  )

  assert.equal(summary, '输出契约已经很完整，但预算冲突时的降级规则仍不够明确；时间线与采购清单基本对齐，但异常处理还不够稳。')
})

test('review summary falls back to dimension reasons when summary and findings are missing', () => {
  const summary = resolveNarrativeReviewSummary(
    '本轮诊断已完成，但评分器没有写出有效摘要；这轮结果不计入可信通过。',
    [],
    [
      '输出契约明确度：保留了四个交付物，但仍缺输入细化和格式约束。',
      '逻辑闭环：已经说明了任务目标，但决策规则和异常处理还不够完整。',
    ],
  )

  assert.equal(summary, '保留了四个交付物，但仍缺输入细化和格式约束；已经说明了任务目标，但决策规则和异常处理还不够完整。')
})

test('review summary falls back to root-cause wording when only lazy gatekeeper copy remains', () => {
  assert.equal(
    resolveNarrativeReviewSummary('本轮高分复核未完成，95+ 资格暂不成立。', []),
    '本轮诊断已完成，但当前摘要没有直接写出真实缺口；请以下方问题列表或分项原因为准。',
  )

  assert.equal(
    resolveNarrativeReviewSummary('本轮诊断已完成，但评分器没有返回有效分项评分；这轮结果不计入可信通过。', []),
    '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。',
  )
})

test('review summary strips top-band gatekeeper findings from the visible findings list', () => {
  assert.deepEqual(
    stripTopBandGatekeeperFindings([
      '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
      '高分复核未完成：本轮仍有关键结构缺口未确认，不覆盖原始任务诊断。',
      '高分复核未通过：关键结构前提仍未全部满足。',
      '输出契约已经很完整，但预算冲突时的降级规则仍不够明确。',
    ]),
    ['输出契约已经很完整，但预算冲突时的降级规则仍不够明确。'],
  )
})

test('review summary prefers root-cause wording when findings reveal invalid structured scoring', () => {
  const summary = resolveNarrativeReviewSummary(
    '该候选提示词与目标高度一致，交付物完整。',
    [
      '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
      '高分复核未完成：本轮仍有关键结构缺口未确认，不覆盖原始任务诊断。',
      '交付物基本完整，但输入归一化规则仍不够明确。',
    ],
  )

  assert.equal(summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
})

test('review summary can sanitize visible review copy for non-credible high-band rounds', () => {
  const sanitized = sanitizeVisibleReviewCopy({
    summary: '这是一个高度贴合目标的高质量提示词。',
    findings: [
      '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
      '高分复核未完成：本轮仍有关键结构缺口未确认，不覆盖原始任务诊断。',
      '对核心任务的保留度很高，没有丢失关键输出。',
      '可执行性设计非常充分。',
    ],
    suggestedChanges: [
      'Decision Threshold: >= 95',
      '补一条预算冲突 fallback。',
    ],
    dimensionReasons: [],
  })

  assert.equal(sanitized.summary, '本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。')
  assert.deepEqual(sanitized.findings, [])
  assert.deepEqual(sanitized.suggestedChanges, ['补一条预算冲突 fallback。'])
})
