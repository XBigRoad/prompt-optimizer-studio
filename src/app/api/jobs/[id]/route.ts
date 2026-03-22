import { NextResponse } from 'next/server'

import {
  addPendingSteeringItem,
  buildGoalAnchorDraftFromPendingSteering,
  clearPendingSteeringItems,
  getJobDetail,
  getJobById,
  removePendingSteeringItem,
  updateJobCustomRubricMd,
  updateJobGoalAnchor,
  updateJobMaxRoundsOverride,
  updateJobModels,
  updateJobNextRoundInstruction,
} from '@/lib/server/jobs/index'
import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { ensureWorkerStarted } from '@/lib/server/runtime/index'

export const runtime = 'nodejs'

type SteeringAction =
  | { type: 'add'; text: string }
  | { type: 'remove'; itemId: string }
  | { type: 'clear' }
  | { type: 'build_goal_anchor_draft'; itemIds?: string[] }

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  ensureWorkerStarted()
  const { id } = await context.params
  const detail = getJobDetail(id)

  if (!detail) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  return NextResponse.json(detail)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const job = getJobById(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const body = await request.json() as {
      optimizerModel?: string
      judgeModel?: string
      optimizerReasoningEffort?: string
      judgeReasoningEffort?: string
      maxRoundsOverride?: number | null
      customRubricMd?: string | null
      nextRoundInstruction?: string
      steeringAction?: SteeringAction
      goalAnchor?: {
        goal?: string
        deliverable?: string
        driftGuard?: string[]
      }
      consumePendingSteeringIds?: string[]
    }

    let updatedJob = job
    let goalAnchorDraft: ReturnType<typeof buildGoalAnchorDraftFromPendingSteering>['goalAnchor'] | null = null
    let consumePendingSteeringIds: string[] = []

    if (
      body.optimizerModel !== undefined
      || body.judgeModel !== undefined
      || body.optimizerReasoningEffort !== undefined
      || body.judgeReasoningEffort !== undefined
    ) {
      updatedJob = updateJobModels(id, {
        optimizerModel: body.optimizerModel ?? job.optimizerModel,
        judgeModel: body.judgeModel ?? job.judgeModel,
        optimizerReasoningEffort: body.optimizerReasoningEffort === undefined
          ? undefined
          : normalizeReasoningEffort(body.optimizerReasoningEffort),
        judgeReasoningEffort: body.judgeReasoningEffort === undefined
          ? undefined
          : normalizeReasoningEffort(body.judgeReasoningEffort),
      })
    }
    if (Object.hasOwn(body, 'maxRoundsOverride')) {
      updatedJob = updateJobMaxRoundsOverride(id, body.maxRoundsOverride ?? null)
    }
    if (Object.hasOwn(body, 'customRubricMd')) {
      updatedJob = updateJobCustomRubricMd(id, body.customRubricMd ?? null)
    }
    if (body.steeringAction) {
      switch (body.steeringAction.type) {
        case 'add':
          updatedJob = addPendingSteeringItem(id, body.steeringAction.text)
          break
        case 'remove':
          updatedJob = removePendingSteeringItem(id, body.steeringAction.itemId)
          break
        case 'clear':
          updatedJob = clearPendingSteeringItems(id)
          break
        case 'build_goal_anchor_draft': {
          const draft = buildGoalAnchorDraftFromPendingSteering(id, body.steeringAction.itemIds)
          goalAnchorDraft = draft.goalAnchor
          consumePendingSteeringIds = draft.consumePendingSteeringIds
          updatedJob = getJobById(id) ?? updatedJob
          break
        }
        default:
          break
      }
    }
    if (Object.hasOwn(body, 'nextRoundInstruction')) {
      updatedJob = updateJobNextRoundInstruction(id, body.nextRoundInstruction ?? '')
    }
    if (Object.hasOwn(body, 'goalAnchor')) {
      updatedJob = updateJobGoalAnchor(id, body.goalAnchor ?? {}, {
        consumePendingSteeringIds: body.consumePendingSteeringIds ?? [],
      })
    }

    return NextResponse.json({ job: updatedJob, goalAnchorDraft, consumePendingSteeringIds })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update job models.' },
      { status: 400 },
    )
  }
}
