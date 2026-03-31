import { summarizeJudgments } from '@/lib/engine/optimization-cycle'
import { areEquivalentPromptTexts } from '@/lib/prompt-text'
import { sanitizeReviewFeedbackItems } from '@/lib/review-feedback'
import {
  isReviewFallbackFinding,
  isReviewFallbackSuggestedChange,
  isReviewFallbackSummary,
  stripFallbackItems,
} from '@/lib/review-fallbacks'
import { CpamcModelAdapter } from '@/lib/server/model-adapter'
import {
  addPendingSteeringItemsWithResult,
  applyPendingJobModels,
  claimNextRunnableJob,
  countConsecutiveNoProgressRounds,
  countConsecutiveStalledOptimizerRounds,
  consumePendingSteeringItems,
  finalizeCancelledJob,
  getJobById,
  getOptimizerSeed,
  heartbeatJobClaim,
  reapStaleRunningJobsOnStartup,
  recordRoundRunForActiveWorker,
  updateJobProgress,
  updateJobReviewState,
} from '@/lib/server/jobs'
import { getPromptPackVersion } from '@/lib/server/prompt-pack'
import { getSettings, validateCpamcConnection } from '@/lib/server/settings'
import type { JobRunMode, JobStatus, JudgeRunRecord } from '@/lib/server/types'
import {
  createWorkerRuntimeState,
  resolveStableWorkerOwnerId,
  shouldReplaceWorkerRuntime,
} from '@/lib/server/worker-runtime'

const globalWorkerState = globalThis as typeof globalThis & {
  __promptOptimizerWorker?: ReturnType<typeof createWorkerRuntimeState>
  __promptOptimizerWorkerOwnerId?: string
}

const WORKER_OWNER_ID = resolveStableWorkerOwnerId(globalWorkerState, () => crypto.randomUUID())
const WORKER_RUNTIME_VERSION = crypto.randomUUID()

export function ensureWorkerStarted() {
  if (shouldReplaceWorkerRuntime(globalWorkerState.__promptOptimizerWorker, WORKER_OWNER_ID, WORKER_RUNTIME_VERSION)) {
    if (globalWorkerState.__promptOptimizerWorker?.intervalId) {
      clearInterval(globalWorkerState.__promptOptimizerWorker.intervalId)
    }
    if (globalWorkerState.__promptOptimizerWorker?.heartbeatIntervalId) {
      clearInterval(globalWorkerState.__promptOptimizerWorker.heartbeatIntervalId)
    }
    globalWorkerState.__promptOptimizerWorker = createWorkerRuntimeState(WORKER_OWNER_ID, WORKER_RUNTIME_VERSION)
  }

  const state = globalWorkerState.__promptOptimizerWorker
  if (!state) {
    return
  }

  reapStaleRunningJobsOnStartup()
  if (state.started) {
    void pumpQueue()
    return
  }

  state.started = true
  state.intervalId = setInterval(() => {
    void pumpQueue()
  }, 2500)
  state.heartbeatIntervalId = setInterval(() => {
    beatActiveJobs()
  }, 5000)
  void pumpQueue()
}

export function resolvePostReviewStatus(input: {
  shouldComplete: boolean
  roundNumber: number
  maxRounds: number
  runMode: JobRunMode
  pauseRequestedAt: string | null
}): JobStatus {
  if (input.shouldComplete) {
    return 'completed'
  }

  if (input.pauseRequestedAt || input.runMode === 'step') {
    return 'paused'
  }

  if (input.roundNumber >= input.maxRounds) {
    return 'manual_review'
  }

  return 'running'
}

export function resolvePostFailureStatus(input: {
  runMode: JobRunMode
  hasUsableResult: boolean
  error: unknown
}): JobStatus {
  if (!input.hasUsableResult || !matchesInfraFailure(input.error)) {
    return 'failed'
  }

  return input.runMode === 'step' ? 'paused' : 'pending'
}

