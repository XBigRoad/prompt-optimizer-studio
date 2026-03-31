import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'

import { JobRoundCard, type RoundCandidateView } from '@/components/job-round-card'
import { JobRoundRunCard, type RoundRunView } from '@/components/job-round-run-card'
import { ModelAliasCombobox } from '@/components/ui/model-alias-combobox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SelectField } from '@/components/ui/select-field'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { normalizeEscapedMultilineText } from '@/lib/prompt-text'
import { buildReasoningEffortOptions, getReasoningEffortLabel, type ReasoningEffort } from '@/lib/reasoning-effort'
import type { ReviewSuggestionAddResult } from '@/lib/review-suggestion-drafts'
import { parseRubricDimensions } from '@/lib/server/rubric-dimensions'
import type { SteeringItem } from '@/lib/server/types'
import { getJobDisplayError, getJobScoreDisplay, getJobScoreMeta, getJobStatusLabel } from '@/lib/presentation'

export type JobDetailViewModel = {
  jobId: string
  title: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
  conversationPolicy: 'stateless' | 'pooled-3x'
  optimizerModel: string
  judgeModel: string
  optimizerReasoningEffort: ReasoningEffort
  judgeReasoningEffort: ReasoningEffort
  pendingOptimizerModel: string | null
  pendingJudgeModel: string | null
  pendingOptimizerReasoningEffort: ReasoningEffort | null
  pendingJudgeReasoningEffort: ReasoningEffort | null
  cancelRequestedAt: string | null
  pauseRequestedAt: string | null
  pendingSteeringItems: SteeringItem[]
  goalAnchor: {
    goal: string
    deliverable: string
    driftGuard: string[]
  }
  goalAnchorExplanation: {
    sourceSummary: string
    rationale: string[]
  }
  runMode: 'auto' | 'step'
  currentRound: number
  candidateCount: number
  scoreState: 'available' | 'not_generated'
  failureKind: 'infra' | 'content' | null
  bestAverageScore: number
  maxRoundsOverride: number | null
  passStreak: number
  lastReviewScore: number
  customRubricMd: string | null
  autoApplyReviewSuggestions: boolean
  autoApplyReviewSuggestionsToStableRules: boolean
  effectiveRubricMd: string
  effectiveRubricSource: 'job' | 'settings' | 'default'
  errorMessage: string | null
  latestFullPrompt: string
  initialPrompt: string
  modelsLabel: string
  effectiveMaxRounds: number
  candidates: RoundCandidateView[]
  roundRuns: RoundRunView[]
}

