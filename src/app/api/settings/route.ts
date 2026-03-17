import { NextResponse } from 'next/server'

import { normalizeReasoningEffort } from '@/lib/reasoning-effort'
import { getSettings, normalizeApiProtocol, saveSettings } from '@/lib/server/settings'
import type { AppSettings } from '@/lib/server/types'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ settings: getSettings() })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppSettings>
    const settings = saveSettings({
      cpamcBaseUrl: body.cpamcBaseUrl?.trim() ?? '',
      cpamcApiKey: body.cpamcApiKey?.trim() ?? '',
      ...(typeof body.apiProtocol === 'string' ? { apiProtocol: normalizeApiProtocol(body.apiProtocol) } : {}),
      defaultOptimizerModel: body.defaultOptimizerModel?.trim() ?? '',
      defaultJudgeModel: body.defaultJudgeModel?.trim() ?? '',
      ...(body.defaultOptimizerReasoningEffort !== undefined
        ? { defaultOptimizerReasoningEffort: normalizeReasoningEffort(body.defaultOptimizerReasoningEffort) }
        : {}),
      ...(body.defaultJudgeReasoningEffort !== undefined
        ? { defaultJudgeReasoningEffort: normalizeReasoningEffort(body.defaultJudgeReasoningEffort) }
        : {}),
      scoreThreshold: clampNumber(body.scoreThreshold, 1, 100, 95),
      judgePassCount: clampNumber(body.judgePassCount, 1, 5, 3),
      maxRounds: clampNumber(body.maxRounds, 1, 20, 8),
      noImprovementLimit: clampNumber(body.noImprovementLimit, 1, 5, 2),
      workerConcurrency: clampNumber(body.workerConcurrency, 1, 4, 2),
      conversationPolicy: body.conversationPolicy === 'pooled-3x' ? 'pooled-3x' : 'stateless',
      ...(typeof body.customRubricMd === 'string' ? { customRubricMd: body.customRubricMd } : {}),
    })

    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings.' },
      { status: 400 },
    )
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}
