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
import type { RoundCandidateView } from '../src/components/job-round-card'
import { SettingsControlRoom } from '../src/components/settings-control-room'
import { StudioFrame } from '../src/components/studio-frame'
import { ModelAliasCombobox } from '../src/components/ui/model-alias-combobox'
import { I18nProvider } from '../src/lib/i18n'

test('studio frame and control room can render fully in English', () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: 'en',
    children: createElement(StudioFrame, {
      title: 'Job Control Room',
      currentPath: '/',
      children: createElement(DashboardControlRoom, {
        actionableOnly: false,
        loading: false,
        groups: {
          attention: [makeJob('manual', 'manual_review')],
          running: [],
          queued: [],
          recentCompleted: [],
          history: [],
        },
        stats: { attention: 1, running: 0, queued: 0, recentCompleted: 0, history: 0 },
        actionInFlight: null,
        onToggleActionableOnly: () => {},
        onCopyPrompt: async () => {},
        onResumeStep: async () => {},
        onResumeAuto: async () => {},
      }),
    }),
  }))

  assert.match(html, /Job Control Room/)
  assert.match(html, /Prompt Optimizer Studio/)
  assert.match(html, /Language/)
  assert.match(html, /Need your decision/)
  assert.doesNotMatch(html, /How to use/)
  assert.doesNotMatch(html, /Navigation/)
  assert.doesNotMatch(html, /任务控制室/)
  assert.doesNotMatch(html, /控制室导航/)
})

test('studio frame keeps logo only in tab/favicon and not inside the sidebar', () => {
  const html = renderToStaticMarkup(createElement(StudioFrame, {
    title: '任务控制室',
    currentPath: '/',
    children: createElement('div', null, 'body'),
  }))

  assert.doesNotMatch(html, /src="\/logo\.png"/)
})

test('studio frame keeps only the product name in the sidebar brand block', () => {
  const html = renderToStaticMarkup(createElement(StudioFrame, {
    title: '当前页标题唯一标记',
    currentPath: '/',
    children: createElement('div', null, 'body'),
  }))

  assert.match(html, /Prompt Optimizer Studio/)
  assert.doesNotMatch(html, />Prompt Optimizer</)
  assert.doesNotMatch(html, /当前页标题唯一标记/)
  assert.doesNotMatch(html, /控制室导航/)
})

test('logo assets exist for favicon and GitHub rendering', () => {
  // Keep this small and explicit: we only want to ensure the assets we reference in
  // the app and README keep existing as stable paths.
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')

  assert.ok(fs.existsSync(path.join(process.cwd(), 'public', 'logo.png')))
  assert.ok(fs.existsSync(path.join(process.cwd(), 'src', 'app', 'icon.png')))
})

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
  assert.doesNotMatch(html, /Prompt Optimizer Studio/)
  assert.match(html, /待你处理/)
  assert.match(html, /自动运行中/)
  assert.match(html, /最新结果/)
  assert.match(html, /排队中/)
  assert.match(html, /历史任务/)
  assert.doesNotMatch(html, /aria-controls="radix-/)
  assert.match(html, /先处理要你决策的任务/)
  assert.doesNotMatch(html, /class="section-title lane-title"/)
  assert.doesNotMatch(html, /前往设置/)
  assert.doesNotMatch(html, /前往配置台/)
})


test('dashboard control room renders the middle slot between hero and lane tabs', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    middleSlot: createElement('div', { 'data-test-slot': 'submission-slot' }, '投递台测试块'),
    groups: {
      attention: [makeJob('manual', 'manual_review')],
      running: [],
      queued: [],
      recentCompleted: [],
      history: [],
    },
    stats: { attention: 1, running: 0, queued: 0, recentCompleted: 0, history: 0 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  const heroIndex = html.indexOf('任务控制室')
  const slotIndex = html.indexOf('投递台测试块')
  const tabIndex = html.indexOf('data-lane="attention"')

  assert.ok(heroIndex >= 0)
  assert.ok(slotIndex > heroIndex)
  assert.ok(tabIndex > slotIndex)
})

