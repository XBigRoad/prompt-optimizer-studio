import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  BrainCircuit,
  ClipboardList,
  Copy,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

import { JobRoundCard, type RoundCandidateView } from '@/components/job-round-card'
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
  nextRoundInstruction: string | null
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
    savingGoalAnchor: boolean
    retrying: boolean
    cancelling: boolean
    pausing: boolean
    resumingStep: boolean
    resumingAuto: boolean
    copyingPrompt: boolean
    expandedRounds: Record<string, boolean>
  }
  form: {
    taskModel: string
    maxRoundsOverrideValue: string
    nextRoundInstruction: string
    goalAnchorGoal: string
    goalAnchorDeliverable: string
    goalAnchorDriftGuardText: string
  }
  handlers: {
    onRetry: () => void
    onSaveModel: () => void
    onSaveMaxRoundsOverride: () => void
    onSaveNextRoundInstruction: () => void
    onSaveGoalAnchor: () => void
    onPauseTask: () => void
    onResumeStep: () => void
    onResumeAuto: () => void
    onCancelTask: () => void
    onCopyLatestPrompt: () => void
    onToggleRound: (candidateId: string) => void
    onTaskModelChange: (value: string) => void
    onMaxRoundsOverrideChange: (value: string) => void
    onNextRoundInstructionChange: (value: string) => void
    onGoalAnchorGoalChange: (value: string) => void
    onGoalAnchorDeliverableChange: (value: string) => void
    onGoalAnchorDriftGuardChange: (value: string) => void
  }
}) {
  const canEdit = model.status !== 'completed'
  const canSteer = !['completed', 'cancelled'].includes(model.status)
  const canRestart = ['pending', 'paused', 'failed', 'manual_review', 'cancelled'].includes(model.status)
  const canCancel = !['completed', 'cancelled'].includes(model.status)
  const canPause = !['completed', 'cancelled', 'paused'].includes(model.status)
  const canResume = !['completed', 'cancelled', 'running'].includes(model.status)

  return (
    <div className="detail-control-room">
      <section className="detail-hero">
        <div className="nav-row">
          <Link href="/" className="link nav-chip"><ArrowLeft size={16} /> 返回控制室</Link>
          <Link href="/settings" className="link nav-chip"><Settings2 size={16} /> 设置</Link>
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
        {ui.loading ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="notice">正在读取任务详情...</motion.div> : null}
        {ui.actionMessage ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="notice success">{ui.actionMessage}</motion.div> : null}
        {ui.error ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="notice error">{ui.error}</motion.div> : null}
        {getJobDisplayError(model.errorMessage) ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="notice error">{getJobDisplayError(model.errorMessage)}</motion.div> : null}
      </AnimatePresence>

      <section className="result-stage">
        <div className="section-head">
          <div>
            <span className="eyebrow"><Copy size={16} /> 结果优先</span>
            <h2 className="section-title">当前最新完整提示词</h2>
            <p className="small">这是你现在最应该复制和判断的版本。后续所有诊断都只是为这个结果服务。</p>
          </div>
          <button className="button primary-action" type="button" onClick={handlers.onCopyLatestPrompt} disabled={ui.copyingPrompt}>
            {ui.copyingPrompt ? '复制中...' : '复制完整提示词'}
          </button>
        </div>
        <pre className="pre result-pre">{model.latestFullPrompt}</pre>
      </section>

      <section className="understanding-stage">
        <div className="understanding-grid">
          <div className="panel understanding-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow"><ShieldCheck size={16} /> 目标理解层</span>
                <h2 className="section-title">核心目标锚点</h2>
                <p className="small">这里定义任务不能漂移的核心目标与关键交付物。</p>
              </div>
              {canEdit ? (
                <button className="button ghost" type="button" onClick={handlers.onSaveGoalAnchor} disabled={ui.savingGoalAnchor}>
                  {ui.savingGoalAnchor ? '保存中...' : '保存核心目标锚点'}
                </button>
              ) : null}
            </div>
            <div className="form-grid">
              <label className="label">
                核心目标
                <textarea className="textarea" value={form.goalAnchorGoal} onChange={(event) => handlers.onGoalAnchorGoalChange(event.target.value)} disabled={!canEdit} />
              </label>
              <label className="label">
                关键交付物
                <textarea className="textarea" value={form.goalAnchorDeliverable} onChange={(event) => handlers.onGoalAnchorDeliverableChange(event.target.value)} disabled={!canEdit} />
              </label>
              <label className="label">
                防漂移条款
                <textarea className="textarea" value={form.goalAnchorDriftGuardText} onChange={(event) => handlers.onGoalAnchorDriftGuardChange(event.target.value)} disabled={!canEdit} />
              </label>
            </div>
          </div>

          <div className="panel explanation-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow"><BrainCircuit size={16} /> 辅助判断</span>
                <h2 className="section-title">提炼解释</h2>
                <p className="small">帮助你快速判断系统对原始需求的理解有没有偏。</p>
              </div>
            </div>
            <div className="explanation-card">
              <p className="small"><strong>原始任务摘要：</strong>{model.goalAnchorExplanation.sourceSummary}</p>
              <strong>系统为什么这样提炼</strong>
              <ul className="list compact-list">
                {model.goalAnchorExplanation.rationale.map((item, index) => (
                  <li key={`goal-rationale-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="control-stage">
        <div className="section-head">
          <div>
            <span className="eyebrow"><SlidersHorizontal size={16} /> 操作面板</span>
            <h2 className="section-title">任务控制</h2>
            <p className="small">只保留会影响下一步决策的控制项，避免控制和诊断混杂。</p>
          </div>
        </div>
        <datalist id="job-model-aliases">
          {models.map((modelOption) => <option key={modelOption.id} value={modelOption.id} />)}
        </datalist>
        <div className="form-grid">
          <label className="label">
            任务模型别名
            <input className="input" list="job-model-aliases" value={form.taskModel} onChange={(event) => handlers.onTaskModelChange(event.target.value)} disabled={!canEdit} />
          </label>
          <label className="label">
            任务级最大轮数
            <input className="input" type="number" min={1} max={99} value={form.maxRoundsOverrideValue} onChange={(event) => handlers.onMaxRoundsOverrideChange(event.target.value)} disabled={!canEdit} />
          </label>
          <label className="label" id="next-round-steering">
            下一轮人工引导
            <textarea className="textarea" value={form.nextRoundInstruction} onChange={(event) => handlers.onNextRoundInstructionChange(event.target.value)} disabled={!canSteer} />
          </label>
        </div>
        <div className="button-row">
          {canEdit ? <button className="button" type="button" onClick={handlers.onSaveModel} disabled={ui.savingModels}>{ui.savingModels ? '保存中...' : '保存任务模型'}</button> : null}
          {canEdit ? <button className="button ghost" type="button" onClick={handlers.onSaveMaxRoundsOverride} disabled={ui.savingMaxRounds}>{ui.savingMaxRounds ? '保存中...' : '保存任务级轮数'}</button> : null}
          {canSteer ? <button className="button ghost" type="button" onClick={handlers.onSaveNextRoundInstruction} disabled={ui.savingSteering}>{ui.savingSteering ? '保存中...' : '保存人工引导'}</button> : null}
          {canPause ? <button className="button secondary" type="button" onClick={handlers.onPauseTask} disabled={ui.pausing}>{ui.pausing ? '处理中...' : model.status === 'running' ? '暂停（本轮后）' : '暂停'}</button> : null}
          {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeStep} disabled={ui.resumingStep}>{ui.resumingStep ? '处理中...' : '继续一轮'}</button> : null}
          {canResume ? <button className="button secondary" type="button" onClick={handlers.onResumeAuto} disabled={ui.resumingAuto}>{ui.resumingAuto ? '处理中...' : '恢复自动运行'}</button> : null}
          {canRestart ? <button className="button ghost" type="button" onClick={handlers.onRetry} disabled={ui.retrying}><RefreshCcw size={16} /> {ui.retrying ? '处理中...' : '重新开始'}</button> : null}
          {canCancel ? <button className="button danger" type="button" onClick={handlers.onCancelTask} disabled={ui.cancelling}><PauseCircle size={16} /> {ui.cancelling ? '处理中...' : '取消任务'}</button> : null}
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
