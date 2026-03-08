import type { ConversationPolicy } from '@/lib/engine/conversation-policy'
import type { RoundJudgment } from '@/lib/engine/optimization-cycle'

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
export type JobRunMode = 'auto' | 'step'

export interface GoalAnchor {
  goal: string
  deliverable: string
  driftGuard: string[]
}

export interface AppSettings {
  cpamcBaseUrl: string
  cpamcApiKey: string
  defaultOptimizerModel: string
  defaultJudgeModel: string
  scoreThreshold: number
  judgePassCount: number
  maxRounds: number
  noImprovementLimit: number
  workerConcurrency: number
  conversationPolicy: ConversationPolicy
  updatedAt: string
}

export interface PromptPackVersion {
  id: string
  hash: string
  skillMd: string
  rubricMd: string
  templateMd: string
  createdAt: string
}

export interface JobRecord {
  id: string
  title: string
  rawPrompt: string
  optimizerModel: string
  judgeModel: string
  pendingOptimizerModel: string | null
  pendingJudgeModel: string | null
  status: JobStatus
  runMode: JobRunMode
  packVersionId: string
  currentRound: number
  bestAverageScore: number
  latestPrompt: string
  goalAnchor: GoalAnchor
  maxRoundsOverride: number | null
  nextRoundInstruction: string | null
  passStreak: number
  lastReviewScore: number
  lastReviewPatch: string[]
  finalCandidateId: string | null
  conversationPolicy: ConversationPolicy
  conversationGroupId: string | null
  cancelRequestedAt: string | null
  pauseRequestedAt: string | null
  nextRoundInstructionUpdatedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface CandidateRecord {
  id: string
  jobId: string
  roundNumber: number
  optimizedPrompt: string
  strategy: 'preserve' | 'rebuild'
  scoreBefore: number
  averageScore: number
  majorChanges: string[]
  mve: string
  deadEndSignals: string[]
  aggregatedIssues: string[]
  createdAt: string
}

export interface JudgeRunRecord extends RoundJudgment {
  id: string
  jobId: string
  candidateId: string
  judgeIndex: number
  createdAt: string
}

export interface JobDetail {
  job: JobRecord
  candidates: Array<CandidateRecord & { judges: JudgeRunRecord[] }>
}

export interface JobInput {
  title: string
  rawPrompt: string
  optimizerModel?: string
  judgeModel?: string
}

export interface ModelCatalogItem {
  id: string
  label: string
}