function containsFallbackReviewText(items: string[], matcher: (value: string) => boolean) {
  return items.some((item) => matcher(item.trim()))
}

export function resolveCandidateScoreBefore(
  review: Pick<JudgeRunRecord, 'score'> | null,
  optimizerScoreBefore: number | null,
) {
  if (review) {
    return review.score
  }

  if (typeof optimizerScoreBefore === 'number' && Number.isFinite(optimizerScoreBefore)) {
    return optimizerScoreBefore
  }

  return 0
}

export function buildOptimizerReviewFeedback(
  review: Pick<JudgeRunRecord, 'findings' | 'suggestedChanges' | 'dimensionReasons'> | null,
) {
  if (!review) {
    return []
  }

  const actionableFindings = review.findings.filter(isActionableReviewFinding)
  return sanitizeReviewFeedbackItems([
    ...(review.dimensionReasons ?? []),
    ...actionableFindings,
    ...review.suggestedChanges,
  ])
}

function normalizeReviewSuggestionText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function collectAutoApplyReviewSuggestionTexts(items: string[]) {
  return sanitizeReviewFeedbackItems(stripFallbackItems(items, isReviewFallbackSuggestedChange))
    .map(normalizeReviewSuggestionText)
    .filter(Boolean)
}

export function applyAutomaticReviewSuggestionAdoption(input: {
  jobId: string
  enabled: boolean
  toStableRules: boolean
  suggestedChanges: string[]
}) {
  if (!input.enabled) {
    return null
  }

  const texts = collectAutoApplyReviewSuggestionTexts(input.suggestedChanges)
  if (texts.length === 0) {
    return null
  }

  return addPendingSteeringItemsWithResult(
    input.jobId,
    texts,
    input.toStableRules ? 'stable' : 'pending',
  )
}

function isActionableReviewFinding(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return false
  }

  return /缺少|不够|不足|未|没有|需要|需补|应当|必须|冲突|异常|失败|兜底|回退|不一致|边界|约束|输出标准|输出契约|契约|门槛|达标|前提|自检|验证|漂移|泛化|空泛|模糊|薄|missing|lack|needs?|should|must|conflict|edge|exception|fallback|retry|verify|validation|constraint|unclear|incomplete|generic|thin/i.test(normalized)
}

export function reviewPassesCredibly(
  review: Pick<JudgeRunRecord, 'score' | 'hasMaterialIssues' | 'summary' | 'driftLabels' | 'findings' | 'suggestedChanges'> | null,
  threshold: number = 95,
) {
  if (!review) {
    return false
  }

  if (review.score < threshold || review.hasMaterialIssues || review.driftLabels.length > 0) {
    return false
  }

  if (isReviewFallbackSummary(review.summary.trim())) {
    return false
  }

  if (containsFallbackReviewText(review.findings, isReviewFallbackFinding)) {
    return false
  }

  if (containsFallbackReviewText(review.suggestedChanges, isReviewFallbackSuggestedChange)) {
    return false
  }

  return true
}

export function nextCrediblePassStreak(input: {
  currentPassStreak: number
  review: Pick<JudgeRunRecord, 'score' | 'hasMaterialIssues' | 'summary' | 'driftLabels' | 'findings' | 'suggestedChanges'> | null
  threshold?: number
  optimizationError?: Error | null
}) {
  if (!reviewPassesCredibly(input.review, input.threshold ?? 95)) {
    return 0
  }

  if (input.optimizationError) {
    return 0
  }

  return input.currentPassStreak + 1
}

