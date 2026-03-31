import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobRoundCard, type RoundCandidateView } from '../src/components/job-round-card'

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
      dimensionScores: {
        d1: 12,
        d2: 7,
        d3: 11,
      },
      rubricDimensionsSnapshot: [
        { id: 'd1', label: '历史目标清晰度', max: 15 },
        { id: 'd2', label: '历史输入约束完整度', max: 10 },
        { id: 'd3', label: '历史输出契约明确度', max: 15 },
      ],
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
  assert.match(html, /这版提示词得分 96\.00/)
  assert.match(html, /结构已经稳定，只剩轻微语气优化空间。/)
  assert.match(html, /查看详情/)
  assert.doesNotMatch(html, /复核分数/)
  assert.doesNotMatch(html, /查看优化后提示词/)
  assert.doesNotMatch(html, /本轮采用的人工引导/)
})

test('round card hides non-credible zero scores in the header and surfaces the structured-score root cause', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      averageScore: 0,
      judges: [
        {
          ...candidate.judges[0],
          dimensionScores: null,
          dimensionReasons: [],
          summary: '该候选提示词与目标高度一致，交付物完整。',
          findings: [
            '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
            '高分复核未通过：关键结构前提仍未全部满足。',
            '交付物基本完整，但输入归一化规则仍不够明确。',
          ],
        },
      ],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /这版提示词暂未评分/)
  assert.doesNotMatch(html, /这版提示词得分 0\.00/)
  assert.match(html, /本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。/)
  assert.doesNotMatch(html, /高分复核未通过：关键结构前提仍未全部满足。/)
})

test('round card prefers the candidate review snapshot over the current rubric labels', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate,
    expanded: true,
    onToggle: () => {},
    rubricDimensions: [
      { id: 'd1', label: '当前目标清晰度', max: 15 },
      { id: 'd2', label: '当前输入约束完整度', max: 10 },
      { id: 'd3', label: '当前输出契约明确度', max: 15 },
    ],
  }))

  assert.match(html, /历史目标清晰度/)
  assert.doesNotMatch(html, /当前目标清晰度/)
})

test('round card shows the unstructured rubric note instead of fabricating score bars', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      judges: [
        {
          ...candidate.judges[0],
          rubricDimensionsSnapshot: null,
        },
      ],
    },
    expanded: true,
    onToggle: () => {},
    rubricDimensions: [],
  }))

  assert.match(html, /当前评分标准不是结构化分项格式，暂不显示分项分数条。/)
})

test('round card still reveals full diagnostics and applied steering when expanded', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate,
    expanded: true,
    onToggle: () => {},
    rubricDimensions: [
      { id: 'd1', label: '目标清晰度', max: 15 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
      { id: 'd3', label: '输出契约明确度', max: 15 },
    ],
  }))

  assert.match(html, /收起详情/)
  assert.match(html, /查看优化后提示词/)
  assert.match(html, /这轮实际改动/)
  assert.match(html, /这版主要问题/)
  assert.match(html, /本轮采用的人工引导/)
  assert.match(html, /Keep the 老中医 judgment tone, but preserve the original conclusion\./)
  assert.doesNotMatch(html, /发现的问题/)
  assert.doesNotMatch(html, /建议修改/)
  assert.doesNotMatch(html, /修订补丁/)
  assert.match(html, /class="round-analysis-flow round-analysis-grid"/)
  assert.match(html, /class="judge-card round-review-panel round-diagnostic-panel"/)
  assert.match(html, /目标清晰度/)
  assert.match(html, /12\s*\/\s*15/)
})

test('round card labels judge-only guidance as review suggestions when major changes are missing', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: [],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /这版做的是保守收口，但模型没有写出改动摘要/)
  assert.match(html, /评审建议/)
  assert.match(html, /Warm up the tone\./)
  assert.doesNotMatch(html, /这一轮没有额外诊断细节/)
})

