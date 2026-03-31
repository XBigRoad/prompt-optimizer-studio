import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runOptimizationCycle,
  type ModelAdapter,
  type RoundJudgment,
} from '../src/lib/engine/optimization-cycle'

class FakeAdapter implements ModelAdapter {
  lastOptimizeInput: Record<string, unknown> | null = null
  lastJudgeInput: string | null = null

  constructor(
    private readonly optimizedPrompt: string,
    private readonly judgment: RoundJudgment,
  ) {}

  async optimizePrompt(input: Record<string, unknown>): Promise<{
    optimizedPrompt: string
    strategy: 'preserve' | 'rebuild'
    scoreBefore: number
    majorChanges: string[]
    mve: string
    deadEndSignals: string[]
  }> {
    this.lastOptimizeInput = input
    return {
      optimizedPrompt: this.optimizedPrompt,
      strategy: 'rebuild',
      scoreBefore: 61,
      majorChanges: ['tightened output contract'],
      mve: 'Run one judge-only dry check.',
      deadEndSignals: ['missing variables'],
    }
  }

  async judgePrompt(prompt: string): Promise<RoundJudgment> {
    this.lastJudgeInput = prompt
    return this.judgment
  }
}

test('returns a single review result for the current candidate', async () => {
  const adapter = new FakeAdapter('final prompt', {
    score: 97,
    hasMaterialIssues: false,
    summary: 'strong',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
  })

  const result = await runOptimizationCycle({
    adapter,
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
    previousBestScore: 90,
  })

  assert.equal(result.review.score, 97)
  assert.equal(result.bestScore, 97)
  assert.equal(result.optimizedPrompt, 'final prompt')
  assert.equal(adapter.lastJudgeInput, 'draft prompt')
  assert.deepEqual(result.aggregatedIssues, [])
  assert.deepEqual(adapter.lastOptimizeInput, {
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    pendingSteeringItems: [],
    reviewFeedbackItems: [],
  })
})

test('keeps only the current review patch, without historical review context leaking back into optimizer', async () => {
  const adapter = new FakeAdapter('better prompt', {
    score: 94,
    hasMaterialIssues: true,
    summary: 'still weak',
    driftLabels: ['focus_shift'],
    driftExplanation: 'The prompt drifted away from the original task center.',
    findings: ['missing boundary test'],
    suggestedChanges: ['add edge case'],
  })

  const result = await runOptimizationCycle({
    adapter,
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
    previousBestScore: 91,
  })

  assert.deepEqual(result.aggregatedIssues, ['missing boundary test', 'add edge case'])
  assert.equal(result.bestScore, 94)
  assert.equal(adapter.lastJudgeInput, 'draft prompt')
  assert.equal(Object.prototype.hasOwnProperty.call(adapter.lastOptimizeInput ?? {}, 'previousFeedback'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(adapter.lastOptimizeInput ?? {}, 'threshold'), false)
})

test('sanitizes threshold-bound review feedback before sending it to the optimizer', async () => {
  const adapter = new FakeAdapter('better prompt', {
    score: 96,
    hasMaterialIssues: true,
    summary: 'still weak',
    driftLabels: [],
    driftExplanation: '',
    findings: [
      '高分复核未通过：关键结构前提仍未全部满足。',
      '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
      '输出契约缺少可核对字段。',
    ],
    suggestedChanges: [
      '补齐预算冲突 fallback。',
      'Decision Threshold: >=85',
    ],
    dimensionReasons: [
      '输入约束完整度：没有给出明确边界条件。',
      '鲁棒性仍低于 95+ 门槛。',
    ],
  })

  await runOptimizationCycle({
    adapter,
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
    previousBestScore: 91,
  })

  assert.deepEqual((adapter.lastOptimizeInput as { reviewFeedbackItems?: string[] }).reviewFeedbackItems, [
    '输入约束完整度：没有给出明确边界条件。',
    '鲁棒性仍需补强。',
    '输出契约与鲁棒性仍需补强。',
    '输出契约缺少可核对字段。',
    '补齐预算冲突 fallback。',
  ])
})

test('runOptimizationCycle strips threshold-bound review boilerplate before optimizer sees feedback items', async () => {
  const adapter = new FakeAdapter('better prompt', {
    score: 96,
    hasMaterialIssues: false,
    summary: 'strong',
    driftLabels: [],
    driftExplanation: '',
    findings: [
      '高分复核未通过：关键结构前提仍未全部满足。',
      '输入约束完整度仍低于 95+ 门槛。',
    ],
    suggestedChanges: [
      'Decision Threshold',
      '补上预算冲突 fallback。',
    ],
    dimensionReasons: [
      '鲁棒性 当前为 8/10，未达到 95+ 所需的 9/10。',
    ],
  })

  await runOptimizationCycle({
    adapter,
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
    previousBestScore: 90,
  })

  assert.deepEqual((adapter.lastOptimizeInput?.reviewFeedbackItems as string[]) ?? [], [
    '鲁棒性 当前为 8/10，仍需补强。',
    '输入约束完整度仍需补强。',
    '补上预算冲突 fallback。',
  ])
})

test('runOptimizationCycle strips threshold-bound review feedback before sending it back to the optimizer', async () => {
  const adapter = new FakeAdapter('better prompt', {
    score: 96,
    hasMaterialIssues: false,
    summary: 'still strong',
    driftLabels: [],
    driftExplanation: '',
    findings: [
      '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
      '缺少预算不足时怎么收缩菜单的规则。',
    ],
    suggestedChanges: [
      '补上预算不足时的回退方案。',
      '高分复核未通过：关键结构前提仍未全部满足。',
    ],
    dimensionReasons: [
      '输入约束完整度 当前为 8/10，未达到 95+ 所需的 9/10。',
      '输出契约明确度：可判定格式还不够硬。',
    ],
  })

  await runOptimizationCycle({
    adapter,
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
    previousBestScore: 91,
  })

  assert.deepEqual(adapter.lastOptimizeInput, {
    currentPrompt: 'draft prompt',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the requested output.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    pendingSteeringItems: [],
    reviewFeedbackItems: [
      '输入约束完整度 当前为 8/10，仍需补强。',
      '输出契约明确度：可判定格式还不够硬。',
      '输出契约与鲁棒性仍需补强。',
      '缺少预算不足时怎么收缩菜单的规则。',
      '补上预算不足时的回退方案。',
    ],
  })
})
