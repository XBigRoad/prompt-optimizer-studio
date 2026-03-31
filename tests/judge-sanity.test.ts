import assert from 'node:assert/strict'
import test from 'node:test'

import { calibrateJudgeOutput } from '../src/lib/server/judge-sanity'

test('judge sanity leaves non-drift structured reviews untouched', () => {
  const result = calibrateJudgeOutput({
    expectedLanguage: 'zh-CN',
    review: {
      score: 84,
      hasMaterialIssues: true,
      summary: '当前主要缺口是输出契约还不够可判定。',
      driftLabels: [],
      driftExplanation: '',
      findings: ['还缺失败场景处理。'],
      suggestedChanges: ['补一条预算冲突时的回退方案。'],
      dimensionReasons: ['输出契约还不够硬。'],
    },
  })

  assert.deepEqual(result, {
    score: 84,
    hasMaterialIssues: true,
    summary: '当前主要缺口是输出契约还不够可判定。',
    driftLabels: [],
    driftExplanation: '',
    findings: ['还缺失败场景处理。'],
    suggestedChanges: ['补一条预算冲突时的回退方案。'],
    dimensionReasons: ['输出契约还不够硬。'],
  })
})

test('judge sanity converts drift-tagged high scores into localized non-credible reviews', () => {
  const result = calibrateJudgeOutput({
    expectedLanguage: 'zh-CN',
    review: {
      score: 98,
      hasMaterialIssues: false,
      summary: '整体已经很稳。',
      driftLabels: ['constraint_loss'],
      driftExplanation: '预算约束被弱化了。',
      findings: ['遗漏了预算冲突边界。'],
      suggestedChanges: ['补回预算不足时的回退路径。'],
    },
  })

  assert.equal(result.score, 89)
  assert.equal(result.hasMaterialIssues, true)
  assert.equal(result.summary, '整体已经很稳。')
  assert.equal(result.driftExplanation, '预算约束被弱化了。')
  assert.deepEqual(result.driftLabels, ['constraint_loss'])
  assert.ok(result.findings.some((item) => /偏题或约束丢失/.test(item)))
  assert.ok(result.findings.some((item) => /预算冲突边界/.test(item)))
  assert.ok(result.suggestedChanges.some((item) => /先修正偏离目标或遗漏约束/.test(item)))
  assert.ok(result.suggestedChanges.some((item) => /预算不足时的回退路径/.test(item)))
})

test('judge sanity localizes the drift guard in English reviews too', () => {
  const result = calibrateJudgeOutput({
    expectedLanguage: 'en',
    review: {
      score: 96,
      hasMaterialIssues: false,
      summary: 'Looks production-ready.',
      driftLabels: ['goal_changed'],
      driftExplanation: 'The candidate turned into a generic planning assistant.',
      findings: [],
      suggestedChanges: [],
    },
  })

  assert.equal(result.score, 89)
  assert.equal(result.hasMaterialIssues, true)
  assert.equal(result.summary, 'Looks production-ready.')
  assert.deepEqual(result.findings, [
    'Drift or constraint-loss signals were detected, so a high-score “no issues” conclusion is not credible.',
  ])
  assert.deepEqual(result.suggestedChanges, [
    'Fix the drift or missing constraints first, then reassess the overall prompt quality.',
  ])
})
