import type { ConversationPolicy } from '@/lib/engine/conversation-policy'
import type { RoundJudgment } from '@/lib/engine/optimization-cycle'
import type { ReasoningEffort } from '@/lib/reasoning-effort'

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
export type JobRunMode = 'auto' | 'step'
export type ApiProtocol =
  | 'auto'
  | 'openai-compatible'
  | 'anthropic-native'
  | 'gemini-native'
  | 'mistral-native'
  | 'cohere-native'

export interface SteeringItem {
  id: string
  text: string
  createdAt: string
}

export interface GoalAnchor {
  goal: string
  deliverable: string
  driftGuard: string[]
}

export interface GoalAnchorExplanation {
  sourceSummary: string
  rationale: string[]
}

export interface AppSettings {
  cpamcBaseUrl: string
  cpamcApiKey: string
  apiProtocol: ApiProtocol
  defaultOptimizerModel: string
  defaultJudgeModel: string
  defaultOptimizerReasoningEffort: ReasoningEffort
  defaultJudgeReasoningEffort: ReasoningEffort
  scoreThreshold: number
  judgePassCount: number
  maxRounds: number
  noImprovementLimit: number
  workerConcurrency: number
  conversationPolicy: ConversationPolicy
  customRubricMd: string
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
  optimizerReasoningEffort: ReasoningEffort
  judgeReasoningEffort: ReasoningEffort
  pendingOptimizerModel: string | null
  pendingJudgeModel: string | null
  pendingOptimizerReasoningEffort: ReasoningEffort | null
  pendingJudgeReasoningEffort: ReasoningEffort | null
  status: JobStatus
  runMode: JobRunMode
  packVersionId: string
  currentRound: number
  candidateCount: number
  bestAverageScore: number
  latestPrompt: string
  goalAnchor: GoalAnchor
  goalAnchorExplanation: GoalAnchorExplanation
  maxRoundsOverride: number | null
  pendingSteeringItems: SteeringItem[]
  passStreak: number
  lastReviewScore: number
  lastReviewPatch: string[]
  finalCandidateId: string | null
  conversationPolicy: ConversationPolicy
  conversationGroupId: string | null
  cancelRequestedAt: string | null
  pauseRequestedAt: string | null
  customRubricMd: string | null
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
  appliedSteeringItems: SteeringItem[]
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
  optimizerReasoningEffort?: ReasoningEffort
  judgeReasoningEffort?: ReasoningEffort
  customRubricMd?: string | null
}

export interface ModelCatalogItem {
  id: string
  label: string
}
