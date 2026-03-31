import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobRoundRunCard, type RoundRunView } from '../src/components/job-round-run-card'

const globalsCssPath = path.join(process.cwd(), 'src/styles/globals.css')

const round: RoundRunView = {
  id: 'round-2',
  roundNumber: 2,
  semantics: 'input-judged-output-handed-off',
  inputPrompt: 'ROUND 1 OUTPUT',
  inputCandidateId: 'candidate-r1',
  outputCandidateId: 'candidate-r2',
  displayScore: 96,
  hasMaterialIssues: false,
  summary: '结构已经稳住，还能再补一点细节密度。',
  driftLabels: [],
  driftExplanation: '',
  findings: ['Still missing one concrete edge case.'],
  dimensionReasons: [],
  suggestedChanges: ['Add one practical scenario.'],
  outcome: 'settled',
  optimizerError: null,
  judgeError: null,
  passStreakAfter: 1,
  outputJudged: false,
  outputFinal: false,
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
  outputCandidate: {
    id: 'candidate-r2',
    jobId: 'job-1',
    roundNumber: 2,
    optimizedPrompt: 'ROUND 2 OUTPUT',
    strategy: 'rebuild',
    scoreBefore: 94,
    averageScore: 0,
    majorChanges: ['Merged duplicate sections.', 'Raised the detail floor.'],
    mve: 'Run one dry check.',
    deadEndSignals: [],
    aggregatedIssues: [],
    appliedSteeringItems: [],
    createdAt: '2026-03-20T00:01:00.000Z',
  },
  createdAt: '2026-03-20T00:01:10.000Z',
}

test('round run card labels the review score as the previous prompt score in compact mode', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round,
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /上轮提示词评分 96\.00/)
  assert.match(html, /结构已经稳住，还能再补一点细节密度。/)
  assert.doesNotMatch(html, /这版提示词得分/)
})

test('round run card hides non-credible zero scores and shows the structured-score root cause instead', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      displayScore: 0,
      dimensionScores: null,
      dimensionReasons: [],
      summary: '该候选提示词与目标高度一致，交付物完整。',
      findings: [
        '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
        '高分复核未通过：关键结构前提仍未全部满足。',
        '交付物基本完整，但输入归一化规则仍不够明确。',
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /上轮提示词暂未评分/)
  assert.doesNotMatch(html, /上轮提示词评分 0\.00/)
  assert.match(html, /本轮诊断已完成，但结构化分项评分无效；请以下方问题列表或运行信息为准。/)
  assert.doesNotMatch(html, /高分复核未通过：关键结构前提仍未全部满足。/)
})

test('round run card prefers the stored rubric snapshot over the current rubric labels', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round,
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

test('round run card explains when an old review can no longer align to the current rubric', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      rubricDimensionsSnapshot: null,
      dimensionScores: { d1: 12 },
    },
    expanded: true,
    onToggle: () => {},
    rubricDimensions: [
      { id: 'd1', label: '目标清晰度', max: 10 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
    ],
  }))

  assert.match(html, /该轮评分标准快照不可用，暂不显示分项分数条。/)
})

test('round run card shows input prompt, new output, and split diagnostics when expanded', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round,
    expanded: true,
    onToggle: () => {},
    rubricDimensions: [
      { id: 'd1', label: '目标清晰度', max: 15 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
      { id: 'd3', label: '输出契约明确度', max: 15 },
    ],
  }))

  assert.match(html, /进入本轮前的提示词/)
  assert.match(html, /ROUND 1 OUTPUT/)
  assert.match(html, /本轮生成的新版本/)
  assert.match(html, /ROUND 2 OUTPUT/)
  assert.match(html, /上轮主要问题/)
  assert.match(html, /这轮实际改动/)
  assert.match(html, /目标清晰度/)
  assert.match(html, /12\s*\/\s*15/)
  assert.match(html, /输入约束完整度/)
  assert.match(html, /7\s*\/\s*10/)
})

