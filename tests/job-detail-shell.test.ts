import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { JobDetailShell } from '../src/components/job-detail-shell'
import { I18nProvider } from '../src/lib/i18n'
import { clearJobDetailRuntimeSnapshot, writeJobDetailRuntimeSnapshot } from '../src/lib/job-detail-runtime-cache'

test('job detail shell reuses cached snapshot so remount does not fall back to blank loading shell', () => {
  const jobId = 'job-cache-1'

  clearJobDetailRuntimeSnapshot(jobId)
  writeJobDetailRuntimeSnapshot(jobId, {
    detail: {
      job: {
        id: jobId,
        title: '缓存后的任务详情',
        rawPrompt: '初始提示词',
        optimizerModel: 'gpt-5.4',
        judgeModel: 'gpt-5.4',
        optimizerReasoningEffort: 'high',
        judgeReasoningEffort: 'high',
        pendingOptimizerModel: null,
        pendingJudgeModel: null,
        pendingOptimizerReasoningEffort: null,
        pendingJudgeReasoningEffort: null,
        cancelRequestedAt: null,
        pauseRequestedAt: null,
        pendingSteeringItems: [],
        goalAnchor: {
          goal: '保持当前任务目标',
          deliverable: '输出最终完整提示词',
          driftGuard: ['不要偏题'],
        },
        goalAnchorExplanation: {
          sourceSummary: '系统从原始任务里识别出真实目标。',
          rationale: ['当前任务是持续优化提示词直到拿到稳定终稿。'],
        },
        status: 'running',
        runMode: 'auto',
        currentRound: 2,
        candidateCount: 1,
        bestAverageScore: 88,
        maxRoundsOverride: 25,
        passStreak: 1,
        lastReviewScore: 88,
        finalCandidateId: null,
        customRubricMd: null,
        errorMessage: null,
        conversationPolicy: 'stateless',
      },
      candidates: [],
      roundRuns: [],
    },
    models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    settings: { maxRounds: 25 },
    effectiveRubricMd: '# 默认评分标准',
    effectiveRubricSource: 'default',
  })

  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: 'zh-CN',
    children: createElement(JobDetailShell, { jobId }),
  }))

  assert.match(html, /缓存后的任务详情/)
  assert.match(html, /当前最新完整提示词/)
  assert.doesNotMatch(html, /<main><div class="shell"><div class="notice">正在读取任务详情\.\.\.<\/div><\/div><\/main>/)

  clearJobDetailRuntimeSnapshot(jobId)
})

test('job detail shell ignores malformed cached snapshots instead of crashing on stale runtime data', () => {
  const jobId = 'job-cache-stale'

  clearJobDetailRuntimeSnapshot(jobId)
  writeJobDetailRuntimeSnapshot(jobId, {
    detail: {
      job: {
        id: jobId,
        title: '过期缓存',
        rawPrompt: '旧提示词',
        optimizerModel: 'gpt-5.4',
        judgeModel: 'gpt-5.4',
        optimizerReasoningEffort: 'high',
        judgeReasoningEffort: 'high',
        pendingSteeringItems: [],
        goalAnchor: {
          goal: '旧目标',
          deliverable: '旧交付',
          driftGuard: ['不要偏题'],
        },
        status: 'running',
        runMode: 'auto',
        currentRound: 1,
        candidateCount: 0,
        bestAverageScore: 0,
        maxRoundsOverride: null,
        passStreak: 0,
        lastReviewScore: 0,
        finalCandidateId: null,
        customRubricMd: null,
        errorMessage: null,
        conversationPolicy: 'stateless',
      },
      candidates: [],
      roundRuns: [],
    },
    models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    settings: { maxRounds: 8 },
    effectiveRubricMd: '# 默认评分标准',
    effectiveRubricSource: 'default',
  } as never)

  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: 'zh-CN',
    children: createElement(JobDetailShell, { jobId }),
  }))

  assert.match(html, /正在读取任务详情/)
  assert.doesNotMatch(html, /过期缓存/)

  clearJobDetailRuntimeSnapshot(jobId)
})
