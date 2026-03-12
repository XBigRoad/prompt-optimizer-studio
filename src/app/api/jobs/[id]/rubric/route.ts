import { NextResponse } from 'next/server'

import { getJobById } from '@/lib/server/jobs'
import { ensurePromptPackVersion } from '@/lib/server/prompt-pack'
import { getSettings } from '@/lib/server/settings'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const job = getJobById(id)

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  const settings = getSettings()
  const pack = ensurePromptPackVersion()
  const rubricMd = job.customRubricMd || settings.customRubricMd || pack.rubricMd
  const source = job.customRubricMd ? 'job' : settings.customRubricMd ? 'settings' : 'default'

  return NextResponse.json({ rubricMd, source })
}