test('round run card derives actual changes from the output diff instead of judge suggestions', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      inputPrompt: '你是初九。',
      suggestedChanges: ['补一条异常处理规则。'],
      outputCandidate: {
        ...round.outputCandidate!,
        majorChanges: [],
        optimizedPrompt: [
          '你是初九。',
          '1. 当前局势判断',
          '2. 真正主线',
          '3. 当前最大阻塞',
        ].join('\n'),
      },
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /新增了「1\. 当前局势判断」「2\. 真正主线」「3\. 当前最大阻塞」等结构段落。/)
  assert.match(html, /评审建议/)
  assert.match(html, /补一条异常处理规则。/)
  assert.doesNotMatch(html, /模型没有写出改动摘要/)
  assert.doesNotMatch(html, /这一轮没有额外诊断细节/)
})

test('round run card ignores fallback major changes and still derives concrete diff summaries', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      inputPrompt: '你是初九。',
      outputCandidate: {
        ...round.outputCandidate!,
        majorChanges: ['本轮已生成新版本，但模型返回了异语言改动摘要；请以上方新版本正文为准。'],
        optimizedPrompt: [
          '你是初九。',
          '1. 当前局势判断',
          '2. 真正主线',
          '3. 当前最大阻塞',
        ].join('\n'),
      },
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /新增了「1\. 当前局势判断」「2\. 真正主线」「3\. 当前最大阻塞」等结构段落。/)
  assert.doesNotMatch(html, /异语言改动摘要/)
})

test('round run card derives a concrete diff summary when both major changes and suggested changes are missing', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      inputPrompt: '你是初九。\\n帮我处理复杂任务。',
      suggestedChanges: [],
      outputCandidate: {
        ...round.outputCandidate!,
        majorChanges: [],
        optimizedPrompt: [
          '你是初九。',
          '1. 当前局势判断',
          '2. 真正主线',
          '3. 当前最大阻塞',
          '4. 下一步最小动作',
        ].join('\n'),
      },
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这轮实际改动/)
  assert.match(html, /新增了「1\. 当前局势判断」「2\. 真正主线」「3\. 当前最大阻塞」等结构段落。/)
  assert.match(html, /把原本偏粗的要求扩成了更完整的可执行提示词。/)
  assert.doesNotMatch(html, /模型没有写出改动摘要/)
})

test('round run card tells the truth when the handed-off prompt is identical to the input', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      suggestedChanges: [],
      outputCandidate: {
        ...round.outputCandidate!,
        majorChanges: [],
        optimizedPrompt: round.inputPrompt,
      },
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /本轮没有形成可区分的新稿；当前有效版本仍是进入本轮前的这版提示词。/)
  assert.doesNotMatch(html, /沿用上一版/)
  assert.doesNotMatch(html, /模型没有写出改动摘要/)
})

test('round run card labels review-only guidance as review suggestions instead of actual changes', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      passStreakAfter: 0,
      hasMaterialIssues: true,
      summary: '这轮主要补充了诊断摘要。',
      findings: ['还缺一个边界情况。'],
      suggestedChanges: ['补一条异常处理规则。'],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /评审建议/)
  assert.match(html, /补一条异常处理规则。/)
  assert.doesNotMatch(html, /这轮实际改动/)
  assert.doesNotMatch(html, /这一轮没有额外诊断细节/)
})

test('round run card suppresses fallback-only suggestions from the support panel', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      passStreakAfter: 0,
      hasMaterialIssues: true,
      findings: ['还缺一个边界情况。'],
      suggestedChanges: ['本轮给出了改进方向，但模型返回了异语言建议；请优先参考当前任务语境。'],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /上轮主要问题/)
  assert.doesNotMatch(html, /评审建议/)
  assert.doesNotMatch(html, /异语言建议/)
})

