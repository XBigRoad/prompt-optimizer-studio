import type { Route } from 'next'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  History,
  PauseCircle,
  PlayCircle,
  Sparkles,
} from 'lucide-react'

import { getConversationPolicyLabel, getJobDisplayError, getJobStatusLabel, getPromptPreview } from '@/lib/presentation'

export type DashboardJobView = {
  id: string
  title: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
  currentRound: number
  bestAverageScore: number
  latestPrompt: string
  errorMessage: string | null
  createdAt: string
  conversationPolicy: 'stateless' | 'pooled-3x'
  optimizerModel: string
  judgeModel: string
}

export function DashboardControlRoom({
  actionableOnly,
  loading,
  groups,
  stats,
  actionInFlight,
  onToggleActionableOnly,
  onCopyPrompt,
  onResumeStep,
  onResumeAuto,
}: {
  actionableOnly: boolean
  loading: boolean
  groups: {
    attention: DashboardJobView[]
    running: DashboardJobView[]
    queued: DashboardJobView[]
    recentCompleted: DashboardJobView[]
    history: DashboardJobView[]
  }
  stats: {
    attention: number
    running: number
    queued: number
    recentCompleted: number
    history: number
  }
  actionInFlight: string | null
  onToggleActionableOnly: () => void
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
  onResumeStep: (job: DashboardJobView) => Promise<void>
  onResumeAuto: (job: DashboardJobView) => Promise<void>
}) {
  return (
    <section className="control-room">
      <div className="control-room-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> Prompt Optimizer 控制室</span>
          <h2 className="control-room-title">任务控制室</h2>
          <p className="hero-lead">
            先处理要你决策的任务，再观察自动运行中的任务，最后回看最新结果。首页只保留真正需要判断和推动的内容。
          </p>
          <div className="button-row">
            <button
              className={`button control-toggle${actionableOnly ? ' active' : ''}`}
              type="button"
              onClick={onToggleActionableOnly}
            >
              {actionableOnly ? '恢复完整看板' : '只看我现在要处理的'}
            </button>
            <Link href="/settings" className="button ghost">前往设置</Link>
          </div>
        </div>
        <div className="summary-cluster">
          <SummaryCard icon={<AlertTriangle size={18} />} label="待你处理" value={stats.attention} tone="manual_review" />
          <SummaryCard icon={<Activity size={18} />} label="自动运行中" value={stats.running} tone="running" />
          <SummaryCard icon={<CheckCircle2 size={18} />} label="最新结果" value={stats.recentCompleted} tone="completed" />
          <SummaryCard icon={<History size={18} />} label="历史任务" value={stats.history} tone="pending" />
        </div>
      </div>

      {loading ? <div className="notice">正在读取控制室数据...</div> : null}

      <LayoutGroup>
        <div className="control-room-grid">
          <DashboardLane
            title="待你处理"
            description="这些任务需要你判断是否继续自动跑，或先加人工引导再推进。"
            icon={<AlertTriangle size={18} />}
            jobs={groups.attention}
            emptyMessage="当前没有需要你立即处理的任务。"
            actionInFlight={actionInFlight}
            onCopyPrompt={onCopyPrompt}
            onResumeAuto={onResumeAuto}
            onResumeStep={onResumeStep}
          />
          <DashboardLane
            title="自动运行中"
            description="这些任务已经在跑，先观察结果，不要同时给自己制造额外噪音。"
            icon={<Activity size={18} />}
            jobs={groups.running}
            emptyMessage="当前没有自动运行中的任务。"
            actionInFlight={actionInFlight}
            onCopyPrompt={onCopyPrompt}
            onResumeAuto={onResumeAuto}
            onResumeStep={onResumeStep}
          />
          <DashboardLane
            title="最新结果"
            description="这里只保留最近完成结果，方便你直接回到最有价值的产出。"
            icon={<CheckCircle2 size={18} />}
            jobs={groups.recentCompleted}
            emptyMessage="最近还没有完成结果。"
            actionInFlight={actionInFlight}
            onCopyPrompt={onCopyPrompt}
            onResumeAuto={onResumeAuto}
            onResumeStep={onResumeStep}
          />
        </div>
      </LayoutGroup>

      {!actionableOnly ? (
        <div className="control-room-secondary">
          <DashboardLane
            title="排队中"
            description="已入队但还没进入自动优化。放在次层，避免和需要你决策的任务抢注意力。"
            icon={<Clock3 size={18} />}
            jobs={groups.queued}
            emptyMessage="当前没有排队中的任务。"
            actionInFlight={actionInFlight}
            onCopyPrompt={onCopyPrompt}
            onResumeAuto={onResumeAuto}
            onResumeStep={onResumeStep}
            compact
          />

          <details className="history-drawer">
            <summary>
              <span><History size={16} /> 历史任务</span>
              <span className="meta">{groups.history.length} 条</span>
            </summary>
            {groups.history.length === 0 ? (
              <div className="notice">暂无历史任务。</div>
            ) : (
              <div className="history-grid">
                {groups.history.map((job) => (
                  <DashboardJobCard
                    key={job.id}
                    job={job}
                    actionInFlight={actionInFlight}
                    onCopyPrompt={onCopyPrompt}
                    onResumeAuto={onResumeAuto}
                    onResumeStep={onResumeStep}
                    subdued
                  />
                ))}
              </div>
            )}
          </details>
        </div>
      ) : null}
    </section>
  )
}

