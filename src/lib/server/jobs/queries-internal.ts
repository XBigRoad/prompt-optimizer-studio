import { getDb } from '@/lib/server/db/index'
import type { JobDetail, JobRecord, JudgeRunRecord } from '@/lib/contracts'

import {
  claimNextRunnableJobRow,
  heartbeatJobClaim as heartbeatClaimInRepository,
  selectCandidateRowsByJobId,
  selectJobRowById,
  selectJobRows,
  selectJudgeRowsByJobId,
  selectLatestCandidateSeed,
  selectRoundRunRowsByJobId,
} from '@/lib/server/jobs/repository'
import {
  collapseCandidateRowsByRound,
  mapCandidateRow,
  mapJobRow,
  mapJudgeRow,
  mapRoundRunRows,
  maybeRepairLegacyGoalAnchorRow,
  synthesizeLegacyRoundRuns,
} from '@/lib/server/jobs/mappers-internal'

export function listJobs() {
  const db = getDb()
  return selectJobRows()
    .map((row) => maybeRepairLegacyGoalAnchorRow(db, row))
    .map(mapJobRow)
}

export function getJobById(id: string) {
  const db = getDb()
  const row = selectJobRowById(id)
  return row ? mapJobRow(maybeRepairLegacyGoalAnchorRow(db, row)) : null
}

export function requireJob(jobId: string): JobRecord {
  const job = getJobById(jobId)
  if (!job) {
    throw new Error(`Job not found: ${jobId}`)
  }
  return job
}

export function getJobDetail(id: string): JobDetail | null {
  const job = getJobById(id)
  if (!job) {
    return null
  }

  const candidateRows = selectCandidateRowsByJobId(id)
  const judgeRows = selectJudgeRowsByJobId(id)
  const judgesByCandidate = new Map<string, JudgeRunRecord[]>()

  for (const row of judgeRows) {
    const judge = mapJudgeRow(row)
    const list = judgesByCandidate.get(judge.candidateId) ?? []
    list.push(judge)
    judgesByCandidate.set(judge.candidateId, list)
  }

  const candidates = collapseCandidateRowsByRound(candidateRows).map((row) => {
    const candidate = mapCandidateRow(row)
    return {
      ...candidate,
      judges: judgesByCandidate.get(candidate.id) ?? [],
    }
  })

  const roundRunRows = selectRoundRunRowsByJobId(id)

  return {
    job,
    candidates,
    roundRuns: roundRunRows.length > 0
      ? mapRoundRunRows(roundRunRows, candidates)
      : synthesizeLegacyRoundRuns(candidates),
  }
}

export function getOptimizerSeed(jobId: string) {
  const job = requireJob(jobId)
  const candidate = selectLatestCandidateSeed(jobId)

  return {
    currentCandidateId: candidate?.id ? String(candidate.id) : null,
    currentPrompt: candidate ? String(candidate.optimized_prompt) : job.rawPrompt,
    latestRoundNumber: candidate ? Number(candidate.round_number ?? 0) : 0,
    goalAnchor: job.goalAnchor,
    pendingSteeringItems: job.pendingSteeringItems,
  }
}

export function heartbeatJobClaim(jobId: string, workerOwnerId: string) {
  heartbeatClaimInRepository(jobId, workerOwnerId)
}

export function claimNextRunnableJob(workerOwnerId: string) {
  const jobId = claimNextRunnableJobRow(workerOwnerId)
  return jobId ? requireJob(jobId) : null
}
