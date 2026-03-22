import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobRoundRunCard, type RoundRunView } from '../src/components/job-round-run-card'

const roundRun: RoundRunView = {
  id: 'round-2',
  roundNumber: 2,
  semantics: 'input-judged-output-handed-off',
  inputPrompt: 'ROUND 1 OUTPUT',
  inputCandidateId: 'candidate-r1',
  outputCandidateId: 'candidate-r2',
  displayScore: 96,
  hasMaterialIssues: false,
  summary: '这一轮输入已经稳定，新版本会在下一轮继续复核。',
  driftLabels: [],
  driftExplanation: '',
  findings: ['结构稳定。'],
  suggestedChanges: ['继续压缩少量冗余措辞。'],
  outcome: 'settled',
  optimizerError: null,
  judgeError: null,
  passStreakAfter: 2,
  outputJudged: false,
  outputFinal: false,
  outputCandidate: {
    id: 'candidate-r2',
    jobId: 'job-1',
    roundNumber: 2,
    optimizedPrompt: 'ROUND 2 OUTPUT',
    strategy: 'rebuild',
    scoreBefore: 94,
    averageScore: 0,
    majorChanges: ['压缩输出协议。'],
    mve: '用同一输入再跑一轮 judge。',
    deadEndSignals: ['不要为了稳妥而丢交付。'],
    aggregatedIssues: ['轻微语气偏硬。'],
    appliedSteeringItems: [],
    createdAt: '2026-03-20T00:01:00.000Z',
  },
  createdAt: '2026-03-20T00:01:10.000Z',
}

test('input-judged round card states clearly that the displayed score belongs to the input prompt', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: roundRun,
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /第 2 轮/)
  assert.match(html, /上轮提示词评分 96\.00/)
  assert.match(html, /上面这个分数是上一轮提示词的，不是下面新版本的/)
  assert.match(html, /这版要到下一轮才会评分/)
  assert.doesNotMatch(html, /进入本轮前的提示词/)
  assert.doesNotMatch(html, /本轮生成的新版本/)
})

test('input-judged round card reveals both the judged input and the handed-off output when expanded', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: roundRun,
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /进入本轮前的提示词/)
  assert.match(html, /ROUND 1 OUTPUT/)
  assert.match(html, /本轮生成的新版本/)
  assert.match(html, /ROUND 2 OUTPUT/)
  assert.match(html, /这版要到下一轮才会评分/)
  assert.match(html, /结构稳定。/)
  assert.match(html, /继续压缩少量冗余措辞。/)
  assert.match(html, /这轮还卡在哪/)
  assert.match(html, /下一步怎么改/)
  assert.doesNotMatch(html, /发现的问题/)
})

test('input-judged round card marks outputs already reviewed by a later round', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...roundRun,
      outputJudged: true,
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /这版后来已经评过分/)
  assert.doesNotMatch(html, /这版要到下一轮才会评分/)
})

test('input-judged round card marks the terminal handed-off output as the final delivered result', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...roundRun,
      roundNumber: 16,
      passStreakAfter: 3,
      outputFinal: true,
      summary: '这一轮已经满足停止条件，并把新版本作为最终结果交付。',
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /第 16 轮/)
  assert.match(html, /这版已作为最终结果交付/)
  assert.doesNotMatch(html, /这版要到下一轮才会评分/)
})

test('input-judged round card explains when review passed but no new output was generated', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...roundRun,
      outputCandidateId: null,
      outputCandidate: null,
      passStreakAfter: 3,
      optimizerError: 'request timeout after 360000ms',
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /上轮提示词评分 96\.00/)
  assert.match(html, /达标但未生成新版本/)
  assert.match(html, /这轮已经满足停止条件，但没生成新版本，系统会沿用上一版作为最终结果/)
})

test('input-judged round card hides empty analysis panels and humanizes placeholder MVE copy', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...roundRun,
      outputCandidate: {
        ...roundRun.outputCandidate!,
        majorChanges: [],
        deadEndSignals: [],
        aggregatedIssues: [],
        mve: 'Run a single sample',
      },
      findings: [],
      suggestedChanges: [],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /下一步最小验证/)
  assert.match(html, /再抽 1 个样例快速复核/)
  assert.doesNotMatch(html, /这轮改了什么/)
  assert.doesNotMatch(html, /还要补的地方/)
  assert.doesNotMatch(html, /走偏风险/)
  assert.doesNotMatch(html, /这轮还卡在哪/)
  assert.doesNotMatch(html, /下一步怎么改/)
})

test('input-judged round card also humanizes hyphenated single-sample MVE placeholders', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...roundRun,
      outputCandidate: {
        ...roundRun.outputCandidate!,
        mve: 'Run a single-sample judge validation.',
      },
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /下一步最小验证/)
  assert.match(html, /再抽 1 个样例快速复核/)
  assert.doesNotMatch(html, /Run a single-sample judge validation\./)
})
