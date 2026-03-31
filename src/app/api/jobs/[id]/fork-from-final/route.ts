import { NextResponse } from 'next/server'

import { forkJobFromFinal, getJobById } from '@/lib/server/jobs'
import type { JobRunMode } from '@/lib/server/types'

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
    const forked = await forkJobFromFinal(id, runMode)
    return NextResponse.json({ job: forked })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fork from final failed.' },
      { status: 409 },
    )
  }
}
