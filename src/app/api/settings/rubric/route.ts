import { NextResponse } from 'next/server'

import { ensurePromptPackVersion } from '@/lib/server/prompt-pack/index'
import { getSettings } from '@/lib/server/settings/index'

export const runtime = 'nodejs'

export async function GET() {
  const settings = getSettings()
  const pack = ensurePromptPackVersion()
  const rubricMd = settings.customRubricMd || pack.rubricMd

  return NextResponse.json({
    rubricMd,
    source: settings.customRubricMd ? 'settings' : 'default',
  })
}
