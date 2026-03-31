import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildJobDetailLoadWarning,
  shouldSurfaceJobDetailHardFailure,
} from '../src/lib/job-detail-load-feedback'

test('job detail load warning localizes retained auxiliary fetch failures', () => {
  assert.equal(
    buildJobDetailLoadWarning({
      locale: 'zh-CN',
      retainedDetail: true,
      failedSources: ['models', 'rubric'],
    }),
    '模型列表、当前评分标准刷新失败，页面先继续沿用这些区域上一版可用数据。',
  )
})

test('job detail load warning explains retained content when detail refresh fails', () => {
  assert.equal(
    buildJobDetailLoadWarning({
      locale: 'zh-CN',
      retainedDetail: true,
      detailRefreshFailed: true,
      failedSources: ['settings'],
    }),
    '任务详情刚刚刷新失败，页面先保留上一版内容；设置也没有刷新成功。',
  )
})

test('job detail load warning stays null when no retained snapshot exists', () => {
  assert.equal(
    buildJobDetailLoadWarning({
      locale: 'zh-CN',
      retainedDetail: false,
      failedSources: ['models'],
    }),
    null,
  )
})

test('job detail hard failure is only surfaced immediately when no retained detail exists', () => {
  assert.equal(shouldSurfaceJobDetailHardFailure({ hasRetainedDetail: false, consecutiveFailures: 1 }), true)
  assert.equal(shouldSurfaceJobDetailHardFailure({ hasRetainedDetail: true, consecutiveFailures: 1 }), false)
  assert.equal(shouldSurfaceJobDetailHardFailure({ hasRetainedDetail: true, consecutiveFailures: 2 }), true)
})
