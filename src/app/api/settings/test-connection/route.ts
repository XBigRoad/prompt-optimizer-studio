import { NextResponse } from 'next/server'

import { fetchCpamcModels } from '@/lib/server/models'
import { getSettings, normalizeApiProtocol } from '@/lib/server/settings/index'
import type { AppSettings, ModelCatalogItem } from '@/lib/contracts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppSettings>
    const current = getSettings()
    const merged = {
      cpamcBaseUrl: body.cpamcBaseUrl?.trim() ?? current.cpamcBaseUrl,
      cpamcApiKey: body.cpamcApiKey?.trim() ?? current.cpamcApiKey,
      apiProtocol: normalizeApiProtocol(typeof body.apiProtocol === 'string' ? body.apiProtocol : current.apiProtocol),
      defaultOptimizerModel: body.defaultOptimizerModel?.trim() ?? current.defaultOptimizerModel,
    }

    const models = await fetchCpamcModels(merged)
    await verifyOpenAiCompatibleInferenceAccess(merged, models)
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

async function verifyOpenAiCompatibleInferenceAccess(
  settings: {
    cpamcBaseUrl: string
    cpamcApiKey: string
    apiProtocol: AppSettings['apiProtocol']
    defaultOptimizerModel: string
  },
  models: ModelCatalogItem[],
) {
  if (!shouldProbeOpenAiCompatibleInference(settings, models)) {
    return
  }

  const requestedModel = settings.defaultOptimizerModel.trim()
  const probeModel = resolveOpenRouterProbeModel(requestedModel, models)

  try {
    await runOpenAiCompatibleChatProbe(settings, probeModel)
  } catch (error) {
    throw new Error(buildOpenRouterInferenceFailureMessage({
      requestedModel,
      probeModel,
      cause: error,
    }))
  }
}

function shouldProbeOpenAiCompatibleInference(
  settings: {
    cpamcBaseUrl: string
    apiProtocol: AppSettings['apiProtocol']
    defaultOptimizerModel: string
  },
  models: ModelCatalogItem[],
) {
  return (
    settings.apiProtocol === 'openai-compatible'
    && isOpenRouterBaseUrl(settings.cpamcBaseUrl)
    && models.length > 0
    && settings.defaultOptimizerModel.trim().length > 0
  )
}

function isOpenRouterBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

function resolveOpenRouterProbeModel(requestedModel: string, models: ModelCatalogItem[]) {
  if (requestedModel.includes('/')) {
    return requestedModel
  }

  const suffix = `/${requestedModel}`
  const exactOrSuffixedMatch = models.find((item) => item.id === requestedModel || item.id.endsWith(suffix))
  return exactOrSuffixedMatch?.id ?? requestedModel
}

async function runOpenAiCompatibleChatProbe(
  settings: {
    cpamcBaseUrl: string
    cpamcApiKey: string
  },
  model: string,
) {
  const endpoint = appendToBasePath(settings.cpamcBaseUrl, 'chat/completions')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.cpamcApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: 'Reply with OK.' },
      ],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`模型请求失败 (${response.status}): ${payload}`)
  }
}

function buildOpenRouterInferenceFailureMessage(input: {
  requestedModel: string
  probeModel: string
  cause: unknown
}) {
  const aliasHint = input.requestedModel !== input.probeModel
    ? ` 当前模型别名建议改成 "${input.probeModel}"。`
    : input.requestedModel.includes('/')
      ? ''
      : ` 当前模型别名可优先检查是否需要带 provider 前缀，例如 "${input.probeModel}"。`

  return [
    '模型列表可访问，但推理鉴权失败。',
    '这类 OpenAI-compatible 网关的 /models 可能是公开接口，不能代表实际推理已可用。',
    aliasHint,
    `原始错误：${errorToMessage(input.cause)}`,
  ].join('')
}

function appendToBasePath(baseUrl: string, suffix: string) {
  return new URL(suffix, ensureTrailingSlash(baseUrl)).toString()
}

function ensureTrailingSlash(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
