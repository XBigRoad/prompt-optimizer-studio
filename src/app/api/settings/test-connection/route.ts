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
    const message = models.length > 0
      ? `连接通过，发现 ${models.length} 个模型。`
      : merged.apiProtocol === 'openai-compatible'
        ? '连接已建立，但当前网关未返回模型列表；你仍可手动填写模型别名。'
        : '连接通过，发现 0 个模型。'

    return NextResponse.json({
      ok: true,
      message,
      models,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection test failed.' },
      { status: 400 },
    )
  }
}
