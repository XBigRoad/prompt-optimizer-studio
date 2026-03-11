import { NextResponse } from 'next/server'

import { fetchCpamcModels } from '@/lib/server/models'
import { getSettings, normalizeApiProtocol } from '@/lib/server/settings'
import type { AppSettings } from '@/lib/server/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppSettings>
    const current = getSettings()
    const merged = {
      cpamcBaseUrl: body.cpamcBaseUrl?.trim() ?? current.cpamcBaseUrl,
      cpamcApiKey: body.cpamcApiKey?.trim() ?? current.cpamcApiKey,
      apiProtocol: normalizeApiProtocol(typeof body.apiProtocol === 'string' ? body.apiProtocol : current.apiProtocol),
    }

    const models = await fetchCpamcModels(merged)

    return NextResponse.json({
      ok: true,
      message: `连接通过，发现 ${models.length} 个模型。`,
      models,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection test failed.' },
      { status: 400 },
    )
  }
}