test('running dashboard cards keep only one detail entry point', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    groups: {
      attention: [],
      running: [makeJob('single-detail', 'running')],
      queued: [],
      recentCompleted: [],
      history: [],
    },
    stats: { attention: 0, running: 1, queued: 0, recentCompleted: 0, history: 0 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  assert.equal(html.split('/jobs/single-detail').length - 1, 1)
  assert.match(html, /打开详情/)
})

test('dashboard defaults to latest results when only history exists', () => {
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

  assert.match(html, /(data-lane="recent-completed"[^>]*data-state="active")|(data-state="active"[^>]*data-lane="recent-completed")/)
  assert.match(html, /搜索标题，例如：老中医/)
  assert.match(html, /1 次运行/)
})

test('dashboard history uses singular run copy in English', () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: 'en',
    children: createElement(DashboardControlRoom, {
      actionableOnly: false,
      loading: false,
      groups: {
        attention: [],
        running: [],
        queued: [],
        recentCompleted: [],
        history: [makeJob('history-en', 'failed')],
      },
      stats: { attention: 0, running: 0, queued: 0, recentCompleted: 0, history: 1 },
      actionInFlight: null,
      onToggleActionableOnly: () => {},
      onCopyPrompt: async () => {},
      onResumeStep: async () => {},
      onResumeAuto: async () => {},
    }),
  }))

  assert.match(html, />1 run</)
  assert.doesNotMatch(html, />1 runs</)
})

test('dashboard recent results tab exposes balanced result and history columns', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    groups: {
      attention: [],
      running: [],
      queued: [],
      recentCompleted: [makeJob('completed-rhythm', 'completed')],
      history: [makeJob('history-rhythm', 'failed')],
    },
    stats: { attention: 0, running: 0, queued: 0, recentCompleted: 1, history: 1 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  assert.match(html, /data-ui="latest-results-grid"/)
  assert.match(html, /data-ui="recent-results-column"/)
  assert.match(html, /data-ui="history-results-column"/)
})

test('completed dashboard cards keep a single copy action and retain detail entry', () => {
  const html = renderToStaticMarkup(createElement(DashboardControlRoom, {
    actionableOnly: false,
    loading: false,
    groups: {
      attention: [],
      running: [],
      queued: [],
      recentCompleted: [makeJob('completed-copy', 'completed')],
      history: [],
    },
    stats: { attention: 0, running: 0, queued: 0, recentCompleted: 1, history: 0 },
    actionInFlight: null,
    onToggleActionableOnly: () => {},
    onCopyPrompt: async () => {},
    onResumeStep: async () => {},
    onResumeAuto: async () => {},
  }))

  assert.match(html, /复制最新提示词/)
  assert.match(html, /data-ui="card-secondary-link"/)
  assert.equal(html.split('/jobs/completed-copy').length - 1, 1)
  assert.doesNotMatch(html, /class="button ghost"[^>]*>详情</)
  assert.doesNotMatch(html, />复制</)
})