export function resolvePassTrackingAfterRound(input: {
  currentPassStreak: number
  currentPassStreakCandidateId: string | null
  review: Pick<JudgeRunRecord, 'score' | 'hasMaterialIssues' | 'summary' | 'driftLabels' | 'findings' | 'suggestedChanges'> | null
  threshold?: number
  optimizationError?: Error | null
  currentCandidateId: string | null
  outputCandidateId: string | null
}) {
  if (input.outputCandidateId) {
    return {
      passStreak: 0,
      passStreakCandidateId: input.outputCandidateId,
    }
  }

  if (!input.currentCandidateId) {
    return {
      passStreak: 0,
      passStreakCandidateId: null,
    }
  }

  if (!reviewPassesCredibly(input.review, input.threshold ?? 95) || input.optimizationError) {
    return {
      passStreak: 0,
      passStreakCandidateId: input.currentCandidateId,
    }
  }

  return {
    passStreak: input.currentPassStreakCandidateId === input.currentCandidateId
      ? input.currentPassStreak + 1
      : 1,
    passStreakCandidateId: input.currentCandidateId,
  }
}

export function shouldCompleteAfterCredibleReview(input: {
  passStreakAfter: number
  passStreakCandidateId: string | null
  currentCandidateId: string | null
  outputCandidateId: string | null
  review: Pick<JudgeRunRecord, 'score' | 'hasMaterialIssues' | 'summary' | 'driftLabels' | 'findings' | 'suggestedChanges'> | null
  threshold?: number
  requiredPassCount?: number
}) {
  return reviewPassesCredibly(input.review, input.threshold ?? 95)
    && Boolean(input.currentCandidateId)
    && input.outputCandidateId === null
    && input.passStreakCandidateId === input.currentCandidateId
    && input.passStreakAfter >= (input.requiredPassCount ?? 3)
}

async function pumpQueue() {
  const state = globalWorkerState.__promptOptimizerWorker
  if (!state) {
    return
  }

  if (state.isPumping) {
    state.repumpRequested = true
    return
  }

  state.isPumping = true
  const settings = getSettings()
  try {
    do {
      state.repumpRequested = false

      while (state.activeCount < settings.workerConcurrency) {
        const job = claimNextRunnableJob(WORKER_OWNER_ID)
        if (!job) {
          break
        }

        state.activeCount += 1
        state.activeJobIds.add(job.id)
        void runJob(job.id).finally(() => {
          state.activeJobIds.delete(job.id)
          state.activeCount -= 1
          void pumpQueue()
        })
      }
    } while (state.repumpRequested && state.activeCount < settings.workerConcurrency)
  } finally {
    state.isPumping = false
  }
}

function beatActiveJobs() {
  const state = globalWorkerState.__promptOptimizerWorker
  if (!state) {
    return
  }

  for (const jobId of state.activeJobIds) {
    heartbeatJobClaim(jobId, WORKER_OWNER_ID)
  }
}

