import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  BrainCircuit,
  ClipboardList,
  Copy,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'

import { JobRoundCard, type RoundCandidateView } from '@/components/job-round-card'
import { ModelAliasCombobox } from '@/components/ui/model-alias-combobox'
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
    savingSteering: boolean
    generatingGoalAnchorDraft: boolean
    savingGoalAnchor: boolean
    retrying: boolean
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
    onAddPendingSteering: () => void
    onRemovePendingSteeringItem: (itemId: string) => void
    onClearPendingSteering: () => void
    onGenerateGoalAnchorDraft: () => void
    onSaveGoalAnchor: () => void
    onPauseTask: () => void
    onResumeStep: () => void
    onResumeAuto: () => void
    onCancelTask: () => void
    onCopyLatestPrompt: () => void
    onToggleCompareMode: () => void
    onToggleRound: (candidateId: string) => void
    onTaskModelChange: (value: string) => void
    onMaxRoundsOverrideChange: (value: string) => void
    onPendingSteeringInputChange: (value: string) => void
    onGoalAnchorGoalChange: (value: string) => void
    onGoalAnchorDeliverableChange: (value: string) => void
    onGoalAnchorDriftGuardChange: (value: string) => void
    onTogglePendingSteeringSelection: (itemId: string) => void
  }
}) {
  const canEdit = model.status !== 'completed'
  const canSteer = !['completed', 'cancelled'].includes(model.status)
  const canRestart = ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(model.status)
  const canCancel = !['completed', 'cancelled'].includes(model.status)
  const canPause = !['completed', 'cancelled', 'paused'].includes(model.status)
  const canResume = !['completed', 'cancelled', 'running'].includes(model.status)
  const hasPendingSteering = model.pendingSteeringItems.length > 0
  const selectedPendingSteeringIdSet = new Set(form.selectedPendingSteeringIds)
  const hasSelectedPendingSteering = selectedPendingSteeringIdSet.size > 0

  return (
    <div className="detail-control-room">
      <section className="detail-hero">
        <div className="nav-row">
          <Link href="/" className="link nav-chip"><ArrowLeft size={16} /> 返回控制室</Link>
          <Link href="/settings" className="link nav-chip"><Settings2 size={16} /> 配置台</Link>
        </div>
        <div className="detail-hero-grid">
          <div>
            <span className="eyebrow"><Sparkles size={16} /> 结果台</span>
            <h1>{model.title}</h1>
            <p className="hero-lead">先确认最终结果，再检查目标理解，最后决定是否继续推进任务。</p>
          </div>
          <div className="summary-cluster">
            <SummaryBadge label="状态" value={getJobStatusLabel(model.status)} tone={model.status} />
            <SummaryBadge label="任务模型" value={model.modelsLabel} />
            <SummaryBadge label="运行模式" value={model.runMode === 'step' ? '单步' : '自动'} />
            <SummaryBadge label="轮数上限" value={String(model.effectiveMaxRounds)} />
            <SummaryBadge label="最佳分数" value={model.bestAverageScore.toFixed(2)} />
            <SummaryBadge label="会话" value={getConversationPolicyLabel(model.conversationPolicy)} />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {getDetailNoticeItems({
          loading: ui.loading,
          actionMessage: ui.actionMessage,
          error: ui.error,
          displayError: getJobDisplayError(model.errorMessage),
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
            <span className="eyebrow"><Copy size={16} /> 结果优先</span>
            <h2 className="section-title">当前最新完整提示词</h2>
            <p className="small">这是你现在最应该复制和判断的版本。后续所有诊断都只是为这个结果服务。</p>
          </div>
          <div className="result-stage-actions">
            <button className="button ghost" type="button" onClick={handlers.onToggleCompareMode}>
              {ui.compareMode ? '退出对比' : '进入对比'}
            </button>
            <button className="button primary-action" type="button" onClick={handlers.onCopyLatestPrompt} disabled={ui.copyingPrompt}>
              {ui.copyingPrompt ? '复制中...' : '复制完整提示词'}
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
                  <span className="eyebrow subdued">初始输入</span>
                  <strong>初始版提示词</strong>
                </div>
                <p className="small">这是任务刚创建时的原始输入，用来和当前版直接对照。</p>
                <pre className="pre result-pre result-pre-initial">{model.initialPrompt}</pre>
              </div>
              <div className="panel result-panel result-panel-latest">
                <div className="result-panel-head">
                  <span className="eyebrow">当前结果</span>
                  <strong>当前最新完整提示词</strong>
                </div>
                <p className="small">复制按钮始终复制右侧这一版，方便你直接带走当前可用结果。</p>
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
        <div className="understanding-grid">
          <div className="panel understanding-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow"><ShieldCheck size={16} /> 目标理解层</span>
                <h2 className="section-title">{hasPendingSteering ? '当前有效目标视图' : '长期规则'}</h2>
                <p className="small">
                  {hasPendingSteering
                    ? '长期规则保持不变，待生效引导会作为下一轮的一次性补充。'
                    : '这里定义任务不能漂移的长期目标与长期交付物。'}
                </p>
              </div>
            </div>
            <div className="active-goal-grid compact-goal-grid">
              <ReadonlyGoalField label="长期目标" value={model.goalAnchor.goal} />
              <ReadonlyGoalField label="长期交付物" value={model.goalAnchor.deliverable} />
              <ReadonlyGoalField label="长期边界" value={model.goalAnchor.driftGuard.join('\n')} />
            </div>
            <p className="small goal-summary-note">长期规则会持续约束后续轮次；临时引导只影响下一轮，除非你明确保存新的长期规则。</p>
            {hasPendingSteering ? (
              <div className="pending-steering-stack">
                <div className="section-head compact-head">
                  <div>
                    <strong>待生效引导</strong>
                    <p className="small">这些条目会按当前顺序进入下一轮；勾选并保存后，才会进入长期规则。</p>
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
                        <span className="pill pending">待生效 {index + 1}</span>
                        <span className="small">{selectedPendingSteeringIdSet.has(item.id) ? '准备写入长期规则' : '仅下一轮生效'}</span>
                      </div>
                      <p>{item.text}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : null}

            <details className="anchor-editor-drawer">
              <summary>{canEdit ? '编辑长期规则' : '查看长期规则'}</summary>
              <div className="anchor-editor-body">
                <div className="section-head compact-head">
                  <div>
                    <strong>长期规则内容</strong>
                    <p className="small">这里只有在你确认保存后才会生效。未选中的临时引导不会自动写进这里。</p>
                  </div>
                  {canEdit ? (
                    <button className="button ghost" type="button" onClick={handlers.onSaveGoalAnchor} disabled={ui.savingGoalAnchor}>
                      {ui.savingGoalAnchor ? '保存中...' : '保存长期规则'}
                    </button>
                  ) : null}
                </div>
                <div className="form-grid anchor-editor-grid">
                  <label className="label">
                    长期目标
                    <textarea className="textarea" value={form.goalAnchorGoal} onChange={(event) => handlers.onGoalAnchorGoalChange(event.target.value)} disabled={!canEdit} />
                  </label>
                  <label className="label">
                    长期交付物
                    <textarea className="textarea" value={form.goalAnchorDeliverable} onChange={(event) => handlers.onGoalAnchorDeliverableChange(event.target.value)} disabled={!canEdit} />
                  </label>
                  <label className="label">
                    长期边界
                    <textarea className="textarea" value={form.goalAnchorDriftGuardText} onChange={(event) => handlers.onGoalAnchorDriftGuardChange(event.target.value)} disabled={!canEdit} />
                  </label>
                </div>
                {form.goalAnchorDraftReady ? (
                  <div className="goal-anchor-draft-note">
                    <strong>已把选中项带入长期规则编辑区</strong>
                    <p className="small">现在还只是草稿。点击“保存长期规则”后，选中的条目才会成为长期规则；未选中的条目会继续留在待生效列表。</p>
                  </div>
                ) : null}
              </div>
            </details>
          </div>

          <div className="panel explanation-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow"><BrainCircuit size={16} /> 辅助判断</span>
                <h2 className="section-title">提炼解释</h2>
                <p className="small">先看长期解释，再看这组临时引导会怎样改变下一轮。</p>
              </div>
            </div>
            <div className="explanation-card">
              <strong>长期解释</strong>
              <p className="small"><strong>原始任务摘要：</strong>{model.goalAnchorExplanation.sourceSummary}</p>
              <details className="fold-card explanation-fold">
                <summary>查看提炼依据</summary>
                <ul className="list compact-list">
                  {model.goalAnchorExplanation.rationale.map((item, index) => (
                    <li key={`goal-rationale-${index}`}>{item}</li>
                  ))}
                </ul>
              </details>
            </div>
            {hasPendingSteering ? (
              <div className="explanation-card steering-impact-card">
                <strong>当前这组引导会怎样影响下一轮</strong>
                <p className="small">本轮会按当前顺序吸收 {model.pendingSteeringItems.length} 条引导；如果下一轮把其中内容写进完整提示词，后续轮次会继续受影响。</p>
                <details className="fold-card explanation-fold">
                  <summary>查看影响细节</summary>
                  <ul className="list compact-list">
                    {model.pendingSteeringItems.map((item) => (
                      <li key={`impact-${item.id}`}>{item.text}</li>
                    ))}
                    <li>optimizer 会按当前顺序吸收这组引导，再基于完整提示词做最小必要改动。</li>
                    <li>reviewer 不会看到这些引导原文，只会看到下一轮产出的候选提示词。</li>
                  </ul>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="control-stage">
        <div className="section-head">
          <div>
            <span className="eyebrow"><SlidersHorizontal size={16} /> 操作面板</span>
            <h2 className="section-title">任务控制</h2>
            <p className="small">先决定怎么跑，再补这次的人工纠偏。</p>
          </div>
        </div>
        <div className="control-stage-grid">
          <div className="control-subpanel runtime-control-panel">
            <div className="section-head control-subhead">
              <div>
                <strong>运行控制</strong>
                <p className="small">模型、轮数和继续方式都在这里。</p>
              </div>
            </div>
            <div className="compact-control-grid runtime-config-grid">
              <ModelAliasCombobox
                inputId="job-task-model"
                label="任务模型别名"
                value={form.taskModel}
                options={models}
                disabled={!canEdit}
                onChange={(next) => handlers.onTaskModelChange(next)}
              />
              <label className="label compact-control-field">
                任务级最大轮数
                <input className="input" type="number" min={1} max={99} value={form.maxRoundsOverrideValue} onChange={(event) => handlers.onMaxRoundsOverrideChange(event.target.value)} disabled={!canEdit} />
              </label>
            </div>
            {canEdit ? (
              <div className="inline-actions runtime-save-actions">
                <button className="button ghost compact" type="button" onClick={handlers.onSaveModel} disabled={ui.savingModels}>
                  {ui.savingModels ? '保存中...' : '保存模型'}
                </button>
                <button className="button ghost compact" type="button" onClick={handlers.onSaveMaxRoundsOverride} disabled={ui.savingMaxRounds}>
                  {ui.savingMaxRounds ? '保存中...' : '保存轮数'}
                </button>
              </div>
            ) : null}
            <div className="runtime-action-stack">
              <div className="button-row runtime-primary-actions">
                {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeStep} disabled={ui.resumingStep}><PlayCircle size={16} /> {ui.resumingStep ? '处理中...' : '继续一轮'}</button> : null}
                {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeAuto} disabled={ui.resumingAuto}><PlayCircle size={16} /> {ui.resumingAuto ? '处理中...' : '恢复自动运行'}</button> : null}
                {canPause ? <button className="button secondary" type="button" onClick={handlers.onPauseTask} disabled={ui.pausing}>{ui.pausing ? '处理中...' : model.status === 'running' ? '暂停（本轮后）' : '暂停'}</button> : null}
              </div>
              <div className="button-row runtime-secondary-actions">
                {canRestart ? <button className="button ghost" type="button" onClick={handlers.onRetry} disabled={ui.retrying}><RefreshCcw size={16} /> {ui.retrying ? '处理中...' : '重新开始'}</button> : null}
                {canCancel ? <button className="button danger" type="button" onClick={handlers.onCancelTask} disabled={ui.cancelling}><PauseCircle size={16} /> {ui.cancelling ? '处理中...' : '取消任务'}</button> : null}
              </div>
            </div>
          </div>

          <div className="control-subpanel steering-control-panel" id="next-round-steering">
            <div className="section-head control-subhead">
              <div>
                <strong>下一轮引导</strong>
                <p className="small">只写这次想纠偏的点。它会在下一轮生效，不影响当前轮。</p>
              </div>
            </div>
            <label className="label steering-control-field">
              追加一条人工引导
              <textarea className="textarea" value={form.pendingSteeringInput} onChange={(event) => handlers.onPendingSteeringInputChange(event.target.value)} disabled={!canSteer} />
            </label>
            <div className="button-row compact-actions">
              {canSteer ? (
                <button className="button ghost compact" type="button" onClick={handlers.onAddPendingSteering} disabled={ui.savingSteering}>
                  <Plus size={16} /> {ui.savingSteering ? '保存中...' : '加入待生效列表'}
                </button>
              ) : null}
              {canEdit ? (
                <button className="button ghost compact" type="button" onClick={handlers.onGenerateGoalAnchorDraft} disabled={!hasSelectedPendingSteering || ui.generatingGoalAnchorDraft}>
                  <WandSparkles size={16} /> {ui.generatingGoalAnchorDraft ? '生成中...' : '生成长期规则草稿'}
                </button>
              ) : null}
              {canSteer && hasPendingSteering ? (
                <button className="button ghost compact" type="button" onClick={handlers.onClearPendingSteering} disabled={ui.savingSteering}>
                  <Trash2 size={16} /> 清空待生效引导
                </button>
              ) : null}
            </div>
            {hasPendingSteering ? (
              <div className="pending-steering-stack control-pending-list">
                <div className="section-head compact-head">
                  <div>
                    <strong>待生效列表</strong>
                    <p className="small">勾选后，生成草稿并保存，才会进入长期规则。</p>
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
                        <span className="pill paused">待生效 {index + 1}</span>
                        <div className="steering-card-actions">
                          <label className="selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedPendingSteeringIdSet.has(item.id)}
                              onChange={() => handlers.onTogglePendingSteeringSelection(item.id)}
                              disabled={!canEdit || ui.generatingGoalAnchorDraft || ui.savingGoalAnchor}
                              aria-label={`切换待生效引导 ${index + 1} 是否加入长期规则`}
                            />
                            <span className="small">{selectedPendingSteeringIdSet.has(item.id) ? '加入长期规则' : '只影响下一轮'}</span>
                          </label>
                          {canSteer ? (
                            <button className="icon-button" type="button" aria-label={`删除待生效引导 ${index + 1}`} onClick={() => handlers.onRemovePendingSteeringItem(item.id)} disabled={ui.savingSteering}>
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
                <span className="small">当前没有待生效引导。要临时纠偏时，先在上面添加一条。</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="diagnostic-stage">
        <div className="section-head">
          <div>
            <span className="eyebrow"><ClipboardList size={16} /> 深入诊断</span>
            <h2 className="section-title">优化过程诊断</h2>
            <p className="small">默认只露摘要。需要时再展开每一轮的完整诊断和复核细节。</p>
          </div>
        </div>
        {model.candidates.length === 0 ? <div className="notice">还没有产出候选稿。</div> : null}
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
}) {
  const notices: Array<{ key: string; tone: 'info' | 'success' | 'error'; text: string }> = []

  if (input.loading) {
    notices.push({ key: 'loading', tone: 'info', text: '正在读取任务详情...' })
  }
  if (input.actionMessage) {
    notices.push({ key: 'action-message', tone: 'success', text: input.actionMessage })
  }
  if (input.error) {
    notices.push({ key: 'ui-error', tone: 'error', text: getJobDisplayError(input.error) ?? input.error })
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