test('settings control room moves save action into one shared bar below the compact grid', () => {
  const html = renderToStaticMarkup(createElement(SettingsControlRoom, {
    form: {
      cpamcBaseUrl: '',
      cpamcApiKey: '',
      apiProtocol: 'auto',
      defaultTaskModel: '',
      scoreThreshold: 95,
      maxRounds: 8,
      workerConcurrency: 2,
      customRubricMd: '',
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

  const compactGridIndex = html.indexOf('class="settings-grid settings-grid-compact"')
  const saveBarIndex = html.indexOf('data-ui="settings-save-bar"')
  const runtimeIndex = html.indexOf('运行策略')
  const saveIndex = html.indexOf('保存设置')

  assert.ok(compactGridIndex >= 0)
  assert.ok(saveBarIndex > compactGridIndex)
  assert.ok(saveIndex > runtimeIndex)
  assert.equal((html.match(/>保存设置</g) ?? []).length, 1)
})

test('settings control room keeps Chinese-only rubric label by default', () => {
  const html = renderToStaticMarkup(createElement(SettingsControlRoom, {
    form: {
      cpamcBaseUrl: '',
      cpamcApiKey: '',
      apiProtocol: 'auto',
      defaultTaskModel: '',
      scoreThreshold: 95,
      maxRounds: 8,
      workerConcurrency: 2,
      customRubricMd: '',
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

  assert.match(html, />评分标准</)
  assert.doesNotMatch(html, /Rubric/)
})

test('job detail control room keeps result before goal, controls, and diagnostics', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))

  assert.doesNotMatch(html, /<datalist/)

  const resultIndex = html.indexOf('当前最新完整提示词')
  const goalIndex = html.indexOf('长期规则')
  const controlIndex = html.indexOf('任务控制')
  const diagnosticIndex = html.indexOf('优化过程诊断')

  assert.doesNotMatch(html, /结果优先/)
  assert.doesNotMatch(html, /目标理解层/)
  assert.doesNotMatch(html, /辅助判断/)
  assert.doesNotMatch(html, /操作面板/)
  assert.doesNotMatch(html, /深入诊断/)
  assert.ok(resultIndex >= 0)
  assert.ok(goalIndex > resultIndex)
  assert.ok(controlIndex > goalIndex)
  assert.ok(diagnosticIndex > controlIndex)
})

test('job detail control room can render fully in English', () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: 'en',
    children: createElement(JobDetailControlRoom, makeDetailProps()),
  }))

  assert.match(html, /Return to control room/)
  assert.match(html, /Settings Desk/)
  assert.match(html, /Result Desk/)
  assert.match(html, /Current latest full prompt/)
  assert.match(html, /Runtime control/)
  assert.match(html, /Next-round steering/)
  assert.doesNotMatch(html, /返回控制室/)
  assert.doesNotMatch(html, /当前最新完整提示词/)
  assert.doesNotMatch(html, /任务控制/)
})

test('job detail keeps the task model editor as a searchable combobox', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))

  assert.match(html, /data-ui="model-alias-combobox"/)
  assert.match(html, /任务模型/)
  assert.doesNotMatch(html, /任务模型别名/)
  assert.doesNotMatch(html, /combobox-input/)
  assert.doesNotMatch(html, /<select[^>]+id="job-task-model"/)
})

test('model alias combobox starts as a select-like trigger instead of an inline input', () => {
  const html = renderToStaticMarkup(createElement(ModelAliasCombobox, {
    inputId: 'model-picker',
    label: '任务模型',
    value: 'gpt-5.2',
    options: [{ id: 'gpt-5.2', label: 'gpt-5.2' }],
    placeholder: '搜索或输入模型名',
    onChange: () => {},
  }))

  assert.match(html, /data-ui="model-alias-trigger"/)
  assert.match(html, />gpt-5\.2</)
  assert.doesNotMatch(html, /combobox-input/)
})

test('job detail exposes manual complete action when paused with candidates', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps({
    model: {
      candidates: [makeCandidate('cand-1')],
    },
  })))

  assert.match(html, /完成并归档/)
})

test('job detail result stage can switch into compare mode without changing the primary copy target', () => {
  const defaultHtml = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))
  const compareHtml = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps({
    ui: { compareMode: true },
  })))

  assert.match(defaultHtml, /当前最新完整提示词/)
  assert.match(defaultHtml, /进入对比/)
  assert.doesNotMatch(defaultHtml, /初始版提示词/)

  assert.match(compareHtml, /退出对比/)
  assert.match(compareHtml, /初始版提示词/)
  assert.match(compareHtml, /当前最新完整提示词/)
  assert.match(compareHtml, /复制完整提示词/)
  assert.match(compareHtml, /class="result-compare-grid"/)
})

test('job detail readonly goal fields avoid nested scroll in the primary stable-rules view', () => {
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
      completing: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      compareMode: false,
      expandedRounds: {},
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '',
      customRubricMd: '',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标',
      goalAnchorDraftReady: false,
      selectedPendingSteeringIds: [],
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onSaveCustomRubric: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCompleteTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleCompareMode: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onCustomRubricChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
      onTogglePendingSteeringSelection: () => {},
    },
  }))

  assert.doesNotMatch(html, /active-goal-scroll/)
  assert.equal((html.match(/class="active-goal-card compact-goal-card"/g) ?? []).length, 3)
})

