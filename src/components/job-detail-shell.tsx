'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { JobDetailControlRoom, type JobDetailViewModel } from '@/components/job-detail-control-room'
import { type RoundCandidateView } from '@/components/job-round-card'
import { type RoundRunView } from '@/components/job-round-run-card'
import { StudioFrame } from '@/components/studio-frame'
import { useI18n, useLocaleText } from '@/lib/i18n'
import {
  buildJobDetailLoadWarning,
  shouldSurfaceJobDetailHardFailure,
  type JobDetailLoadSource,
} from '@/lib/job-detail-load-feedback'
import { readJobDetailRuntimeSnapshot, writeJobDetailRuntimeSnapshot } from '@/lib/job-detail-runtime-cache'
import { normalizeEscapedMultilineText } from '@/lib/prompt-text'
import type { ReasoningEffort } from '@/lib/reasoning-effort'
import { resolveReviewSuggestionAutomationState } from '@/lib/review-suggestion-automation'
import { getJobFailureKind, getJobScoreState, getTaskModelLabel, isDeliveredFinalRoundOutput, resolveLatestFullPrompt } from '@/lib/presentation'
import type { SteeringItem } from '@/lib/server/types'

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
type JobRunMode = 'auto' | 'step'

interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
  dimensionScores?: Record<string, number> | null
  rubricDimensionsSnapshot?: Array<{ id: string; label: string; max: number }> | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
}

interface Candidate extends RoundCandidateView {
  judges: JudgeRun[]
}

interface RoundRunPayload extends Omit<RoundRunView, 'outputFinal'> {}

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
    finalCandidateId: string | null
    customRubricMd: string | null
    autoApplyReviewSuggestions: boolean
    autoApplyReviewSuggestionsToStableRules: boolean
    errorMessage: string | null
    conversationPolicy: 'stateless' | 'pooled-3x'
  }
  candidates: Candidate[]
  roundRuns: RoundRunPayload[]
}

interface SteeringActionResultPayload {
  addedTexts: string[]
  skippedDuplicateTexts: string[]
}

async function readSettledJsonResponse<T>(result: PromiseSettledResult<Response>) {
  if (result.status !== 'fulfilled') {
    return { response: null, payload: null as T | null }
  }

  const response = result.value
  try {
    return { response, payload: await response.json() as T }
  } catch {
    return { response, payload: null as T | null }
  }
}

