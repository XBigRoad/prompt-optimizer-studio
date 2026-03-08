import { NextResponse } from 'next/server'

import { getJobDetail, getJobById, updateJobGoalAnchor, updateJobMaxRoundsOverride, updateJobModels, updateJobNextRoundInstruction } from '@/lib/server/jobs'
import { ensureWorkerStarted } from '@/lib/server/worker'

export const runtime = 'nodejs'

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
      maxRoundsOverride?: number | null
      nextRoundInstruction?: string
      goalAnchor?: {
        goal?: string
        deliverable?: string
        driftGuard?: string[]
      }
    }

    let updatedJob = job
    if (body.optimizerModel !== undefined || body.judgeModel !== undefined) {
      updatedJob = updateJobModels(id, {
        optimizerModel: body.optimizerModel ?? '',
        judgeModel: body.judgeModel ?? '',
      })
    }
    if (Object.hasOwn(body, 'maxRoundsOverride')) {
      updatedJob = updateJobMaxRoundsOverride(id, body.maxRoundsOverride ?? null)
    }
    if (Object.hasOwn(body, 'nextRoundInstruction')) {
      updatedJob = updateJobNextRoundInstruction(id, body.nextRoundInstruction ?? '')
    }
    if (Object.hasOwn(body, 'goalAnchor')) {
      updatedJob = updateJobGoalAnchor(id, body.goalAnchor ?? {})
    }

    return NextResponse.json({ job: updatedJob })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update job models.' },
      { status: 400 },
    )
  }
}
