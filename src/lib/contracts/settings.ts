import type { ConversationPolicy } from '@/lib/engine/conversation-policy'
import type { ReasoningEffort } from '@/lib/reasoning-effort'
import type { ApiProtocol } from '@/lib/contracts/provider'

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
