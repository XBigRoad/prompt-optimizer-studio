import type { Route } from 'next'
import Link from 'next/link'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  History,
  PlayCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  getConversationPolicyLabel,
  getJobDisplayError,
  getJobStatusLabel,
  getPromptPreview,
  groupHistoryJobsByTitle,
} from '@/lib/presentation'

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

type LaneKey = 'attention' | 'running' | 'recent-completed' | 'history'

type HistoryGroupView = ReturnType<typeof groupHistoryJobsByTitle<DashboardJobView>>[number]

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
  const [historyQuery, setHistoryQuery] = useState('')
  const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<Record<string, boolean>>({})

  const historyGroups = useMemo(() => {
    const normalizedQuery = normalizeTitleQuery(historyQuery)
    return groupHistoryJobsByTitle(groups.history).filter((group) => (
      normalizedQuery.length === 0 || normalizeTitleQuery(group.title).includes(normalizedQuery)
    ))
  }, [groups.history, historyQuery])

  const lanes = useMemo(() => {
    const available = [
      {
        key: 'attention' as const,
        title: '待你处理',
        description: '这些任务需要你判断是否继续自动跑，或先加人工引导再推进。',
        icon: <AlertTriangle size={18} />,
        jobs: groups.attention,
        emptyMessage: '当前没有需要你立即处理的任务。',
      },
      {
        key: 'running' as const,
        title: '自动运行中',
        description: '这些任务已经在跑，先观察结果，不要同时给自己制造额外噪音。',
        icon: <Activity size={18} />,
        jobs: groups.running,
        emptyMessage: '当前没有自动运行中的任务。',
      },
      {
        key: 'recent-completed' as const,
        title: '最新结果',
        description: '这里只保留最近完成结果，方便你直接回到最有价值的产出。',
        icon: <CheckCircle2 size={18} />,
        jobs: groups.recentCompleted,
        emptyMessage: '最近还没有完成结果。',
      },
      {
        key: 'history' as const,
        title: '历史任务',
        description: '把旧任务按标题归拢，先搜名字，再展开具体运行记录。',
        icon: <History size={18} />,
        jobs: groups.history,
        emptyMessage: '暂无历史任务。',
      },
    ]

    return actionableOnly
      ? available.filter((item) => item.key === 'attention' || item.key === 'running')
      : available
  }, [actionableOnly, groups.attention, groups.history, groups.recentCompleted, groups.running])

  const defaultLane = useMemo(() => {
    const withContent = lanes.find((lane) => (
      lane.key === 'history' ? historyGroups.length > 0 : lane.jobs.length > 0
    ))
    return withContent?.key ?? lanes[0]?.key ?? 'attention'
  }, [historyGroups.length, lanes])

  const [activeLane, setActiveLane] = useState<LaneKey>(defaultLane)

  useEffect(() => {
    setActiveLane(defaultLane)
  }, [defaultLane])

  const currentLane = lanes.find((lane) => lane.key === activeLane) ?? lanes[0]

  return (
    <section className="control-room">
      <div className="control-room-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> Prompt Optimizer 控制室</span>
          <h2 className="control-room-title">任务控制室</h2>
          <p className="hero-lead">
            先处理要你决策的任务，再观察自动运行中的任务，然后查看最新结果或翻出同标题历史运行。
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

      <section className="control-board">
        <div className="lane-switcher" role="tablist" aria-label="控制板视图切换">
          {lanes.map((lane) => (
            <button
              key={lane.key}
              type="button"
              className={`lane-chip${activeLane === lane.key ? ' active' : ''}`}
              onClick={() => setActiveLane(lane.key)}
            >
              {lane.icon}
              <span>{lane.title}</span>
              <strong>{lane.key === 'history' ? historyGroups.length : lane.jobs.length}</strong>
            </button>
          ))}
        </div>

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {currentLane ? (
              <motion.div
                key={currentLane.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="lane-content"
              >
                {currentLane.key === 'history' ? (
                  <HistoryLane
                    title={currentLane.title}
                    description={currentLane.description}
                    icon={currentLane.icon}
                    groups={historyGroups}
                    query={historyQuery}
                    onQueryChange={setHistoryQuery}
                    expandedGroups={expandedHistoryGroups}
                    onToggleGroup={(groupKey) => setExpandedHistoryGroups((current) => ({
                      ...current,
                      [groupKey]: !current[groupKey],
                    }))}
                    emptyMessage={currentLane.emptyMessage}
                    onCopyPrompt={onCopyPrompt}
                  />
                ) : (
                  <DashboardLane
                    title={currentLane.title}
                    description={currentLane.description}
                    icon={currentLane.icon}
                    jobs={currentLane.jobs}
                    emptyMessage={currentLane.emptyMessage}
                    actionInFlight={actionInFlight}
                    onCopyPrompt={onCopyPrompt}
                    onResumeAuto={onResumeAuto}
                    onResumeStep={onResumeStep}
                    compact
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </LayoutGroup>
      </section>

      {!actionableOnly ? (
        <div className="control-room-secondary compact-secondary">
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
    </section>
  )
}

function HistoryLane({
  title,
  description,
  icon,
  groups,
  query,
  onQueryChange,
  expandedGroups,
  onToggleGroup,
  emptyMessage,
  onCopyPrompt,
}: {
  title: string
  description: string
  icon: React.ReactNode
  groups: HistoryGroupView[]
  query: string
  onQueryChange: (value: string) => void
  expandedGroups: Record<string, boolean>
  onToggleGroup: (groupKey: string) => void
  emptyMessage: string
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
}) {
  return (
    <section className="control-lane history-lane compact">
      <div className="lane-header">
        <div className="lane-heading">
          <span className="eyebrow">{icon}{title}</span>
          <h3 className="section-title">{title}</h3>
          <p className="small">{description}</p>
        </div>
        <label className="history-search" aria-label="搜索历史任务">
          <Search size={16} />
          <input
            className="input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索标题，例如：老中医"
          />
        </label>
      </div>

      <div className="history-stack">
        {groups.length === 0 ? <div className="notice">{query.trim() ? '没有匹配的历史任务。' : emptyMessage}</div> : null}
        {groups.map((group) => (
          <HistoryGroupCard
            key={group.key}
            group={group}
            expanded={Boolean(expandedGroups[group.key])}
            onToggle={() => onToggleGroup(group.key)}
            onCopyPrompt={onCopyPrompt}
          />
        ))}
      </div>
    </section>
  )
}

function HistoryGroupCard({
  group,
  expanded,
  onToggle,
  onCopyPrompt,
}: {
  group: HistoryGroupView
  expanded: boolean
  onToggle: () => void
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
}) {
  const latestJob = group.jobs[0]
  if (!latestJob) {
    return null
  }

  return (
    <motion.article layout className="history-group-card">
      <button type="button" className="history-group-toggle" onClick={onToggle}>
        <div className="history-group-summary">
          <div className="card-topline">
            <span className={`status ${latestJob.status}`}>{getJobStatusLabel(latestJob.status)}</span>
            <span className="meta">{group.jobs.length} 次运行</span>
          </div>
          <h3>{group.title}</h3>
          <p className="prompt-preview">{getPromptPreview(latestJob.latestPrompt, 120)}</p>
          <div className="card-metrics">
            <span>最近更新 {formatDate(latestJob.createdAt)}</span>
            <span>最新最佳 {latestJob.bestAverageScore.toFixed(2)}</span>
          </div>
        </div>
        <span className={`history-group-chevron${expanded ? ' expanded' : ''}`}>
          <ChevronDown size={18} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="history-run-list"
          >
            {group.jobs.map((job) => (
              <div className="history-run-row" key={job.id}>
                <div className="history-run-copy">
                  <div className="card-topline">
                    <span className={`status ${job.status}`}>{getJobStatusLabel(job.status)}</span>
                    <span className="meta">{formatDate(job.createdAt)}</span>
                  </div>
                  <div className="card-metrics compact-metrics">
                    <span>轮次 {job.currentRound}</span>
                    <span>最佳均分 {job.bestAverageScore.toFixed(2)}</span>
                    <span>模型 {job.optimizerModel}</span>
                  </div>
                </div>
                <div className="inline-actions secondary-actions">
                  {(job.status === 'completed' || job.status === 'manual_review' || job.status === 'paused') ? (
                    <button className="button ghost" type="button" onClick={() => void onCopyPrompt(job)}>
                      <Copy size={16} /> 复制
                    </button>
                  ) : null}
                  <Link href={`/jobs/${job.id}` as Route} className="button ghost">
                    详情 <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
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
      <p className="prompt-preview">{getPromptPreview(job.latestPrompt, subdued ? 96 : 140)}</p>
      <div className="card-metrics compact-metrics">
        <span>轮次 {job.currentRound}</span>
        <span>最佳均分 {job.bestAverageScore.toFixed(2)}</span>
      </div>
      <div className="card-metrics compact-metrics">
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
          {primary.kind === 'action' ? (
            <Link href={`/jobs/${job.id}${canAct ? '#next-round-steering' : ''}` as Route} className="button ghost">
              {canAct ? '编辑引导' : '详情'}
            </Link>
          ) : null}
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

function normalizeTitleQuery(value: string) {
  return value.replace(/\s+/g, '').trim().toLocaleLowerCase()
}