async function runJob(jobId: string) {
  try {
    const settings = getSettings()
    validateCpamcConnection(settings)

    while (true) {
      const liveJob = getJobById(jobId)
      if (!liveJob) {
        return
      }

      if (liveJob.cancelRequestedAt) {
        finalizeCancelledJob(jobId)
        return
      }

      if (
        liveJob.pendingOptimizerModel
        || liveJob.pendingJudgeModel
        || liveJob.pendingOptimizerReasoningEffort !== null
        || liveJob.pendingJudgeReasoningEffort !== null
      ) {
        applyPendingJobModels(jobId)
      }

      const activeJob = getJobById(jobId)
      if (!activeJob) {
        return
      }

      const maxRounds = activeJob.maxRoundsOverride ?? settings.maxRounds

      const {
        currentPrompt,
        currentCandidateId,
        latestRoundNumber,
        goalAnchor,
        pendingSteeringItems,
      } = getOptimizerSeed(jobId)
      const effectiveCurrentRound = Math.max(activeJob.currentRound, latestRoundNumber)
      if (effectiveCurrentRound >= maxRounds) {
        updateJobProgress(jobId, {
          status: 'manual_review',
          currentRound: effectiveCurrentRound,
          bestAverageScore: activeJob.bestAverageScore,
          finalCandidateId: activeJob.finalCandidateId,
          errorMessage: '达到最大轮数，已停止自动优化。',
        })
        return
      }

      const pack = getPromptPackVersion(activeJob.packVersionId)
      const effectiveRubric = activeJob.customRubricMd || settings.customRubricMd
      const effectivePack = effectiveRubric
        ? { ...pack, rubricMd: effectiveRubric }
        : pack
      const adapter = new CpamcModelAdapter(settings, effectivePack, {
        optimizerModel: activeJob.optimizerModel,
        judgeModel: activeJob.judgeModel,
        optimizerReasoningEffort: activeJob.optimizerReasoningEffort,
        judgeReasoningEffort: activeJob.judgeReasoningEffort,
      })
      let review: JudgeRunRecord | null = null
      let aggregatedIssues: string[] = []
      let reviewError: Error | null = null

      try {
        const inputReview = await adapter.judgePrompt(currentPrompt, 0, goalAnchor)
        review = {
          id: crypto.randomUUID(),
          jobId,
          candidateId: currentCandidateId ?? '',
          judgeIndex: 0,
          score: inputReview.score,
          hasMaterialIssues: inputReview.hasMaterialIssues,
          dimensionScores: inputReview.dimensionScores ?? null,
          summary: inputReview.summary,
          driftLabels: inputReview.driftLabels,
          driftExplanation: inputReview.driftExplanation,
          findings: inputReview.findings,
          suggestedChanges: inputReview.suggestedChanges,
          dimensionReasons: inputReview.dimensionReasons ?? [],
          rubricDimensionsSnapshot: inputReview.rubricDimensionsSnapshot ?? null,
          createdAt: new Date().toISOString(),
        }
        aggregatedIssues = summarizeJudgments([inputReview], settings.scoreThreshold).aggregatedIssues
      } catch (error) {
        reviewError = error instanceof Error ? error : new Error(String(error ?? 'Unknown review error'))
      }

      let optimization: Awaited<ReturnType<CpamcModelAdapter['optimizePrompt']>> | null = null
      let optimizationError: Error | null = null
      const actionableReviewFeedback = buildOptimizerReviewFeedback(review)

      try {
        optimization = await adapter.optimizePrompt({
          currentPrompt,
          goalAnchor,
          pendingSteeringItems,
          reviewFeedbackItems: actionableReviewFeedback,
        })
      } catch (error) {
        optimizationError = error instanceof Error ? error : new Error(String(error ?? 'Unknown optimization error'))
      }

      const predictedOutputCandidateId = optimization && !areEquivalentPromptTexts(
        currentPrompt,
        optimization.optimizedPrompt,
      )
        ? 'material-output'
        : null
      const strictNoOutputFailureMessage = (
        review
        && optimization
        && !optimizationError
        && predictedOutputCandidateId === null
        && actionableReviewFeedback.length > 0
      )
        ? '本轮仍有未解决缺口，但优化器两次都没有产出可替换的新稿。'
        : null
      const effectiveOptimizationError = strictNoOutputFailureMessage
        ? new Error(strictNoOutputFailureMessage)
        : optimizationError
      const passTracking = resolvePassTrackingAfterRound({
        currentPassStreak: activeJob.passStreak,
        currentPassStreakCandidateId: activeJob.passStreakCandidateId,
        review,
        threshold: settings.scoreThreshold,
        optimizationError: effectiveOptimizationError,
        currentCandidateId,
        outputCandidateId: predictedOutputCandidateId,
      })
      const shouldComplete = shouldCompleteAfterCredibleReview({
        passStreakAfter: passTracking.passStreak,
        passStreakCandidateId: passTracking.passStreakCandidateId,
        currentCandidateId,
        outputCandidateId: predictedOutputCandidateId,
        review,
        threshold: settings.scoreThreshold,
        requiredPassCount: settings.judgePassCount,
      })

      const committedRound = recordRoundRunForActiveWorker(jobId, WORKER_OWNER_ID, {
        currentPrompt,
        currentCandidateId,
        optimization: optimization
          ? {
              ...optimization,
              scoreBefore: resolveCandidateScoreBefore(review, optimization.scoreBefore),
            }
          : null,
        review,
        aggregatedIssues,
        appliedSteeringItems: pendingSteeringItems,
        outcome: resolveRoundOutcome({
          optimization,
          review,
          optimizationError: effectiveOptimizationError,
          reviewError,
        }),
        optimizerError: effectiveOptimizationError?.message ?? null,
        judgeError: reviewError?.message ?? null,
        passStreakAfter: passTracking.passStreak,
      })
      if (!committedRound) {
        return
      }

      const latestJob = getJobById(jobId)
      if (latestJob?.cancelRequestedAt) {
        finalizeCancelledJob(jobId)
        return
      }

      const commitState = resolveRoundCommitState({
        shouldComplete,
        hasReview: Boolean(review),
        outputCandidateId: committedRound.outputCandidateId,
        currentCandidateId,
        finalCandidateId: activeJob.finalCandidateId,
        roundNumber: committedRound.roundNumber,
        maxRounds,
        runMode: activeJob.runMode,
        pauseRequestedAt: latestJob?.pauseRequestedAt ?? null,
        threshold: settings.scoreThreshold,
        reviewScore: review?.score ?? null,
        reviewHasMaterialIssues: review?.hasMaterialIssues ?? null,
        optimizationError: effectiveOptimizationError,
        reviewError,
        strictNoOutputFailureMessage,
      })
      const stalledOptimizerRounds = (!committedRound.outputCandidateId && optimizationError)
        ? countConsecutiveStalledOptimizerRounds(jobId, {
          currentCandidateId,
          currentPrompt,
          maxRows: Math.max(settings.noImprovementLimit + 2, 6),
        })
        : 0
      const noProgressRounds = !committedRound.outputCandidateId
        ? countConsecutiveNoProgressRounds(jobId, {
          currentCandidateId,
          currentPrompt,
          maxRows: Math.max(settings.noImprovementLimit + 2, 6),
        })
        : 0
      const stabilizedCommitState = applyRepeatedNoOutputGuard(commitState, {
        runMode: activeJob.runMode,
        noImprovementLimit: settings.noImprovementLimit,
        stalledOptimizerRounds,
        noProgressRounds,
        hasOutputCandidate: Boolean(committedRound.outputCandidateId),
        optimizationError,
        currentCandidateId,
        passStreakAfter: passTracking.passStreak,
        requiredPassCount: settings.judgePassCount,
      })

      updateJobReviewState(jobId, {
        passStreak: passTracking.passStreak,
        passStreakCandidateId: passTracking.passStreakCandidateId,
        bestAverageScore: review ? Math.max(activeJob.bestAverageScore, review.score) : activeJob.bestAverageScore,
        lastReviewScore: review?.score ?? activeJob.lastReviewScore,
        lastReviewPatch: review ? aggregatedIssues : activeJob.lastReviewPatch,
        currentRound: committedRound.roundNumber,
        finalCandidateId: stabilizedCommitState.finalCandidateId,
        status: stabilizedCommitState.status,
        errorMessage: stabilizedCommitState.errorMessage,
      })
      if (commitState.status === 'completed' || committedRound.outputCandidateId) {
        consumePendingSteeringItems(jobId, pendingSteeringItems.map((item) => item.id))
      }

      const postRoundJob = getJobById(jobId)
      if (postRoundJob && review) {
        applyAutomaticReviewSuggestionAdoption({
          jobId,
          enabled: postRoundJob.autoApplyReviewSuggestions,
          toStableRules: postRoundJob.autoApplyReviewSuggestionsToStableRules,
          suggestedChanges: review.suggestedChanges,
        })
      }

      if (
        stabilizedCommitState.status === 'completed'
        || stabilizedCommitState.status === 'manual_review'
        || stabilizedCommitState.status === 'paused'
        || stabilizedCommitState.status === 'pending'
      ) {
        return
      }
    }
  } catch (error) {
    const failedJob = getJobById(jobId)
    const failureStatus = resolvePostFailureStatus({
      runMode: failedJob?.runMode ?? 'auto',
      hasUsableResult: Boolean(
        failedJob
        && (
          failedJob.candidateCount > 0
          || failedJob.currentRound > 0
          || failedJob.finalCandidateId
        )
      ),
      error,
    })
    updateJobProgress(jobId, {
      status: failureStatus,
      currentRound: failedJob?.currentRound ?? 0,
      bestAverageScore: failedJob?.bestAverageScore ?? 0,
      finalCandidateId: failedJob?.finalCandidateId ?? null,
      errorMessage: error instanceof Error ? error.message : 'Unknown worker error',
    })
  }
}

function matchesInfraFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : NaN
  const retriable = typeof error === 'object' && error !== null && 'retriable' in error
    ? Boolean((error as { retriable?: unknown }).retriable)
    : false

  return retriable
    || Number.isFinite(status) && (status === 408 || status === 429 || status >= 500)
    || /(fetch failed|timeout|timed out|gateway time-?out|bad gateway|the operation was aborted|etimedout|econnreset|econnrefused|socket hang up|cloudflare|upstream|network|\b50[234]\b)/i.test(message)
}

export function applyRepeatedNoOutputGuard(
  commitState: {
    status: JobStatus
    finalCandidateId: string | null
    errorMessage: string | null
  },
  input: {
    runMode: JobRunMode
    noImprovementLimit: number
    stalledOptimizerRounds: number
    noProgressRounds: number
    hasOutputCandidate: boolean
    optimizationError: Error | null
    currentCandidateId?: string | null
    passStreakAfter?: number
    requiredPassCount?: number
  },
) {
  if (
    commitState.status !== 'pending'
    || input.hasOutputCandidate
    || input.noImprovementLimit <= 0
    || input.noProgressRounds < input.noImprovementLimit
  ) {
    return commitState
  }

  if (shouldKeepRecheckingStableCandidate(input)) {
    return commitState
  }

  return {
    status: input.runMode === 'step' ? 'paused' as const : 'manual_review' as const,
    finalCandidateId: null,
    errorMessage: resolveNoProgressErrorMessage(input),
  }
}

