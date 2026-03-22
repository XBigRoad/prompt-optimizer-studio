import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobRoundCard, type RoundCandidateView } from '../src/components/widgets/job-detail/round-card'

const candidate: RoundCandidateView = {
  id: 'candidate-r2',
  roundNumber: 2,
  optimizedPrompt: 'ROUND 2 OUTPUT',
  strategy: 'rebuild',
  scoreBefore: 94,
  averageScore: 96,
  majorChanges: ['压缩输出协议。'],
  mve: '用同一输入再跑一轮 judge。',
  deadEndSignals: ['不要为了稳妥而丢交付。'],
  aggregatedIssues: ['轻微语气偏硬。'],
  appliedSteeringItems: [],
  judges: [{
    id: 'judge-r2',
    judgeIndex: 0,
    score: 96,
    hasMaterialIssues: false,
    summary: '这一版提示词整体稳定，可以继续观察下一轮。',
    driftLabels: [],
    driftExplanation: '',
    findings: ['结构稳定。'],
    suggestedChanges: ['继续压缩少量冗余措辞。'],
  }],
}

test('legacy round card uses clearer score and review labels', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate,
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这版提示词得分 96\.00/)
  assert.match(html, /下一步最小验证/)
  assert.match(html, /这轮改了什么/)
  assert.match(html, /走偏风险/)
  assert.match(html, /还要补的地方/)
  assert.match(html, /这版提示词复核结果/)
  assert.match(html, /这轮还卡在哪/)
  assert.match(html, /下一步怎么改/)
  assert.doesNotMatch(html, />MVE</)
  assert.doesNotMatch(html, /复核分数/)
  assert.doesNotMatch(html, /发现的问题/)
})

test('legacy round card hides empty panels and humanizes placeholder MVE copy', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: [],
      deadEndSignals: [],
      aggregatedIssues: [],
      mve: 'Run a single sample',
      judges: [{
        ...candidate.judges[0],
        findings: [],
        suggestedChanges: [],
      }],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /下一步最小验证/)
  assert.match(html, /再抽 1 个样例快速复核/)
  assert.doesNotMatch(html, /这轮改了什么/)
  assert.doesNotMatch(html, /走偏风险/)
  assert.doesNotMatch(html, /还要补的地方/)
  assert.doesNotMatch(html, /这轮还卡在哪/)
  assert.doesNotMatch(html, /下一步怎么改/)
})

test('legacy round card also humanizes hyphenated single-sample MVE placeholders', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      mve: 'Run a single-sample judge validation.',
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /下一步最小验证/)
  assert.match(html, /再抽 1 个样例快速复核/)
  assert.doesNotMatch(html, /Run a single-sample judge validation\./)
})
