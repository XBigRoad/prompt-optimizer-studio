'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import { JobDetailControlRoom, type JobDetailViewModel } from '@/components/job-detail-control-room'
import { type RoundCandidateView } from '@/components/job-round-card'
import { getTaskModelLabel, resolveLatestFullPrompt } from '@/lib/presentation'

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
type JobRunMode = 'auto' | 'step'

interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
}

interface Candidate extends RoundCandidateView {
  judges: JudgeRun[]
}

interface ModelOption {
  id: string
  label: string
}

interface SettingsPayload {
  maxRounds: number
}

interface JobDetailPayload {
  job: {
    id: string
    title: string
    rawPrompt: string
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
    status: JobStatus
    runMode: JobRunMode
    currentRound: number
    bestAverageScore: number
    maxRoundsOverride: number | null
    passStreak: number
    lastReviewScore: number
    errorMessage: string | null
    conversationPolicy: 'stateless' | 'pooled-3x'
  }
  candidates: Candidate[]
}

export function JobDetailShell({ jobId }: { jobId: string }) {
  const [detail, setDetail] = useState<JobDetailPayload | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({ maxRounds: 8 })
  const [taskModel, setTaskModel] = useState('')
  const [maxRoundsOverrideValue, setMaxRoundsOverrideValue] = useState('')
  const [nextRoundInstruction, setNextRoundInstruction] = useState('')
  const [goalAnchorGoal, setGoalAnchorGoal] = useState('')
  const [goalAnchorDeliverable, setGoalAnchorDeliverable] = useState('')
  const [goalAnchorDriftGuardText, setGoalAnchorDriftGuardText] = useState('')
  const [modelDirty, setModelDirty] = useState(false)
  const [maxRoundsDirty, setMaxRoundsDirty] = useState(false)
  const [steeringDirty, setSteeringDirty] = useState(false)
  const [goalAnchorDirty, setGoalAnchorDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [savingModels, setSavingModels] = useState(false)
  const [savingMaxRounds, setSavingMaxRounds] = useState(false)
  const [savingSteering, setSavingSteering] = useState(false)
  const [savingGoalAnchor, setSavingGoalAnchor] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resumingStep, setResumingStep] = useState(false)
  const [resumingAuto, setResumingAuto] = useState(false)
  const [copyingPrompt, setCopyingPrompt] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      try {
        const [detailResponse, modelsResponse, settingsResponse] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
        ])
        const detailPayload = await detailResponse.json()
        const modelsPayload = await modelsResponse.json()
        const settingsPayload = await settingsResponse.json()
        if (!detailResponse.ok) {
          throw new Error(detailPayload.error ?? 'Failed to load job detail.')
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? 'Failed to load settings.')
        }
        if (!cancelled) {
          setDetail(detailPayload)
          setSettings({ maxRounds: settingsPayload.settings.maxRounds })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load job detail.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    timer = setInterval(() => void load(), 3000)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [jobId])

  useEffect(() => {
    if (!detail || modelDirty) return
    setTaskModel(detail.job.pendingOptimizerModel ?? detail.job.optimizerModel)
  }, [detail, modelDirty])

  useEffect(() => {
    if (!detail || maxRoundsDirty) return
    setMaxRoundsOverrideValue(detail.job.maxRoundsOverride === null ? '' : String(detail.job.maxRoundsOverride))
  }, [detail, maxRoundsDirty])

  useEffect(() => {
    if (!detail || steeringDirty) return
    setNextRoundInstruction(detail.job.nextRoundInstruction ?? '')
  }, [detail, steeringDirty])

  useEffect(() => {
    if (!detail || goalAnchorDirty) return
    setGoalAnchorGoal(detail.job.goalAnchor.goal)
    setGoalAnchorDeliverable(detail.job.goalAnchor.deliverable)
    setGoalAnchorDriftGuardText(detail.job.goalAnchor.driftGuard.join('\n'))
  }, [detail, goalAnchorDirty])

  const model = useMemo<JobDetailViewModel | null>(() => {
    if (!detail) return null
    return {
      jobId,
      title: detail.job.title,
      status: detail.job.status,
      conversationPolicy: detail.job.conversationPolicy,
      optimizerModel: detail.job.optimizerModel,
      judgeModel: detail.job.judgeModel,
      pendingOptimizerModel: detail.job.pendingOptimizerModel,
      pendingJudgeModel: detail.job.pendingJudgeModel,
      cancelRequestedAt: detail.job.cancelRequestedAt,
      pauseRequestedAt: detail.job.pauseRequestedAt,
      nextRoundInstruction: detail.job.nextRoundInstruction,
      goalAnchor: detail.job.goalAnchor,
      goalAnchorExplanation: detail.job.goalAnchorExplanation,
      runMode: detail.job.runMode,
      currentRound: detail.job.currentRound,
      bestAverageScore: detail.job.bestAverageScore,
      maxRoundsOverride: detail.job.maxRoundsOverride,
      passStreak: detail.job.passStreak,
      lastReviewScore: detail.job.lastReviewScore,
      errorMessage: detail.job.errorMessage,
      latestFullPrompt: resolveLatestFullPrompt(detail.job.rawPrompt, detail.candidates),
      modelsLabel: getTaskModelLabel(detail.job.optimizerModel, detail.job.judgeModel),
      effectiveMaxRounds: detail.job.maxRoundsOverride ?? settings.maxRounds,
      candidates: detail.candidates,
    }
  }, [detail, jobId, settings.maxRounds])

  async function retry() {
    setRetrying(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Retry failed.')
      setError(null)
      setActionMessage('任务已重新开始。')
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setSteeringDirty(false)
      setGoalAnchorDirty(false)
      setExpandedRounds({})
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job }, candidates: [] } : current)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Retry failed.')
      setActionMessage(null)
    } finally {
      setRetrying(false)
    }
  }

  async function saveModel() {
    setSavingModels(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimizerModel: taskModel, judgeModel: taskModel }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Save failed.')
      setError(null)
      setModelDirty(false)
      setActionMessage(detail?.job.status === 'running' ? '任务模型已保存，将在下一轮生效。' : '任务模型已保存。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingModels(false)
    }
  }

  async function saveMaxRoundsOverride() {
    setSavingMaxRounds(true)
    try {
      const normalizedValue = maxRoundsOverrideValue.trim()
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRoundsOverride: normalizedValue ? Number(normalizedValue) : null }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Save failed.')
      setError(null)
      setMaxRoundsDirty(false)
      setActionMessage(detail?.job.status === 'running' ? '任务级最大轮数已保存，将在下一轮检查时生效。' : '任务级最大轮数已保存。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingMaxRounds(false)
    }
  }

  async function saveNextRoundInstruction() {
    setSavingSteering(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextRoundInstruction }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Save failed.')
      setError(null)
      setSteeringDirty(false)
      setActionMessage(detail?.job.status === 'running' ? '人工引导已保存，将在下一轮生效。' : '人工引导已保存，继续运行后生效。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function saveGoalAnchor() {
    setSavingGoalAnchor(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalAnchor: {
            goal: goalAnchorGoal,
            deliverable: goalAnchorDeliverable,
            driftGuard: goalAnchorDriftGuardText.split('\n').map((item) => item.trim()).filter(Boolean),
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Save failed.')
      setError(null)
      setGoalAnchorDirty(false)
      setActionMessage('核心目标锚点已保存。后续所有轮次都会受它约束。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed.')
      setActionMessage(null)
    } finally {
      setSavingGoalAnchor(false)
    }
  }

  async function pauseTask() {
    setPausing(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/pause`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Pause failed.')
      setError(null)
      setActionMessage(detail?.job.status === 'running' ? '已请求暂停，当前轮结束后会停下。' : '任务已暂停。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : 'Pause failed.')
      setActionMessage(null)
    } finally {
      setPausing(false)
    }
  }

  async function resumeStep() {
    setResumingStep(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-step`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Resume step failed.')
      setError(null)
      setActionMessage('任务将继续一轮，完成后会自动回到暂停。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume step failed.')
      setActionMessage(null)
    } finally {
      setResumingStep(false)
    }
  }

  async function resumeAuto() {
    setResumingAuto(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-auto`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Resume auto failed.')
      setError(null)
      setActionMessage('任务已恢复自动运行。')
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Resume auto failed.')
      setActionMessage(null)
    } finally {
      setResumingAuto(false)
    }
  }

  async function cancelTask() {
    setCancelling(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Cancel failed.')
      setError(null)
      setActionMessage(detail?.job.status === 'running' ? '已请求取消，当前轮结束后会停止。' : '任务已取消。')
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setSteeringDirty(false)
      setGoalAnchorDirty(false)
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job } } : current)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Cancel failed.')
      setActionMessage(null)
    } finally {
      setCancelling(false)
    }
  }

  async function copyLatestPrompt() {
    if (!model?.latestFullPrompt) return
    setCopyingPrompt(true)
    try {
      await navigator.clipboard.writeText(model.latestFullPrompt)
      setActionMessage('最新完整提示词已复制。')
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Copy failed.')
      setActionMessage(null)
    } finally {
      setCopyingPrompt(false)
    }
  }

  if (!model) {
    return (
      <main>
        <div className="shell">
          <div className="notice">正在读取任务详情...</div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <motion.div
        className="shell"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <JobDetailControlRoom
          model={model}
          models={models}
          ui={{
            loading,
            error,
            actionMessage,
            savingModels,
            savingMaxRounds,
            savingSteering,
            savingGoalAnchor,
            retrying,
            cancelling,
            pausing,
            resumingStep,
            resumingAuto,
            copyingPrompt,
            expandedRounds,
          }}
          form={{
            taskModel,
            maxRoundsOverrideValue,
            nextRoundInstruction,
            goalAnchorGoal,
            goalAnchorDeliverable,
            goalAnchorDriftGuardText,
          }}
          handlers={{
            onRetry: retry,
            onSaveModel: saveModel,
            onSaveMaxRoundsOverride: saveMaxRoundsOverride,
            onSaveNextRoundInstruction: saveNextRoundInstruction,
            onSaveGoalAnchor: saveGoalAnchor,
            onPauseTask: pauseTask,
            onResumeStep: resumeStep,
            onResumeAuto: resumeAuto,
            onCancelTask: cancelTask,
            onCopyLatestPrompt: copyLatestPrompt,
            onToggleRound: (candidateId) => setExpandedRounds((current) => ({ ...current, [candidateId]: !current[candidateId] })),
            onTaskModelChange: (value) => {
              setModelDirty(true)
              setTaskModel(value)
            },
            onMaxRoundsOverrideChange: (value) => {
              setMaxRoundsDirty(true)
              setMaxRoundsOverrideValue(value)
            },
            onNextRoundInstructionChange: (value) => {
              setSteeringDirty(true)
              setNextRoundInstruction(value)
            },
            onGoalAnchorGoalChange: (value) => {
              setGoalAnchorDirty(true)
              setGoalAnchorGoal(value)
            },
            onGoalAnchorDeliverableChange: (value) => {
              setGoalAnchorDirty(true)
              setGoalAnchorDeliverable(value)
            },
            onGoalAnchorDriftGuardChange: (value) => {
              setGoalAnchorDirty(true)
              setGoalAnchorDriftGuardText(value)
            },
          }}
        />
      </motion.div>
    </main>
  )
}
