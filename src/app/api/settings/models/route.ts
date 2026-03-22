import { NextResponse } from 'next/server'

import { fetchCpamcModels } from '@/lib/server/models'
import { getSettings, normalizeApiProtocol } from '@/lib/server/settings/index'
import type { AppSettings } from '@/lib/contracts'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const settings = getSettings()
    if (!settings.cpamcBaseUrl.trim() || !settings.cpamcApiKey.trim()) {
      return NextResponse.json({ models: [] })
    }

    const models = await fetchCpamcModels(settings)
    return NextResponse.json({ models })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models.' },
      { status: 400 },
    )
  }
}

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
    return NextResponse.json({ models })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models.' },
      { status: 400 },
    )
  }
}
