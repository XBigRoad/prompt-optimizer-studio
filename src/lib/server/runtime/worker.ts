import {
  nextPassStreak,
  runOptimizationCycle,
  shouldFinalizeAfterReview,
  type RoundExecutionMode,
} from '@/lib/engine/optimization-cycle'
import { isGpt5FamilyModel, normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { CpamcModelAdapter } from '@/lib/server/model-adapter'
import {
  applyPendingJobModels,
  claimNextRunnableJob,
  consumePendingSteeringItems,
  finalizeCancelledJob,
  getOptimizerSeed,
  getRuntimeJobById,
  heartbeatJobClaim,
  releaseJobClaim,
  recordRoundRunForActiveWorker,
  updateJobProgress,
  updateJobReviewState,
} from '@/lib/server/jobs/runtime'
import { getPromptPackVersion, withPromptPackRubricOverride } from '@/lib/server/prompt-pack/index'
import { getSettings, validateCpamcConnection } from '@/lib/server/settings/index'
import type { JobRunMode, JobStatus } from '@/lib/contracts'
import {
  createWorkerRuntimeState,
  resolveStableWorkerOwnerId,
  shouldReplaceWorkerRuntime,
} from '@/lib/server/runtime/worker-runtime'
import { inferApiProtocol } from '@/lib/server/providers/index'

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
  if (!state || state.started) {
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

  return input.runMode === 'step' ? 'paused' : 'manual_review'
}

export function shouldYieldAfterRound(status: JobStatus) {
  return status === 'running'
}

export function resolveCompletionStateAfterRound(input: {
  shouldComplete: boolean
  outputCandidateId: string | null
  currentCandidateId: string | null
  existingFinalCandidateId: string | null
  roundNumber: number
  maxRounds: number
  runMode: JobRunMode
  pauseRequestedAt: string | null
}) {
  const result = resolveRoundCommitState({
    shouldComplete: input.shouldComplete,
    hasReview: true,
    outputCandidateId: input.outputCandidateId,
    currentCandidateId: input.currentCandidateId,
    finalCandidateId: input.existingFinalCandidateId,
    roundNumber: input.roundNumber,
    maxRounds: input.maxRounds,
    runMode: input.runMode,
    pauseRequestedAt: input.pauseRequestedAt,
    optimizationError: null,
    reviewError: null,
  })

  return {
    status: result.status,
    finalCandidateId: result.finalCandidateId,
  }
}

export function resolveRoundExecutionMode(input: {
  cpamcBaseUrl: string
  apiProtocol: 'auto' | 'openai-compatible' | 'anthropic-native' | 'gemini-native' | 'mistral-native' | 'cohere-native'
  optimizerModel: string
  judgeModel: string
  optimizerReasoningEffort: string
  judgeReasoningEffort: string
}): RoundExecutionMode {
  const protocol = input.apiProtocol !== 'auto'
    ? input.apiProtocol
    : inferApiProtocol(input.cpamcBaseUrl)

  if (protocol !== 'openai-compatible') {
    return 'parallel'
  }

  if (!isGpt5FamilyModel(input.optimizerModel) || !isGpt5FamilyModel(input.judgeModel)) {
    return 'parallel'
  }

  if (
    normalizeReasoningEffort(input.optimizerReasoningEffort) !== 'xhigh'
    || normalizeReasoningEffort(input.judgeReasoningEffort) !== 'xhigh'
  ) {
    return 'parallel'
  }

  return 'sequential'
}

async function pumpQueue() {
  const state = globalWorkerState.__promptOptimizerWorker
  if (!state) {
    return
  }

  const settings = getSettings()
  if (state.activeCount >= settings.workerConcurrency) {
    return
  }

  const job = claimNextRunnableJob(WORKER_OWNER_ID)
  if (!job) {
    return
  }

  state.activeCount += 1
  state.activeJobIds.add(job.id)
  try {
    await runJob(job.id)
  } finally {
    state.activeJobIds.delete(job.id)
    state.activeCount -= 1
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
      const liveJob = getRuntimeJobById(jobId)
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

      const activeJob = getRuntimeJobById(jobId)
      if (!activeJob) {
        return
      }

      const maxRounds = activeJob.maxRoundsOverride ?? settings.maxRounds

      const {
        currentCandidateId,
        currentPrompt,
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
      const effectivePack = withPromptPackRubricOverride(
        pack,
        activeJob.customRubricMd || settings.customRubricMd,
      )
      const adapter = new CpamcModelAdapter(settings, effectivePack, {
        optimizerModel: activeJob.optimizerModel,
        judgeModel: activeJob.judgeModel,
        optimizerReasoningEffort: activeJob.optimizerReasoningEffort,
        judgeReasoningEffort: activeJob.judgeReasoningEffort,
      })
      const executionMode = resolveRoundExecutionMode({
        cpamcBaseUrl: settings.cpamcBaseUrl,
        apiProtocol: settings.apiProtocol,
        optimizerModel: activeJob.optimizerModel,
        judgeModel: activeJob.judgeModel,
        optimizerReasoningEffort: activeJob.optimizerReasoningEffort,
        judgeReasoningEffort: activeJob.judgeReasoningEffort,
      })
      const result = await runOptimizationCycle({
        adapter,
        currentPrompt,
        threshold: settings.scoreThreshold,
        goalAnchor,
        pendingSteeringItems,
        executionMode,
      })

      const review = result.inputReview
      const passStreak = review
        ? nextPassStreak(activeJob.passStreak, review, settings.scoreThreshold)
        : 0
      const roundOutcome = resolveRoundOutcome(result.optimization, review)
      const committedRound = recordRoundRunForActiveWorker(jobId, WORKER_OWNER_ID, {
        currentPrompt,
        currentCandidateId,
        optimization: result.optimization,
        review,
        aggregatedIssues: result.aggregatedIssues,
        appliedSteeringItems: pendingSteeringItems,
        outcome: roundOutcome,
        optimizerError: result.optimizationError?.message ?? null,
        judgeError: result.reviewError?.message ?? null,
        passStreakAfter: passStreak,
        optimizerTelemetry: result.optimizationTelemetry,
        judgeTelemetry: result.reviewTelemetry,
      })
      if (!committedRound) {
        return
      }

      const { outputCandidateId, roundNumber } = committedRound
      const latestJob = getRuntimeJobById(jobId)
      if (latestJob?.cancelRequestedAt) {
        finalizeCancelledJob(jobId)
        return
      }

      const shouldComplete = review
        ? shouldFinalizeAfterReview(activeJob.passStreak, review, settings.scoreThreshold)
        : false
      const bestAverageScore = review
        ? Math.max(activeJob.bestAverageScore, review.score)
        : activeJob.bestAverageScore
      const commitState = resolveRoundCommitState({
        shouldComplete,
        hasReview: Boolean(review),
        outputCandidateId,
        currentCandidateId,
        finalCandidateId: activeJob.finalCandidateId,
        roundNumber,
        maxRounds,
        runMode: activeJob.runMode,
        pauseRequestedAt: latestJob?.pauseRequestedAt ?? null,
        optimizationError: result.optimizationError,
        reviewError: result.reviewError,
      })

      updateJobReviewState(jobId, {
        passStreak,
        bestAverageScore,
        lastReviewScore: review?.score ?? activeJob.lastReviewScore,
        lastReviewPatch: review ? result.aggregatedIssues : activeJob.lastReviewPatch,
        currentRound: roundNumber,
        finalCandidateId: commitState.finalCandidateId,
        status: commitState.status,
        errorMessage: commitState.errorMessage,
      })
      if (commitState.status === 'completed' || outputCandidateId) {
        consumePendingSteeringItems(jobId, pendingSteeringItems.map((item) => item.id))
      }

      if (shouldYieldAfterRound(commitState.status)) {
        releaseJobClaim(jobId, WORKER_OWNER_ID)
      }
      return
    }
  } catch (error) {
    const failedJob = getRuntimeJobById(jobId)
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

function resolveRoundOutcome(
  optimization: Awaited<ReturnType<typeof runOptimizationCycle>>['optimization'],
  review: Awaited<ReturnType<typeof runOptimizationCycle>>['inputReview'],
) {
  if (optimization && review) {
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
  optimizationError: Error | null
  reviewError: Error | null
}) {
  const fallbackCandidateId = input.outputCandidateId ?? input.currentCandidateId ?? input.finalCandidateId

  if (input.shouldComplete && input.hasReview && fallbackCandidateId) {
    return {
      status: 'completed' as const,
      finalCandidateId: fallbackCandidateId,
      errorMessage: null,
    }
  }

  if (!input.hasReview || !input.outputCandidateId) {
    return {
      status: resolvePartialFailureStatus({
        runMode: input.runMode,
        hasOutputCandidate: Boolean(input.outputCandidateId),
        hasReview: input.hasReview,
      }),
      finalCandidateId: fallbackCandidateId,
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
    finalCandidateId: input.outputCandidateId,
    errorMessage:
      status === 'manual_review'
        ? '达到最大轮数，仍未连续三次复核通过。'
        : null,
  }
}

function resolvePartialFailureStatus(input: {
  runMode: JobRunMode
  hasOutputCandidate: boolean
  hasReview: boolean
}): JobStatus {
  if (input.hasOutputCandidate) {
    return input.runMode === 'step' ? 'paused' : 'manual_review'
  }

  if (input.hasReview) {
    return 'failed'
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
