'use client'

import type { ReasoningEffort } from '@/lib/reasoning-effort'
import type { JobDetailPayload } from '@/components/widgets/job-detail/job-detail-types'
import type { JobDetailViewModel } from '@/components/widgets/job-detail/control-room'

export function useJobDetailActions(input: {
  jobId: string
  text: (zh: string, en: string) => string
  detail: JobDetailPayload | null
  model: JobDetailViewModel | null
  taskModel: string
  reasoningEffort: ReasoningEffort
  maxRoundsOverrideValue: string
  pendingSteeringInput: string
  customRubricMd: string
  goalAnchorGoal: string
  goalAnchorDeliverable: string
  goalAnchorDriftGuardText: string
  selectedPendingSteeringIds: string[]
  goalAnchorDraftReady: boolean
  goalAnchorDraftConsumeIds: string[]
  setDetail: React.Dispatch<React.SetStateAction<JobDetailPayload | null>>
  setError: (value: string | null) => void
  setActionMessage: (value: string | null) => void
  setModelDirty: (value: boolean) => void
  setMaxRoundsDirty: (value: boolean) => void
  setCustomRubricDirty: (value: boolean) => void
  setGoalAnchorDirty: (value: boolean) => void
  setGoalAnchorGoal: (value: string) => void
  setGoalAnchorDeliverable: (value: string) => void
  setGoalAnchorDriftGuardText: (value: string) => void
  setGoalAnchorDraftReady: (value: boolean) => void
  setGoalAnchorDraftConsumeIds: (value: string[]) => void
  setPendingSteeringInput: (value: string) => void
  setExpandedRounds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setRetrying: (value: boolean) => void
  setSavingModels: (value: boolean) => void
  setSavingMaxRounds: (value: boolean) => void
  setSavingCustomRubric: (value: boolean) => void
  setSavingSteering: (value: boolean) => void
  setGeneratingGoalAnchorDraft: (value: boolean) => void
  setSavingGoalAnchor: (value: boolean) => void
  setCancelling: (value: boolean) => void
  setPausing: (value: boolean) => void
  setResumingStep: (value: boolean) => void
  setResumingAuto: (value: boolean) => void
  setCompleting: (value: boolean) => void
  setCopyingPrompt: (value: boolean) => void
}) {
  const {
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
  } = input

  function mergeJobUpdate(jobPatch: JobDetailPayload['job']) {
    setDetail((current) => current ? { ...current, job: { ...current.job, ...jobPatch } } : current)
  }

  function resetDraftState() {
    setGoalAnchorDraftReady(false)
    setGoalAnchorDraftConsumeIds([])
  }

  async function requestJobMutation<T>(path: string, init: RequestInit, fallbackZh: string, fallbackEn: string) {
    const response = await fetch(path, init)
    const payload = await response.json() as T & { error?: string }
    if (!response.ok) {
      throw new Error(payload.error ?? text(fallbackZh, fallbackEn))
    }
    return payload
  }

  return {
    mergeJobUpdate,
    resetDraftState,
    async retry() {
      setRetrying(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/retry`,
          { method: 'POST' },
          '重新开始失败。',
          'Retry failed.',
        )
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
      } catch (error) {
        setError(error instanceof Error ? error.message : text('重新开始失败。', 'Retry failed.'))
        setActionMessage(null)
      } finally {
        setRetrying(false)
      }
    },
    async saveModel() {
      setSavingModels(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              optimizerModel: taskModel,
              judgeModel: taskModel,
              optimizerReasoningEffort: reasoningEffort,
              judgeReasoningEffort: reasoningEffort,
            }),
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setModelDirty(false)
        setActionMessage(detail?.job.status === 'running'
          ? text('任务模型与推理强度已保存，将在下一轮生效。', 'The task model and reasoning effort were saved and will take effect next round.')
          : text('任务模型与推理强度已保存。', 'The task model and reasoning effort were saved.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingModels(false)
      }
    },
    async saveMaxRoundsOverride() {
      setSavingMaxRounds(true)
      try {
        const normalizedValue = maxRoundsOverrideValue.trim()
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxRoundsOverride: normalizedValue ? Number(normalizedValue) : null }),
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setMaxRoundsDirty(false)
        setActionMessage(detail?.job.status === 'running'
          ? text('任务级最大轮数已保存，将在下一轮检查时生效。', 'The task-level round cap was saved and will take effect at the next round check.')
          : text('任务级最大轮数已保存。', 'The task-level round cap was saved.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingMaxRounds(false)
      }
    },
    async saveCustomRubric(nextValue?: string) {
      setSavingCustomRubric(true)
      try {
        const valueToSave = (nextValue ?? customRubricMd).trim()
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customRubricMd: valueToSave || null }),
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setCustomRubricDirty(false)
        setActionMessage(detail?.job.status === 'running'
          ? text('任务级评分标准已保存，将在下一轮生效。', 'The task scoring standard was saved and will take effect next round.')
          : text('任务级评分标准已保存。', 'The task scoring standard was saved.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingCustomRubric(false)
      }
    },
    async addPendingSteering() {
      setSavingSteering(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steeringAction: { type: 'add', text: pendingSteeringInput } }),
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setActionMessage(detail?.job.status === 'running'
          ? text('人工引导已加入待生效列表，将在下一轮生效。', 'The steering note was added to the pending list and will take effect next round.')
          : text('人工引导已加入待生效列表。', 'The steering note was added to the pending list.'))
        setPendingSteeringInput('')
        resetDraftState()
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingSteering(false)
      }
    },
    async removePendingSteeringItem(itemId: string) {
      setSavingSteering(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steeringAction: { type: 'remove', itemId } }),
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setActionMessage(text('已删除这条待生效引导。', 'The pending steering item was removed.'))
        resetDraftState()
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingSteering(false)
      }
    },
    async clearPendingSteering() {
      setSavingSteering(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steeringAction: { type: 'clear' } }),
          },
          '清空失败。',
          'Clear failed.',
        )
        setError(null)
        setActionMessage(text('待生效引导已清空。', 'Pending steering was cleared.'))
        resetDraftState()
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('清空失败。', 'Clear failed.'))
        setActionMessage(null)
      } finally {
        setSavingSteering(false)
      }
    },
    async generateGoalAnchorDraft() {
      setGeneratingGoalAnchorDraft(true)
      try {
        const payload = await requestJobMutation<{
          goalAnchorDraft?: { goal: string; deliverable: string; driftGuard: string[] }
          consumePendingSteeringIds?: string[]
        }>(
          `/api/jobs/${jobId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steeringAction: { type: 'build_goal_anchor_draft', itemIds: selectedPendingSteeringIds } }),
          },
          '草稿生成失败。',
          'Draft generation failed.',
        )
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
      } catch (error) {
        setError(error instanceof Error ? error.message : text('草稿生成失败。', 'Draft generation failed.'))
        setActionMessage(null)
      } finally {
        setGeneratingGoalAnchorDraft(false)
      }
    },
    async saveGoalAnchor() {
      setSavingGoalAnchor(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}`,
          {
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
          },
          '保存失败。',
          'Save failed.',
        )
        setError(null)
        setGoalAnchorDirty(false)
        const consumedPending = goalAnchorDraftReady && goalAnchorDraftConsumeIds.length > 0
        resetDraftState()
        setActionMessage(consumedPending
          ? text('长期规则已保存，并已吸收本次选中的待生效引导。', 'Stable rules were saved and absorbed the selected pending steering.')
          : text('长期规则已保存。后续所有轮次都会受它约束。', 'Stable rules were saved. All later rounds will stay constrained by them.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('保存失败。', 'Save failed.'))
        setActionMessage(null)
      } finally {
        setSavingGoalAnchor(false)
      }
    },
    async pauseTask() {
      setPausing(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/pause`,
          { method: 'POST' },
          '暂停失败。',
          'Pause failed.',
        )
        setError(null)
        setActionMessage(detail?.job.status === 'running'
          ? text('已请求暂停，当前轮结束后会停下。', 'Pause requested. The job will stop after the current round.')
          : text('任务已暂停。', 'The job was paused.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('暂停失败。', 'Pause failed.'))
        setActionMessage(null)
      } finally {
        setPausing(false)
      }
    },
    async resumeStep() {
      setResumingStep(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/resume-step`,
          { method: 'POST' },
          '继续一轮失败。',
          'Resume step failed.',
        )
        setError(null)
        setActionMessage(text('任务将继续一轮，完成后会自动回到暂停。', 'The job will run one more round and pause again afterward.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('继续一轮失败。', 'Resume step failed.'))
        setActionMessage(null)
      } finally {
        setResumingStep(false)
      }
    },
    async resumeAuto() {
      setResumingAuto(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/resume-auto`,
          { method: 'POST' },
          '恢复自动运行失败。',
          'Resume auto failed.',
        )
        setError(null)
        setActionMessage(text('任务已恢复自动运行。', 'The job resumed automatic execution.'))
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('恢复自动运行失败。', 'Resume auto failed.'))
        setActionMessage(null)
      } finally {
        setResumingAuto(false)
      }
    },
    async cancelTask() {
      setCancelling(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/cancel`,
          { method: 'POST' },
          '取消失败。',
          'Cancel failed.',
        )
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
      } catch (error) {
        setError(error instanceof Error ? error.message : text('取消失败。', 'Cancel failed.'))
        setActionMessage(null)
      } finally {
        setCancelling(false)
      }
    },
    async completeTask() {
      setCompleting(true)
      try {
        const payload = await requestJobMutation<{ job: JobDetailPayload['job'] }>(
          `/api/jobs/${jobId}/complete`,
          { method: 'POST' },
          '完成归档失败。',
          'Complete failed.',
        )
        setError(null)
        setActionMessage(text('任务已完成并归档。', 'The job was completed and archived.'))
        setModelDirty(false)
        setMaxRoundsDirty(false)
        setCustomRubricDirty(false)
        setGoalAnchorDirty(false)
        resetDraftState()
        mergeJobUpdate(payload.job)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('完成归档失败。', 'Complete failed.'))
        setActionMessage(null)
      } finally {
        setCompleting(false)
      }
    },
    async copyLatestPrompt() {
      if (!model?.latestFullPrompt) {
        return
      }
      setCopyingPrompt(true)
      try {
        await navigator.clipboard.writeText(model.latestFullPrompt)
        setActionMessage(text('最新完整提示词已复制。', 'The latest full prompt was copied.'))
        setError(null)
      } catch (error) {
        setError(error instanceof Error ? error.message : text('复制失败。', 'Copy failed.'))
        setActionMessage(null)
      } finally {
        setCopyingPrompt(false)
      }
    },
  }
}
