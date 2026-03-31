import { NextResponse } from 'next/server'

import { getJobById, resetJobForRetry } from '@/lib/server/jobs'
import type { JobRunMode } from '@/lib/server/types'
import { ensureWorkerStarted } from '@/lib/server/worker'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const job = getJobById(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const body = await request.json().catch(() => null) as { runMode?: JobRunMode } | null
    const runMode = body?.runMode === 'step' ? 'step' : 'auto'
    const reset = resetJobForRetry(id, runMode)
    ensureWorkerStarted()
    return NextResponse.json({ job: reset })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Retry failed.' },
      { status: 409 },
    )
  }
}