export function JobDetailControlRoom({
  model,
  models,
  ui,
  form,
  handlers,
}: {
  model: JobDetailViewModel
  models: Array<{ id: string; label: string }>
  ui: {
    loading: boolean
    error: string | null
    loadWarning?: string | null
    actionMessage: string | null
    savingModels: boolean
    savingMaxRounds: boolean
    savingCustomRubric?: boolean
    savingSteering: boolean
    generatingGoalAnchorDraft: boolean
    savingGoalAnchor: boolean
    retrying: boolean
    completing: boolean
    cancelling: boolean
    pausing: boolean
    resumingStep: boolean
    resumingAuto: boolean
    forkingFromFinal?: boolean
    copyingPrompt: boolean
    compareMode: boolean
    completedResumePickerOpen?: boolean
    completedResumeTargetRunMode?: 'auto' | 'step' | null
    expandedRounds: Record<string, boolean>
  }
  form: {
    taskModel: string
    reasoningEffort?: string
    maxRoundsOverrideValue: string
    pendingSteeringInput: string
    customRubricMd: string
    goalAnchorGoal: string
    goalAnchorDeliverable: string
    goalAnchorDriftGuardText: string
    goalAnchorDraftReady: boolean
    selectedPendingSteeringIds: string[]
  }
  handlers: {
    onRetry: () => void
    onSaveModel: () => void
    onSaveMaxRoundsOverride: () => void
    onSaveCustomRubric: (nextValue?: string) => void
    onAddPendingSteering: () => void
    onAddReviewSuggestions?: (items: string[]) => Promise<ReviewSuggestionAddResult | void> | ReviewSuggestionAddResult | void
    onReviewSuggestionTargetChange?: (target: 'pending' | 'stable') => void
    onToggleAutoApplyReviewSuggestions?: (items: string[]) => Promise<void> | void
    onRemovePendingSteeringItem: (itemId: string) => void
    onClearPendingSteering: () => void
    onGenerateGoalAnchorDraft: () => void
    onSaveGoalAnchor: () => void
    onPauseTask: () => void
    onResumeStep: () => void
    onResumeAuto: () => void
    onCloseCompletedResumePicker?: () => void
    onResumeCompletedCurrentTask?: () => void
    onForkFromFinalTask?: () => void
    onCancelTask: () => void
    onCompleteTask: () => void
    onCopyLatestPrompt: () => void
    onToggleCompareMode: () => void
    onToggleRound: (candidateId: string) => void
    onTaskModelChange: (value: string) => void
    onReasoningEffortChange?: (value: string) => void
    onMaxRoundsOverrideChange: (value: string) => void
    onPendingSteeringInputChange: (value: string) => void
    onCustomRubricChange: (value: string) => void
    onGoalAnchorGoalChange: (value: string) => void
    onGoalAnchorDeliverableChange: (value: string) => void
    onGoalAnchorDriftGuardChange: (value: string) => void
    onTogglePendingSteeringSelection: (itemId: string) => void
  }
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const rubricDimensions = parseRubricDimensions(model.effectiveRubricMd)
  const reasoningEffortOptions = buildReasoningEffortOptions(locale)
  const canEditRuntime = model.status !== 'cancelled'
  const canAdjustStableRules = model.status !== 'completed'
  const canEditTaskRubric = model.status !== 'completed'
  const canSteer = model.status !== 'cancelled'
  const canRestart = ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(model.status)
  const canCancel = !['completed', 'cancelled'].includes(model.status)
  const canPause = !['completed', 'cancelled', 'paused'].includes(model.status)
  const canResume = !['cancelled', 'running'].includes(model.status)
  const canComplete = ['paused', 'manual_review', 'failed'].includes(model.status) && model.candidates.length > 0
  const hasPendingSteering = model.pendingSteeringItems.length > 0
  const selectedPendingSteeringIdSet = new Set(form.selectedPendingSteeringIds)
  const hasSelectedPendingSteering = selectedPendingSteeringIdSet.size > 0
  const completedResumeTarget = ui.completedResumeTargetRunMode === 'step' ? 'step' : 'auto'
  const completedResumeActionLabel = completedResumeTarget === 'step'
    ? text('继续一轮', 'run one round')
    : text('恢复自动运行', 'resume auto')
  const completedResumeCurrentLabel = completedResumeTarget === 'step'
    ? text('当前任务继续一轮', 'Continue this job for one round')
    : text('当前任务恢复自动运行', 'Resume this job in auto mode')
  const completedResumeForkDescription = completedResumeTarget === 'step'
    ? text('保留旧任务归档，新建一条 fresh 任务，并从当前最终版继续一轮。', 'Keep the archived job, create a fresh one, and continue one round from the current final prompt.')
    : text('保留旧任务归档，新建一条 fresh 任务，并从当前最终版恢复自动运行。', 'Keep the archived job, create a fresh one, and resume automatic execution from the current final prompt.')
  const completedResumeResetDescription = completedResumeTarget === 'step'
    ? text('清空当前任务历史，从初版提示词重新继续一轮。', 'Clear this job history and continue one round again from the initial prompt.')
    : text('清空当前任务历史，从初版提示词重新恢复自动运行。', 'Clear this job history and resume automatic execution again from the initial prompt.')
  const rubricSourceZh =
    model.effectiveRubricSource === 'job'
      ? '本任务'
      : model.effectiveRubricSource === 'settings'
        ? '配置台'
        : '内置默认'
  const rubricSourceEn =
    model.effectiveRubricSource === 'job'
      ? 'this job'
      : model.effectiveRubricSource === 'settings'
        ? 'settings'
        : 'built-in default'
  const rubricSourceLine = text(`当前来源：${rubricSourceZh}`, `Current source: ${rubricSourceEn}`)
  const hasSavedJobRubricOverride = Boolean((model.customRubricMd ?? '').trim())
  const reasoningEffortSummary = getReasoningEffortLabel(model.optimizerReasoningEffort, locale)
  const bestScoreDisplay = getJobScoreDisplay(model, locale)
  const bestScoreMeta = getJobScoreMeta(model, locale)
  const latestRoundRunId = model.roundRuns[0]?.id ?? null
  const latestCandidateId = latestRoundRunId ? null : model.candidates[0]?.id ?? null

  return (
    <div className="detail-control-room">
      <section className="detail-hero">
        <div className="nav-row">
          <Link href="/" className="link nav-chip"><ArrowLeft size={16} /> {text('返回控制室', 'Return to control room')}</Link>
          <Link href="/settings" className="link nav-chip"><Settings2 size={16} /> {text('配置台', 'Settings Desk')}</Link>
        </div>
        <div className="detail-hero-grid">
          <div className="detail-hero-copy">
            <span className="eyebrow detail-stage-label detail-stage-chip" data-ui="detail-stage-chip">
              <Sparkles size={15} />
              {text('结果台', 'Result Desk')}
            </span>
            <h1 className="detail-hero-title">{model.title}</h1>
            <p className="hero-lead">{text('先确认最终结果，再检查目标理解，最后决定是否继续推进任务。', 'Confirm the latest result first, then inspect the goal understanding, and only then decide whether to continue.')}</p>
          </div>
          <div className="summary-cluster detail-summary-cluster">
            <SummaryBadge label={text('状态', 'Status')} value={getJobStatusLabel(model.status, locale)} tone={model.status} />
            <SummaryBadge label={text('任务模型', 'Task model')} value={model.modelsLabel} />
            <SummaryBadge label={text('当前推理', 'Active reasoning')} value={reasoningEffortSummary} />
            <SummaryBadge label={text('运行模式', 'Run mode')} value={model.runMode === 'step' ? text('单步', 'Step') : text('自动', 'Auto')} />
            <SummaryBadge label={text('轮数上限', 'Round cap')} value={String(model.effectiveMaxRounds)} />
            <SummaryBadge label={text('最佳分数', 'Best score')} value={bestScoreDisplay} meta={bestScoreMeta} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {getDetailNoticeItems({
          loading: ui.loading,
          actionMessage: ui.actionMessage,
          error: ui.error,
          loadWarning: ui.loadWarning,
          displayError: getJobDisplayError(model.errorMessage, locale, {
            hasUsableResult: model.currentRound > 0 || model.candidateCount > 0 || model.bestAverageScore > 0,
          }),
          locale,
        }).map((notice) => (
          <motion.div
            key={notice.key}
            initial={{ opacity: 0, y: notice.tone === 'info' ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`notice${notice.tone === 'success' ? ' success' : notice.tone === 'error' ? ' error' : ''}`}
          >
            {notice.text}
          </motion.div>
        ))}
      </AnimatePresence>

      <section className="result-stage">
        <div className="section-head">
          <div>
            <h2 className="section-title has-icon">
              <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                <FileText size={18} />
              </span>
              {text('当前最新完整提示词', 'Current latest full prompt')}
            </h2>
            <p className="small">{text('这是你现在最应该复制和判断的版本。后续所有诊断都只是为这个结果服务。', 'This is the version you should copy and judge first. Every diagnostic exists only to support this result.')}</p>
          </div>
          <div className="result-stage-actions">
            <button className="button ghost" type="button" onClick={handlers.onToggleCompareMode}>
              {ui.compareMode ? text('退出对比', 'Exit compare') : text('进入对比', 'Enter compare')}
            </button>
            <button className="button primary-action" type="button" onClick={handlers.onCopyLatestPrompt} disabled={ui.copyingPrompt}>
              {ui.copyingPrompt ? text('复制中...', 'Copying...') : text('复制完整提示词', 'Copy full prompt')}
            </button>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {ui.compareMode ? (
            <motion.div
              key="compare-mode"
              className="result-compare-grid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="panel result-panel result-panel-initial">
                <div className="result-panel-head">
                  <span className="eyebrow subdued">{text('初始输入', 'Initial input')}</span>
                  <strong>{text('初始版提示词', 'Initial prompt')}</strong>
                </div>
                <p className="small">{text('这是任务刚创建时的原始输入，用来和当前版直接对照。', 'This is the raw input from job creation so you can compare it directly with the current version.')}</p>
                <pre className="pre result-pre result-pre-initial">{model.initialPrompt}</pre>
              </div>
              <div className="panel result-panel result-panel-latest">
                <div className="result-panel-head">
                  <span className="eyebrow">{text('当前结果', 'Current result')}</span>
                  <strong>{text('当前最新完整提示词', 'Current latest full prompt')}</strong>
                </div>
                <p className="small">{text('复制按钮始终复制右侧这一版，方便你直接带走当前可用结果。', 'The copy button always targets this current result so you can take the usable version right away.')}</p>
                <pre className="pre result-pre result-pre-latest">{model.latestFullPrompt}</pre>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="latest-only"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <pre className="pre result-pre">{model.latestFullPrompt}</pre>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="understanding-stage">
        <div className="understanding-stack">
          <div className="panel understanding-panel">
            <div className="section-head">
              <div>
                <h2 className="section-title has-icon">
                  <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                    <CheckCircle2 size={18} />
                  </span>
                  {hasPendingSteering ? text('当前有效目标视图', 'Current active goal view') : text('长期规则', 'Stable rules')}
                </h2>
                <p className="small">
                  {hasPendingSteering
                    ? text('长期规则保持不变，待生效引导会作为下一轮的一次性补充。', 'Stable rules stay fixed. Pending steering is only a one-time addition for the next round.')
                    : text('这里定义任务不能漂移的长期目标与长期交付物。', 'This defines the long-term goal and deliverable that the task should not drift away from.')}
                </p>
              </div>
            </div>

            <div className="rationale-inline-block">
              <div className="section-head compact-head">
                <div>
                  <strong>{text('提炼依据', 'Rationale')}</strong>
                  <p className="small">{model.goalAnchorExplanation.sourceSummary}</p>
                </div>
              </div>
              <ul className="list compact-list rationale-list">
                {model.goalAnchorExplanation.rationale.map((item, index) => (
                  <li key={`goal-rationale-${index}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="stable-rules-grid">
              <div className="active-goal-grid compact-goal-grid" data-ui="stable-rules-goal-stack">
                <ReadonlyGoalField
                  label={text('长期目标', 'Stable goal')}
                  value={model.goalAnchor.goal}
                  expandLabel={text('展开全部', 'Expand all')}
                  collapseLabel={text('收起', 'Collapse')}
                />
                <ReadonlyGoalField
                  label={text('长期交付物', 'Stable deliverable')}
                  value={model.goalAnchor.deliverable}
                  expandLabel={text('展开全部', 'Expand all')}
                  collapseLabel={text('收起', 'Collapse')}
                />
                <ReadonlyGoalField
                  label={text('长期边界', 'Stable guardrails')}
                  value={model.goalAnchor.driftGuard.join('\n')}
                  items={model.goalAnchor.driftGuard}
                  expandLabel={text('展开全部', 'Expand all')}
                  collapseLabel={text('收起', 'Collapse')}
                />
                <p className="small goal-summary-note">
                  {text(
                    '长期规则会持续约束后续轮次；临时引导只影响下一轮，除非你明确保存新的长期规则。',
                    'Stable rules keep constraining later rounds. Temporary steering only affects the next round unless you explicitly save a new stable rule.',
                  )}
                </p>
              </div>

              <div className="stable-scoring-block">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('当前评分标准', 'Current scoring standard')}</strong>
                    <p className="small">{rubricSourceLine}</p>
                  </div>
                </div>

                <details className="fold-card fold-card-toggle rubric-preview-fold">
                  <summary className="fold-card-summary">
                    <FoldCardSummary
                      title={text('评分标准预览', 'Scoring standard preview')}
                      closedLabel={text('展开', 'Expand')}
                      openLabel={text('收起', 'Collapse')}
                    />
                  </summary>
                  <pre className="pre rubric-pre">{model.effectiveRubricMd}</pre>
                </details>

                {canEditTaskRubric ? (
                  <details className="fold-card fold-card-toggle rubric-editor-fold">
                    <summary className="fold-card-summary">
                      <FoldCardSummary
                        title={text('编辑任务评分标准', 'Edit task scoring standard')}
                        closedLabel={text('展开', 'Expand')}
                        openLabel={text('收起', 'Collapse')}
                      />
                    </summary>
                    <label className="label">
                      {text('任务评分标准覆写', 'Task scoring override')}
                      <textarea
                        className="textarea"
                        rows={8}
                        value={form.customRubricMd}
                        onChange={(event) => handlers.onCustomRubricChange(event.target.value)}
                        placeholder={text('留空以跟随配置台。', 'Leave empty to follow settings.')}
                        disabled={!canEditTaskRubric}
                      />
                    </label>
                    <p className="small rubric-editor-hint">
                      {text(
                        '想保留分项分数条，请继续使用“编号 + 维度名 + 分值”的结构化格式。分项达标显示按每维满分的 90% 自动判断。',
                        'Keep the “number + dimension label + max score” structure if you want per-dimension score bars. The pass state is shown automatically at 90% of each dimension max.',
                      )}
                    </p>
                    <div className="inline-actions runtime-save-actions">
                      <button className="button ghost compact" type="button" onClick={() => handlers.onSaveCustomRubric()} disabled={ui.savingCustomRubric}>
                        {ui.savingCustomRubric ? text('保存中...', 'Saving...') : text('保存任务评分标准', 'Save task scoring standard')}
                      </button>
                      {hasSavedJobRubricOverride ? (
                        <button
                          className="button ghost compact"
                          type="button"
                          onClick={() => {
                            handlers.onCustomRubricChange('')
                            handlers.onSaveCustomRubric('')
                          }}
                          disabled={ui.savingCustomRubric}
                        >
                          {text('恢复跟随配置台', 'Restore following settings')}
                        </button>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>

            {hasPendingSteering ? (
              <div className="pending-steering-stack">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('待生效引导', 'Pending steering')}</strong>
                    <p className="small">{text('这些条目会按当前顺序进入下一轮；勾选并保存后，才会进入长期规则。', 'These items enter the next round in the current order. They only become stable rules after you select and save them.')}</p>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {model.pendingSteeringItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      className="steering-card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0, y: -6 }}
                    >
                      <div className="steering-card-head">
                        <span className="pill pending">{text('待生效', 'Pending')} {index + 1}</span>
                        <span className="small">{selectedPendingSteeringIdSet.has(item.id) ? text('准备写入长期规则', 'Ready to merge into stable rules') : text('仅下一轮生效', 'Next round only')}</span>
                      </div>
                      <p>{item.text}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : null}

            {canAdjustStableRules ? (
              <details className="anchor-editor-drawer">
                <summary className="fold-card-summary">
                  <FoldCardSummary
                    title={text('调整长期规则', 'Adjust stable rules')}
                    closedLabel={text('按需打开', 'Open when needed')}
                    openLabel={text('收起', 'Collapse')}
                  />
                </summary>
                <div className="anchor-editor-body">
                  <div className="section-head compact-head">
                    <div>
                      <strong>{text('编辑草稿', 'Edit draft')}</strong>
                      <p className="small">{text('这里只是修改草稿。点击保存后，长期规则才会真正更新。未选中的临时引导不会自动写进这里。', 'This is only a working draft. Stable rules update only after you save. Unselected temporary steering will not be written here automatically.')}</p>
                    </div>
                    <button className="button ghost" type="button" onClick={handlers.onSaveGoalAnchor} disabled={ui.savingGoalAnchor}>
                      {ui.savingGoalAnchor ? text('保存中...', 'Saving...') : text('保存长期规则', 'Save stable rules')}
                    </button>
                  </div>
                  <div className="form-grid anchor-editor-grid">
                    <label className="label">
                      {text('长期目标', 'Stable goal')}
                      <textarea className="textarea" value={form.goalAnchorGoal} onChange={(event) => handlers.onGoalAnchorGoalChange(event.target.value)} disabled={!canAdjustStableRules} />
                    </label>
                    <label className="label">
                      {text('长期交付物', 'Stable deliverable')}
                      <textarea className="textarea" value={form.goalAnchorDeliverable} onChange={(event) => handlers.onGoalAnchorDeliverableChange(event.target.value)} disabled={!canAdjustStableRules} />
                    </label>
                    <label className="label">
                      {text('长期边界', 'Stable guardrails')}
                      <textarea className="textarea" value={form.goalAnchorDriftGuardText} onChange={(event) => handlers.onGoalAnchorDriftGuardChange(event.target.value)} disabled={!canAdjustStableRules} />
                    </label>
                  </div>
                  {form.goalAnchorDraftReady ? (
                    <div className="goal-anchor-draft-note">
                      <strong>{text('已把选中项带入长期规则编辑区', 'Selected items were added to the stable-rule editor')}</strong>
                      <p className="small">{text('现在还只是草稿。点击“保存长期规则”后，选中的条目才会成为长期规则；未选中的条目会继续留在待生效列表。', 'This is still only a draft. Selected items become stable rules only after you save. Unselected items stay in the pending list.')}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </section>

      <section className="control-stage">
        <div className="section-head">
          <div>
            <h2 className="section-title has-icon">
              <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                <Settings2 size={18} />
              </span>
              {text('任务控制', 'Task controls')}
            </h2>
            <p className="small">{text('先决定怎么跑，再补这次的人工纠偏。', 'Decide how to run it first, then add the manual correction for this turn.')}</p>
          </div>
        </div>
        <div className="control-stage-grid">
          <div className="control-subpanel runtime-control-panel">
            <div className="section-head control-subhead">
              <div>
                <strong>{text('运行控制', 'Runtime control')}</strong>
                <p className="small">{text('模型、轮数和继续方式都在这里。', 'Models, round caps, and run controls live here.')}</p>
              </div>
            </div>
            <div className="compact-control-grid runtime-config-grid">
              <ModelAliasCombobox
                inputId="job-task-model"
                label={text('任务模型', 'Task model')}
                value={form.taskModel}
                options={models}
                placeholder={model.optimizerModel || text('例如：gpt-5.2', 'For example: gpt-5.2')}
                disabled={!canEditRuntime}
                onChange={handlers.onTaskModelChange}
              />
              <SelectField
                label={text('调整推理强度', 'Adjust reasoning effort')}
                value={form.reasoningEffort ?? 'default'}
                options={reasoningEffortOptions}
                disabled={!canEditRuntime}
                onChange={(value) => handlers.onReasoningEffortChange?.(value)}
              />
              <label className="label compact-control-field">
                {text('任务级最大轮数', 'Task-level round cap')}
                <input className="input" type="number" min={1} max={99} value={form.maxRoundsOverrideValue} onChange={(event) => handlers.onMaxRoundsOverrideChange(event.target.value)} disabled={!canEditRuntime} />
              </label>
            </div>
            {canEditRuntime ? (
              <div className="inline-actions runtime-save-actions">
                <button className="button ghost compact" type="button" onClick={handlers.onSaveModel} disabled={ui.savingModels}>
                  {ui.savingModels ? text('保存中...', 'Saving...') : text('保存运行配置', 'Save runtime settings')}
                </button>
                <button className="button ghost compact" type="button" onClick={handlers.onSaveMaxRoundsOverride} disabled={ui.savingMaxRounds}>
                  {ui.savingMaxRounds ? text('保存中...', 'Saving...') : text('保存轮数', 'Save round cap')}
                </button>
              </div>
            ) : null}
            <div className="runtime-action-stack">
              <div className="button-row runtime-primary-actions">
                {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeStep} disabled={ui.resumingStep}><PlayCircle size={16} /> {ui.resumingStep ? text('处理中...', 'Working...') : text('继续一轮', 'Run one round')}</button> : null}
                {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeAuto} disabled={ui.resumingAuto}><PlayCircle size={16} /> {ui.resumingAuto ? text('处理中...', 'Working...') : text('恢复自动运行', 'Resume auto')}</button> : null}
                {canPause ? <button className="button secondary" type="button" onClick={handlers.onPauseTask} disabled={ui.pausing}>{ui.pausing ? text('处理中...', 'Working...') : model.status === 'running' ? text('暂停（本轮后）', 'Pause after this round') : text('暂停', 'Pause')}</button> : null}
              </div>
              <div className="button-row runtime-secondary-actions">
                {canComplete ? (
                  <ConfirmDialog
                    title={text('完成并归档？', 'Complete and archive?')}
                    description={text('接受当前最新完整提示词作为最终结果，并将任务标记为已完成。完成后不会再继续自动运行。', 'Accept the current latest full prompt as the final result and mark this job as completed. It will not continue running afterward.')}
                    confirmText={text('确认完成并归档', 'Confirm completion')}
                    disabled={ui.completing}
                    onConfirm={handlers.onCompleteTask}
                  >
                    <button className="button ghost" type="button" disabled={ui.completing}>
                      <CheckCircle2 size={16} /> {ui.completing ? text('处理中...', 'Working...') : text('完成并归档', 'Complete and archive')}
                    </button>
                  </ConfirmDialog>
                ) : null}
                {canRestart ? (
                  <ConfirmDialog
                    title={text('重新开始？', 'Restart from the beginning?')}
                    description={text('这会清空当前候选稿、历史轮次和待生效引导，并基于初版提示词与重建后的长期规则重新跑。模型配置会按当前设置生效。', 'This clears current candidates, round history, and pending steering, then reruns from the initial prompt with rebuilt stable rules. The current model settings still apply.')}
                    confirmText={text('确认重新开始', 'Confirm restart')}
                    disabled={ui.retrying}
                    onConfirm={handlers.onRetry}
                  >
                    <button className="button ghost" type="button" disabled={ui.retrying}>
                      <RefreshCcw size={16} /> {ui.retrying ? text('处理中...', 'Working...') : text('重新开始', 'Restart')}
                    </button>
                  </ConfirmDialog>
                ) : null}
                {canCancel ? (
                  <ConfirmDialog
                    title={text('取消任务？', 'Cancel this job?')}
                    description={text('取消后，本任务会停止继续优化并进入历史记录。', 'After cancellation, this job stops optimizing and moves into history.')}
                    confirmText={text('确认取消任务', 'Confirm cancellation')}
                    tone="danger"
                    disabled={ui.cancelling}
                    onConfirm={handlers.onCancelTask}
                  >
                    <button className="button danger" type="button" disabled={ui.cancelling}>
                      <PauseCircle size={16} /> {ui.cancelling ? text('处理中...', 'Working...') : text('取消任务', 'Cancel job')}
                    </button>
                  </ConfirmDialog>
                ) : null}
              </div>
            </div>
            {ui.completedResumePickerOpen ? (
              <div className="dialog-overlay">
                <div className="dialog-content completed-resume-dialog" role="dialog" aria-modal="true" aria-labelledby="completed-resume-picker-title">
                  <div className="dialog-head">
                    <div className="dialog-copy">
                      <h3 className="dialog-title" id="completed-resume-picker-title">{text('继续已完成任务？', 'Continue this completed job?')}</h3>
                      <p className="dialog-description">{text(`你刚点的是「${completedResumeActionLabel}」`, `You just clicked "${completedResumeActionLabel}".`)}</p>
                    </div>
                    {handlers.onCloseCompletedResumePicker ? (
                      <button type="button" className="icon-button dialog-close" onClick={handlers.onCloseCompletedResumePicker} aria-label={text('关闭分流弹层', 'Close chooser')}>
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div className="completed-resume-option-list">
                    <div className="completed-resume-option-card">
                      <div className="completed-resume-option-copy">
                        <strong>{completedResumeCurrentLabel}</strong>
                        <p className="small">{text('会清空已完成标记、旧连胜和最终结果标记，但保留历史轮次与候选稿。', 'This clears the completed marker, old pass streak, and final result marker, while keeping round history and candidates.')}</p>
                      </div>
                      {handlers.onResumeCompletedCurrentTask ? (
                        <button className="button secondary" type="button" onClick={handlers.onResumeCompletedCurrentTask} disabled={ui.resumingStep || ui.resumingAuto}>
                          {completedResumeCurrentLabel}
                        </button>
                      ) : null}
                    </div>
                    <div className="completed-resume-option-card">
                      <div className="completed-resume-option-copy">
                        <strong>{text('基于当前最终版新建任务', 'Create a fresh job from the current final prompt')}</strong>
                        <p className="small">{completedResumeForkDescription}</p>
                      </div>
                      {handlers.onForkFromFinalTask ? (
                        <button className="button ghost" type="button" onClick={handlers.onForkFromFinalTask} disabled={ui.forkingFromFinal}>
                          {ui.forkingFromFinal ? text('处理中...', 'Working...') : text('新建并继续', 'Create and continue')}
                        </button>
                      ) : null}
                    </div>
                    <div className="completed-resume-option-card">
                      <div className="completed-resume-option-copy">
                        <strong>{text('整任务重置', 'Reset this job')}</strong>
                        <p className="small">{completedResumeResetDescription}</p>
                      </div>
                      <button className="button ghost" type="button" onClick={handlers.onRetry} disabled={ui.retrying}>
                        {ui.retrying ? text('处理中...', 'Working...') : text('确认重置', 'Confirm reset')}
                      </button>
                    </div>
                  </div>
                  <div className="dialog-actions">
                    {handlers.onCloseCompletedResumePicker ? (
                      <button type="button" className="button ghost" onClick={handlers.onCloseCompletedResumePicker}>
                        {text('先不继续', 'Not now')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="control-subpanel steering-control-panel" id="next-round-steering">
            <div className="section-head control-subhead">
              <div>
                <strong>{text('下一轮引导', 'Next-round steering')}</strong>
                <p className="small">{text('只写这次想纠偏的点。它会在下一轮生效，不影响当前轮。', 'Only write the correction you want for this turn. It takes effect in the next round, not the current one.')}</p>
                {model.status === 'completed' && hasPendingSteering ? (
                  <p className="small">{text('任务已完成：这些待生效引导会在你重新继续当前任务，或基于当前最终版新建任务后生效。', 'This job is already completed. These pending steering items will take effect after you continue this job again or create a fresh one from the current final prompt.')}</p>
                ) : null}
              </div>
            </div>
            {hasPendingSteering ? (
              <div className="steering-impact-inline">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('这组引导对下一轮的影响', 'How this steering batch affects the next round')}</strong>
                    <p className="small">{text(`下一轮会按当前顺序吸收这 ${model.pendingSteeringItems.length} 条引导；如果结果把其中内容写进完整提示词，后续轮次会继续继承这些变化。`, `The next round will absorb these ${model.pendingSteeringItems.length} steering items in order. If the resulting full prompt keeps them, later rounds will inherit the change too.`)}</p>
                  </div>
                </div>
                <ul className="list compact-list">
                  <li>{text('optimizer 会按当前顺序吸收这组引导，再基于完整提示词做最小必要改动。', 'The optimizer absorbs this steering batch in order, then makes the smallest necessary changes to the full prompt.')}</li>
                  <li>{text('评分器不会看到这些引导原文，只会看到下一轮产出的候选提示词。', 'The judge never sees the raw steering. It only sees the next candidate prompt.')}</li>
                </ul>
              </div>
            ) : null}
            <label className="label steering-control-field">
              {text('追加一条人工引导', 'Add one steering note')}
              <textarea className="textarea" value={form.pendingSteeringInput} onChange={(event) => handlers.onPendingSteeringInputChange(event.target.value)} disabled={!canSteer} />
            </label>
            <div className="button-row compact-actions">
              {canSteer ? (
                <button className="button ghost compact" type="button" onClick={handlers.onAddPendingSteering} disabled={ui.savingSteering}>
                  <Plus size={16} /> {ui.savingSteering ? text('保存中...', 'Saving...') : text('加入待生效列表', 'Add to pending list')}
                </button>
              ) : null}
              {canAdjustStableRules ? (
                <button className="button ghost compact" type="button" onClick={handlers.onGenerateGoalAnchorDraft} disabled={!hasSelectedPendingSteering || ui.generatingGoalAnchorDraft}>
                  <WandSparkles size={16} /> {ui.generatingGoalAnchorDraft ? text('生成中...', 'Building...') : text('生成长期规则草稿', 'Build stable-rule draft')}
                </button>
              ) : null}
              {canSteer && hasPendingSteering ? (
                <ConfirmDialog
                  title={text('清空待生效引导？', 'Clear pending steering?')}
                  description={text('清空后，它们不会进入下一轮，也不会写入长期规则。', 'After clearing, these items will not enter the next round and will not be written into stable rules.')}
                  confirmText={text('确认清空', 'Confirm clear')}
                  tone="danger"
                  disabled={ui.savingSteering}
                  onConfirm={handlers.onClearPendingSteering}
                >
                  <button className="button ghost compact" type="button" disabled={ui.savingSteering}>
                    <Trash2 size={16} /> {text('清空待生效引导', 'Clear pending steering')}
                  </button>
                </ConfirmDialog>
              ) : null}
            </div>
            {hasPendingSteering ? (
              <div className="pending-steering-stack control-pending-list">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('待生效列表', 'Pending list')}</strong>
                    <p className="small">{text('勾选后，生成草稿并保存，才会进入长期规则。', 'Select items, build a draft, and save it before they become stable rules.')}</p>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {model.pendingSteeringItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      layout
                      className="steering-card steering-card-actionable"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0, y: -6 }}
                    >
                      <div className="steering-card-head">
                        <span className="pill paused">{text('待生效', 'Pending')} {index + 1}</span>
                        <div className="steering-card-actions">
                          <label className="selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedPendingSteeringIdSet.has(item.id)}
                              onChange={() => handlers.onTogglePendingSteeringSelection(item.id)}
                              disabled={!canAdjustStableRules || ui.generatingGoalAnchorDraft || ui.savingGoalAnchor}
                              aria-label={text(`切换待生效引导 ${index + 1} 是否加入长期规则`, `Toggle whether pending steering ${index + 1} should be merged into stable rules`)}
                            />
                            <span className="small">{selectedPendingSteeringIdSet.has(item.id) ? text('加入长期规则', 'Merge into stable rules') : text('只影响下一轮', 'Next round only')}</span>
                          </label>
                          {canSteer ? (
                            <button className="icon-button" type="button" aria-label={text(`删除待生效引导 ${index + 1}`, `Delete pending steering ${index + 1}`)} onClick={() => handlers.onRemovePendingSteeringItem(item.id)} disabled={ui.savingSteering}>
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p>{item.text}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="empty-inline-state">
                <span className="small">{text('当前没有待生效引导。要临时纠偏时，先在上面添加一条。', 'No pending steering yet. Add one above when you need a temporary course correction.')}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="diagnostic-stage">
        <div className="section-head">
          <div>
            <h2 className="section-title has-icon">
              <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                <RefreshCcw size={18} />
              </span>
              {text('优化过程诊断', 'Optimization diagnostics')}
            </h2>
            <p className="small">{text('默认只露摘要。需要时再展开每一轮的完整诊断和评分细节。', 'By default you only see the summary. Expand a round when you need the full diagnostic and scoring details.')}</p>
          </div>
        </div>
        {model.candidates.length === 0 && model.roundRuns.length === 0
          ? <div className="notice">{text('还没有产出候选稿。', 'No candidates yet.')}</div>
          : null}
        <div className="shell">
          {model.roundRuns.length > 0
            ? model.roundRuns.map((round) => (
              <JobRoundRunCard
                key={round.id}
                round={round}
                expanded={Boolean(ui.expandedRounds[round.id])}
                onToggle={() => handlers.onToggleRound(round.id)}
                onAddReviewSuggestions={canSteer ? handlers.onAddReviewSuggestions : undefined}
                addingReviewSuggestions={ui.savingSteering}
                reviewSuggestionTarget={model.autoApplyReviewSuggestionsToStableRules ? 'stable' : 'pending'}
                showReviewSuggestionAutomationControls={round.id === latestRoundRunId}
                autoApplyReviewSuggestions={model.autoApplyReviewSuggestions}
                onReviewSuggestionTargetChange={handlers.onReviewSuggestionTargetChange}
                onToggleAutoApplyReviewSuggestions={handlers.onToggleAutoApplyReviewSuggestions}
                rubricDimensions={rubricDimensions}
              />
            ))
            : model.candidates.map((candidate) => (
              <JobRoundCard
                key={candidate.id}
                candidate={candidate}
                expanded={Boolean(ui.expandedRounds[candidate.id])}
                onToggle={() => handlers.onToggleRound(candidate.id)}
                onAddReviewSuggestions={canSteer ? handlers.onAddReviewSuggestions : undefined}
                addingReviewSuggestions={ui.savingSteering}
                reviewSuggestionTarget={model.autoApplyReviewSuggestionsToStableRules ? 'stable' : 'pending'}
                showReviewSuggestionAutomationControls={candidate.id === latestCandidateId}
                autoApplyReviewSuggestions={model.autoApplyReviewSuggestions}
                onReviewSuggestionTargetChange={handlers.onReviewSuggestionTargetChange}
                onToggleAutoApplyReviewSuggestions={handlers.onToggleAutoApplyReviewSuggestions}
                rubricDimensions={rubricDimensions}
              />
            ))}
        </div>
      </section>
    </div>
  )
}

export function getDetailNoticeItems(input: {
  loading: boolean
  actionMessage: string | null
  error: string | null
  loadWarning?: string | null
  displayError: string | null
  locale?: 'zh-CN' | 'en'
}) {
  const notices: Array<{ key: string; tone: 'info' | 'success' | 'error'; text: string }> = []
  let primaryErrorText: string | null = null

  if (input.loading) {
    notices.push({ key: 'loading', tone: 'info', text: input.locale === 'en' ? 'Loading job detail...' : '正在读取任务详情...' })
  }
  if (input.actionMessage) {
    notices.push({ key: 'action-message', tone: 'success', text: input.actionMessage })
  }
  if (input.error) {
    primaryErrorText = getJobDisplayError(input.error, input.locale) ?? input.error
    notices.push({ key: 'ui-error', tone: 'error', text: primaryErrorText })
  }
  if (input.loadWarning) {
    notices.push({ key: 'load-warning', tone: 'info', text: input.loadWarning })
  }
  if (input.displayError && normalizeNoticeText(input.displayError) !== normalizeNoticeText(primaryErrorText)) {
    notices.push({ key: 'display-error', tone: 'error', text: input.displayError })
  }

  return notices
}

function normalizeNoticeText(value: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function SummaryBadge({
  label,
  value,
  meta = null,
  tone = 'pending',
}: {
  label: string
  value: string
  meta?: string | null
  tone?: JobDetailViewModel['status'] | 'pending'
}) {
  return (
    <div className={`summary-card tone-${tone}`}>
      <div className="small">{label}</div>
      <div className="summary-value">{value}</div>
      {meta ? <div className="small">{meta}</div> : null}
    </div>
  )
}

function ReadonlyGoalField({
  label,
  value,
  items,
  expandLabel,
  collapseLabel,
  collapsedPreview,
}: {
  label: string
  value: string
  items?: string[]
  expandLabel: string
  collapseLabel: string
  collapsedPreview?: string
}) {
  const displayValue = normalizeEscapedMultilineText(value)
  const displayItems = (items ?? []).map((item) => normalizeEscapedMultilineText(item)).filter(Boolean)
  const shouldCollapse = shouldCollapseGoalValue(displayValue)
  const preview = collapsedPreview ?? (displayItems.length > 1 ? getGoalItemsPreview(displayItems) : getGoalValuePreview(displayValue))
  const content = displayItems.length > 1
    ? (
      <ul className="list compact-list goal-value-list">
        {displayItems.map((item, index) => <li className="goal-value-list-item" key={`${label}-${index}`}>{item}</li>)}
      </ul>
    )
    : <div className="active-goal-value">{displayValue}</div>

  return (
    <div className="active-goal-card compact-goal-card">
      <div className="active-goal-card-head">
        <div className="label">{label}</div>
      </div>
      {shouldCollapse ? (
        <details className="goal-value-fold" data-ui="goal-value-fold">
          <summary className="fold-card-summary">
            <span className="goal-value-summary-row">
              <span className="goal-value-preview">{preview}</span>
              <span className="fold-card-summary-meta">
                <span className="fold-card-state fold-card-state-closed">{expandLabel}</span>
                <span className="fold-card-state fold-card-state-open">{collapseLabel}</span>
                <span className="fold-card-chevron" aria-hidden="true">
                  <ChevronDown size={16} />
                </span>
              </span>
            </span>
          </summary>
          {content}
        </details>
      ) : (
        content
      )}
    </div>
  )
}

function shouldCollapseGoalValue(value: string) {
  const normalized = value.trim()
  if (!normalized) return false
  const lineCount = normalized.split('\n').filter(Boolean).length
  return lineCount > 2 || normalized.length > 110
}

function getGoalValuePreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 56) {
    return normalized
  }

  return `${normalized.slice(0, 56).trimEnd()}…`
}

function getGoalItemsPreview(items: string[]) {
  const preview = items
    .slice(0, 2)
    .map((item) => normalizeGoalPreviewItem(item))
    .filter(Boolean)
    .join('；')

  if (!preview) {
    return ''
  }

  return items.length > 2 ? `${preview}（共 ${items.length} 条）` : preview
}

function normalizeGoalPreviewItem(item: string) {
  return item
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。；;，,\s]+$/u, '')
    .trim()
}

function FoldCardSummary({
  title,
  closedLabel,
  openLabel,
}: {
  title: string
  closedLabel: string
  openLabel: string
}) {
  return (
    <span className="fold-card-summary-row">
      <span className="fold-card-title">{title}</span>
      <span className="fold-card-summary-meta">
        <span className="fold-card-state fold-card-state-closed">{closedLabel}</span>
        <span className="fold-card-state fold-card-state-open">{openLabel}</span>
        <span className="fold-card-chevron" aria-hidden="true">
          <ChevronDown size={16} />
        </span>
      </span>
    </span>
  )
}
