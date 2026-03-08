import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runOptimizationCycle,
  type ModelAdapter,
  type RoundJudgment,
} from '../src/lib/engine/optimization-cycle'

class FakeAdapter implements ModelAdapter {
  constructor(
    private readonly optimizedPrompt: string,
    private readonly judgment: RoundJudgment,
  ) {}

  async optimizePrompt(): Promise<{
    optimizedPrompt: string
    strategy: 'preserve' | 'rebuild'
    scoreBefore: number
    majorChanges: string[]
    mve: string
    deadEndSignals: string[]
  }> {
    return {
      optimizedPrompt: this.optimizedPrompt,
      strategy: 'rebuild',
      scoreBefore: 61,
      majorChanges: ['tightened output contract'],
      mve: 'Run one judge-only dry check.',
      deadEndSignals: ['missing variables'],
    }
  }

  async judgePrompt(): Promise<RoundJudgment> {
    return this.judgment
  }
}

test('returns a single review result for the current candidate', async () => {
  const adapter = new FakeAdapter('final prompt', {
    score: 97,
    hasMaterialIssues: false,
    summary: 'strong',
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
  assert.deepEqual(result.aggregatedIssues, [])
})

test('keeps only the current review patch, without historical review context', async () => {
  const adapter = new FakeAdapter('better prompt', {
    score: 94,
    hasMaterialIssues: true,
    summary: 'still weak',
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
    previousFeedback: ['old issue that should not be merged here'],
  })

  assert.deepEqual(result.aggregatedIssues, ['missing boundary test', 'add edge case'])
  assert.equal(result.bestScore, 94)
})
