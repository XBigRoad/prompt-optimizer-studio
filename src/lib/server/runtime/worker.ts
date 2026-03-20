import { nextPassStreak, runOptimizationCycle, shouldFinalizeAfterReview } from '@/lib/engine/optimization-cycle'
import { CpamcModelAdapter } from '@/lib/server/model-adapter'
import {
  applyPendingJobModels,
  claimNextRunnableJob,
  consumePendingSteeringItems,
  createCandidateWithJudgesForActiveWorker,
  finalizeCancelledJob,
  getJobById,
  getOptimizerSeed,
  heartbeatJobClaim,
  updateJobProgress,
  updateJobReviewState,
} from '@/lib/server/jobs/index'
import { getPromptPackVersion } from '@/lib/server/prompt-pack/index'
import { getSettings, validateCpamcConnection } from '@/lib/server/settings/index'
import type { JobRunMode, JobStatus, JudgeRunRecord } from '@/lib/contracts'
import {
  createWorkerRuntimeState,
  resolveStableWorkerOwnerId,
  shouldReplaceWorkerRuntime,
} from '@/lib/server/runtime/worker-runtime'

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
        latestRoundNumber,
        previousFeedback,
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
      const result = await runOptimizationCycle({
        adapter,
        currentPrompt,
        threshold: settings.scoreThreshold,
        previousBestScore: activeJob.bestAverageScore,
        previousFeedback,
        goalAnchor,
        pendingSteeringItems,
      })

      const review = result.review
      const judgments: JudgeRunRecord[] = [
        {
          id: crypto.randomUUID(),
          jobId,
          candidateId: '',
          judgeIndex: 0,
          score: review.score,
          hasMaterialIssues: review.hasMaterialIssues,
          summary: review.summary,
          driftLabels: review.driftLabels,
          driftExplanation: review.driftExplanation,
          findings: review.findings,
          suggestedChanges: review.suggestedChanges,
          createdAt: new Date().toISOString(),
        },
      ]

      const committedCandidate = createCandidateWithJudgesForActiveWorker(jobId, WORKER_OWNER_ID, {
        optimizedPrompt: result.optimizedPrompt,
        strategy: result.strategy,
        scoreBefore: result.scoreBefore,
        averageScore: review.score,
        majorChanges: result.majorChanges,
        mve: result.mve,
        deadEndSignals: result.deadEndSignals,
        aggregatedIssues: result.aggregatedIssues,
        appliedSteeringItems: pendingSteeringItems,
        judgments,
      })
      if (!committedCandidate) {
        return
      }

      const { candidateId, roundNumber } = committedCandidate
      const latestJob = getJobById(jobId)
      if (latestJob?.cancelRequestedAt) {
        finalizeCancelledJob(jobId)
        return
      }

      const passStreak = nextPassStreak(activeJob.passStreak, review, settings.scoreThreshold)
      const shouldComplete = shouldFinalizeAfterReview(activeJob.passStreak, review, settings.scoreThreshold)
      const finalStatus = resolvePostReviewStatus({
        shouldComplete,
        roundNumber,
        maxRounds,
        runMode: activeJob.runMode,
        pauseRequestedAt: latestJob?.pauseRequestedAt ?? null,
      })

      updateJobReviewState(jobId, {
        passStreak,
        bestAverageScore: result.bestScore,
        lastReviewScore: review.score,
        lastReviewPatch: result.aggregatedIssues,
        currentRound: roundNumber,
        finalCandidateId: candidateId,
        status: finalStatus,
        errorMessage:
          finalStatus === 'manual_review'
            ? '达到最大轮数，仍未连续三次复核通过。'
            : null,
      })
      consumePendingSteeringItems(jobId, pendingSteeringItems.map((item) => item.id))

      if (finalStatus === 'completed' || finalStatus === 'manual_review' || finalStatus === 'paused') {
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
