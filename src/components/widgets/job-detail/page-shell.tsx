'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { JobDetailControlRoom, type JobDetailViewModel } from '@/components/widgets/job-detail/control-room'
import { type RoundCandidateView } from '@/components/widgets/job-detail/round-card'
import { StudioFrame } from '@/components/shared/layout/studio-frame'
import { useI18n, useLocaleText } from '@/lib/i18n'
import type { ReasoningEffort } from '@/lib/reasoning-effort'
import { getJobFailureKind, getTaskModelLabel, resolveLatestFullPrompt } from '@/lib/presentation'
import type { SteeringItem } from '@/lib/contracts'

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

type EffectiveRubricSource = 'job' | 'settings' | 'default'

interface RubricPayload {
  rubricMd: string
  source: EffectiveRubricSource
}

interface GoalAnchorPayload {
  goal: string
  deliverable: string
  driftGuard: string[]
}

interface JobDetailPayload {
  job: {
    id: string
    title: string
    rawPrompt: string
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
    goalAnchor: GoalAnchorPayload
    goalAnchorExplanation: {
      sourceSummary: string
      rationale: string[]
    }
    status: JobStatus
    runMode: JobRunMode
    currentRound: number
    candidateCount: number
    bestAverageScore: number
    maxRoundsOverride: number | null
    passStreak: number
    lastReviewScore: number
    customRubricMd: string | null
    errorMessage: string | null
    conversationPolicy: 'stateless' | 'pooled-3x'
  }
  candidates: Candidate[]
}

