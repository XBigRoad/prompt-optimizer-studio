'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus, SendHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { DashboardControlRoom } from '@/components/dashboard-control-room'
import { ModelAliasCombobox } from '@/components/ui/model-alias-combobox'
import { SelectField } from '@/components/ui/select-field'
import { StudioFrame } from '@/components/studio-frame'
import { useI18n, useLocaleText } from '@/lib/i18n'
import { focusDashboardJobs, getJobDisplayError, partitionDashboardJobs } from '@/lib/presentation'
import { createRandomId } from '@/lib/random-id'
import { buildReasoningEffortOptions, type ReasoningEffort } from '@/lib/reasoning-effort'

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'

interface JobRecord {
  id: string
  title: string
  status: JobStatus
  currentRound: number
  bestAverageScore: number
  latestPrompt: string
  errorMessage: string | null
  createdAt: string
  conversationPolicy: 'stateless' | 'pooled-3x'
  optimizerModel: string
  judgeModel: string
}

interface ModelOption {
  id: string
  label: string
}

interface DraftJob {
  id: string
  title: string
  rawPrompt: string
  taskModel: string
  reasoningEffort: ReasoningEffort
  customRubricMd: string
}

interface SettingsPayload {
  defaultOptimizerModel: string
  defaultJudgeModel: string
  defaultOptimizerReasoningEffort: ReasoningEffort
  defaultJudgeReasoningEffort: ReasoningEffort
  conversationPolicy: 'stateless' | 'pooled-3x'
}

interface DashboardShellProps {
  initialSubmissionExpanded?: boolean
}

function createEmptyDraft(defaults?: SettingsPayload): DraftJob {
  const defaultTaskModel = (defaults?.defaultOptimizerModel || defaults?.defaultJudgeModel || '').trim()
  return {
    id: createRandomId('draft'),
    title: '',
    rawPrompt: '',
    taskModel: defaultTaskModel,
    reasoningEffort: defaults?.defaultOptimizerReasoningEffort ?? defaults?.defaultJudgeReasoningEffort ?? 'default',
    customRubricMd: '',
  }
}

