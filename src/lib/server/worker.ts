import { nextPassStreak, runOptimizationCycle, shouldFinalizeAfterReview } from '@/lib/engine/optimization-cycle'
import { CpamcModelAdapter } from '@/lib/server/model-adapter'
import {
  applyPendingJobModels,
  claimNextRunnableJob,
  clearConsumedNextRoundInstruction,
  createCandidateWithJudges,
  finalizeCancelledJob,
  getJobById,
  getOptimizerSeed,
  updateJobProgress,
  updateJobReviewState,
} from '@/lib/server/jobs'
import { getPromptPackVersion } from '@/lib/server/prompt-pack'
import { getSettings, validateCpamcConnection } from '@/lib/server/settings'
import type { JobRunMode, JobStatus, JudgeRunRecord } from '@/lib/server/types'
import { createWorkerRuntimeState, shouldReplaceWorkerRuntime } from '@/lib/server/worker-runtime'

const WORKER_OWNER_ID = crypto.randomUUID()

const globalWorkerState = globalThis as typeof globalThis & {
  __promptOptimizerWorker?: ReturnType<typeof createWorkerRuntimeState>
}

export function ensureWorkerStarted() {
  if (shouldReplaceWorkerRuntime(globalWorkerState.__promptOptimizerWorker, WORKER_OWNER_ID)) {
    if (globalWorkerState.__promptOptimizerWorker?.intervalId) {
      clearInterval(globalWorkerState.__promptOptimizerWorker.intervalId)
    }
    globalWorkerState.__promptOptimizerWorker = createWorkerRuntimeState(WORKER_OWNER_ID)
  }

  const state = globalWorkerState.__promptOptimizerWorker
  if (!state || state.started) {
    return
  }

  state.started = true
  state.intervalId = setInterval(() => {
    void pumpQueue()
  }, 2500)
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

async function pumpQueue() {
  const state = globalWorkerState.__promptOptimizerWorker
  if (!state) {
    return
  }

  const settings = getSettings()
  if (state.activeCount >= settings.workerConcurrency) {
    return
  }

  const job = claimNextRunnableJob()
  if (!job) {
    return
  }

  state.activeCount += 1
  try {
    await runJob(job.id)
  } finally {
    state.activeCount -= 1
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

      if (liveJob.pendingOptimizerModel || liveJob.pendingJudgeModel) {
        applyPendingJobModels(jobId)
      }

      const activeJob = getJobById(jobId)
      if (!activeJob) {
        return
      }

      const maxRounds = activeJob.maxRoundsOverride ?? settings.maxRounds
      if (activeJob.currentRound >= maxRounds) {
        updateJobProgress(jobId, {
          status: 'manual_review',
          currentRound: activeJob.currentRound,
          bestAverageScore: activeJob.bestAverageScore,
          finalCandidateId: activeJob.finalCandidateId,
          errorMessage: '达到最大轮数，已停止自动优化。',
        })
        return
      }

      const pack = getPromptPackVersion(activeJob.packVersionId)
      const adapter = new CpamcModelAdapter(settings, pack, {
        optimizerModel: activeJob.optimizerModel,
        judgeModel: activeJob.judgeModel,
      })
      const {
        currentPrompt,
        previousFeedback,
        goalAnchor,
        nextRoundInstruction,
        nextRoundInstructionUpdatedAt,
      } = getOptimizerSeed(jobId)
      const roundNumber = activeJob.currentRound + 1
      const result = await runOptimizationCycle({
        adapter,
        currentPrompt,
        threshold: settings.scoreThreshold,
        previousBestScore: activeJob.bestAverageScore,
        previousFeedback,
        goalAnchor,
        nextRoundInstruction,
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
          findings: review.findings,
          suggestedChanges: review.suggestedChanges,
          createdAt: new Date().toISOString(),
        },
      ]

      const candidateId = createCandidateWithJudges(jobId, {
        roundNumber,
        optimizedPrompt: result.optimizedPrompt,
        strategy: result.strategy,
        scoreBefore: result.scoreBefore,
        averageScore: review.score,
        majorChanges: result.majorChanges,
        mve: result.mve,
        deadEndSignals: result.deadEndSignals,
        aggregatedIssues: result.aggregatedIssues,
        judgments,
      })

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
      clearConsumedNextRoundInstruction(jobId, nextRoundInstructionUpdatedAt)

      if (finalStatus === 'completed' || finalStatus === 'manual_review' || finalStatus === 'paused') {
        return
      }
    }
  } catch (error) {
    const failedJob = getJobById(jobId)
    updateJobProgress(jobId, {
      status: 'failed',
      currentRound: failedJob?.currentRound ?? 0,
      bestAverageScore: failedJob?.bestAverageScore ?? 0,
      finalCandidateId: failedJob?.finalCandidateId ?? null,
      errorMessage: error instanceof Error ? error.message : 'Unknown worker error',
    })
  }
}