export function JobDetailShell({ jobId }: { jobId: string }) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const [detail, setDetail] = useState<JobDetailPayload | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({ maxRounds: 8 })
  const [effectiveRubricMd, setEffectiveRubricMd] = useState('')
  const [effectiveRubricSource, setEffectiveRubricSource] = useState<EffectiveRubricSource>('default')
  const [taskModel, setTaskModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('default')
  const [maxRoundsOverrideValue, setMaxRoundsOverrideValue] = useState('')
  const [pendingSteeringInput, setPendingSteeringInput] = useState('')
  const [customRubricMd, setCustomRubricMd] = useState('')
  const [goalAnchorGoal, setGoalAnchorGoal] = useState('')
  const [goalAnchorDeliverable, setGoalAnchorDeliverable] = useState('')
  const [goalAnchorDriftGuardText, setGoalAnchorDriftGuardText] = useState('')
  const [goalAnchorDraftReady, setGoalAnchorDraftReady] = useState(false)
  const [goalAnchorDraftConsumeIds, setGoalAnchorDraftConsumeIds] = useState<string[]>([])
  const [selectedPendingSteeringIds, setSelectedPendingSteeringIds] = useState<string[]>([])
  const knownPendingSteeringIdsRef = useRef<Set<string>>(new Set())
  const [modelDirty, setModelDirty] = useState(false)
  const [maxRoundsDirty, setMaxRoundsDirty] = useState(false)
  const [customRubricDirty, setCustomRubricDirty] = useState(false)
  const [goalAnchorDirty, setGoalAnchorDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [savingModels, setSavingModels] = useState(false)
  const [savingMaxRounds, setSavingMaxRounds] = useState(false)
  const [savingCustomRubric, setSavingCustomRubric] = useState(false)
  const [savingSteering, setSavingSteering] = useState(false)
  const [generatingGoalAnchorDraft, setGeneratingGoalAnchorDraft] = useState(false)
  const [savingGoalAnchor, setSavingGoalAnchor] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resumingStep, setResumingStep] = useState(false)
  const [resumingAuto, setResumingAuto] = useState(false)
  const [copyingPrompt, setCopyingPrompt] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      try {
        const [detailResponse, modelsResponse, settingsResponse, rubricResponse] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
          fetch(`/api/jobs/${jobId}/rubric`, { cache: 'no-store' }),
        ])
        const detailPayload = await detailResponse.json()
        const modelsPayload = await modelsResponse.json()
        const settingsPayload = await settingsResponse.json()
        const rubricPayload = await rubricResponse.json().catch(() => null) as RubricPayload | null
        if (!detailResponse.ok) {
          throw new Error(detailPayload.error ?? text('任务详情加载失败。', 'Failed to load job detail.'))
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsPayload.error ?? text('设置加载失败。', 'Failed to load settings.'))
        }
        if (!cancelled) {
          setDetail(detailPayload)
          setSettings({ maxRounds: settingsPayload.settings.maxRounds })
          setModels(modelsResponse.ok ? modelsPayload.models : [])
          setError(modelsResponse.ok ? null : modelsPayload.error ?? null)
          if (rubricResponse.ok && rubricPayload) {
            setEffectiveRubricMd(typeof rubricPayload.rubricMd === 'string' ? rubricPayload.rubricMd : '')
            setEffectiveRubricSource(rubricPayload.source ?? 'default')
          } else {
            setEffectiveRubricMd('')
            setEffectiveRubricSource('default')
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : text('任务详情加载失败。', 'Failed to load job detail.'))
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
  }, [jobId, text])

  useEffect(() => {
    if (!detail || modelDirty) return
    setTaskModel(detail.job.pendingOptimizerModel ?? detail.job.optimizerModel)
    setReasoningEffort(detail.job.pendingOptimizerReasoningEffort ?? detail.job.optimizerReasoningEffort)
  }, [detail, modelDirty])

  useEffect(() => {
    if (!detail || maxRoundsDirty) return
    setMaxRoundsOverrideValue(detail.job.maxRoundsOverride === null ? '' : String(detail.job.maxRoundsOverride))
  }, [detail, maxRoundsDirty])

  useEffect(() => {
    if (!detail || customRubricDirty) return
    setCustomRubricMd(detail.job.customRubricMd ?? '')
  }, [detail, customRubricDirty])

  useEffect(() => {
    if (!detail || goalAnchorDirty) return
    setGoalAnchorGoal(detail.job.goalAnchor.goal)
    setGoalAnchorDeliverable(detail.job.goalAnchor.deliverable)
    setGoalAnchorDriftGuardText(detail.job.goalAnchor.driftGuard.join('\n'))
    setGoalAnchorDraftReady(false)
    setGoalAnchorDraftConsumeIds([])
  }, [detail, goalAnchorDirty])

  useEffect(() => {
    if (!detail) return

    const nextPendingIds = detail.job.pendingSteeringItems.map((item) => item.id)
    const nextPendingSet = new Set(nextPendingIds)
    const knownPendingIds = knownPendingSteeringIdsRef.current

    setSelectedPendingSteeringIds((current) => {
      const surviving = current.filter((id) => nextPendingSet.has(id))
      const selectedSet = new Set(surviving)
      const nextSelected = [...surviving]
      const isFirstSync = knownPendingIds.size === 0 && current.length === 0

      for (const id of nextPendingIds) {
        if ((isFirstSync || !knownPendingIds.has(id)) && !selectedSet.has(id)) {
          selectedSet.add(id)
          nextSelected.push(id)
        }
      }

      return nextSelected
    })

    knownPendingSteeringIdsRef.current = nextPendingSet
  }, [detail])

  useEffect(() => {
    setCompareMode(false)
  }, [jobId])

  const model = useMemo<JobDetailViewModel | null>(() => {
    if (!detail) return null
    return {
      jobId,
      title: detail.job.title,
      status: detail.job.status,
      conversationPolicy: detail.job.conversationPolicy,
      optimizerModel: detail.job.optimizerModel,
      judgeModel: detail.job.judgeModel,
      optimizerReasoningEffort: detail.job.optimizerReasoningEffort,
      judgeReasoningEffort: detail.job.judgeReasoningEffort,
      pendingOptimizerModel: detail.job.pendingOptimizerModel,
      pendingJudgeModel: detail.job.pendingJudgeModel,
      pendingOptimizerReasoningEffort: detail.job.pendingOptimizerReasoningEffort,
      pendingJudgeReasoningEffort: detail.job.pendingJudgeReasoningEffort,
      cancelRequestedAt: detail.job.cancelRequestedAt,
      pauseRequestedAt: detail.job.pauseRequestedAt,
      pendingSteeringItems: detail.job.pendingSteeringItems,
      goalAnchor: detail.job.goalAnchor,
      goalAnchorExplanation: detail.job.goalAnchorExplanation,
      runMode: detail.job.runMode,
      currentRound: detail.job.currentRound,
      candidateCount: detail.job.candidateCount,
      scoreState: detail.job.candidateCount > 0 ? 'available' : 'not_generated',
      failureKind: getJobFailureKind(detail.job),
      bestAverageScore: detail.job.bestAverageScore,
      maxRoundsOverride: detail.job.maxRoundsOverride,
      passStreak: detail.job.passStreak,
      lastReviewScore: detail.job.lastReviewScore,
      customRubricMd: detail.job.customRubricMd,
      effectiveRubricMd,
      effectiveRubricSource,
      errorMessage: detail.job.errorMessage,
      latestFullPrompt: resolveLatestFullPrompt(detail.job.rawPrompt, detail.candidates),
      initialPrompt: detail.job.rawPrompt,
      modelsLabel: getTaskModelLabel(detail.job.optimizerModel, detail.job.judgeModel, locale),
      effectiveMaxRounds: detail.job.maxRoundsOverride ?? settings.maxRounds,
      candidates: detail.candidates,
    }
  }, [detail, effectiveRubricMd, effectiveRubricSource, jobId, locale, settings.maxRounds])

  function mergeJobUpdate(jobPatch: JobDetailPayload['job']) {
    setDetail((current) => current ? { ...current, job: { ...current.job, ...jobPatch } } : current)
  }

  function resetDraftState() {
    setGoalAnchorDraftReady(false)
    setGoalAnchorDraftConsumeIds([])
  }

  async function retry() {
    setRetrying(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('重新开始失败。', 'Retry failed.'))
      setError(null)
      setActionMessage(text('任务已重新开始。', 'The job restarted from the beginning.'))
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setCustomRubricDirty(false)
      setGoalAnchorDirty(false)
      resetDraftState()
      setPendingSteeringInput('')
      setExpandedRounds({})
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job }, candidates: [] } : current)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : text('重新开始失败。', 'Retry failed.'))
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
        body: JSON.stringify({
          optimizerModel: taskModel,
          judgeModel: taskModel,
          optimizerReasoningEffort: reasoningEffort,
          judgeReasoningEffort: reasoningEffort,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setModelDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务模型与推理强度已保存，将在下一轮生效。', 'The task model and reasoning effort were saved and will take effect next round.')
        : text('任务模型与推理强度已保存。', 'The task model and reasoning effort were saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setMaxRoundsDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务级最大轮数已保存，将在下一轮检查时生效。', 'The task-level round cap was saved and will take effect at the next round check.')
        : text('任务级最大轮数已保存。', 'The task-level round cap was saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setSavingMaxRounds(false)
    }
  }

  async function saveCustomRubric(nextValue?: string) {
    setSavingCustomRubric(true)
    try {
      const valueToSave = (nextValue ?? customRubricMd).trim()
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customRubricMd: valueToSave || null }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setCustomRubricDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务级评分标准已保存，将在下一轮生效。', 'The task scoring standard was saved and will take effect next round.')
        : text('任务级评分标准已保存。', 'The task scoring standard was saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setSavingCustomRubric(false)
    }
  }

  async function addPendingSteering() {
    setSavingSteering(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steeringAction: { type: 'add', text: pendingSteeringInput } }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setActionMessage(detail?.job.status === 'running'
        ? text('人工引导已加入待生效列表，将在下一轮生效。', 'The steering note was added to the pending list and will take effect next round.')
        : text('人工引导已加入待生效列表。', 'The steering note was added to the pending list.'))
      setPendingSteeringInput('')
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function removePendingSteeringItem(itemId: string) {
    setSavingSteering(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steeringAction: { type: 'remove', itemId } }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setActionMessage(text('已删除这条待生效引导。', 'The pending steering item was removed.'))
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function clearPendingSteering() {
    setSavingSteering(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steeringAction: { type: 'clear' } }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('清空失败。', 'Clear failed.'))
      setError(null)
      setActionMessage(text('待生效引导已清空。', 'Pending steering was cleared.'))
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('清空失败。', 'Clear failed.'))
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function generateGoalAnchorDraft() {
    setGeneratingGoalAnchorDraft(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steeringAction: { type: 'build_goal_anchor_draft', itemIds: selectedPendingSteeringIds } }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('草稿生成失败。', 'Draft generation failed.'))
      if (!payload.goalAnchorDraft) {
        throw new Error(text('未生成长期规则草稿。', 'No stable-rule draft was generated.'))
      }
      setError(null)
      setGoalAnchorGoal(payload.goalAnchorDraft.goal)
      setGoalAnchorDeliverable(payload.goalAnchorDraft.deliverable)
      setGoalAnchorDriftGuardText(payload.goalAnchorDraft.driftGuard.join('\n'))
      setGoalAnchorDirty(true)
      setGoalAnchorDraftReady(true)
      setGoalAnchorDraftConsumeIds(payload.consumePendingSteeringIds ?? [])
      const selectedCount = payload.consumePendingSteeringIds?.length ?? 0
      setActionMessage(text(`已把选中的 ${selectedCount} 条引导带入长期规则编辑区，请确认后保存。`, `Added ${selectedCount} selected steering items to the stable-rule editor. Review and save when ready.`))
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : text('草稿生成失败。', 'Draft generation failed.'))
      setActionMessage(null)
    } finally {
      setGeneratingGoalAnchorDraft(false)
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
          consumePendingSteeringIds: goalAnchorDraftReady ? goalAnchorDraftConsumeIds : [],
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setError(null)
      setGoalAnchorDirty(false)
      const consumedPending = goalAnchorDraftReady && goalAnchorDraftConsumeIds.length > 0
      resetDraftState()
      setActionMessage(consumedPending
        ? text('长期规则已保存，并已吸收本次选中的待生效引导。', 'Stable rules were saved and absorbed the selected pending steering.')
        : text('长期规则已保存。后续所有轮次都会受它约束。', 'Stable rules were saved. All later rounds will stay constrained by them.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      if (!response.ok) throw new Error(payload.error ?? text('暂停失败。', 'Pause failed.'))
      setError(null)
      setActionMessage(detail?.job.status === 'running'
        ? text('已请求暂停，当前轮结束后会停下。', 'Pause requested. The job will stop after the current round.')
        : text('任务已暂停。', 'The job was paused.'))
      mergeJobUpdate(payload.job)
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : text('暂停失败。', 'Pause failed.'))
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
      if (!response.ok) throw new Error(payload.error ?? text('继续一轮失败。', 'Resume step failed.'))
      setError(null)
      setActionMessage(text('任务将继续一轮，完成后会自动回到暂停。', 'The job will run one more round and pause again afterward.'))
      mergeJobUpdate(payload.job)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : text('继续一轮失败。', 'Resume step failed.'))
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
      if (!response.ok) throw new Error(payload.error ?? text('恢复自动运行失败。', 'Resume auto failed.'))
      setError(null)
      setActionMessage(text('任务已恢复自动运行。', 'The job resumed automatic execution.'))
      mergeJobUpdate(payload.job)
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : text('恢复自动运行失败。', 'Resume auto failed.'))
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
      if (!response.ok) throw new Error(payload.error ?? text('取消失败。', 'Cancel failed.'))
      setError(null)
      setActionMessage(detail?.job.status === 'running'
        ? text('已请求取消，当前轮结束后会停止。', 'Cancellation requested. The job will stop after the current round.')
        : text('任务已取消。', 'The job was cancelled.'))
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setCustomRubricDirty(false)
      setGoalAnchorDirty(false)
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : text('取消失败。', 'Cancel failed.'))
      setActionMessage(null)
    } finally {
      setCancelling(false)
    }
  }

  async function completeTask() {
    setCompleting(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/complete`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('完成归档失败。', 'Complete failed.'))
      setError(null)
      setActionMessage(text('任务已完成并归档。', 'The job was completed and archived.'))
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setCustomRubricDirty(false)
      setGoalAnchorDirty(false)
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : text('完成归档失败。', 'Complete failed.'))
      setActionMessage(null)
    } finally {
      setCompleting(false)
    }
  }

  async function copyLatestPrompt() {
    if (!model?.latestFullPrompt) return
    setCopyingPrompt(true)
    try {
      await navigator.clipboard.writeText(model.latestFullPrompt)
      setActionMessage(text('最新完整提示词已复制。', 'The latest full prompt was copied.'))
      setError(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : text('复制失败。', 'Copy failed.'))
      setActionMessage(null)
    } finally {
      setCopyingPrompt(false)
    }
  }

  if (!model) {
    return (
      <main>
        <div className="shell">
          <div className="notice">{text('正在读取任务详情...', 'Loading job detail...')}</div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <StudioFrame title={text('结果台', 'Result Desk')} currentPath={`/jobs/${jobId}`}>
        <motion.div
          className="shell"
          initial={false}
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
              savingCustomRubric,
              savingSteering,
              generatingGoalAnchorDraft,
              savingGoalAnchor,
              retrying,
              completing,
              cancelling,
              pausing,
              resumingStep,
              resumingAuto,
              copyingPrompt,
              compareMode,
              expandedRounds,
            }}
            form={{
              taskModel,
              reasoningEffort,
              maxRoundsOverrideValue,
              pendingSteeringInput,
              customRubricMd,
              goalAnchorGoal,
              goalAnchorDeliverable,
              goalAnchorDriftGuardText,
              goalAnchorDraftReady,
              selectedPendingSteeringIds,
            }}
            handlers={{
              onRetry: retry,
              onSaveModel: saveModel,
              onSaveMaxRoundsOverride: saveMaxRoundsOverride,
              onSaveCustomRubric: saveCustomRubric,
              onAddPendingSteering: addPendingSteering,
              onRemovePendingSteeringItem: removePendingSteeringItem,
              onClearPendingSteering: clearPendingSteering,
              onGenerateGoalAnchorDraft: generateGoalAnchorDraft,
              onSaveGoalAnchor: saveGoalAnchor,
              onPauseTask: pauseTask,
              onResumeStep: resumeStep,
              onResumeAuto: resumeAuto,
              onCancelTask: cancelTask,
              onCompleteTask: completeTask,
              onCopyLatestPrompt: copyLatestPrompt,
              onToggleCompareMode: () => setCompareMode((current) => !current),
              onToggleRound: (candidateId) => setExpandedRounds((current) => ({ ...current, [candidateId]: !current[candidateId] })),
              onTaskModelChange: (value) => {
                setModelDirty(true)
                setTaskModel(value)
              },
              onReasoningEffortChange: (value) => {
                setModelDirty(true)
                setReasoningEffort(value as ReasoningEffort)
              },
              onMaxRoundsOverrideChange: (value) => {
                setMaxRoundsDirty(true)
                setMaxRoundsOverrideValue(value)
              },
              onPendingSteeringInputChange: (value) => {
                setPendingSteeringInput(value)
              },
              onCustomRubricChange: (value) => {
                setCustomRubricDirty(true)
                setCustomRubricMd(value)
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
              onTogglePendingSteeringSelection: (itemId) => {
                resetDraftState()
                setSelectedPendingSteeringIds((current) => {
                  const currentSet = new Set(current)
                  if (currentSet.has(itemId)) {
                    return current.filter((id) => id !== itemId)
                  }

                  const orderedPendingIds = detail?.job.pendingSteeringItems.map((item) => item.id) ?? []
                  return orderedPendingIds.filter((id) => currentSet.has(id) || id === itemId)
                })
              },
            }}
          />
        </motion.div>
      </StudioFrame>
    </main>
  )
}
