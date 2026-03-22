import type {
  EffectiveRubricSource,
  JobDetailPayload,
  JobDetailViewModel,
  SettingsPayload,
} from '@/components/widgets/job-detail/job-detail-types'
import { getJobFailureKind, getTaskModelLabel, resolveLatestFullPrompt } from '@/lib/presentation'

export function buildJobDetailViewModel(input: {
  detail: JobDetailPayload
  jobId: string
  locale: 'zh-CN' | 'en'
  settings: SettingsPayload
  effectiveRubricMd: string
  effectiveRubricSource: EffectiveRubricSource
}): JobDetailViewModel {
  const { detail, jobId, locale, settings, effectiveRubricMd, effectiveRubricSource } = input
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
    finalCandidateId: detail.job.finalCandidateId,
    customRubricMd: detail.job.customRubricMd,
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
      outputFinal: Boolean(detail.job.finalCandidateId && round.outputCandidateId === detail.job.finalCandidateId),
    })),
  }
}
