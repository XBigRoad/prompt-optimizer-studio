import assert from 'node:assert/strict'
import test from 'node:test'

import {
  nextPassStreak,
  shouldFinalizeAfterReview,
  summarizeJudgments,
  type RoundJudgment,
} from '../src/lib/engine/optimization-cycle'

function makeJudgment(
  score: number,
  hasMaterialIssues = false,
  findings: string[] = [],
  suggestedChanges: string[] = [],
  driftLabels: string[] = [],
  driftExplanation = '',
): RoundJudgment {
  return {
    score,
    hasMaterialIssues,
    summary: 'review',
    driftLabels,
    driftExplanation,
    findings,
    suggestedChanges,
  }
}

test('reviewer summary uses only the single current review result', () => {
  const summary = summarizeJudgments([
    makeJudgment(96, false, ['issue A'], ['patch A']),
  ], 95)

  assert.equal(summary.passCount, 1)
  assert.equal(summary.averageScore, 96)
  assert.deepEqual(summary.aggregatedIssues, ['issue A', 'patch A'])
})

test('pass streak increments only when current review fully passes', () => {
  assert.equal(nextPassStreak(0, makeJudgment(95, false)), 1)
  assert.equal(nextPassStreak(1, makeJudgment(96, false)), 2)
  assert.equal(nextPassStreak(2, makeJudgment(94, true, ['issue'])), 0)
})

test('drift labels can be attached without changing pass logic when review passes cleanly', () => {
  const review = makeJudgment(95, false, [], [], [], '')
  assert.deepEqual(review.driftLabels, [])
  assert.equal(review.driftExplanation, '')
  assert.equal(nextPassStreak(0, review), 1)
})

test('drift labels reset pass logic even when the numeric score is high', () => {
  const review = makeJudgment(98, false, [], [], ['focus_shift'], '偏题')
  assert.equal(nextPassStreak(2, review), 0)
  assert.equal(shouldFinalizeAfterReview(2, review, 95), false)
})

test('job finalizes only after three consecutive passing reviews', () => {
  assert.equal(shouldFinalizeAfterReview(2, makeJudgment(95, false), 95), true)
  assert.equal(shouldFinalizeAfterReview(1, makeJudgment(95, false), 95), false)
  assert.equal(shouldFinalizeAfterReview(2, makeJudgment(95, true, ['issue']), 95), false)
})

test('job finalization respects a custom required pass count when configured', () => {
  assert.equal(shouldFinalizeAfterReview(1, makeJudgment(95, false), 95, 2), true)
  assert.equal(shouldFinalizeAfterReview(0, makeJudgment(95, false), 95, 2), false)
})
