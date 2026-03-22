import type { CandidateRecord, SteeringItem } from '@/lib/contracts'
import type { ReasoningEffort } from '@/lib/reasoning-effort'
import type { RoundCandidateView } from '@/components/widgets/job-detail/round-card'

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'manual_review' | 'cancelled'
export type JobRunMode = 'auto' | 'step'
export type EffectiveRubricSource = 'job' | 'settings' | 'default'

export interface JudgeRun {
  id: string
  judgeIndex: number
  score: number
  hasMaterialIssues: boolean
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
}

export interface ModelOption {
  id: string
  label: string
}

export interface SettingsPayload {
  maxRounds: number
}

export interface RubricPayload {
  rubricMd: string
  source: EffectiveRubricSource
}

export interface GoalAnchorPayload {
  goal: string
  deliverable: string
  driftGuard: string[]
}

export interface RoundCandidatePayload {
  id: string
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
  judges: JudgeRun[]
}

export interface RoundRunPayload {
  id: string
  roundNumber: number
  semantics: 'legacy-output-judged' | 'input-judged-output-handed-off'
  inputPrompt: string
  inputCandidateId: string | null
  outputCandidateId: string | null
  displayScore: number | null
  hasMaterialIssues: boolean | null
  summary: string
  driftLabels: string[]
  driftExplanation: string
  findings: string[]
  suggestedChanges: string[]
  outcome: 'settled' | 'judge_failed' | 'optimizer_failed' | 'both_failed' | 'legacy'
  optimizerError: string | null
  judgeError: string | null
  passStreakAfter: number
  outputJudged: boolean
  outputFinal?: boolean
  outputCandidate: CandidateRecord | null
  createdAt: string
}

export interface JobDetailPayload {
  job: {
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
    cancelRequestedAt: string | null
    pauseRequestedAt: string | null
    pendingSteeringItems: SteeringItem[]
    goalAnchor: GoalAnchorPayload
    goalAnchorExplanation: {
      sourceSummary: string
      rationale: string[]
    }
    status: JobStatus
    runMode: JobRunMode
    currentRound: number
    candidateCount: number
    bestAverageScore: number
    maxRoundsOverride: number | null
    passStreak: number
    lastReviewScore: number
    finalCandidateId: string | null
    customRubricMd: string | null
    errorMessage: string | null
    conversationPolicy: 'stateless' | 'pooled-3x'
  }
  candidates: RoundCandidatePayload[]
  roundRuns: RoundRunPayload[]
}

export interface JobDetailFormState {
  taskModel: string
  reasoningEffort?: string
  maxRoundsOverrideValue: string
  pendingSteeringInput: string
  customRubricMd: string
  goalAnchorGoal: string
  goalAnchorDeliverable: string
  goalAnchorDriftGuardText: string
  goalAnchorDraftReady: boolean
  selectedPendingSteeringIds: string[]
}

export interface JobDetailUiState {
  loading: boolean
  error: string | null
  actionMessage: string | null
  savingModels: boolean
  savingMaxRounds: boolean
  savingCustomRubric?: boolean
  savingSteering: boolean
  generatingGoalAnchorDraft: boolean
  savingGoalAnchor: boolean
  retrying: boolean
  completing: boolean
  cancelling: boolean
  pausing: boolean
  resumingStep: boolean
  resumingAuto: boolean
  copyingPrompt: boolean
  compareMode: boolean
  expandedRounds: Record<string, boolean>
}

export interface JobDetailHandlers {
  onRetry: () => void
  onSaveModel: () => void
  onSaveMaxRoundsOverride: () => void
  onSaveCustomRubric: (nextValue?: string) => void
  onAddPendingSteering: () => void
  onRemovePendingSteeringItem: (itemId: string) => void
  onClearPendingSteering: () => void
  onGenerateGoalAnchorDraft: () => void
  onSaveGoalAnchor: () => void
  onPauseTask: () => void
  onResumeStep: () => void
  onResumeAuto: () => void
  onCancelTask: () => void
  onCompleteTask: () => void
  onCopyLatestPrompt: () => void
  onToggleCompareMode: () => void
  onToggleRound: (candidateId: string) => void
  onTaskModelChange: (value: string) => void
  onReasoningEffortChange?: (value: string) => void
  onMaxRoundsOverrideChange: (value: string) => void
  onPendingSteeringInputChange: (value: string) => void
  onCustomRubricChange: (value: string) => void
  onGoalAnchorGoalChange: (value: string) => void
  onGoalAnchorDeliverableChange: (value: string) => void
  onGoalAnchorDriftGuardChange: (value: string) => void
  onTogglePendingSteeringSelection: (itemId: string) => void
}

export interface JobDetailViewModel {
  jobId: string
  title: string
  status: JobStatus
  conversationPolicy: 'stateless' | 'pooled-3x'
  optimizerModel: string
  judgeModel: string
  optimizerReasoningEffort: ReasoningEffort
  judgeReasoningEffort: ReasoningEffort
  pendingOptimizerModel: string | null
  pendingJudgeModel: string | null
  pendingOptimizerReasoningEffort: ReasoningEffort | null
  pendingJudgeReasoningEffort: ReasoningEffort | null
  cancelRequestedAt: string | null
  pauseRequestedAt: string | null
  pendingSteeringItems: SteeringItem[]
  goalAnchor: {
    goal: string
    deliverable: string
    driftGuard: string[]
  }
  goalAnchorExplanation: {
    sourceSummary: string
    rationale: string[]
  }
  runMode: JobRunMode
  currentRound: number
  candidateCount: number
  scoreState: 'available' | 'not_generated'
  failureKind: 'infra' | 'content' | null
  bestAverageScore: number
  maxRoundsOverride: number | null
  passStreak: number
  lastReviewScore: number
  finalCandidateId: string | null
  customRubricMd: string | null
  effectiveRubricMd: string
  effectiveRubricSource: EffectiveRubricSource
  errorMessage: string | null
  latestFullPrompt: string
  initialPrompt: string
  modelsLabel: string
  effectiveMaxRounds: number
  candidates: RoundCandidateView[]
  roundRuns: RoundRunPayload[]
}
