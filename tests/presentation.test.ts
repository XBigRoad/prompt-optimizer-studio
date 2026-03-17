import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getJobFailureKind,
  getJobScoreDisplay,
  getJobScoreMeta,
  getPromptPreview,
  getTaskModelLabel,
  resolveLatestFullPrompt,
} from '../src/lib/presentation'

test('task model label collapses identical optimizer and judge models', () => {
  assert.equal(getTaskModelLabel('gpt-5.2', 'gpt-5.2'), 'gpt-5.2')
})

test('task model label exposes mixed legacy jobs safely', () => {
  assert.equal(getTaskModelLabel('gpt-5.4', 'gemini-3.1-pro'), '混合：gpt-5.4 / gemini-3.1-pro')
})

test('latest full prompt prefers the newest candidate prompt', () => {
  assert.equal(resolveLatestFullPrompt('raw prompt', [
    { optimizedPrompt: 'round 3 prompt' },
    { optimizedPrompt: 'round 2 prompt' },
  ]), 'round 3 prompt')
})

test('latest full prompt falls back to raw prompt when no candidate exists', () => {
  assert.equal(resolveLatestFullPrompt('raw prompt', []), 'raw prompt')
})

test('prompt preview compresses the latest full prompt for card display', () => {
  const preview = getPromptPreview('Line one.\n\nLine two with more details.\n\nLine three.', 24)
  assert.equal(preview, 'Line one. Line two with...')
})

test('job score display hides missing scores until a candidate exists', () => {
  assert.equal(getJobScoreDisplay({
    bestAverageScore: 0,
    currentRound: 0,
    candidateCount: 0,
  }), '—')
  assert.equal(getJobScoreMeta({
    currentRound: 0,
    candidateCount: 0,
  }), '未产生成绩')
})

test('job score display keeps numeric scores once a candidate exists', () => {
  assert.equal(getJobScoreDisplay({
    bestAverageScore: 94,
    currentRound: 1,
    candidateCount: 1,
  }), '94.00')
  assert.equal(getJobScoreMeta({
    currentRound: 1,
    candidateCount: 1,
  }), null)
})

test('job failure kind distinguishes infra-blocked failures from content failures', () => {
  assert.equal(getJobFailureKind({
    status: 'failed',
    currentRound: 0,
    candidateCount: 0,
    errorMessage: 'fetch failed: ETIMEDOUT',
  }), 'infra')

  assert.equal(getJobFailureKind({
    status: 'failed',
    currentRound: 3,
    candidateCount: 3,
    errorMessage: '模型请求失败 (504): rawchat.cn | 504: Gateway time-out',
  }), 'infra')

  assert.equal(getJobFailureKind({
    status: 'failed',
    currentRound: 1,
    candidateCount: 1,
    errorMessage: '候选稿分数字段无效：scoreBefore',
  }), 'content')
})

test('display error maps generic infra failures into a retryable explanation', async () => {
  const { getJobDisplayError } = await import('../src/lib/presentation')

  assert.equal(
    getJobDisplayError('fetch failed: ETIMEDOUT'),
    '本次是请求层失败，系统尚未产生成绩。可直接重试；若频繁出现，再看网关、模型可用性或网络连通性。',
  )
})

test('display error maps raw gateway timeout HTML into a retryable infra explanation', async () => {
  const { getJobDisplayError } = await import('../src/lib/presentation')

  assert.equal(
    getJobDisplayError('模型请求失败 (504): <!DOCTYPE html><title>rawchat.cn | 504: Gateway time-out</title>'),
    '本次是请求层失败，系统尚未产生成绩。可直接重试；若频繁出现，再看网关、模型可用性或网络连通性。',
  )
})
