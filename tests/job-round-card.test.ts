import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobRoundCard, type RoundCandidateView } from '../src/components/widgets/job-detail/round-card'

const candidate: RoundCandidateView = {
  id: 'candidate-1',
  roundNumber: 7,
  optimizedPrompt: 'FULL PROMPT CONTENT',
  strategy: 'preserve',
  scoreBefore: 88,
  averageScore: 96,
  majorChanges: ['Tightened the output contract.'],
  mve: 'Run one dry check.',
  deadEndSignals: ['Do not overfit the wording.'],
  aggregatedIssues: ['Reduce jargon.'],
  appliedSteeringItems: [
    {
      id: 'steer-1',
      text: 'Keep the 老中医 judgment tone, but preserve the original conclusion.',
      createdAt: '2026-03-09T10:00:00.000Z',
    },
  ],
  judges: [
    {
      id: 'judge-1',
      judgeIndex: 0,
      score: 96,
      hasMaterialIssues: false,
      summary: '结构已经稳定，只剩轻微语气优化空间。',
      driftLabels: [],
      driftExplanation: '',
      findings: ['Tone is slightly formal.'],
      suggestedChanges: ['Warm up the tone.'],
    },
  ],
}

test('round card stays compact by default but keeps an explicit details entry point', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate,
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /第 7 轮/)
  assert.match(html, /结构已经稳定，只剩轻微语气优化空间。/)
  assert.match(html, /查看详情/)
  assert.doesNotMatch(html, /查看优化后提示词/)
  assert.doesNotMatch(html, /本轮采用的人工引导/)
})

test('round card still reveals full diagnostics and applied steering when expanded', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate,
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /收起详情/)
  assert.match(html, /查看优化后提示词/)
  assert.match(html, /主要修改/)
  assert.match(html, /复核结果/)
  assert.match(html, /本轮采用的人工引导/)
  assert.match(html, /Keep the 老中医 judgment tone, but preserve the original conclusion\./)
  assert.match(html, /class="round-analysis-grid"/)
  assert.match(html, /class="panel round-mve-panel"/)
  assert.match(html, /class="judge-card round-review-panel"/)
})