test('job detail uses disclosure for long stable-rule content instead of a nested scrollbar', () => {
  const longGuardModel = makeDetailModel()
  longGuardModel.goalAnchor = {
    ...longGuardModel.goalAnchor,
    driftGuard: [
      '不要改写用户的原始任务意图；任何补充都必须服务于原目标，而不是把任务扩展成泛泛的提示词教程。',
      '输出必须保持为可一键复制的完整提示词，不能退化成检查清单、点评摘要或纯建议列表。',
      '如果需要加入约束、评分或示例，必须明确它们如何帮助用户得到更稳定的最终提示词，而不是增加阅读负担。',
    ],
  }

  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, {
    ...makeDetailProps(),
    model: longGuardModel,
  }))

  assert.match(html, /data-ui="goal-value-fold"/)
  assert.match(html, /展开全部/)
  assert.match(html, /收起/)
  assert.doesNotMatch(html, /active-goal-scroll/)
})

test('job detail moves rationale into stable rules above the stable goal cards', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))

  assert.doesNotMatch(html, /提炼解释/)
  assert.doesNotMatch(html, /查看提炼依据/)
  assert.match(html, /提炼依据/)
  assert.match(html, /原始任务要求输出完整提示词。/)
  assert.match(html, /系统识别到核心任务是优化提示词。/)
  assert.ok(html.indexOf('提炼依据') < html.indexOf('>长期目标<'))
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
      completing: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      compareMode: false,
      expandedRounds: {},
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '',
      customRubricMd: '',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标',
      goalAnchorDraftReady: false,
      selectedPendingSteeringIds: ['steer-1'],
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onSaveCustomRubric: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCompleteTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleCompareMode: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onCustomRubricChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
      onTogglePendingSteeringSelection: () => {},
    },
  }))

  assert.match(html, /当前有效目标视图/)
  assert.match(html, /待生效引导/)
  assert.match(html, /语气更直接，但保留老中医式判断和原有核心结论。/)
  assert.match(html, /最终给我的仍然应该是可一键复制的完整提示词。/)
  assert.match(html, /这组引导对下一轮的影响/)
  assert.match(html, /运行控制/)
  assert.match(html, /下一轮引导/)
  assert.match(html, /追加一条人工引导/)
  assert.match(html, /生成长期规则草稿/)
  assert.match(html, /待生效列表/)
  assert.match(html, /勾选后，生成草稿并保存，才会进入长期规则/)
  assert.match(html, /提炼依据/)
  assert.match(html, /reviewer 不会看到这些引导原文/)
  assert.doesNotMatch(html, /待生效引导卡片/)
  assert.match(html, /取消任务/)
  assert.match(html, /清空待生效引导/)
})

test('job detail explanation removes duplicated source labels and keeps task scoring standard compact', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps({
    model: {
      candidates: [makeCandidate('cand-1')],
      customRubricMd: null,
      effectiveRubricMd: '# 默认评分标准\n\n1. 目标一致性 (20)',
      effectiveRubricSource: 'settings',
    },
    form: {
      customRubricMd: '',
    },
  })))

  assert.doesNotMatch(html, /原始任务摘要：/)
  assert.match(html, /当前评分标准/)
  assert.match(html, /当前来源：配置台/)
  assert.match(html, /# 默认评分标准/)
  assert.match(html, /评分标准预览/)
  assert.match(html, /编辑任务评分标准/)
  assert.doesNotMatch(html, /只影响当前任务；留空则跟随配置台里的全局评分标准。支持 Markdown。/)
  assert.doesNotMatch(html, /单任务评分标准 · 跟随配置台/)
  assert.doesNotMatch(html, />展开评分标准</)
  assert.ok(html.indexOf('长期规则') < html.indexOf('当前评分标准'))
})

test('job detail demotes stable-rule editing into an adjustment action instead of a second stable-rule view', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))

  assert.match(html, /调整长期规则/)
  assert.match(html, /编辑草稿/)
  assert.doesNotMatch(html, /查看长期规则/)
  assert.doesNotMatch(html, /长期规则内容/)
})

test('job detail stable rules preview shows job-level scoring override when present', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps({
    model: {
      customRubricMd: '# 单任务评分标准\n\n1. 保真 (50)',
      effectiveRubricMd: '# 单任务评分标准\n\n1. 保真 (50)',
      effectiveRubricSource: 'job',
    },
    form: {
      customRubricMd: '# 单任务评分标准\n\n1. 保真 (50)',
    },
  })))

  assert.match(html, /当前评分标准/)
  assert.match(html, /当前来源：本任务/)
  assert.match(html, /# 单任务评分标准/)
  assert.match(html, /保存任务评分标准/)
  assert.match(html, /恢复跟随配置台/)
})

