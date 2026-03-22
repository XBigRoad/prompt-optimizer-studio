'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { StudioFrame } from '@/components/shared/layout/studio-frame'
import { JobDetailControlRoom } from '@/components/widgets/job-detail/control-room'
import { buildJobDetailViewModel } from '@/components/widgets/job-detail/job-detail-view-model'
import { useJobDetailActions } from '@/components/widgets/job-detail/use-job-detail-actions'
import { useJobDetailQuery } from '@/components/widgets/job-detail/use-job-detail-query'
import { useI18n, useLocaleText } from '@/lib/i18n'
import type { ReasoningEffort } from '@/lib/reasoning-effort'

export function JobDetailShell({ jobId }: { jobId: string }) {
  const { locale } = useI18n()
  const text = useLocaleText()
  const {
    detail,
    setDetail,
    models,
    settings,
    effectiveRubricMd,
    effectiveRubricSource,
    loading,
    error,
    setError,
  } = useJobDetailQuery({ jobId, text })

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
    if (!detail || modelDirty) {
      return
    }
    setTaskModel(detail.job.pendingOptimizerModel ?? detail.job.optimizerModel)
    setReasoningEffort(detail.job.pendingOptimizerReasoningEffort ?? detail.job.optimizerReasoningEffort)
  }, [detail, modelDirty])

  useEffect(() => {
    if (!detail || maxRoundsDirty) {
      return
    }
    setMaxRoundsOverrideValue(detail.job.maxRoundsOverride === null ? '' : String(detail.job.maxRoundsOverride))
  }, [detail, maxRoundsDirty])

  useEffect(() => {
    if (!detail || customRubricDirty) {
      return
    }
    setCustomRubricMd(detail.job.customRubricMd ?? '')
  }, [detail, customRubricDirty])

  useEffect(() => {
    if (!detail || goalAnchorDirty) {
      return
    }
    setGoalAnchorGoal(detail.job.goalAnchor.goal)
    setGoalAnchorDeliverable(detail.job.goalAnchor.deliverable)
    setGoalAnchorDriftGuardText(detail.job.goalAnchor.driftGuard.join('\n'))
    setGoalAnchorDraftReady(false)
    setGoalAnchorDraftConsumeIds([])
  }, [detail, goalAnchorDirty])

  useEffect(() => {
    if (!detail) {
      return
    }

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

  const model = useMemo(() => {
    if (!detail) {
      return null
    }

    return buildJobDetailViewModel({
      detail,
      jobId,
      locale,
      settings,
      effectiveRubricMd,
      effectiveRubricSource,
    })
  }, [detail, effectiveRubricMd, effectiveRubricSource, jobId, locale, settings])

  const actions = useJobDetailActions({
    jobId,
    text,
    detail,
    model,
    taskModel,
    reasoningEffort,
    maxRoundsOverrideValue,
    pendingSteeringInput,
    customRubricMd,
    goalAnchorGoal,
    goalAnchorDeliverable,
    goalAnchorDriftGuardText,
    selectedPendingSteeringIds,
    goalAnchorDraftReady,
    goalAnchorDraftConsumeIds,
    setDetail,
    setError,
    setActionMessage,
    setModelDirty,
    setMaxRoundsDirty,
    setCustomRubricDirty,
    setGoalAnchorDirty,
    setGoalAnchorGoal,
    setGoalAnchorDeliverable,
    setGoalAnchorDriftGuardText,
    setGoalAnchorDraftReady,
    setGoalAnchorDraftConsumeIds,
    setPendingSteeringInput,
    setExpandedRounds,
    setRetrying,
    setSavingModels,
    setSavingMaxRounds,
    setSavingCustomRubric,
    setSavingSteering,
    setGeneratingGoalAnchorDraft,
    setSavingGoalAnchor,
    setCancelling,
    setPausing,
    setResumingStep,
    setResumingAuto,
    setCompleting,
    setCopyingPrompt,
  })

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
              onRetry: actions.retry,
              onSaveModel: actions.saveModel,
              onSaveMaxRoundsOverride: actions.saveMaxRoundsOverride,
              onSaveCustomRubric: actions.saveCustomRubric,
              onAddPendingSteering: actions.addPendingSteering,
              onRemovePendingSteeringItem: actions.removePendingSteeringItem,
              onClearPendingSteering: actions.clearPendingSteering,
              onGenerateGoalAnchorDraft: actions.generateGoalAnchorDraft,
              onSaveGoalAnchor: actions.saveGoalAnchor,
              onPauseTask: actions.pauseTask,
              onResumeStep: actions.resumeStep,
              onResumeAuto: actions.resumeAuto,
              onCancelTask: actions.cancelTask,
              onCompleteTask: actions.completeTask,
              onCopyLatestPrompt: actions.copyLatestPrompt,
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
              onPendingSteeringInputChange: setPendingSteeringInput,
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
                actions.resetDraftState()
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