function shouldKeepRecheckingStableCandidate(input: {
  currentCandidateId?: string | null
  passStreakAfter?: number
  requiredPassCount?: number
}) {
  if (!input.currentCandidateId) {
    return false
  }

  const passStreakAfter = input.passStreakAfter ?? 0
  if (passStreakAfter <= 0) {
    return false
  }

  return passStreakAfter < (input.requiredPassCount ?? 3)
}

function resolveNoProgressErrorMessage(input: {
  runMode: JobRunMode
  noProgressRounds: number
  optimizationError: Error | null
}) {
  const prefix = input.runMode === 'step'
    ? `连续 ${input.noProgressRounds} 轮未生成新版本，已暂停等待处理`
    : `连续 ${input.noProgressRounds} 轮未生成新版本，已停止自动续跑并等待处理`

  return input.optimizationError ? `${prefix}：${input.optimizationError.message}` : `${prefix}：优化器连续返回等价版本，没有形成实质新稿。`
}

export function resolveRoundOutcome(input: {
  optimization: Awaited<ReturnType<CpamcModelAdapter['optimizePrompt']>> | null
  review: JudgeRunRecord | null
  optimizationError: Error | null
  reviewError: Error | null
}) {
  const { optimization, review, optimizationError, reviewError } = input
  if (optimization && review && optimizationError) {
    return 'optimizer_failed'
  }
  if (optimization && review) {
    return 'settled'
  }
  if (review && !optimization && !optimizationError) {
    return 'settled'
  }
  if (optimization) {
    return 'judge_failed'
  }
  if (review) {
    return 'optimizer_failed'
  }
  return 'both_failed'
}

