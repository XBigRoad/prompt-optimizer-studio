import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePostFailureStatus, resolvePostReviewStatus } from '../src/lib/server/worker'

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