export function DashboardShell({ initialSubmissionExpanded = true }: DashboardShellProps = {}) {
  const text = useLocaleText()
  const { locale } = useI18n()
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const reasoningEffortOptions = useMemo(() => buildReasoningEffortOptions(locale), [locale])
  const [settings, setSettings] = useState<SettingsPayload>({
    defaultOptimizerModel: '',
    defaultJudgeModel: '',
    defaultOptimizerReasoningEffort: 'default',
    defaultJudgeReasoningEffort: 'default',
    conversationPolicy: 'stateless',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionableOnly, setActionableOnly] = useState(false)
  const [submissionExpanded, setSubmissionExpanded] = useState(initialSubmissionExpanded)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftJob[]>([createEmptyDraft()])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [jobsResponse, settingsResponse, modelsResponse] = await Promise.all([
          fetch('/api/jobs', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
        ])
        const jobsPayload = await jobsResponse.json()
        const settingsPayload = await settingsResponse.json()
        const modelsPayload = await modelsResponse.json()

        if (!jobsResponse.ok) {
          throw new Error(jobsPayload.error ?? text('任务列表加载失败。', 'Failed to load jobs.'))
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? text('设置加载失败。', 'Failed to load settings.'))
        }

        if (!cancelled) {
          const nextDefaults = {
            defaultOptimizerModel: settingsPayload.settings.defaultOptimizerModel,
            defaultJudgeModel: settingsPayload.settings.defaultJudgeModel,
            defaultOptimizerReasoningEffort: settingsPayload.settings.defaultOptimizerReasoningEffort ?? 'default',
            defaultJudgeReasoningEffort: settingsPayload.settings.defaultJudgeReasoningEffort ?? 'default',
            conversationPolicy: settingsPayload.settings.conversationPolicy,
          }
          setJobs(jobsPayload.jobs)
          setSettings(nextDefaults)
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setDrafts((current) => current.map((draft, index) => (
            index === 0 && !draft.taskModel && !draft.rawPrompt && !draft.title
              ? createEmptyDraft(nextDefaults)
              : draft
          )))
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : text('控制室加载失败。', 'Failed to load dashboard.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = setInterval(() => {
      void load()
    }, 3000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [text])

  const groupedJobs = useMemo(() => partitionDashboardJobs(jobs), [jobs])
  const visibleGroups = useMemo(() => focusDashboardJobs(groupedJobs, actionableOnly), [groupedJobs, actionableOnly])
  const controlRoomGroups = useMemo(() => ({
    attention: visibleGroups.active.filter((job) => job.status === 'manual_review' || job.status === 'paused'),
    running: visibleGroups.active.filter((job) => job.status === 'running'),
    queued: visibleGroups.queued,
    recentCompleted: visibleGroups.recentCompleted,
    history: visibleGroups.history,
  }), [visibleGroups])
  const controlRoomStats = useMemo(() => ({
    attention: groupedJobs.active.filter((job) => job.status === 'manual_review' || job.status === 'paused').length,
    running: groupedJobs.active.filter((job) => job.status === 'running').length,
    queued: groupedJobs.queued.length,
    recentCompleted: groupedJobs.recentCompleted.length,
    history: groupedJobs.history.length,
  }), [groupedJobs])

  async function submitJobs() {
    const payload = drafts
      .map((draft) => ({
        title: draft.title.trim(),
        rawPrompt: draft.rawPrompt.trim(),
        optimizerModel: draft.taskModel.trim(),
        judgeModel: draft.taskModel.trim(),
        optimizerReasoningEffort: draft.reasoningEffort,
        judgeReasoningEffort: draft.reasoningEffort,
        customRubricMd: draft.customRubricMd.trim() || undefined,
      }))
      .filter((draft) => draft.rawPrompt)

    if (payload.length === 0) {
      setError(text('至少填写一个初版提示词。', 'Add at least one initial prompt.'))
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: payload }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? text('创建任务失败。', 'Failed to create jobs.'))
      }
      setDrafts([createEmptyDraft(settings)])
      setJobs((current) => [...result.jobs, ...current])
      setError(null)
      setActionMessage(text('新任务已送入控制室。', 'New jobs were sent to the control room.'))
      setSubmissionExpanded(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : text('创建任务失败。', 'Failed to create jobs.'))
      setActionMessage(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLatestPrompt(job: JobRecord) {
    try {
      await navigator.clipboard.writeText(job.latestPrompt)
      setActionMessage(text(`已复制「${job.title}」的最新提示词。`, `Copied the latest prompt from "${job.title}".`))
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : text('复制失败。', 'Copy failed.'))
      setActionMessage(null)
    }
  }

  async function resumeStep(job: JobRecord) {
    setActionInFlight(`${job.id}:step`)
    try {
      const response = await fetch(`/api/jobs/${job.id}/resume-step`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('继续一轮失败。', 'Resume step failed.'))
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(text(`「${job.title}」将继续一轮，完成后自动回到暂停。`, `"${job.title}" will run one more round and pause again after it finishes.`))
      setError(null)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : text('继续一轮失败。', 'Resume step failed.'))
      setActionMessage(null)
    } finally {
      setActionInFlight(null)
    }
  }

  async function resumeAuto(job: JobRecord) {
    setActionInFlight(`${job.id}:auto`)
    try {
      const response = await fetch(`/api/jobs/${job.id}/resume-auto`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('恢复自动运行失败。', 'Resume auto failed.'))
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(text(`「${job.title}」已恢复自动运行。`, `"${job.title}" resumed automatic execution.`))
      setError(null)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : text('恢复自动运行失败。', 'Resume auto failed.'))
      setActionMessage(null)
    } finally {
      setActionInFlight(null)
    }
  }

  async function completeTask(job: JobRecord) {
    setActionInFlight(`${job.id}:complete`)
    try {
      const response = await fetch(`/api/jobs/${job.id}/complete`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('完成并归档失败。', 'Complete and archive failed.'))
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(text(`「${job.title}」已完成并归档。`, `"${job.title}" was completed and archived.`))
      setError(null)
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : text('完成并归档失败。', 'Complete and archive failed.'))
      setActionMessage(null)
    } finally {
      setActionInFlight(null)
    }
  }

  async function retryJob(job: JobRecord) {
    setActionInFlight(`${job.id}:retry`)
    try {
      const response = await fetch(`/api/jobs/${job.id}/retry`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? text('重新开始失败。', 'Restart failed.'))
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(text(`「${job.title}」已重新开始。`, `"${job.title}" restarted from the beginning.`))
      setError(null)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : text('重新开始失败。', 'Restart failed.'))
      setActionMessage(null)
    } finally {
      setActionInFlight(null)
    }
  }

  const submissionStation = (
	      <section className={`panel submission-station${submissionExpanded ? ' expanded' : ' collapsed'}`}>
	            <div className="section-head">
	              <div>
	                <span className="eyebrow"><Plus size={16} /> {text('投递台', 'Submission station')}</span>
	                <h2 className="section-title">
	                  {submissionExpanded ? text('批量投递新任务', 'Submit new jobs') : text('投递新任务', 'Submit a new job')}
	                </h2>
	                {submissionExpanded ? (
	                  <p className="small">{text('需要时再展开即可，不必占满首屏。', 'Expand only when you need to submit new work.')}</p>
	                ) : null}
	              </div>
	              <div className="button-row">
	                {submissionExpanded ? (
	                  <>
	                    <button className="button ghost" type="button" onClick={() => setSubmissionExpanded(false)}>
	                      <ChevronDown size={16} className="rotate-180" />
	                      {text('收起投递台', 'Collapse submission')}
	                    </button>
	                    <button className="button ghost" type="button" onClick={() => setDrafts((current) => [...current, createEmptyDraft(settings)])}>
	                      {text('新增一条', 'Add another')}
	                    </button>
	                    <button className="button primary-action" type="button" onClick={submitJobs} disabled={submitting}>
	                      <SendHorizontal size={16} /> {submitting ? text('提交中...', 'Submitting...') : text('提交到队列', 'Send to queue')}
	                    </button>
	                  </>
	                ) : (
	                  <button className="button primary-action" type="button" onClick={() => setSubmissionExpanded(true)}>
	                    <Plus size={16} /> {text('新增任务', 'New job')}
	                  </button>
	                )}
	              </div>
	            </div>

            <AnimatePresence initial={false}>
              {submissionExpanded ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="submission-body"
                >
                  <div className="panel-grid">
                    {drafts.map((draft, index) => (
                      <div className="draft-card control-card subdued" key={draft.id}>
                        <div className="card-topline">
                          <span className="status pending">{text('草稿', 'Draft')} {index + 1}</span>
                        </div>
                        <label className="label">
                          {text('标题', 'Title')}
                          <input className="input" value={draft.title} onChange={(event) => updateDraft(setDrafts, draft.id, 'title', event.target.value)} placeholder={text('例如：医疗分诊控制台', 'For example: medical triage console')} />
                        </label>
                        <ModelAliasCombobox
                          inputId={`draft-${draft.id}-task-model`}
                          label={text('任务模型', 'Task model')}
                          value={draft.taskModel}
                          options={models}
                          placeholder={settings.defaultOptimizerModel || settings.defaultJudgeModel || text('例如：gpt-5.2', 'For example: gpt-5.2')}
                          disabled={submitting}
                          onChange={(next) => updateDraft(setDrafts, draft.id, 'taskModel', next)}
                        />
                        <SelectField
                          label={text('推理强度', 'Reasoning effort')}
                          value={draft.reasoningEffort}
                          options={reasoningEffortOptions}
                          disabled={submitting}
                          onChange={(next) => updateDraft(setDrafts, draft.id, 'reasoningEffort', next)}
                        />
                        <label className="label">
                          {text('初版提示词', 'Initial prompt')}
                          <textarea className="textarea" value={draft.rawPrompt} onChange={(event) => updateDraft(setDrafts, draft.id, 'rawPrompt', event.target.value)} placeholder={text('贴入一句话需求、初版 prompt，或待优化长提示词。', 'Paste a one-line need, an initial prompt, or a longer prompt that needs optimization.')} />
                        </label>
                        <details className="fold-card">
                          <summary>{text('这条任务的评分标准', 'Scoring standard for this job')}</summary>
                          <p className="small">{text('留空则跟随配置台里的全局评分标准。只会影响这条新任务。', 'Leave empty to follow the global scoring standard from settings. It only affects this new job.')}</p>
                          <label className="label">
                            {text('任务级评分标准覆写', 'Task-level scoring override')}
                            <textarea
                              className="textarea"
                              rows={6}
                              value={draft.customRubricMd}
                              onChange={(event) => updateDraft(setDrafts, draft.id, 'customRubricMd', event.target.value)}
                              placeholder={text('可选：为这条任务单独写一份评分标准。', 'Optional: write a separate scoring standard for this job.')}
                            />
                          </label>
                        </details>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {actionMessage ? <div className="notice success">{actionMessage}</div> : null}
            {error ? <div className="notice error">{getJobDisplayError(error, locale) ?? error}</div> : null}
    </section>
  )

  return (
    <main>
      <StudioFrame title={text('任务控制室', 'Job Control Room')} currentPath="/">
        <motion.div
          className="shell"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <DashboardControlRoom
            actionableOnly={actionableOnly}
            loading={loading}
            middleSlot={submissionStation}
            groups={controlRoomGroups}
            stats={controlRoomStats}
            actionInFlight={actionInFlight}
            onToggleActionableOnly={() => setActionableOnly((current) => !current)}
            onCopyPrompt={copyLatestPrompt}
            onCompleteTask={completeTask}
            onResumeStep={resumeStep}
            onResumeAuto={resumeAuto}
            onRetry={retryJob}
          />
        </motion.div>
      </StudioFrame>
    </main>
  )
}

function updateDraft(
  setDrafts: Dispatch<SetStateAction<DraftJob[]>>,
  draftId: string,
  field: keyof Omit<DraftJob, 'id'>,
  value: string,
) {
  setDrafts((current) => current.map((draft) => (draft.id === draftId ? { ...draft, [field]: value } : draft)))
}
