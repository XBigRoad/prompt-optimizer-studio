'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus, SendHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { DashboardControlRoom } from '@/components/dashboard-control-room'
import { StudioFrame } from '@/components/studio-frame'
import { focusDashboardJobs, partitionDashboardJobs } from '@/lib/presentation'

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
  optimizerModel: string
  judgeModel: string
}

interface SettingsPayload {
  defaultOptimizerModel: string
  defaultJudgeModel: string
  conversationPolicy: 'stateless' | 'pooled-3x'
}

function createEmptyDraft(defaults?: SettingsPayload): DraftJob {
  return {
    id: crypto.randomUUID(),
    title: '',
    rawPrompt: '',
    optimizerModel: defaults?.defaultOptimizerModel ?? '',
    judgeModel: defaults?.defaultJudgeModel ?? '',
  }
}

export function DashboardShell() {
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({
    defaultOptimizerModel: '',
    defaultJudgeModel: '',
    conversationPolicy: 'stateless',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionableOnly, setActionableOnly] = useState(false)
  const [submissionExpanded, setSubmissionExpanded] = useState(false)
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
          throw new Error(jobsPayload.error ?? 'Failed to load jobs.')
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? 'Failed to load settings.')
        }

        if (!cancelled) {
          const nextDefaults = {
            defaultOptimizerModel: settingsPayload.settings.defaultOptimizerModel,
            defaultJudgeModel: settingsPayload.settings.defaultJudgeModel,
            conversationPolicy: settingsPayload.settings.conversationPolicy,
          }
          setJobs(jobsPayload.jobs)
          setSettings(nextDefaults)
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setDrafts((current) => current.map((draft, index) => (
            index === 0 && !draft.optimizerModel && !draft.judgeModel && !draft.rawPrompt && !draft.title
              ? createEmptyDraft(nextDefaults)
              : draft
          )))
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard.')
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
  }, [])

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
        optimizerModel: draft.optimizerModel.trim(),
        judgeModel: draft.judgeModel.trim(),
      }))
      .filter((draft) => draft.rawPrompt)

    if (payload.length === 0) {
      setError('至少填写一个初版提示词。')
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
        throw new Error(result.error ?? 'Failed to create jobs.')
      }
      setDrafts([createEmptyDraft(settings)])
      setJobs((current) => [...result.jobs, ...current])
      setError(null)
      setActionMessage('新任务已送入控制室。')
      setSubmissionExpanded(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create jobs.')
      setActionMessage(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLatestPrompt(job: JobRecord) {
    try {
      await navigator.clipboard.writeText(job.latestPrompt)
      setActionMessage(`已复制「${job.title}」的最新提示词。`)
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制失败。')
      setActionMessage(null)
    }
  }

  async function resumeStep(job: JobRecord) {
    setActionInFlight(`${job.id}:step`)
    try {
      const response = await fetch(`/api/jobs/${job.id}/resume-step`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Resume step failed.')
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(`「${job.title}」将继续一轮，完成后自动回到暂停。`)
      setError(null)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume step failed.')
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
        throw new Error(payload.error ?? 'Resume auto failed.')
      }
      setJobs((current) => current.map((item) => (item.id === job.id ? payload.job : item)))
      setActionMessage(`「${job.title}」已恢复自动运行。`)
      setError(null)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume auto failed.')
      setActionMessage(null)
    } finally {
      setActionInFlight(null)
    }
  }

  return (
    <main>
      <StudioFrame title="任务控制室" currentPath="/">
        <motion.div
          className="shell"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <DashboardControlRoom
            actionableOnly={actionableOnly}
            loading={loading}
            groups={controlRoomGroups}
            stats={controlRoomStats}
            actionInFlight={actionInFlight}
            onToggleActionableOnly={() => setActionableOnly((current) => !current)}
            onCopyPrompt={copyLatestPrompt}
            onResumeStep={resumeStep}
            onResumeAuto={resumeAuto}
          />

          <section className={`panel submission-station${submissionExpanded ? ' expanded' : ' collapsed'}`}>
            <div className="section-head">
              <div>
                <span className="eyebrow"><Plus size={16} /> 投递台</span>
                <h2 className="section-title">批量投递新任务</h2>
                <p className="small">先处理控制室，再按需展开录入新任务。</p>
              </div>
              <div className="button-row">
                <button className="button ghost" type="button" onClick={() => setSubmissionExpanded((current) => !current)}>
                  <ChevronDown size={16} className={submissionExpanded ? 'rotate-180' : ''} />
                  {submissionExpanded ? '收起投递台' : '展开投递台'}
                </button>
                {submissionExpanded ? (
                  <>
                    <button className="button ghost" type="button" onClick={() => setDrafts((current) => [...current, createEmptyDraft(settings)])}>
                      新增一条
                    </button>
                    <button className="button primary-action" type="button" onClick={submitJobs} disabled={submitting}>
                      <SendHorizontal size={16} /> {submitting ? '提交中...' : '提交到队列'}
                    </button>
                  </>
                ) : (
                  <button className="button primary-action" type="button" onClick={() => setSubmissionExpanded(true)}>
                    <Plus size={16} /> 新增任务
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
                  <datalist id="cpamc-model-aliases">
                    {models.map((model) => <option key={model.id} value={model.id} />)}
                  </datalist>
                  <div className="panel-grid">
                    {drafts.map((draft, index) => (
                      <div className="draft-card control-card subdued" key={draft.id}>
                        <div className="card-topline">
                          <span className="status pending">草稿 {index + 1}</span>
                        </div>
                        <label className="label">
                          标题
                          <input className="input" value={draft.title} onChange={(event) => updateDraft(setDrafts, draft.id, 'title', event.target.value)} placeholder="例如：医疗分诊控制台" />
                        </label>
                        <label className="label">
                          优化模型别名
                          <input className="input" list="cpamc-model-aliases" value={draft.optimizerModel} onChange={(event) => updateDraft(setDrafts, draft.id, 'optimizerModel', event.target.value)} placeholder={settings.defaultOptimizerModel || '例如：gpt-5.2'} />
                        </label>
                        <label className="label">
                          裁判模型别名
                          <input className="input" list="cpamc-model-aliases" value={draft.judgeModel} onChange={(event) => updateDraft(setDrafts, draft.id, 'judgeModel', event.target.value)} placeholder={settings.defaultJudgeModel || '例如：gpt-5.2'} />
                        </label>
                        <label className="label">
                          初版提示词
                          <textarea className="textarea" value={draft.rawPrompt} onChange={(event) => updateDraft(setDrafts, draft.id, 'rawPrompt', event.target.value)} placeholder="贴入一句话需求、初版 prompt，或待优化长提示词。" />
                        </label>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {actionMessage ? <div className="notice success">{actionMessage}</div> : null}
            {error ? <div className="notice error">{error}</div> : null}
          </section>
        </motion.div>
      </StudioFrame>
    </main>
  )
}

function updateDraft(
  setDrafts: React.Dispatch<React.SetStateAction<DraftJob[]>>,
  draftId: string,
  field: keyof Omit<DraftJob, 'id'>,
  value: string,
) {
  setDrafts((current) => current.map((draft) => (draft.id === draftId ? { ...draft, [field]: value } : draft)))
}