test('round run card keeps the previous-issues panel when only the review summary exists', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      findings: [],
      driftLabels: [],
      driftExplanation: '',
      summary: '上一轮的主要问题是：目标对了，但输出协议还不够具体。',
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /上轮主要问题/)
  assert.match(html, /本轮详情已展开；下方查看主要问题、实际改动与评审建议。/)
  assert.match(html, /上一轮的主要问题是：目标对了，但输出协议还不够具体。/)
})

test('round run card synthesizes a narrative summary when stored high-score recheck copy is too lazy', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '本轮高分复核未完成，95+ 资格暂不成立。',
      findings: [
        '主线识别、现实约束和最小动作推进已经形成完整闭环。',
        '默认输出协议与目标 deliverable 基本完全对齐。',
        '主要短板是部分规则略重复，可能让回答略显厚重。',
      ],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /主线识别、现实约束和最小动作推进已经形成完整闭环；默认输出协议与目标 deliverable 基本完全对齐；主要短板是部分规则略重复，可能让回答略显厚重。/)
  assert.doesNotMatch(html, /95\+\s*资格暂不成立/)
})

test('round run card synthesizes a concrete summary from dimension reasons when the stored summary is lazy fallback text', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '本轮诊断已完成，但评分器没有写出有效摘要；这轮结果不计入可信通过。',
      findings: [],
      dimensionReasons: [
        '输出契约明确度：保留了人数、预算、老人小孩和四个交付物，但仍缺输入细化、输出格式和决策规则。',
        '鲁棒性：还没有把异常处理和冲突取舍写硬，真实执行时仍可能回到空泛建议。',
      ],
    },
    expanded: false,
    onToggle: () => {},
  }))

  assert.match(html, /保留了人数、预算、老人小孩和四个交付物，但仍缺输入细化、输出格式和决策规则；还没有把异常处理和冲突取舍写硬，真实执行时仍可能回到空泛建议。/)
  assert.doesNotMatch(html, /评分器没有写出有效摘要/)
})

test('round run card hides top-band gatekeeper findings from the visible issues list', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '整体高度贴合目标锚点：角色明确、四项输出完整、默认条件与执行约束齐全。',
      findings: [
        '高分重评未返回可信结构化结果：本轮评分记为不可信，不能作为通过依据。',
        '高分复核未完成：本轮仍有关键结构缺口未确认，不覆盖原始任务诊断。',
        '对单灶、无蒸器具、无明火等设备限制给出了替代策略，显著提升了现实可执行性。',
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /对单灶、无蒸器具、无明火等设备限制给出了替代策略，显著提升了现实可执行性。/)
  assert.doesNotMatch(html, /高分重评未返回可信结构化结果/)
  assert.doesNotMatch(html, /高分复核未完成/)
})

test('round run card dedupes findings that simply repeat the summary', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '上一轮的主要问题是：默认输出契约还不够硬。',
      findings: [
        '上一轮的主要问题是：默认输出契约还不够硬。',
        '还缺少一个异常场景的处理规则。',
      ],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.equal(html.split('上一轮的主要问题是：默认输出契约还不够硬。').length - 1, 1)
  assert.match(html, /还缺少一个异常场景的处理规则。/)
})

test('round run card does not style passed-without-output as failed and keeps runtime errors visible', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      optimizerError: '模型请求失败：request timeout after 120000ms',
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /class="pill completed">达标，本轮未产出更优替换稿/)
  assert.doesNotMatch(html, /class="pill failed">达标，本轮未产出更优替换稿/)
  assert.match(html, /本轮运行信息/)
  assert.match(html, /本次是请求层失败，但系统已保留当前结果与分数/)
})

test('round run card hides structured parse runtime details when review insights already explain the round', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      optimizerError: 'Model did not return valid JSON. Payload: {"score":94}',
      summary: '提示词与目标场景基本一致，保留了人数、预算、老人小孩三项关键变量，也点到了四个交付物。',
      findings: ['整体仍偏简略，缺少输入细化、输出格式、决策规则和异常处理。'],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /上轮主要问题/)
  assert.match(html, /整体仍偏简略，缺少输入细化、输出格式、决策规则和异常处理。/)
  assert.doesNotMatch(html, /本轮运行信息/)
  assert.doesNotMatch(html, /Model did not return valid JSON/)
})

