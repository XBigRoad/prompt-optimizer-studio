import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
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
import { ModelAliasCombobox } from '@/components/ui/model-alias-combobox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useI18n, useLocaleText } from '@/lib/i18n'
import type { SteeringItem } from '@/lib/server/types'
import { getConversationPolicyLabel, getJobDisplayError, getJobStatusLabel } from '@/lib/presentation'

export type JobDetailViewModel = {
  jobId: string
  title: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
  conversationPolicy: 'stateless' | 'pooled-3x'
  optimizerModel: string
  judgeModel: string
  pendingOptimizerModel: string | null
  pendingJudgeModel: string | null
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
  bestAverageScore: number
  maxRoundsOverride: number | null
  passStreak: number
  lastReviewScore: number
  customRubricMd: string | null
  effectiveRubricMd: string
  effectiveRubricSource: 'job' | 'settings' | 'default'
  errorMessage: string | null
  latestFullPrompt: string
  initialPrompt: string
  modelsLabel: string
  effectiveMaxRounds: number
  candidates: RoundCandidateView[]
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
    copyingPrompt: boolean
    compareMode: boolean
    expandedRounds: Record<string, boolean>
  }
  form: {
    taskModel: string
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
    onRemovePendingSteeringItem: (itemId: string) => void
    onClearPendingSteering: () => void
    onGenerateGoalAnchorDraft: () => void
    onSaveGoalAnchor: () => void
    onPauseTask: () => void
    onResumeStep: () => void
    onResumeAuto: () => void
    onCancelTask: () => void
    onCompleteTask: () => void
    onCopyLatestPrompt: () => void
    onToggleCompareMode: () => void
    onToggleRound: (candidateId: string) => void
    onTaskModelChange: (value: string) => void
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
  const canEdit = model.status !== 'completed'
  const canSteer = !['completed', 'cancelled'].includes(model.status)
  const canRestart = ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(model.status)
  const canCancel = !['completed', 'cancelled'].includes(model.status)
  const canPause = !['completed', 'cancelled', 'paused'].includes(model.status)
  const canResume = !['completed', 'cancelled', 'running'].includes(model.status)
  const canComplete = ['paused', 'manual_review', 'failed'].includes(model.status) && model.candidates.length > 0
  const hasPendingSteering = model.pendingSteeringItems.length > 0
  const selectedPendingSteeringIdSet = new Set(form.selectedPendingSteeringIds)
  const hasSelectedPendingSteering = selectedPendingSteeringIdSet.size > 0
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

  return (
    <div className="detail-control-room">
      <section className="detail-hero">
        <div className="nav-row">
          <Link href="/" className="link nav-chip"><ArrowLeft size={16} /> {text('返回控制室', 'Return to control room')}</Link>
          <Link href="/settings" className="link nav-chip"><Settings2 size={16} /> {text('配置台', 'Settings Desk')}</Link>
        </div>
        <div className="detail-hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={16} /> {text('结果台', 'Result Desk')}</span>
            <h1>{model.title}</h1>
            <p className="hero-lead">{text('先确认最终结果，再检查目标理解，最后决定是否继续推进任务。', 'Confirm the latest result first, then inspect the goal understanding, and only then decide whether to continue.')}</p>
          </div>
          <div className="summary-cluster detail-summary-cluster">
            <SummaryBadge label={text('状态', 'Status')} value={getJobStatusLabel(model.status, locale)} tone={model.status} />
            <SummaryBadge label={text('任务模型', 'Task model')} value={model.modelsLabel} />
            <SummaryBadge label={text('运行模式', 'Run mode')} value={model.runMode === 'step' ? text('单步', 'Step') : text('自动', 'Auto')} />
            <SummaryBadge label={text('轮数上限', 'Round cap')} value={String(model.effectiveMaxRounds)} />
            <SummaryBadge label={text('最佳分数', 'Best score')} value={model.bestAverageScore.toFixed(2)} />
            <SummaryBadge label={text('会话', 'Conversation')} value={getConversationPolicyLabel(model.conversationPolicy, locale)} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {getDetailNoticeItems({
          loading: ui.loading,
          actionMessage: ui.actionMessage,
          error: ui.error,
          displayError: getJobDisplayError(model.errorMessage, locale),
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
                <Copy size={18} />
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
          <div className="panel explanation-panel">
            <div className="section-head">
              <div>
                <h2 className="section-title has-icon">
                  <span className="section-title-icon" data-ui="section-title-icon" aria-hidden="true">
                    <WandSparkles size={18} />
                  </span>
                  {text('提炼解释', 'Condensed explanation')}
                </h2>
                <p className="small">{text('先看长期解释，再看这组临时引导会怎样改变下一轮。', 'Read the stable explanation first, then see how the pending steering changes the next round.')}</p>
              </div>
            </div>

            <div className="explanation-strip-grid">
              <div className="explanation-card">
                <strong>{text('长期解释', 'Stable explanation')}</strong>
                <p className="small">{model.goalAnchorExplanation.sourceSummary}</p>
                <details className="fold-card explanation-fold">
                  <summary>{text('查看提炼依据', 'View rationale')}</summary>
                  <ul className="list compact-list">
                    {model.goalAnchorExplanation.rationale.map((item, index) => (
                      <li key={`goal-rationale-${index}`}>{item}</li>
                    ))}
                  </ul>
                </details>
              </div>

              {hasPendingSteering ? (
                <div className="explanation-card steering-impact-card">
                  <strong>{text('当前这组引导会怎样影响下一轮', 'How this steering batch will affect the next round')}</strong>
                  <p className="small">{text(`本轮会按当前顺序吸收 ${model.pendingSteeringItems.length} 条引导；如果下一轮把其中内容写进完整提示词，后续轮次会继续受影响。`, `The next round will absorb these ${model.pendingSteeringItems.length} steering items in order. If that round writes them into the full prompt, later rounds will keep inheriting the change.`)}</p>
                  <details className="fold-card explanation-fold">
                    <summary>{text('查看影响细节', 'View impact details')}</summary>
                    <ul className="list compact-list">
                      {model.pendingSteeringItems.map((item) => (
                        <li key={`impact-${item.id}`}>{item.text}</li>
                      ))}
                      <li>{text('optimizer 会按当前顺序吸收这组引导，再基于完整提示词做最小必要改动。', 'The optimizer absorbs this steering batch in order, then makes only the smallest necessary changes to the full prompt.')}</li>
                      <li>{text('reviewer 不会看到这些引导原文，只会看到下一轮产出的候选提示词。', 'The reviewer never sees the raw steering. It only sees the candidate prompt produced in the next round.')}</li>
                    </ul>
                  </details>
                </div>
              ) : null}
            </div>
          </div>

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

            <div className="stable-rules-grid">
              <div className="active-goal-grid compact-goal-grid">
                <ReadonlyGoalField label={text('长期目标', 'Stable goal')} value={model.goalAnchor.goal} />
                <ReadonlyGoalField label={text('长期交付物', 'Stable deliverable')} value={model.goalAnchor.deliverable} />
                <ReadonlyGoalField label={text('长期边界', 'Stable guardrails')} value={model.goalAnchor.driftGuard.join('\n')} />
              </div>

              <div className="stable-scoring-block">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('当前评分标准', 'Current scoring standard')}</strong>
                    <p className="small">{rubricSourceLine}</p>
                  </div>
                </div>

                <details className="fold-card rubric-preview-fold">
                  <summary>{text('展开评分标准', 'View scoring standard')}</summary>
                  <pre className="pre rubric-pre">{model.effectiveRubricMd}</pre>
                </details>

                {canEdit ? (
                  <details className="fold-card rubric-editor-fold">
                    <summary>{text('编辑任务评分标准', 'Edit task scoring standard')}</summary>
                    <label className="label">
                      {text('任务评分标准覆写', 'Task scoring override')}
                      <textarea
                        className="textarea"
                        rows={8}
                        value={form.customRubricMd}
                        onChange={(event) => handlers.onCustomRubricChange(event.target.value)}
                        placeholder={text('留空以跟随配置台。', 'Leave empty to follow settings.')}
                        disabled={!canEdit}
                      />
                    </label>
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

            <p className="small goal-summary-note">{text('长期规则会持续约束后续轮次；临时引导只影响下一轮，除非你明确保存新的长期规则。', 'Stable rules keep constraining later rounds. Temporary steering only affects the next round unless you explicitly save a new stable rule.')}</p>
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

            <details className="anchor-editor-drawer">
              <summary>{canEdit ? text('编辑长期规则', 'Edit stable rules') : text('查看长期规则', 'View stable rules')}</summary>
              <div className="anchor-editor-body">
                <div className="section-head compact-head">
                  <div>
                    <strong>{text('长期规则内容', 'Stable rule contents')}</strong>
                    <p className="small">{text('这里只有在你确认保存后才会生效。未选中的临时引导不会自动写进这里。', 'Nothing here takes effect until you save. Unselected temporary steering will not be written here automatically.')}</p>
                  </div>
                  {canEdit ? (
                    <button className="button ghost" type="button" onClick={handlers.onSaveGoalAnchor} disabled={ui.savingGoalAnchor}>
                      {ui.savingGoalAnchor ? text('保存中...', 'Saving...') : text('保存长期规则', 'Save stable rules')}
                    </button>
                  ) : null}
                </div>
                <div className="form-grid anchor-editor-grid">
                  <label className="label">
                    {text('长期目标', 'Stable goal')}
                    <textarea className="textarea" value={form.goalAnchorGoal} onChange={(event) => handlers.onGoalAnchorGoalChange(event.target.value)} disabled={!canEdit} />
                  </label>
                  <label className="label">
                    {text('长期交付物', 'Stable deliverable')}
                    <textarea className="textarea" value={form.goalAnchorDeliverable} onChange={(event) => handlers.onGoalAnchorDeliverableChange(event.target.value)} disabled={!canEdit} />
                  </label>
                  <label className="label">
                    {text('长期边界', 'Stable guardrails')}
                    <textarea className="textarea" value={form.goalAnchorDriftGuardText} onChange={(event) => handlers.onGoalAnchorDriftGuardChange(event.target.value)} disabled={!canEdit} />
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
                disabled={!canEdit}
                onChange={handlers.onTaskModelChange}
              />
              <label className="label compact-control-field">
                {text('任务级最大轮数', 'Task-level round cap')}
                <input className="input" type="number" min={1} max={99} value={form.maxRoundsOverrideValue} onChange={(event) => handlers.onMaxRoundsOverrideChange(event.target.value)} disabled={!canEdit} />
              </label>
            </div>
            {canEdit ? (
              <div className="inline-actions runtime-save-actions">
                <button className="button ghost compact" type="button" onClick={handlers.onSaveModel} disabled={ui.savingModels}>
                  {ui.savingModels ? text('保存中...', 'Saving...') : text('保存模型', 'Save model')}
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
                    description={text('这会清空当前候选稿与历史轮次，从初版提示词重新跑。', 'This clears the current candidates and round history, then restarts from the initial prompt.')}
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
          </div>

          <div className="control-subpanel steering-control-panel" id="next-round-steering">
            <div className="section-head control-subhead">
              <div>
                <strong>{text('下一轮引导', 'Next-round steering')}</strong>
                <p className="small">{text('只写这次想纠偏的点。它会在下一轮生效，不影响当前轮。', 'Only write the correction you want for this turn. It takes effect in the next round, not the current one.')}</p>
                {model.status === 'completed' && hasPendingSteering ? (
                  <p className="small">{text('任务已完成：这些待生效引导会作为记录保留，但不会再被应用到后续轮次。', 'This job is already completed. These pending steering items remain only as records and will not be applied again.')}</p>
                ) : null}
              </div>
            </div>
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
              {canEdit ? (
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
                              disabled={!canEdit || ui.generatingGoalAnchorDraft || ui.savingGoalAnchor}
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
            <p className="small">{text('默认只露摘要。需要时再展开每一轮的完整诊断和复核细节。', 'By default you only see the summary. Expand a round when you need the full diagnostic and review details.')}</p>
          </div>
        </div>
        {model.candidates.length === 0 ? <div className="notice">{text('还没有产出候选稿。', 'No candidates yet.')}</div> : null}
        <motion.div layout className="shell">
          {model.candidates.map((candidate) => (
            <JobRoundCard
              key={candidate.id}
              candidate={candidate}
              expanded={Boolean(ui.expandedRounds[candidate.id])}
              onToggle={() => handlers.onToggleRound(candidate.id)}
            />
          ))}
        </motion.div>
      </section>
    </div>
  )
}

export function getDetailNoticeItems(input: {
  loading: boolean
  actionMessage: string | null
  error: string | null
  displayError: string | null
  locale?: 'zh-CN' | 'en'
}) {
  const notices: Array<{ key: string; tone: 'info' | 'success' | 'error'; text: string }> = []

  if (input.loading) {
    notices.push({ key: 'loading', tone: 'info', text: input.locale === 'en' ? 'Loading job detail...' : '正在读取任务详情...' })
  }
  if (input.actionMessage) {
    notices.push({ key: 'action-message', tone: 'success', text: input.actionMessage })
  }
  if (input.error) {
    notices.push({ key: 'ui-error', tone: 'error', text: getJobDisplayError(input.error, input.locale) ?? input.error })
  }
  if (input.displayError) {
    notices.push({ key: 'display-error', tone: 'error', text: input.displayError })
  }

  return notices
}

function SummaryBadge({
  label,
  value,
  tone = 'pending',
}: {
  label: string
  value: string
  tone?: JobDetailViewModel['status'] | 'pending'
}) {
  return (
    <div className={`summary-card tone-${tone}`}>
      <div className="small">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  )
}

function ReadonlyGoalField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="active-goal-card compact-goal-card compact-scroll-card">
      <div className="label">{label}</div>
      <div className="active-goal-value active-goal-scroll">{value}</div>
    </div>
  )
}