export function JobDetailShell({ jobId }: { jobId: string }) {
  const cachedSnapshot = readJobDetailRuntimeSnapshot<JobDetailPayload, ModelOption, SettingsPayload, EffectiveRubricSource>(jobId)
  const cachedDetail = normalizeJobDetailPayload(cachedSnapshot?.detail)
  const { locale } = useI18n()
  const text = useLocaleText()
  const [detail, setDetail] = useState<JobDetailPayload | null>(() => cachedDetail)
  const [models, setModels] = useState<ModelOption[]>(() => cachedSnapshot?.models ?? [])
  const [settings, setSettings] = useState<SettingsPayload>(() => cachedSnapshot?.settings ?? { maxRounds: 8 })
  const [effectiveRubricMd, setEffectiveRubricMd] = useState(() => cachedSnapshot?.effectiveRubricMd ?? '')
  const [effectiveRubricSource, setEffectiveRubricSource] = useState<EffectiveRubricSource>(() => cachedSnapshot?.effectiveRubricSource ?? 'default')
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
  const detailReadyRef = useRef(Boolean(cachedDetail))
  const detailFailureCountRef = useRef(0)
  const modelsRef = useRef<ModelOption[]>(cachedSnapshot?.models ?? [])
  const settingsRef = useRef<SettingsPayload>(cachedSnapshot?.settings ?? { maxRounds: 8 })
  const rubricRef = useRef<{ md: string; source: EffectiveRubricSource }>({
    md: cachedSnapshot?.effectiveRubricMd ?? '',
    source: cachedSnapshot?.effectiveRubricSource ?? 'default',
  })
  const [modelDirty, setModelDirty] = useState(false)
  const [maxRoundsDirty, setMaxRoundsDirty] = useState(false)
  const [customRubricDirty, setCustomRubricDirty] = useState(false)
  const [goalAnchorDirty, setGoalAnchorDirty] = useState(false)
  const [loading, setLoading] = useState(() => cachedDetail === null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)
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
  const [forkingFromFinal, setForkingFromFinal] = useState(false)
  const [copyingPrompt, setCopyingPrompt] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [completedResumePickerOpen, setCompletedResumePickerOpen] = useState(false)
  const [completedResumeTargetRunMode, setCompletedResumeTargetRunMode] = useState<JobRunMode | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [reviewSuggestionTargetOverride, setReviewSuggestionTargetOverride] = useState<'pending' | 'stable' | null>(null)
  const [autoApplyReviewSuggestionsOverride, setAutoApplyReviewSuggestionsOverride] = useState<boolean | null>(null)
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      try {
        const [detailResult, modelsResult, settingsResult, rubricResult] = await Promise.allSettled([
          fetch(`/api/jobs/${jobId}`, { cache: 'no-store' }),
          fetch('/api/settings/models', { cache: 'no-store' }),
          fetch('/api/settings', { cache: 'no-store' }),
          fetch(`/api/jobs/${jobId}/rubric`, { cache: 'no-store' }),
        ])
        const [detailRecord, modelsRecord, settingsRecord, rubricRecord] = await Promise.all([
          readSettledJsonResponse<JobDetailPayload & { error?: string }>(detailResult),
          readSettledJsonResponse<{ models?: ModelOption[]; error?: string }>(modelsResult),
          readSettledJsonResponse<{ settings?: SettingsPayload; error?: string }>(settingsResult),
          readSettledJsonResponse<RubricPayload & { error?: string }>(rubricResult),
        ])

        const failedSources: JobDetailLoadSource[] = []
        const detailResponse = detailRecord.response
        const detailPayload = detailRecord.payload
        const modelsResponse = modelsRecord.response
        const modelsPayload = modelsRecord.payload
        const settingsResponse = settingsRecord.response
        const settingsPayload = settingsRecord.payload
        const rubricResponse = rubricRecord.response
        const rubricPayload = rubricRecord.payload

        if (!modelsResponse?.ok) {
          failedSources.push('models')
        }
        if (!settingsResponse?.ok) {
          failedSources.push('settings')
        }
        if (!rubricResponse?.ok) {
          failedSources.push('rubric')
        }

        if (!detailResponse?.ok || !detailPayload) {
          throw new Error(detailPayload?.error ?? text('任务详情加载失败。', 'Failed to load job detail.'))
        }

        if (!cancelled) {
          const nextDetail = normalizeJobDetailPayload(detailPayload)
          if (!nextDetail) {
            throw new Error(text('任务详情数据格式无效。', 'Invalid job detail payload.'))
          }
          const nextModels = modelsResponse?.ok && Array.isArray(modelsPayload?.models)
            ? modelsPayload.models
            : modelsRef.current
          const nextSettings = settingsResponse?.ok && settingsPayload?.settings
            ? { maxRounds: settingsPayload.settings.maxRounds }
            : settingsRef.current
          const nextRubricMd = rubricResponse?.ok && typeof rubricPayload?.rubricMd === 'string'
            ? rubricPayload.rubricMd
            : rubricRef.current.md
          const nextRubricSource = rubricResponse?.ok && rubricPayload
            ? (rubricPayload.source ?? 'default')
            : rubricRef.current.source

          detailFailureCountRef.current = 0
          detailReadyRef.current = true
          setDetail(nextDetail)
          setSettings(nextSettings)
          setModels(nextModels)
          setDetailLoadError(null)
          setLoadWarning(buildJobDetailLoadWarning({
            locale,
            retainedDetail: detailReadyRef.current,
            failedSources,
          }))
          setEffectiveRubricMd(nextRubricMd)
          setEffectiveRubricSource(nextRubricSource)
          writeJobDetailRuntimeSnapshot(jobId, {
            detail: nextDetail,
            models: nextModels,
            settings: nextSettings,
            effectiveRubricMd: nextRubricMd,
            effectiveRubricSource: nextRubricSource,
          })
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : text('任务详情加载失败。', 'Failed to load job detail.')
          const consecutiveFailures = detailFailureCountRef.current + 1
          detailFailureCountRef.current = consecutiveFailures
          if (shouldSurfaceJobDetailHardFailure({
            hasRetainedDetail: detailReadyRef.current,
            consecutiveFailures,
          })) {
            setDetailLoadError(message)
            setLoadWarning(null)
          } else {
            setLoadWarning(buildJobDetailLoadWarning({
              locale,
              retainedDetail: true,
              detailRefreshFailed: true,
            }))
          }
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
    modelsRef.current = models
  }, [models])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    rubricRef.current = {
      md: effectiveRubricMd,
      source: effectiveRubricSource,
    }
  }, [effectiveRubricMd, effectiveRubricSource])

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
    setGoalAnchorGoal(normalizeEscapedMultilineText(detail.job.goalAnchor.goal))
    setGoalAnchorDeliverable(normalizeEscapedMultilineText(detail.job.goalAnchor.deliverable))
    setGoalAnchorDriftGuardText(detail.job.goalAnchor.driftGuard.map(normalizeEscapedMultilineText).join('\n'))
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

  useEffect(() => {
    if (detail?.job.status !== 'completed' && completedResumePickerOpen) {
      closeCompletedResumePicker()
    }
  }, [detail?.job.status, completedResumePickerOpen])

  const model = useMemo<JobDetailViewModel | null>(() => {
    if (!detail) return null
    const reviewSuggestionAutomation = resolveReviewSuggestionAutomationState(detail.job, {
      enabled: autoApplyReviewSuggestionsOverride,
      target: reviewSuggestionTargetOverride,
    })

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
      goalAnchor: {
        goal: normalizeEscapedMultilineText(detail.job.goalAnchor.goal),
        deliverable: normalizeEscapedMultilineText(detail.job.goalAnchor.deliverable),
        driftGuard: detail.job.goalAnchor.driftGuard.map(normalizeEscapedMultilineText),
      },
      goalAnchorExplanation: {
        sourceSummary: normalizeEscapedMultilineText(detail.job.goalAnchorExplanation.sourceSummary),
        rationale: detail.job.goalAnchorExplanation.rationale.map(normalizeEscapedMultilineText),
      },
      runMode: detail.job.runMode,
      currentRound: detail.job.currentRound,
      candidateCount: detail.job.candidateCount,
      scoreState: getJobScoreState(detail.job),
      failureKind: getJobFailureKind(detail.job),
      bestAverageScore: detail.job.bestAverageScore,
      maxRoundsOverride: detail.job.maxRoundsOverride,
      passStreak: detail.job.passStreak,
      lastReviewScore: detail.job.lastReviewScore,
      customRubricMd: detail.job.customRubricMd,
      autoApplyReviewSuggestions: reviewSuggestionAutomation.enabled,
      autoApplyReviewSuggestionsToStableRules: reviewSuggestionAutomation.target === 'stable',
      effectiveRubricMd,
      effectiveRubricSource,
      errorMessage: detail.job.errorMessage,
      latestFullPrompt: resolveLatestFullPrompt(detail.job.rawPrompt, detail.candidates),
      initialPrompt: detail.job.rawPrompt,
      modelsLabel: getTaskModelLabel(detail.job.optimizerModel, detail.job.judgeModel, locale),
      effectiveMaxRounds: detail.job.maxRoundsOverride ?? settings.maxRounds,
      candidates: detail.candidates,
      roundRuns: detail.roundRuns.map((round) => ({
        ...round,
        outputFinal: isDeliveredFinalRoundOutput(detail.job.status, round.outputCandidateId, detail.job.finalCandidateId),
      })),
    }
  }, [
    autoApplyReviewSuggestionsOverride,
    detail,
    effectiveRubricMd,
    effectiveRubricSource,
    jobId,
    locale,
    reviewSuggestionTargetOverride,
    settings.maxRounds,
  ])

  function mergeJobUpdate(jobPatch: JobDetailPayload['job']) {
    setDetail((current) => current ? { ...current, job: { ...current.job, ...jobPatch } } : current)
  }

  const reviewSuggestionAutomation = resolveReviewSuggestionAutomationState(detail?.job, {
    enabled: autoApplyReviewSuggestionsOverride,
    target: reviewSuggestionTargetOverride,
  })

  function resetDraftState() {
    setGoalAnchorDraftReady(false)
    setGoalAnchorDraftConsumeIds([])
  }

  function openCompletedResumePicker(runMode: JobRunMode) {
    setCompletedResumeTargetRunMode(runMode)
    setCompletedResumePickerOpen(true)
  }

  function closeCompletedResumePicker() {
    setCompletedResumePickerOpen(false)
    setCompletedResumeTargetRunMode(null)
  }

  async function retry() {
    const runMode = detail?.job.status === 'completed' && completedResumePickerOpen
      ? (completedResumeTargetRunMode === 'step' ? 'step' : 'auto')
      : 'auto'
    const reopeningCompletedJob = detail?.job.status === 'completed' && completedResumePickerOpen
    setRetrying(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runMode }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('重新开始失败。', 'Retry failed.'))
      setActionError(null)
      closeCompletedResumePicker()
      setActionMessage(reopeningCompletedJob
        ? text('任务已清空历史，并已按你的选择重新排队。', 'The job history was cleared and queued again with your chosen run mode.')
        : text('任务已重置并重新排队。', 'The job was reset and queued again.'))
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setCustomRubricDirty(false)
      setGoalAnchorDirty(false)
      resetDraftState()
      setPendingSteeringInput('')
      setExpandedRounds({})
      setDetail((current) => current ? { ...current, job: { ...current.job, ...payload.job }, candidates: [], roundRuns: [] } : current)
    } catch (retryError) {
      setActionError(retryError instanceof Error ? retryError.message : text('重新开始失败。', 'Retry failed.'))
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
      setActionError(null)
      setModelDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务模型与推理强度已保存，将在下一轮生效。', 'The task model and reasoning effort were saved and will take effect next round.')
        : text('任务模型与推理强度已保存。', 'The task model and reasoning effort were saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      setActionError(null)
      setMaxRoundsDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务级最大轮数已保存，将在下一轮检查时生效。', 'The task-level round cap was saved and will take effect at the next round check.')
        : text('任务级最大轮数已保存。', 'The task-level round cap was saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      setActionError(null)
      setCustomRubricDirty(false)
      setActionMessage(detail?.job.status === 'running'
        ? text('任务级评分标准已保存，将在下一轮生效。', 'The task scoring standard was saved and will take effect next round.')
        : text('任务级评分标准已保存。', 'The task scoring standard was saved.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      setActionError(null)
      setActionMessage(detail?.job.status === 'running'
        ? text('人工引导已加入待生效列表，将在下一轮生效。', 'The steering note was added to the pending list and will take effect next round.')
        : text('人工引导已加入待生效列表。', 'The steering note was added to the pending list.'))
      setPendingSteeringInput('')
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setSavingSteering(false)
    }
  }

  async function addReviewSuggestions(items: string[]) {
    setSavingSteering(true)
    try {
      const target = reviewSuggestionAutomation.target
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steeringAction: { type: 'add_many', items, target } }),
      })
      const payload = await response.json() as {
        job: JobDetailPayload['job']
        steeringActionResult?: SteeringActionResultPayload | null
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      const steeringActionResult = payload.steeringActionResult ?? {
        addedTexts: items,
        skippedDuplicateTexts: [],
      }
      const addedCount = steeringActionResult.addedTexts.length
      const skippedCount = steeringActionResult.skippedDuplicateTexts.length
      setActionError(null)
      setActionMessage(buildReviewSuggestionActionMessage({
        text,
        addedCount,
        skippedCount,
        running: detail?.job.status === 'running',
        target,
      }))
      resetDraftState()
      mergeJobUpdate(payload.job)
      return steeringActionResult
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.')
      setActionError(message)
      setActionMessage(null)
      throw new Error(message)
    } finally {
      setSavingSteering(false)
    }
  }

  async function updateReviewSuggestionTarget(target: 'pending' | 'stable') {
    setSavingSteering(true)
    setReviewSuggestionTargetOverride(target)
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApplyReviewSuggestionsToStableRules: target === 'stable',
        }),
      })
      const payload = await response.json() as {
        job: JobDetailPayload['job']
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))
      setActionError(null)
      setActionMessage(target === 'stable'
        ? text('后续手动采纳与自动采纳都会默认写入长期规则。', 'Manual and automatic adoption will now default to stable rules.')
        : text('后续手动采纳与自动采纳都会默认只加入下一轮引导。', 'Manual and automatic adoption will now default to next-round steering only.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setReviewSuggestionTargetOverride(null)
      setSavingSteering(false)
    }
  }

  async function toggleAutoApplyReviewSuggestions(items: string[]) {
    setSavingSteering(true)
    try {
      const enable = !reviewSuggestionAutomation.enabled
      const target = reviewSuggestionAutomation.target
      setAutoApplyReviewSuggestionsOverride(enable)
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApplyReviewSuggestions: enable,
          autoApplyReviewSuggestionsToStableRules: target === 'stable',
          ...(enable && items.length > 0
            ? { steeringAction: { type: 'add_many', items, target } }
            : {}),
        }),
      })
      const payload = await response.json() as {
        job: JobDetailPayload['job']
        steeringActionResult?: SteeringActionResultPayload | null
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? text('保存失败。', 'Save failed.'))

      const steeringActionResult = payload.steeringActionResult ?? {
        addedTexts: [],
        skippedDuplicateTexts: [],
      }

      setActionError(null)
      setActionMessage(buildAutoApplyReviewSuggestionMessage({
        text,
        enable,
        target,
        running: detail?.job.status === 'running',
        addedCount: steeringActionResult.addedTexts.length,
        skippedCount: steeringActionResult.skippedDuplicateTexts.length,
      }))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
      setActionMessage(null)
    } finally {
      setAutoApplyReviewSuggestionsOverride(null)
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
      setActionError(null)
      setActionMessage(text('已删除这条待生效引导。', 'The pending steering item was removed.'))
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      setActionError(null)
      setActionMessage(text('待生效引导已清空。', 'Pending steering was cleared.'))
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('清空失败。', 'Clear failed.'))
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
      setActionError(null)
      setGoalAnchorGoal(normalizeEscapedMultilineText(payload.goalAnchorDraft.goal))
      setGoalAnchorDeliverable(normalizeEscapedMultilineText(payload.goalAnchorDraft.deliverable))
      setGoalAnchorDriftGuardText(payload.goalAnchorDraft.driftGuard.map(normalizeEscapedMultilineText).join('\n'))
      setGoalAnchorDirty(true)
      setGoalAnchorDraftReady(true)
      setGoalAnchorDraftConsumeIds(payload.consumePendingSteeringIds ?? [])
      const selectedCount = payload.consumePendingSteeringIds?.length ?? 0
      setActionMessage(text(`已把选中的 ${selectedCount} 条引导带入长期规则编辑区，请确认后保存。`, `Added ${selectedCount} selected steering items to the stable-rule editor. Review and save when ready.`))
    } catch (draftError) {
      setActionError(draftError instanceof Error ? draftError.message : text('草稿生成失败。', 'Draft generation failed.'))
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
      setActionError(null)
      setGoalAnchorDirty(false)
      const consumedPending = goalAnchorDraftReady && goalAnchorDraftConsumeIds.length > 0
      resetDraftState()
      setActionMessage(consumedPending
        ? text('长期规则已保存，并已吸收本次选中的待生效引导。', 'Stable rules were saved and absorbed the selected pending steering.')
        : text('长期规则已保存。后续所有轮次都会受它约束。', 'Stable rules were saved. All later rounds will stay constrained by them.'))
      mergeJobUpdate(payload.job)
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : text('保存失败。', 'Save failed.'))
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
      setActionError(null)
      setActionMessage(detail?.job.status === 'running'
        ? text('已请求暂停，当前轮结束后会停下。', 'Pause requested. The job will stop after the current round.')
        : text('任务已暂停。', 'The job was paused.'))
      mergeJobUpdate(payload.job)
    } catch (pauseError) {
      setActionError(pauseError instanceof Error ? pauseError.message : text('暂停失败。', 'Pause failed.'))
      setActionMessage(null)
    } finally {
      setPausing(false)
    }
  }

  async function resumeStep() {
    if (detail?.job.status === 'completed') {
      openCompletedResumePicker('step')
      return
    }

    setResumingStep(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-step`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('继续一轮失败。', 'Resume step failed.'))
      setActionError(null)
      setActionMessage(text('任务将继续一轮，完成后会自动回到暂停。', 'The job will run one more round and pause again afterward.'))
      mergeJobUpdate(payload.job)
    } catch (resumeError) {
      setActionError(resumeError instanceof Error ? resumeError.message : text('继续一轮失败。', 'Resume step failed.'))
      setActionMessage(null)
    } finally {
      setResumingStep(false)
    }
  }

  async function resumeAuto() {
    if (detail?.job.status === 'completed') {
      openCompletedResumePicker('auto')
      return
    }

    setResumingAuto(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume-auto`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('恢复自动运行失败。', 'Resume auto failed.'))
      setActionError(null)
      setActionMessage(text('任务已恢复自动运行。', 'The job resumed automatic execution.'))
      mergeJobUpdate(payload.job)
    } catch (resumeError) {
      setActionError(resumeError instanceof Error ? resumeError.message : text('恢复自动运行失败。', 'Resume auto failed.'))
      setActionMessage(null)
    } finally {
      setResumingAuto(false)
    }
  }

  async function resumeCompletedCurrentTask() {
    const targetRunMode = completedResumeTargetRunMode === 'step' ? 'step' : 'auto'
    const setLoading = targetRunMode === 'step' ? setResumingStep : setResumingAuto
    const fallbackError = targetRunMode === 'step'
      ? text('继续一轮失败。', 'Resume step failed.')
      : text('恢复自动运行失败。', 'Resume auto failed.')
    const url = targetRunMode === 'step'
      ? `/api/jobs/${jobId}/resume-step`
      : `/api/jobs/${jobId}/resume-auto`

    setLoading(true)
    try {
      const response = await fetch(url, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? fallbackError)
      setActionError(null)
      closeCompletedResumePicker()
      setActionMessage(targetRunMode === 'step'
        ? text('已清空完成标记与旧连胜，当前任务会继续一轮。', 'The completion marker and old pass streak were cleared. This job will run one more round.')
        : text('已清空完成标记与旧连胜，当前任务已恢复自动运行。', 'The completion marker and old pass streak were cleared. This job resumed automatic execution.'))
      mergeJobUpdate(payload.job)
    } catch (resumeError) {
      setActionError(resumeError instanceof Error ? resumeError.message : fallbackError)
      setActionMessage(null)
    } finally {
      setLoading(false)
    }
  }

  async function forkFromFinalTask() {
    const targetRunMode = completedResumeTargetRunMode === 'step' ? 'step' : 'auto'
    setForkingFromFinal(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/fork-from-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runMode: targetRunMode }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('基于最终版新建任务失败。', 'Fork from final failed.'))
      setActionError(null)
      closeCompletedResumePicker()
      const nextJobId = payload?.job?.id as string | undefined
      if (nextJobId && typeof window !== 'undefined') {
        window.location.assign(`/jobs/${nextJobId}`)
        return
      }
      setActionMessage(text('已基于当前最终版新建任务。', 'A fresh job was created from the current final prompt.'))
    } catch (forkError) {
      setActionError(forkError instanceof Error ? forkError.message : text('基于最终版新建任务失败。', 'Fork from final failed.'))
      setActionMessage(null)
    } finally {
      setForkingFromFinal(false)
    }
  }

  async function cancelTask() {
    setCancelling(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? text('取消失败。', 'Cancel failed.'))
      setActionError(null)
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
      setActionError(cancelError instanceof Error ? cancelError.message : text('取消失败。', 'Cancel failed.'))
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
      setActionError(null)
      setActionMessage(text('任务已完成并归档。', 'The job was completed and archived.'))
      setModelDirty(false)
      setMaxRoundsDirty(false)
      setCustomRubricDirty(false)
      setGoalAnchorDirty(false)
      resetDraftState()
      mergeJobUpdate(payload.job)
    } catch (completeError) {
      setActionError(completeError instanceof Error ? completeError.message : text('完成归档失败。', 'Complete failed.'))
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
      setActionError(null)
    } catch (copyError) {
      setActionError(copyError instanceof Error ? copyError.message : text('复制失败。', 'Copy failed.'))
      setActionMessage(null)
    } finally {
      setCopyingPrompt(false)
    }
  }

  if (!model) {
    return (
      <main>
        <StudioFrame title={text('结果台', 'Result Desk')} currentPath={`/jobs/${jobId}`}>
          <div className="shell">
            <section className="detail-hero">
              <div className="detail-hero-copy">
                <span className="eyebrow detail-stage-label detail-stage-chip" data-ui="detail-stage-chip">
                  {text('结果台', 'Result Desk')}
                </span>
              </div>
            </section>
            <div className="notice">{text('正在读取任务详情...', 'Loading job detail...')}</div>
          </div>
        </StudioFrame>
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
              error: actionError ?? detailLoadError,
              loadWarning,
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
              forkingFromFinal,
              copyingPrompt,
              compareMode,
              completedResumePickerOpen,
              completedResumeTargetRunMode,
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
              onAddReviewSuggestions: addReviewSuggestions,
              onReviewSuggestionTargetChange: updateReviewSuggestionTarget,
              onToggleAutoApplyReviewSuggestions: toggleAutoApplyReviewSuggestions,
              onRemovePendingSteeringItem: removePendingSteeringItem,
              onClearPendingSteering: clearPendingSteering,
              onGenerateGoalAnchorDraft: generateGoalAnchorDraft,
              onSaveGoalAnchor: saveGoalAnchor,
              onPauseTask: pauseTask,
              onResumeStep: resumeStep,
              onResumeAuto: resumeAuto,
              onCloseCompletedResumePicker: closeCompletedResumePicker,
              onResumeCompletedCurrentTask: resumeCompletedCurrentTask,
              onForkFromFinalTask: forkFromFinalTask,
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

function buildReviewSuggestionActionMessage(input: {
  text: (zh: string, en: string) => string
  addedCount: number
  skippedCount: number
  running: boolean
  target: 'pending' | 'stable'
}) {
  if (input.addedCount > 0 && input.skippedCount > 0) {
    return input.running
      ? input.text(
        input.target === 'stable'
          ? `已新增 ${input.addedCount} 条评审建议到长期规则，另有 ${input.skippedCount} 条已在长期规则中。`
          : `已新增 ${input.addedCount} 条评审建议，另有 ${input.skippedCount} 条已存在于待生效列表，将在下一轮生效。`,
        input.target === 'stable'
          ? `Added ${input.addedCount} review suggestions to stable rules and skipped ${input.skippedCount} duplicates already there.`
          : `Added ${input.addedCount} review suggestions and skipped ${input.skippedCount} duplicates already in the pending list. They will take effect next round.`,
      )
      : input.text(
        input.target === 'stable'
          ? `已新增 ${input.addedCount} 条评审建议到长期规则，另有 ${input.skippedCount} 条已在长期规则中。`
          : `已新增 ${input.addedCount} 条评审建议，另有 ${input.skippedCount} 条已存在于待生效列表。`,
        input.target === 'stable'
          ? `Added ${input.addedCount} review suggestions to stable rules and skipped ${input.skippedCount} duplicates already there.`
          : `Added ${input.addedCount} review suggestions and skipped ${input.skippedCount} duplicates already in the pending list.`,
      )
  }

  if (input.addedCount > 0) {
    return input.running
      ? input.text(
        input.target === 'stable'
          ? `已把 ${input.addedCount} 条评审建议加入长期规则。`
          : `已把 ${input.addedCount} 条评审建议加入待生效列表，将在下一轮生效。`,
        input.target === 'stable'
          ? `Added ${input.addedCount} review suggestions to stable rules.`
          : `Added ${input.addedCount} review suggestions to the pending list. They will take effect next round.`,
      )
      : input.text(
        input.target === 'stable'
          ? `已把 ${input.addedCount} 条评审建议加入长期规则。`
          : `已把 ${input.addedCount} 条评审建议加入待生效列表。`,
        input.target === 'stable'
          ? `Added ${input.addedCount} review suggestions to stable rules.`
          : `Added ${input.addedCount} review suggestions to the pending list.`,
      )
  }

  return input.text(
    input.target === 'stable'
      ? `选中的 ${input.skippedCount} 条评审建议已在长期规则中。`
      : `选中的 ${input.skippedCount} 条评审建议已存在于待生效列表。`,
    input.target === 'stable'
      ? `${input.skippedCount} selected review suggestions were already in stable rules.`
      : `${input.skippedCount} selected review suggestions were already in the pending list.`,
  )
}

function buildAutoApplyReviewSuggestionMessage(input: {
  text: (zh: string, en: string) => string
  enable: boolean
  target: 'pending' | 'stable'
  running: boolean
  addedCount: number
  skippedCount: number
}) {
  if (!input.enable) {
    return input.text(
      '已关闭后续每轮自动采纳。',
      'Turned off automatic adoption for future rounds.',
    )
  }

  if (input.addedCount === 0 && input.skippedCount === 0) {
    return input.text(
      input.target === 'stable'
        ? '已开启后续每轮自动采纳；后续新建议会自动写入长期规则。'
        : '已开启后续每轮自动采纳；后续新建议会自动加入下一轮引导。',
      input.target === 'stable'
        ? 'Turned on automatic adoption; future suggestions will be written into stable rules.'
        : 'Turned on automatic adoption; future suggestions will be added as next-round steering.',
    )
  }

  const immediate = buildReviewSuggestionActionMessage({
    text: input.text,
    addedCount: input.addedCount,
    skippedCount: input.skippedCount,
    running: input.running,
    target: input.target,
  })

  return input.text(
    `${immediate} 后续每轮也会自动采纳新建议。`,
    `${immediate} Future rounds will auto-adopt new suggestions as well.`,
  )
}

function normalizeJobDetailPayload(value: unknown): JobDetailPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Partial<JobDetailPayload>
  const job = payload.job
  if (!job || typeof job !== 'object') {
    return null
  }

  const goalAnchor = job.goalAnchor
  const goalAnchorExplanation = job.goalAnchorExplanation
  if (
    !goalAnchor
    || typeof goalAnchor !== 'object'
    || !Array.isArray(goalAnchor.driftGuard)
    || !goalAnchorExplanation
    || typeof goalAnchorExplanation !== 'object'
    || !Array.isArray(goalAnchorExplanation.rationale)
    || !Array.isArray(job.pendingSteeringItems)
    || !Array.isArray(payload.candidates)
    || !Array.isArray(payload.roundRuns)
  ) {
    return null
  }

  return {
    ...payload,
    job: {
      ...job,
      pendingSteeringItems: job.pendingSteeringItems,
      goalAnchor: {
        ...goalAnchor,
        driftGuard: goalAnchor.driftGuard,
      },
      goalAnchorExplanation: {
        ...goalAnchorExplanation,
        rationale: goalAnchorExplanation.rationale,
      },
      autoApplyReviewSuggestions: Boolean(job.autoApplyReviewSuggestions),
      autoApplyReviewSuggestionsToStableRules: job.autoApplyReviewSuggestionsToStableRules === undefined
        ? true
        : Boolean(job.autoApplyReviewSuggestionsToStableRules),
    },
    candidates: payload.candidates,
    roundRuns: payload.roundRuns,
  } as JobDetailPayload
}