test('round run card uses review suggestions wording when a passed round keeps the same prompt', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      passStreakAfter: 2,
      summary: '这轮复核通过，但仍有少量可继续补强的点。',
      findings: ['时间倒排规则还可以更硬。'],
      suggestedChanges: ['补一条时间倒排规则：若用户给出开饭时间，必须倒排采购、备菜和上桌。'],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /达标，本轮未产出更优替换稿/)
  assert.match(html, /优化器本轮已执行，但没有形成可替换的更优新稿，当前候选继续接受独立复核。/)
  assert.match(html, /评审建议/)
  assert.doesNotMatch(html, /下一步建议/)
  assert.doesNotMatch(html, /沿用上一版/)
})

test('round run card shows review suggestions by default even when actual changes exist', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      suggestedChanges: ['把“当前最大阻塞”的判断标准写得更硬一点。'],
      outputCandidate: {
        ...round.outputCandidate!,
        majorChanges: ['补上了输出前自检。'],
      },
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

test('round run card localizes raw infra errors when summary is missing', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '',
      outputCandidate: null,
      outputCandidateId: null,
      optimizerError: '模型请求失败：request timeout after 239999ms',
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /本次是请求层失败/)
  assert.doesNotMatch(html, /request timeout after 239999ms/)
})

test('round run card tells the truth when request-layer failures block any handoff draft', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      summary: '',
      findings: [],
      dimensionReasons: [],
      displayScore: null,
      outputCandidate: null,
      outputCandidateId: null,
      optimizerError: '模型请求失败：request timeout after 120000ms',
      judgeError: '模型请求失败：request timeout after 120000ms',
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这一轮停在请求层失败，系统还没拿到可写入的评分或新稿，因此没有可移交版本。/)
})

test('round run card distinguishes review-only no-output rounds from provider failures', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidate: null,
      outputCandidateId: null,
      optimizerError: null,
      judgeError: null,
      passStreakAfter: 0,
      displayScore: 88,
      summary: '这轮诊断已经跑完，但还没有形成更好的接替稿。',
      findings: ['异常处理还不够硬。'],
    },
    expanded: true,
    onToggle: () => {},
  }))

  assert.match(html, /这一轮只留下评分和诊断，没有形成新的可移交版本。/)
  assert.doesNotMatch(html, /请求层失败/)
})

test('round run preview summary is not clamped to two lines in css', () => {
  const source = fs.readFileSync(globalsCssPath, 'utf8')
  const blocks = Array.from(source.matchAll(/\.round-preview\s*\{[\s\S]*?\}/g)).map((item) => item[0])
  const match = blocks.find((block) => /display:|overflow:|-webkit-line-clamp:/.test(block))

  assert.ok(match)
  assert.match(match, /display:\s*block;/)
  assert.match(match, /overflow:\s*visible;/)
  assert.doesNotMatch(match, /-webkit-line-clamp:/)
})


test('round run card exposes editable review suggestions when steering handoff is enabled', () => {
  const html = renderToStaticMarkup(createElement(JobRoundRunCard, {
    round: {
      ...round,
      outputCandidateId: null,
      outputCandidate: null,
      passStreakAfter: 0,
      hasMaterialIssues: true,
      findings: ['还缺一个边界情况。'],
      suggestedChanges: ['补一条异常处理规则。'],
    },
    expanded: true,
    onToggle: () => {},
    onAddReviewSuggestions: async () => {},
    addingReviewSuggestions: false,
  }))

  assert.match(html, /评审建议/)
  assert.match(html, /这些建议来自评分器，不会自动进入下一轮。勾选、改写并确认后，才会写入待生效引导。/)
  assert.match(html, /加入下一轮引导/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /恢复评审建议 1 原文/)
})
