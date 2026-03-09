import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProviderAdapter,
  inferApiProtocol,
  normalizeProviderModelCatalog,
} from '../src/lib/server/provider-adapter'

test('inferApiProtocol detects official Anthropic and Gemini endpoints while preserving OpenAI-compatible gateways', () => {
  assert.equal(inferApiProtocol('https://api.openai.com/v1'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://openrouter.ai/api/v1'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://api.anthropic.com'), 'anthropic-native')
  assert.equal(inferApiProtocol('https://api.anthropic.com/v1'), 'anthropic-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com'), 'gemini-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com/v1beta'), 'gemini-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com/v1beta/openai'), 'openai-compatible')
})

test('OpenAI-compatible adapter posts chat completions with bearer auth', async () => {
  const originalFetch = global.fetch
  let capturedUrl = ''
  let capturedHeaders: Record<string, string> = {}
  let capturedBody: Record<string, unknown> = {}

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"optimizedPrompt":"final prompt"}',
            },
          },
        ],
      }), { status: 200 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })
    const payload = await adapter.requestJson({
      model: 'gpt-5.2',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.equal(adapter.protocol, 'openai-compatible')
    assert.equal(capturedUrl, 'https://api.openai.com/v1/chat/completions')
    assert.equal(capturedHeaders.authorization, 'Bearer sk-openai')
    assert.equal(capturedHeaders['content-type'], 'application/json')
    assert.equal(capturedBody.model, 'gpt-5.2')
    assert.deepEqual(capturedBody.messages, [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'user prompt' },
    ])
    assert.equal(payload.optimizedPrompt, 'final prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('Anthropic native adapter posts /v1/messages with x-api-key auth', async () => {
  const originalFetch = global.fetch
  let capturedUrl = ''
  let capturedHeaders: Record<string, string> = {}
  let capturedBody: Record<string, unknown> = {}

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

      return new Response(JSON.stringify({
        content: [
          {
            type: 'text',
            text: '{"summary":"ready"}',
          },
        ],
      }), { status: 200 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.anthropic.com',
      cpamcApiKey: 'sk-ant',
    })
    const payload = await adapter.requestJson({
      model: 'claude-3-7-sonnet-20250219',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.equal(adapter.protocol, 'anthropic-native')
    assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages')
    assert.equal(capturedHeaders['x-api-key'], 'sk-ant')
    assert.equal(capturedHeaders['anthropic-version'], '2023-06-01')
    assert.equal(capturedBody.model, 'claude-3-7-sonnet-20250219')
    assert.equal(capturedBody.system, 'system instruction')
    assert.deepEqual(capturedBody.messages, [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'user prompt',
          },
        ],
      },
    ])
    assert.equal(payload.summary, 'ready')
  } finally {
    global.fetch = originalFetch
  }
})

test('Gemini native adapter posts generateContent with x-goog-api-key auth', async () => {
  const originalFetch = global.fetch
  let capturedUrl = ''
  let capturedHeaders: Record<string, string> = {}
  let capturedBody: Record<string, unknown> = {}

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries())
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{"goal":"Keep the original task"}',
                },
              ],
            },
          },
        ],
      }), { status: 200 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://generativelanguage.googleapis.com',
      cpamcApiKey: 'gem-key',
    })
    const payload = await adapter.requestJson({
      model: 'gemini-2.5-pro',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.equal(adapter.protocol, 'gemini-native')
    assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent')
    assert.equal(capturedHeaders['x-goog-api-key'], 'gem-key')
    assert.equal(capturedHeaders['content-type'], 'application/json')
    assert.deepEqual(capturedBody.systemInstruction, {
      parts: [{ text: 'system instruction' }],
    })
    assert.deepEqual(capturedBody.contents, [
      {
        role: 'user',
        parts: [{ text: 'user prompt' }],
      },
    ])
    assert.equal(payload.goal, 'Keep the original task')
  } finally {
    global.fetch = originalFetch
  }
})

test('normalizeProviderModelCatalog keeps alias-only model ids across protocols', () => {
  assert.deepEqual(
    normalizeProviderModelCatalog('openai-compatible', {
      data: [
        { id: 'openai/gpt-5.4' },
        { id: 'gpt-5.4' },
        { id: 'anthropic/claude-sonnet-4' },
        { id: 'google/gemini-2.5-pro' },
      ],
    }).map((item) => item.id),
    ['gpt-5.4', 'claude-sonnet-4', 'gemini-2.5-pro'],
  )

  assert.deepEqual(
    normalizeProviderModelCatalog('anthropic-native', {
      data: [
        { id: 'claude-3-5-haiku-20241022' },
        { id: 'claude-3-7-sonnet-20250219' },
      ],
    }).map((item) => item.id),
    ['claude-3-5-haiku-20241022', 'claude-3-7-sonnet-20250219'],
  )

  assert.deepEqual(
    normalizeProviderModelCatalog('gemini-native', {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/text-embedding-004',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    }).map((item) => item.id),
    ['gemini-2.5-pro'],
  )
})