export function resolveRoundCommitState(input: {
  shouldComplete: boolean
  hasReview: boolean
  outputCandidateId: string | null
  currentCandidateId: string | null
  finalCandidateId: string | null
  roundNumber: number
  maxRounds: number
  runMode: JobRunMode
  pauseRequestedAt: string | null
  threshold: number
  reviewScore: number | null
  reviewHasMaterialIssues: boolean | null
  optimizationError: Error | null
  reviewError: Error | null
  strictNoOutputFailureMessage?: string | null
}) {
  const fallbackCandidateId = input.currentCandidateId ?? input.finalCandidateId
  const hasPassingReviewedInput = (
    input.hasReview
    && input.outputCandidateId === null
    && input.currentCandidateId === null
    && input.reviewScore !== null
    && input.reviewScore >= input.threshold
    && input.reviewHasMaterialIssues === false
  )
  const hasUsableResult = Boolean(input.outputCandidateId ?? fallbackCandidateId) || hasPassingReviewedInput

  if (input.shouldComplete && input.hasReview && (fallbackCandidateId || hasPassingReviewedInput)) {
    return {
      status: 'completed' as const,
      finalCandidateId: fallbackCandidateId,
      errorMessage: null,
    }
  }

  if (input.strictNoOutputFailureMessage) {
    return {
      status: input.runMode === 'step' ? 'paused' as const : 'manual_review' as const,
      finalCandidateId: null,
      errorMessage: input.strictNoOutputFailureMessage,
    }
  }

  if (input.hasReview && !input.outputCandidateId && !input.optimizationError && !input.reviewError) {
    return {
      status: resolveNoOutputProgressStatus(input),
      finalCandidateId: null,
      errorMessage: null,
    }
  }

  if (!input.hasReview || !input.outputCandidateId) {
    return {
      status: resolvePartialFailureStatus({
        runMode: input.runMode,
        hasOutputCandidate: Boolean(input.outputCandidateId),
        hasUsableResult,
        optimizationError: input.optimizationError,
        reviewError: input.reviewError,
      }),
      finalCandidateId: null,
      errorMessage: resolvePartialFailureMessage(input.optimizationError, input.reviewError),
    }
  }

  const status = resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: input.roundNumber,
    maxRounds: input.maxRounds,
    runMode: input.runMode,
    pauseRequestedAt: input.pauseRequestedAt,
  })

  return {
    status,
    finalCandidateId: status === 'completed' ? input.outputCandidateId : null,
    errorMessage:
      status === 'manual_review'
        ? '达到最大轮数，仍未连续三次复核通过。'
        : null,
  }
}

function resolveNoOutputProgressStatus(input: {
  roundNumber: number
  maxRounds: number
  runMode: JobRunMode
  pauseRequestedAt: string | null
}) {
  if (input.pauseRequestedAt || input.runMode === 'step') {
    return 'paused' as const
  }

  if (input.roundNumber >= input.maxRounds) {
    return 'manual_review' as const
  }

  return 'pending' as const
}

export function resolvePartialFailureStatus(input: {
  runMode: JobRunMode
  hasOutputCandidate: boolean
  hasUsableResult: boolean
  optimizationError: Error | null
  reviewError: Error | null
}): JobStatus {
  if (input.hasOutputCandidate) {
    return input.runMode === 'step' ? 'paused' : 'pending'
  }

  const recoverableErrors = [input.optimizationError, input.reviewError].filter(
    (error): error is Error => Boolean(error),
  )
  const canSoftLand = input.hasUsableResult
    && recoverableErrors.length > 0
    && recoverableErrors.every((error) => matchesInfraFailure(error))

  if (canSoftLand) {
    return input.runMode === 'step' ? 'paused' : 'pending'
  }

  return 'failed'
}

function resolvePartialFailureMessage(
  optimizationError: Error | null,
  reviewError: Error | null,
) {
  if (optimizationError && reviewError) {
    return `${optimizationError.message} | ${reviewError.message}`
  }

  return optimizationError?.message ?? reviewError?.message ?? 'Round execution failed.'
}