test('goal-anchor draft note explains that saving is still required', () => {
  const steeredModel = makeDetailModel()
  steeredModel.pendingSteeringItems = [
    {
      id: 'steer-1',
      text: '真实一些。',
      createdAt: '2026-03-09T10:00:00.000Z',
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
      completing: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      compareMode: false,
      expandedRounds: {},
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '',
      customRubricMd: '',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标\n真实一些。',
      goalAnchorDraftReady: true,
      selectedPendingSteeringIds: ['steer-1'],
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onSaveCustomRubric: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCompleteTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleCompareMode: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onCustomRubricChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
      onTogglePendingSteeringSelection: () => {},
    },
  }))

  assert.match(html, /已把选中项带入长期规则编辑区/)
  assert.match(html, /现在还只是草稿。点击“保存长期规则”后，选中的条目才会成为长期规则/) 
  assert.match(html, /未选中的条目会继续留在待生效列表/)
})

test('settings control room groups connection, defaults, and active runtime fields only', () => {
  const html = renderToStaticMarkup(createElement(SettingsControlRoom, {
    form: {
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'secret',
      apiProtocol: 'auto',
      defaultTaskModel: 'gpt-5.2',
      scoreThreshold: 95,
      maxRounds: 8,
      workerConcurrency: 2,
      customRubricMd: '',
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

  assert.doesNotMatch(html, /<datalist/)
  assert.doesNotMatch(html, /<select class="input"/)
  assert.doesNotMatch(html, /aria-controls="radix-/)

  assert.match(html, /data-ui="settings-page-header"/)
  assert.match(html, /data-ui="settings-connection-form"/)
  assert.match(html, /连接/)
  assert.match(html, /默认模型/)
  assert.match(html, /默认任务模型/)
  assert.match(html, /运行策略/)
  assert.match(html, /评分标准/)
  assert.match(html, /接口协议/)
  assert.match(html, /自动判断/)
  assert.match(html, /快速选择服务商/)
  assert.match(html, /Base URL/)
  assert.match(html, /API Key/)
  assert.match(html, /同时运行任务数/)
  assert.match(html, /data-ui="select-field"/)
  assert.ok(countOccurrences(html, 'data-ui="select-field"') >= 2)
  assert.equal(countOccurrences(html, '>配置台<'), 1)
  assert.equal(countOccurrences(html, '>连接<'), 1)
  assert.equal(countOccurrences(html, '>默认模型<'), 1)
  assert.ok(html.indexOf('>连接<') < html.indexOf('>默认模型<'))
  assert.ok(html.indexOf('>默认模型<') < html.indexOf('>评分标准<'))
  assert.ok(html.indexOf('>评分标准<') < html.indexOf('>运行策略<'))
  assert.doesNotMatch(html, /接入层/)
  assert.doesNotMatch(html, /模型策略/)
  assert.doesNotMatch(html, /评分规则/)
  assert.doesNotMatch(html, /运行行为/)
  assert.doesNotMatch(html, /裁判数量/)
  assert.doesNotMatch(html, /无提升上限/)
  assert.doesNotMatch(html, /会话策略/)
  assert.doesNotMatch(html, /CPAMC/)
  assert.doesNotMatch(html, /协议识别/)
  assert.doesNotMatch(html, /默认模型别名/)
  assert.doesNotMatch(html, /连接与策略/)
  assert.doesNotMatch(html, /把连接、默认模型、评分标准和运行策略收进同一张工作台里/)
  assert.doesNotMatch(html, /默认保持自动判断。只有在你使用反代、企业网关或兼容层时/)
  assert.doesNotMatch(html, /combobox-input/)
  assert.ok(countOccurrences(html, 'data-ui="section-title-icon"') >= 4)
})

test('settings control room keeps rubric copy Chinese-only in zh view', () => {
  const html = renderToStaticMarkup(createElement(SettingsControlRoom, {
    form: {
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'secret',
      apiProtocol: 'auto',
      defaultTaskModel: 'gpt-5.2',
      scoreThreshold: 95,
      maxRounds: 8,
      workerConcurrency: 2,
      customRubricMd: '',
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

  assert.match(html, /评分标准/)
  assert.doesNotMatch(html, /Rubric/)
})

test('job detail SSR render avoids unstable radix ids and keeps section icons', () => {
  const html = renderToStaticMarkup(createElement(JobDetailControlRoom, makeDetailProps()))

  assert.doesNotMatch(html, /aria-controls="radix-/)
  assert.ok(countOccurrences(html, 'data-ui="section-title-icon"') >= 4)
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

test('job detail notices map known internal score errors into friendly copy', () => {
  const notices = getDetailNoticeItems({
    loading: false,
    actionMessage: null,
    error: '候选稿分数字段无效：scoreBefore',
    displayError: null,
  })

  assert.equal(notices[0]?.text, '模型本轮返回了无效分数，系统已拦截这次结果写入。请直接重试；若反复出现，建议更换模型或稍后再试。')
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

function makeDetailProps(overrides: {
  model?: Partial<JobDetailViewModel>
  ui?: Partial<Parameters<typeof JobDetailControlRoom>[0]['ui']>
  form?: Partial<Parameters<typeof JobDetailControlRoom>[0]['form']>
} = {}) {
  return {
    model: { ...makeDetailModel(), ...overrides.model },
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
      completing: false,
      cancelling: false,
      pausing: false,
      resumingStep: false,
      resumingAuto: false,
      copyingPrompt: false,
      compareMode: false,
      expandedRounds: {},
      ...overrides.ui,
    },
    form: {
      taskModel: 'gpt-5.2',
      maxRoundsOverrideValue: '12',
      pendingSteeringInput: '保持结果导向',
      customRubricMd: '',
      goalAnchorGoal: '保持原始任务目标',
      goalAnchorDeliverable: '输出完整优化提示词',
      goalAnchorDriftGuardText: '不要偏离目标',
      goalAnchorDraftReady: false,
      selectedPendingSteeringIds: [],
      ...overrides.form,
    },
    handlers: {
      onRetry: () => {},
      onSaveModel: () => {},
      onSaveMaxRoundsOverride: () => {},
      onSaveCustomRubric: () => {},
      onAddPendingSteering: () => {},
      onRemovePendingSteeringItem: () => {},
      onClearPendingSteering: () => {},
      onGenerateGoalAnchorDraft: () => {},
      onSaveGoalAnchor: () => {},
      onPauseTask: () => {},
      onResumeStep: () => {},
      onResumeAuto: () => {},
      onCancelTask: () => {},
      onCompleteTask: () => {},
      onCopyLatestPrompt: () => {},
      onToggleCompareMode: () => {},
      onToggleRound: () => {},
      onTaskModelChange: () => {},
      onMaxRoundsOverrideChange: () => {},
      onPendingSteeringInputChange: () => {},
      onCustomRubricChange: () => {},
      onGoalAnchorGoalChange: () => {},
      onGoalAnchorDeliverableChange: () => {},
      onGoalAnchorDriftGuardChange: () => {},
      onTogglePendingSteeringSelection: () => {},
    },
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
    customRubricMd: null,
    effectiveRubricMd: '# 默认评分标准\n\n1. 目标一致性 (20)',
    effectiveRubricSource: 'default',
    errorMessage: null,
    latestFullPrompt: 'LATEST FULL PROMPT',
    initialPrompt: 'INITIAL RAW PROMPT',
    modelsLabel: 'gpt-5.2',
    effectiveMaxRounds: 12,
    candidates: [],
  }
}

function makeCandidate(id: string): RoundCandidateView {
  return {
    id,
    roundNumber: 4,
    optimizedPrompt: 'LATEST FULL PROMPT',
    strategy: 'preserve',
    scoreBefore: 80,
    averageScore: 92,
    majorChanges: ['Keep structure stable'],
    mve: 'mve',
    deadEndSignals: [],
    aggregatedIssues: [],
    appliedSteeringItems: [],
    judges: [
      {
        id: 'judge-1',
        judgeIndex: 0,
        score: 92,
        hasMaterialIssues: false,
        summary: 'ok',
        driftLabels: [],
        driftExplanation: '',
        findings: [],
        suggestedChanges: [],
      },
    ],
  }
}

function countOccurrences(input: string, needle: string) {
  return input.split(needle).length - 1
}
