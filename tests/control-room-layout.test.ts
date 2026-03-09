import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  DashboardControlRoom,
  type DashboardJobView,
} from '../src/components/dashboard-control-room'
import {
  JobDetailControlRoom,
  getDetailNoticeItems,
  type JobDetailViewModel,
} from '../src/components/job-detail-control-room'
import { SettingsControlRoom } from '../src/components/settings-control-room'

test('dashboard control room prioritizes attention, running, and latest results', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    groups: {
      attention: [makeJob('manual', 'manual_review'), makeJob('paused', 'paused')],
      running: [makeJob('running', 'running')],
      queued: [makeJob('queued', 'pending')],
      recentCompleted: [makeJob('completed', 'completed')],
      history: [makeJob('failed', 'failed')],
    },
    stats: { attention: 2, running: 1, queued: 1, recentCompleted: 1, history: 1 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  assert.match(html, /任务控制室/)
  assert.match(html, /待你处理/)
  assert.match(html, /自动运行中/)
  assert.match(html, /最新结果/)
  assert.match(html, /历史任务/)
})

test('history lane exposes grouped search when history is the active focus', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    groups: {
      attention: [],
      running: [],
      queued: [],
      recentCompleted: [],
      history: [makeJob('history-old', 'failed')],
    },
    stats: { attention: 0, running: 0, queued: 0, recentCompleted: 0, history: 1 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  assert.match(html, /搜索标题，例如：老中医/)
  assert.match(html, /1 次运行/)
})

test('job detail control room keeps result before goal, controls, and diagnostics', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, {
    model: makeDetailModel(),
    models: [],
    ui: {
      loading: false,
      error: null,
      actionMessage: null,
      savingModels: false,
      savingMaxRounds: false,
      savingSteering: false,
      generatingGoalAnchorDraft: false,
      savingGoalAnchor: false,
      retrying: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      expandedRounds: {},
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '保持结果导向',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标',
      goalAnchorDraftReady: false,
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
    },
  }))

  const resultIndex = html.indexOf('当前最新完整提示词')
  const goalIndex = html.indexOf('核心目标锚点')
  const controlIndex = html.indexOf('任务控制')
  const diagnosticIndex = html.indexOf('优化过程诊断')

  assert.ok(resultIndex >= 0)
  assert.ok(goalIndex > resultIndex)
  assert.ok(controlIndex > goalIndex)
  assert.ok(diagnosticIndex > controlIndex)
})

test('job detail exposes pending steering cards and goal-anchor merge entry when steering exists', () => {
  const steeredModel = makeDetailModel()
  steeredModel.pendingSteeringItems = [
    {
      id: 'steer-1',
      text: '语气更直接，但保留老中医式判断和原有核心结论。',
      createdAt: '2026-03-09T10:00:00.000Z',
    },
    {
      id: 'steer-2',
      text: '最终给我的仍然应该是可一键复制的完整提示词。',
      createdAt: '2026-03-09T10:01:00.000Z',
    },
  ]

  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, {
    model: steeredModel,
    models: [],
    ui: {
      loading: false,
      error: null,
      actionMessage: null,
      savingModels: false,
      savingMaxRounds: false,
      savingSteering: false,
      generatingGoalAnchorDraft: false,
      savingGoalAnchor: false,
      retrying: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      expandedRounds: {},
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标',
      goalAnchorDraftReady: false,
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
    },
  }))

  assert.match(html, /当前有效目标视图/)
  assert.match(html, /待生效引导/)
  assert.match(html, /语气更直接，但保留老中医式判断和原有核心结论。/)
  assert.match(html, /最终给我的仍然应该是可一键复制的完整提示词。/)
  assert.match(html, /当前这组引导会怎样影响下一轮/)
  assert.match(html, /写入稳定锚点/)
  assert.match(html, /reviewer 不会看到这些引导原文/)
})

test('settings control room groups connection, defaults, and active runtime fields only', () => {
  const html = renderToStaticMarkup(createElement(SettingsControlRoom, {
    form: {
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'secret',
      defaultTaskModel: 'gpt-5.2',
      scoreThreshold: 95,
      maxRounds: 8,
    },
    models: [],
    loading: false,
    saving: false,
    testing: false,
    loadingModels: false,
    message: null,
    error: null,
    onSave: () => {},
    onTestConnection: () => {},
    onRefreshModels: () => {},
    onFormChange: () => {},
  }))

  assert.match(html, /连接/)
  assert.match(html, /默认模型/)
  assert.match(html, /运行策略/)
  assert.match(html, /OpenAI-compatible、Anthropic 官方和 Gemini 官方接口/)
  assert.match(html, /协议识别/)
  assert.match(html, /Base URL/)
  assert.match(html, /API Key/)
  assert.doesNotMatch(html, /裁判数量/)
  assert.doesNotMatch(html, /无提升上限/)
  assert.doesNotMatch(html, /并发数/)
  assert.doesNotMatch(html, /会话策略/)
  assert.doesNotMatch(html, /CPAMC/)
})

test('job detail notices produce stable unique keys for AnimatePresence', () => {
  const notices = getDetailNoticeItems({
    loading: true,
    actionMessage: 'saved',
    error: 'boom',
    displayError: 'mapped error',
  })

  assert.deepEqual(notices.map((item) => item.key), [
    'loading',
    'action-message',
    'ui-error',
    'display-error',
  ])
})

function makeJob(id: string, status: DashboardJobView['status']): DashboardJobView {
  return {
    id,
    title: id,
    status,
    currentRound: 1,
    bestAverageScore: 92,
    latestPrompt: 'Latest prompt preview',
    errorMessage: null,
    createdAt: '2026-03-09T10:00:00.000Z',
    conversationPolicy: 'stateless',
    optimizerModel: 'gpt-5.2',
    judgeModel: 'gpt-5.2',
  }
}

function makeDetailModel(): JobDetailViewModel {
  return {
    jobId: 'job-1',
    title: '测试任务',
    status: 'paused',
    conversationPolicy: 'stateless',
    optimizerModel: 'gpt-5.2',
    judgeModel: 'gpt-5.2',
    pendingOptimizerModel: null,
    pendingJudgeModel: null,
    cancelRequestedAt: null,
    pauseRequestedAt: null,
    pendingSteeringItems: [],
    goalAnchor: {
      goal: '保持原始任务目标',
      deliverable: '输出完整优化提示词',
      driftGuard: ['不要偏离目标'],
    },
    goalAnchorExplanation: {
      sourceSummary: '原始任务要求输出完整提示词。',
      rationale: ['系统识别到核心任务是优化提示词。'],
    },
    runMode: 'step',
    currentRound: 6,
    bestAverageScore: 96,
    maxRoundsOverride: 12,
    passStreak: 1,
    lastReviewScore: 94,
    errorMessage: null,
    latestFullPrompt: 'LATEST FULL PROMPT',
    modelsLabel: 'gpt-5.2',
    effectiveMaxRounds: 12,
    candidates: [],
  }
}
