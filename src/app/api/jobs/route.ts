import { NextResponse } from 'next/server'

import { createJobs, getJobById, listJobs } from '@/lib/server/jobs'
import { ensureWorkerStarted } from '@/lib/server/worker'
import type { JobInput } from '@/lib/server/types'

export const runtime = 'nodejs'

export async function GET() {
  ensureWorkerStarted()
  return NextResponse.json({ jobs: listJobs() })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: JobInput; jobs?: JobInput[] }
    const jobs = body.jobs ?? (body.job ? [body.job] : [])
    if (jobs.length === 0) {
      return NextResponse.json({ error: '至少提交一个任务。' }, { status: 400 })
    }

    const created = await createJobs(jobs)
    ensureWorkerStarted()
    return NextResponse.json({
      jobs: created.map((job) => getJobById(job.id) ?? job),
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create jobs.' },
      { status: 400 },
    )
  }
}
