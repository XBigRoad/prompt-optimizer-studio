import type { Route } from 'next'
import Link from 'next/link'
import * as Accordion from '@radix-ui/react-accordion'
import * as Tabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  formatRunCount,
  getConversationPolicyLabel,
  getJobDisplayError,
  getJobStatusLabel,
  getPromptPreview,
  groupHistoryJobsByTitle,
} from '@/lib/presentation'
import { useI18n, useLocaleText } from '@/lib/i18n'

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

type LaneKey = 'attention' | 'running' | 'recent-completed' | 'queued'

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
  middleSlot,
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
  middleSlot?: React.ReactNode
}) {
  const [historyQuery, setHistoryQuery] = useState('')
  const [expandedHistoryGroups, setExpandedHistoryGroups] = useState<string[]>([])
  const { locale } = useI18n()
  const text = useLocaleText()

  const historyGroups = useMemo(() => {
    const normalizedQuery = normalizeTitleQuery(historyQuery)
    return groupHistoryJobsByTitle(groups.history).filter((group) => (
      normalizedQuery.length === 0 || normalizeTitleQuery(group.title).includes(normalizedQuery)
    ))
  }, [groups.history, historyQuery])

  const lanes = useMemo(() => {
    const available: Array<{
      key: LaneKey
      title: string
      description: string
      icon: React.ReactNode
      jobs: DashboardJobView[]
      emptyMessage: string
    }> = [
      {
        key: 'attention' as const,
        title: text('待你处理', 'Need your decision'),
        description: text('这些任务需要你判断是否继续自动跑，或先加人工引导再推进。', 'These jobs need your decision before the next round. Add steering first if you want to correct the direction.'),
        icon: <AlertTriangle size={18} />,
        jobs: groups.attention,
        emptyMessage: text('当前没有需要你立即处理的任务。', 'Nothing needs your decision right now.'),
      },
      {
        key: 'running' as const,
        title: text('自动运行中', 'Running automatically'),
        description: text('这些任务已经在跑，先观察结果，不要同时给自己制造额外噪音。', 'These jobs are already running. Observe first and avoid adding extra noise.'),
        icon: <Activity size={18} />,
        jobs: groups.running,
        emptyMessage: text('当前没有自动运行中的任务。', 'No jobs are running automatically right now.'),
      },
      {
        key: 'recent-completed' as const,
        title: text('最新结果', 'Latest results'),
        description: text('最近完成的结果与历史运行记录，方便你直接回到最有价值的产出。', 'Recent results and grouped history, so you can jump back to the most valuable output quickly.'),
        icon: <CheckCircle2 size={18} />,
        jobs: groups.recentCompleted,
        emptyMessage: text('最近还没有完成结果。', 'No completed results yet.'),
      },
      {
        key: 'queued' as const,
        title: text('排队中', 'Queued'),
        description: text('已入队但还没进入自动优化。优先保证你能一屏聚焦当前焦点。', 'Queued jobs have not started yet. Keep the current focus visible on one screen first.'),
        icon: <Clock3 size={18} />,
        jobs: groups.queued,
        emptyMessage: text('当前没有排队中的任务。', 'No queued jobs right now.'),
      },
    ]

    return actionableOnly
      ? available.filter((item) => item.key === 'attention' || item.key === 'running')
      : available
  }, [actionableOnly, groups.attention, groups.queued, groups.recentCompleted, groups.running])

  const defaultLane = useMemo(() => {
    if (lanes.some((lane) => lane.key === 'attention' && lane.jobs.length > 0)) {
      return 'attention'
    }
    if (lanes.some((lane) => lane.key === 'running' && lane.jobs.length > 0)) {
      return 'running'
    }
    if (lanes.some((lane) => lane.key === 'recent-completed' && (lane.jobs.length > 0 || historyGroups.length > 0))) {
      return 'recent-completed'
    }
    if (lanes.some((lane) => lane.key === 'queued' && lane.jobs.length > 0)) {
      return 'queued'
    }

    return lanes[0]?.key ?? 'attention'
  }, [historyGroups.length, lanes])

  const [activeLane, setActiveLane] = useState<LaneKey>(defaultLane)

  useEffect(() => {
    setActiveLane(defaultLane)
  }, [defaultLane])

  return (
    <section className="control-room">
      <div className="control-room-hero">
        <div className="hero-copy">
          <h2 className="control-room-title">{text('任务控制室', 'Job Control Room')}</h2>
          <p className="hero-lead">
            {text('先处理要你决策的任务，再观察自动运行中的任务，然后查看最新结果或翻出同标题历史运行。', 'Handle the jobs that need your decision first, then watch the running jobs, then review results or grouped history.')}
          </p>
          <div className="button-row">
            <button
              className={`button control-toggle${actionableOnly ? ' active' : ''}`}
              type="button"
              onClick={onToggleActionableOnly}
            >
              {actionableOnly ? text('恢复完整看板', 'Show full board') : text('只看我现在要处理的', 'Only show what needs me now')}
            </button>
          </div>
        </div>
        <div className="summary-cluster">
          <SummaryCard icon={<AlertTriangle size={18} />} label={text('待你处理', 'Need your decision')} value={stats.attention} tone="manual_review" />
          <SummaryCard icon={<Activity size={18} />} label={text('自动运行中', 'Running automatically')} value={stats.running} tone="running" />
          <SummaryCard icon={<CheckCircle2 size={18} />} label={text('最新结果', 'Latest results')} value={stats.recentCompleted} tone="completed" />
          <SummaryCard icon={<History size={18} />} label={text('历史任务', 'History')} value={stats.history} tone="pending" />
        </div>
      </div>

      {loading ? <div className="notice">{text('正在读取控制室数据...', 'Loading control room data...')}</div> : null}

      {middleSlot}

      <section className="control-board">
        <Tabs.Root value={activeLane} onValueChange={(next) => setActiveLane(next as LaneKey)} className="control-tabs">
          <Tabs.List className="control-tabs-list" aria-label={text('控制板视图切换', 'Switch control-board views')}>
            {lanes.map((lane) => (
              <Tabs.Trigger
                key={lane.key}
                value={lane.key}
                className="control-tabs-trigger"
                data-lane={lane.key}
              >
                {lane.icon}
                <span>{lane.title}</span>
                <strong>{lane.jobs.length}</strong>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {lanes.map((lane) => (
            <Tabs.Content key={lane.key} value={lane.key} className="control-tabs-content">
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="lane-content"
              >
                {lane.key === 'recent-completed' ? (
                  <div className="latest-results-grid" data-ui="latest-results-grid">
                    <DashboardLane
                      title={text('最近完成', 'Recently completed')}
                      description={lane.description}
                      jobs={lane.jobs}
                      emptyMessage={lane.emptyMessage}
                      actionInFlight={actionInFlight}
                      onCopyPrompt={onCopyPrompt}
                      onResumeAuto={onResumeAuto}
                      onResumeStep={onResumeStep}
                      compact
                      dataUi="recent-results-column"
                    />
                    <HistoryLane
                      title={text('历史任务', 'History')}
                      description={text('把旧任务按标题归拢，先搜名字，再展开具体运行记录。', 'Group older jobs by title. Search by name first, then expand the specific runs.')}
                      groups={historyGroups}
                      query={historyQuery}
                      onQueryChange={setHistoryQuery}
                      expandedGroups={expandedHistoryGroups}
                      onExpandedGroupsChange={setExpandedHistoryGroups}
                      emptyMessage={text('暂无历史任务。', 'No history yet.')}
                      onCopyPrompt={onCopyPrompt}
                      dataUi="history-results-column"
                    />
                  </div>
                ) : (
                  <DashboardLane
                    title={undefined}
                    description={lane.description}
                    jobs={lane.jobs}
                    emptyMessage={lane.emptyMessage}
                    actionInFlight={actionInFlight}
                    onCopyPrompt={onCopyPrompt}
                    onResumeAuto={onResumeAuto}
                    onResumeStep={onResumeStep}
                    compact
                  />
                )}
              </motion.div>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>
    </section>
  )
}

function DashboardLane({
  title,
  description,
  jobs,
  emptyMessage,
  actionInFlight,
  onCopyPrompt,
  onResumeAuto,
  onResumeStep,
  compact = false,
  dataUi,
}: {
  title?: string
  description: string
  jobs: DashboardJobView[]
  emptyMessage: string
  actionInFlight: string | null
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
  onResumeAuto: (job: DashboardJobView) => Promise<void>
  onResumeStep: (job: DashboardJobView) => Promise<void>
  compact?: boolean
  dataUi?: string
}) {
  return (
    <section className={`control-lane${compact ? ' compact' : ''}`} data-ui={dataUi}>
      <div className="lane-header">
        <div className="lane-heading">
          {title ? <h3 className="section-title">{title}</h3> : null}
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
  groups,
  query,
  onQueryChange,
  expandedGroups,
  onExpandedGroupsChange,
  emptyMessage,
  onCopyPrompt,
  dataUi,
}: {
  title: string
  description: string
  groups: HistoryGroupView[]
  query: string
  onQueryChange: (value: string) => void
  expandedGroups: string[]
  onExpandedGroupsChange: (value: string[]) => void
  emptyMessage: string
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
  dataUi?: string
}) {
  const text = useLocaleText()

  return (
    <section className="control-lane history-lane compact" data-ui={dataUi}>
      <div className="lane-header">
        <div className="lane-heading">
          <h3 className="section-title">{title}</h3>
          <p className="small">{description}</p>
        </div>
      </div>
      <div className="history-lane-toolbar">
        <label className="history-search" aria-label={text('搜索历史任务', 'Search history jobs')}>
          <Search size={16} />
          <input
            className="input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={text('搜索标题，例如：老中医', 'Search titles, for example: Old TCM')}
          />
        </label>
      </div>

      <div className="history-stack">
        {groups.length === 0 ? <div className="notice">{query.trim() ? text('没有匹配的历史任务。', 'No matching history jobs.') : emptyMessage}</div> : null}
        {groups.length > 0 ? (
          <Accordion.Root
            type="multiple"
            value={expandedGroups}
            onValueChange={onExpandedGroupsChange}
            className="history-accordion"
          >
            {groups.map((group) => (
              <HistoryGroupCard
                key={group.key}
                group={group}
                onCopyPrompt={onCopyPrompt}
              />
            ))}
          </Accordion.Root>
        ) : null}
      </div>
    </section>
  )
}

function HistoryGroupCard({
  group,
  onCopyPrompt,
}: {
  group: HistoryGroupView
  onCopyPrompt: (job: DashboardJobView) => Promise<void>
}) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const latestJob = group.jobs[0]
  if (!latestJob) {
    return null
  }

  return (
    <Accordion.Item value={group.key} className="history-group-card">
      <Accordion.Header className="history-group-header">
        <Accordion.Trigger type="button" className="history-group-toggle">
          <div className="history-group-summary">
            <div className="card-topline">
              <span className={`status ${latestJob.status}`}>{getJobStatusLabel(latestJob.status, locale)}</span>
              <span className="meta">{formatRunCount(group.jobs.length, locale)}</span>
            </div>
            <h3>{group.title}</h3>
            <p className="prompt-preview">{getPromptPreview(latestJob.latestPrompt, 120)}</p>
            <div className="card-metrics">
              <span>{text('最近更新', 'Updated')} {formatDate(latestJob.createdAt, locale)}</span>
              <span>{text('最新最佳', 'Best')} {latestJob.bestAverageScore.toFixed(2)}</span>
            </div>
          </div>
          <span className="history-group-chevron">
            <ChevronDown size={18} />
          </span>
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content className="history-run-list">
        <div className="history-run-list-inner">
          {group.jobs.map((job) => (
            <div className="history-run-row" key={job.id}>
              <div className="history-run-copy">
                <div className="card-topline">
                  <span className={`status ${job.status}`}>{getJobStatusLabel(job.status, locale)}</span>
                  <span className="meta">{formatDate(job.createdAt, locale)}</span>
                </div>
                <div className="card-metrics compact-metrics">
                  <span>{text('轮次', 'Round')} {job.currentRound}</span>
                  <span>{text('最佳均分', 'Best avg')} {job.bestAverageScore.toFixed(2)}</span>
                  <span>{text('模型', 'Model')} {job.optimizerModel}</span>
                </div>
              </div>
              <div className="inline-actions secondary-actions">
                {(job.status === 'completed' || job.status === 'manual_review' || job.status === 'paused') ? (
                  <button className="button ghost" type="button" onClick={() => void onCopyPrompt(job)}>
                    <Copy size={16} /> {text('复制', 'Copy')}
                  </button>
                ) : null}
                <Link href={`/jobs/${job.id}` as Route} className="button ghost">
                  {text('详情', 'Details')} <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
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
  const { locale } = useI18n()
  const text = useLocaleText()
  const canAct = job.status === 'manual_review' || job.status === 'paused'
  const secondaryLink =
    job.status === 'completed'
      ? {
          href: `/jobs/${job.id}`,
          label: text('详情', 'Details'),
        }
      : canAct
        ? {
            href: `/jobs/${job.id}#next-round-steering`,
            label: text('编辑引导', 'Edit steering'),
          }
        : null
  const primary:
    | { kind: 'link'; label: string; href: string }
    | { kind: 'action'; label: string; action: () => void; pending: boolean } =
    job.status === 'manual_review' || job.status === 'paused'
      ? { kind: 'action', label: text('继续一轮', 'Run one round'), action: () => void onResumeStep(job), pending: actionInFlight === `${job.id}:step` }
      : job.status === 'completed'
        ? { kind: 'action', label: text('复制最新提示词', 'Copy latest prompt'), action: () => void onCopyPrompt(job), pending: false }
        : { kind: 'link', label: text('打开详情', 'Open details'), href: `/jobs/${job.id}` }
  const hasFooterSecondaryActions = canAct || (primary.kind === 'action' && job.status !== 'completed')

  return (
    <motion.article layout className={`control-card${subdued ? ' subdued' : ''} tone-${job.status}`}>
      <div className="card-topline">
        <span className={`status ${job.status}`}>{getJobStatusLabel(job.status, locale)}</span>
        <span className="meta">{formatDate(job.createdAt, locale)}</span>
      </div>
      <div className="card-heading-row">
        <h3>{job.title}</h3>
        {secondaryLink ? (
          <Link href={secondaryLink.href as Route} className="card-inline-link" data-ui="card-secondary-link">
            <span>{secondaryLink.label}</span>
            <ChevronRight size={14} />
          </Link>
        ) : null}
      </div>
      <p className="prompt-preview">{getPromptPreview(job.latestPrompt, subdued ? 96 : 140)}</p>
      <div className="card-metrics compact-metrics">
        <span>{text('轮次', 'Round')} {job.currentRound}</span>
        <span>{text('最佳均分', 'Best avg')} {job.bestAverageScore.toFixed(2)}</span>
      </div>
      <div className="card-metrics compact-metrics">
        <span>{text('模型', 'Model')} {job.optimizerModel}</span>
        <span>{getConversationPolicyLabel(job.conversationPolicy, locale)}</span>
      </div>
      {getJobDisplayError(job.errorMessage, locale) ? <div className="notice error">{getJobDisplayError(job.errorMessage, locale)}</div> : null}
      <div className="card-actions">
        {primary.kind === 'link' ? (
          <Link href={primary.href as Route} className="button primary-action">
            {primary.label} <ChevronRight size={16} />
          </Link>
        ) : (
          <button className="button primary-action" type="button" onClick={primary.action} disabled={primary.pending}>
            {primary.pending ? text('处理中...', 'Working...') : primary.label}
          </button>
        )}
        {hasFooterSecondaryActions ? (
          <div className="inline-actions secondary-actions">
            {canAct ? (
              <button className="button ghost" type="button" onClick={() => void onResumeAuto(job)} disabled={actionInFlight === `${job.id}:auto`}>
                <PlayCircle size={16} /> {actionInFlight === `${job.id}:auto` ? text('处理中...', 'Working...') : text('自动运行', 'Run automatically')}
              </button>
            ) : null}
            {primary.kind === 'action' && job.status !== 'completed' ? (
              <button className="button ghost" type="button" onClick={() => void onCopyPrompt(job)}>
                <Copy size={16} /> {text('复制', 'Copy')}
              </button>
            ) : null}
          </div>
        ) : null}
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
      <div className="summary-top">
        <div className="summary-icon">{icon}</div>
        <div className="summary-label">{label}</div>
      </div>
      <div className="summary-value">{value}</div>
    </div>
  )
}

function formatDate(value: string, locale: 'zh-CN' | 'en' = 'zh-CN') {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeTitleQuery(value: string) {
  return value.replace(/\s+/g, '').trim().toLocaleLowerCase()
}
