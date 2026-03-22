import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveCompletionStateAfterRound,
  resolvePostFailureStatus,
  resolvePostReviewStatus,
  resolveRoundExecutionMode,
} from '../src/lib/server/runtime/index'

test('step mode pauses after exactly one completed round', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 4,
    maxRounds: 8,
    runMode: 'step',
    pauseRequestedAt: null,
  }), 'paused')
})

test('cooperative pause wins after the current round finishes', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 4,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: '2026-03-08T10:00:00.000Z',
  }), 'paused')
})

test('auto mode falls back to manual review once the effective max round is reached', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 8,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
  }), 'manual_review')
})

test('completion still wins over step or pause controls', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: true,
    roundNumber: 8,
    maxRounds: 8,
    runMode: 'step',
    pauseRequestedAt: '2026-03-08T10:00:00.000Z',
  }), 'completed')
})

test('step mode soft-lands infra failures with usable results back to paused', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'step',
    hasUsableResult: true,
    error: Object.assign(new Error('模型请求失败 (504): rawchat.cn | 504: Gateway time-out'), { status: 504, retriable: true }),
  }), 'paused')
})

test('auto mode soft-lands infra failures with usable results into manual review', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'auto',
    hasUsableResult: true,
    error: new Error('fetch failed: ETIMEDOUT'),
  }), 'manual_review')
})

test('hard failures remain failed when there is no usable result or the error is not infra', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'step',
    hasUsableResult: false,
    error: Object.assign(new Error('模型请求失败 (504): Gateway time-out'), { status: 504, retriable: true }),
  }), 'failed')

  assert.equal(resolvePostFailureStatus({
    runMode: 'auto',
    hasUsableResult: true,
    error: new Error('候选稿分数字段无效：scoreBefore'),
  }), 'failed')
})

test('uses sequential round execution for openai-compatible GPT-5 xhigh on both optimizer and judge', () => {
  assert.equal(resolveRoundExecutionMode({
    cpamcBaseUrl: 'http://localhost:8317/v1',
    apiProtocol: 'auto',
    optimizerModel: 'gpt-5.4',
    judgeModel: 'gpt-5.4',
    optimizerReasoningEffort: 'xhigh',
    judgeReasoningEffort: 'xhigh',
  }), 'sequential')
})

test('keeps parallel round execution outside the risky provider/model profile', () => {
  assert.equal(resolveRoundExecutionMode({
    cpamcBaseUrl: 'http://localhost:8317/v1',
    apiProtocol: 'auto',
    optimizerModel: 'gpt-5.4',
    judgeModel: 'gpt-5.4',
    optimizerReasoningEffort: 'xhigh',
    judgeReasoningEffort: 'medium',
  }), 'parallel')

  assert.equal(resolveRoundExecutionMode({
    cpamcBaseUrl: 'https://api.anthropic.com',
    apiProtocol: 'anthropic-native',
    optimizerModel: 'claude-sonnet-4.5',
    judgeModel: 'claude-sonnet-4.5',
    optimizerReasoningEffort: 'xhigh',
    judgeReasoningEffort: 'xhigh',
  }), 'parallel')
})

test('third passing review still completes when optimizer output is missing', () => {
  assert.deepEqual(resolveCompletionStateAfterRound({
    shouldComplete: true,
    outputCandidateId: null,
    currentCandidateId: 'candidate-r2',
    existingFinalCandidateId: 'candidate-r1',
    roundNumber: 3,
    maxRounds: 20,
    runMode: 'auto',
    pauseRequestedAt: null,
  }), {
    status: 'completed',
    finalCandidateId: 'candidate-r2',
  })
})

test('completion fallback prefers current judged input over stale final candidate', () => {
  assert.deepEqual(resolveCompletionStateAfterRound({
    shouldComplete: true,
    outputCandidateId: null,
    currentCandidateId: 'candidate-r2',
    existingFinalCandidateId: 'candidate-r1',
    roundNumber: 3,
    maxRounds: 20,
    runMode: 'step',
    pauseRequestedAt: '2026-03-22T00:00:00.000Z',
  }), {
    status: 'completed',
    finalCandidateId: 'candidate-r2',
  })
})