test('round card shows review suggestions by default even when actual changes exist', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: ['补上了输出前自检。'],
      judges: [
        {
          ...candidate.judges[0],
          suggestedChanges: ['把“当前最大阻塞”的判断标准写得更硬一点。'],
        },
      ],
    },
    expanded: true,
    onToggle: () => {},
    onAddReviewSuggestions: async () => {},
    addingReviewSuggestions: false,
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /补上了输出前自检。/)
  assert.match(html, /评审建议/)
  assert.match(html, /把“当前最大阻塞”的判断标准写得更硬一点。/)
  assert.match(html, /class="round-support-column"/)
  assert.match(html, /class="round-support-column">[\s\S]*这轮实际改动[\s\S]*评审建议/)
})

test('round card ignores fallback-only suggestions instead of rendering fake advice', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: [],
      judges: [
        {
          ...candidate.judges[0],
          suggestedChanges: ['本轮给出了改进方向，但模型返回了异语言建议；请优先参考当前任务语境。'],
        },
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /模型没有写出改动摘要/)
  assert.doesNotMatch(html, /下一步建议/)
  assert.doesNotMatch(html, /异语言建议/)
})

test('round card keeps the main-issues panel when only the review summary exists', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      judges: [
        {
          ...candidate.judges[0],
          findings: [],
          driftLabels: [],
          driftExplanation: '',
          summary: '这版的主要问题是：结构稳定了，但默认输出契约还不够硬。',
        },
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这版主要问题/)
  assert.match(html, /这版详情已展开；下方查看主要问题、实际改动与评审建议。/)
  assert.match(html, /这版的主要问题是：结构稳定了，但默认输出契约还不够硬。/)
})

test('round card synthesizes a richer summary when high-score recheck copy would otherwise occupy the whole preview', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      judges: [
        {
          ...candidate.judges[0],
          summary: '本轮高分复核未完成，95+ 资格暂不成立。',
          findings: [
            '该提示词与目标场景高度一致，人数、预算、老人小孩和四个交付物都已经覆盖。',
            '默认输出协议与家庭聚餐场景对齐，能直接产出菜单建议、采购清单和时间安排。',
            '仍缺更硬的预算冲突回退规则。',
          ],
        },
      ],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /该提示词与目标场景高度一致，人数、预算、老人小孩和四个交付物都已经覆盖；默认输出协议与家庭聚餐场景对齐，能直接产出菜单建议、采购清单和时间安排；仍缺更硬的预算冲突回退规则。/)
  assert.doesNotMatch(html, /95\+\s*资格暂不成立/)
})

test('round card replaces lazy fallback-only summary copy with root-cause wording', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      judges: [
        {
          ...candidate.judges[0],
          summary: '本轮诊断已完成，但评分器没有返回有效分项评分；这轮结果不计入可信通过。',
          findings: [],
          dimensionReasons: [],
        },
      ],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。/)
  assert.doesNotMatch(html, /评分器没有返回有效分项评分；这轮结果不计入可信通过/)
})

test('round card fallback copy uses scoring summary wording instead of review summary wording', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      judges: [],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /暂无评分摘要。/)
  assert.doesNotMatch(html, /暂无复核摘要。/)
  assert.doesNotMatch(html, /No review summary yet\./)
})

test('round card falls back to a truthful actual-change note when neither major changes nor suggestions exist', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: [],
      judges: [
        {
          ...candidate.judges[0],
          suggestedChanges: [],
        },
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /模型没有写出改动摘要/)
  assert.doesNotMatch(html, /评审建议/)
})


test('round card exposes editable review suggestions when steering handoff is enabled', () => {
  const html = renderToStaticMarkup(createElement(JobRoundCard, {
    candidate: {
      ...candidate,
      majorChanges: [],
    },
    expanded: true,
    onToggle: () => {},
    onAddReviewSuggestions: async () => {},
    addingReviewSuggestions: false,
  }))

  assert.match(html, /评审建议/)
  assert.match(html, /这些建议来自评分器，不会自动进入下一轮。勾选、改写并确认后，才会写入待生效引导。/)
  assert.match(html, /加入下一轮引导/)
  assert.match(html, /恢复评审建议 1 原文/)
})
