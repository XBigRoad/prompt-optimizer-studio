import { NextResponse } from 'next/server'

import { getJobById, resumeJobStep } from '@/lib/server/jobs/index'
import { ensureWorkerStarted } from '@/lib/server/runtime/index'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const job = getJobById(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const updatedJob = resumeJobStep(id)
    ensureWorkerStarted()
    return NextResponse.json({ job: updatedJob })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Resume step failed.' },
      { status: 409 },
    )
  }
}