function DashboardLane({
  title,
  description,
  icon,
  jobs,
  emptyMessage,
  actionInFlight,
  onCopyPrompt,
  onResumeAuto,
  onResumeStep,
  compact = false,
}: {
  title: string
  description: string
  icon: React.ReactNode
  jobs: DashboardJobView[]
  emptyMessage: string
  actionInFlight: string | null
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
  onResumeAuto: (job: DashboardJobView) => Promise<void>
  onResumeStep: (job: DashboardJobView) => Promise<void>
  compact?: boolean
}) {
  return (
    <section className={`control-lane${compact ? ' compact' : ''}`}>
      <div className="lane-header">
        <div className="lane-heading">
          <span className="eyebrow">{icon}{title}</span>
          <h3 className="section-title">{title}</h3>
          <p className="small">{description}</p>
        </div>
      </div>
      <AnimatePresence mode="popLayout">
        <motion.div layout className="lane-grid">
          {jobs.length === 0 ? <div className="notice">{emptyMessage}</div> : null}
          {jobs.map((job) => (
            <DashboardJobCard
              key={job.id}
              job={job}
              actionInFlight={actionInFlight}
              onCopyPrompt={onCopyPrompt}
              onResumeAuto={onResumeAuto}
              onResumeStep={onResumeStep}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function DashboardJobCard({
  job,
  actionInFlight,
  onCopyPrompt,
  onResumeAuto,
  onResumeStep,
  subdued = false,
}: {
  job: DashboardJobView
  actionInFlight: string | null
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
  onResumeAuto: (job: DashboardJobView) => Promise<void>
  onResumeStep: (job: DashboardJobView) => Promise<void>
  subdued?: boolean
}) {
  const canAct = job.status === 'manual_review' || job.status === 'paused'
  const primary:
    | { kind: 'link'; label: string; href: string }
    | { kind: 'action'; label: string; action: () => void; pending: boolean } =
    job.status === 'manual_review' || job.status === 'paused'
      ? { kind: 'action', label: '继续一轮', action: () => void onResumeStep(job), pending: actionInFlight === `${job.id}:step` }
      : job.status === 'completed'
        ? { kind: 'action', label: '复制最新提示词', action: () => void onCopyPrompt(job), pending: false }
        : { kind: 'link', label: '打开详情', href: `/jobs/${job.id}` }

  return (
    <motion.article layout className={`control-card${subdued ? ' subdued' : ''} tone-${job.status}`}>
      <div className="card-topline">
        <span className={`status ${job.status}`}>{getJobStatusLabel(job.status)}</span>
        <span className="meta">{formatDate(job.createdAt)}</span>
      </div>
      <h3>{job.title}</h3>
      <p className="prompt-preview">{getPromptPreview(job.latestPrompt, 140)}</p>
      <div className="card-metrics">
        <span>轮次 {job.currentRound}</span>
        <span>最佳均分 {job.bestAverageScore.toFixed(2)}</span>
      </div>
      <div className="card-metrics">
        <span>模型 {job.optimizerModel}</span>
        <span>{getConversationPolicyLabel(job.conversationPolicy)}</span>
      </div>
      {getJobDisplayError(job.errorMessage) ? <div className="notice error">{getJobDisplayError(job.errorMessage)}</div> : null}
      <div className="card-actions">
        {primary.kind === 'link' ? (
          <Link href={primary.href as Route} className="button primary-action">
            {primary.label} <ChevronRight size={16} />
          </Link>
        ) : (
          <button className="button primary-action" type="button" onClick={primary.action} disabled={primary.pending}>
            {primary.pending ? '处理中...' : primary.label}
          </button>
        )}
        <div className="inline-actions secondary-actions">
          {canAct ? (
            <button className="button ghost" type="button" onClick={() => void onResumeAuto(job)} disabled={actionInFlight === `${job.id}:auto`}>
              <PlayCircle size={16} /> {actionInFlight === `${job.id}:auto` ? '处理中...' : '自动运行'}
            </button>
          ) : null}
          {primary.kind === 'action' ? (
            <button className="button ghost" type="button" onClick={() => void onCopyPrompt(job)}>
              <Copy size={16} /> 复制
            </button>
          ) : null}
          <Link href={`/jobs/${job.id}${canAct ? '#next-round-steering' : ''}` as Route} className="button ghost">
            {canAct ? '编辑引导' : '详情'}
          </Link>
        </div>
      </div>
    </motion.article>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'manual_review' | 'running' | 'completed' | 'pending'
}) {
  return (
    <div className={`summary-card tone-${tone}`}>
      <div className="summary-icon">{icon}</div>
      <div>
        <div className="small">{label}</div>
        <div className="summary-value">{value}</div>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
