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
  assert.equal(inferApiProtocol('https://api.moonshot.cn/v1'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://dashscope.aliyuncs.com/compatible-mode/v1'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://open.bigmodel.cn/api/paas/v4/'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://api.deepseek.com/v1'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://api.anthropic.com'), 'anthropic-native')
  assert.equal(inferApiProtocol('https://api.anthropic.com/v1'), 'anthropic-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com'), 'gemini-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com/v1beta'), 'gemini-native')
  assert.equal(inferApiProtocol('https://generativelanguage.googleapis.com/v1beta/openai'), 'openai-compatible')
  assert.equal(inferApiProtocol('https://api.mistral.ai/v1'), 'mistral-native')
  assert.equal(inferApiProtocol('https://api.cohere.com'), 'cohere-native')
})

test('createProviderAdapter honors explicit apiProtocol override', () => {
  const adapter = createProviderAdapter({
    cpamcBaseUrl: 'https://gateway.example.com',
    cpamcApiKey: 'secret',
    apiProtocol: 'anthropic-native',
  })

  assert.equal(adapter.protocol, 'anthropic-native')
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

test('OpenAI-compatible adapter times out when response body never resolves and cancels the body stream', async () => {
  const originalFetch = global.fetch
  let cancelled = false

  try {
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => new Promise<never>(() => {}),
      body: {
        cancel: async () => {
          cancelled = true
        },
      },
    })) as unknown as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    const startedAt = Date.now()
    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 20,
        maxAttempts: 1,
        reasoningEffort: 'xhigh',
      }),
      (error: unknown) => {
        assert.match(String(error), /(response body timeout|request timeout)/i)
        return true
      },
    )
    assert.equal(cancelled, true)
    assert.ok(Date.now() - startedAt < 1_000)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter times out when fetch never settles even if the mock ignores abort signals', async () => {
  const originalFetch = global.fetch

  try {
    global.fetch = (async () => new Promise<never>(() => {})) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    const startedAt = Date.now()
    await assert.rejects(
      () => Promise.race([
        adapter.requestJson({
          model: 'gpt-5.4',
          system: 'system instruction',
          user: 'user prompt',
          timeoutMs: 20,
          maxAttempts: 1,
          reasoningEffort: 'xhigh',
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('test timeout')), 200)),
      ]),
      (error: unknown) => {
        assert.doesNotMatch(String(error), /test timeout/i)
        assert.match(String(error), /request timeout/i)
        return true
      },
    )
    assert.ok(Date.now() - startedAt < 1_000)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter applies timeout budget across retries instead of multiplying it per attempt', async () => {
  const originalFetch = global.fetch

  try {
    global.fetch = (async () => new Promise<never>(() => {})) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    const startedAt = Date.now()
    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 80,
        maxAttempts: 3,
        reasoningEffort: 'xhigh',
      }),
      /request timeout/i,
    )
    assert.ok(Date.now() - startedAt < 160)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to /responses when chat/completions is missing', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  const requestBodies: Array<Record<string, unknown>> = []

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)

      if (url.endsWith('/chat/completions')) {
        return new Response('Not Found', { status: 404 })
      }

      if (url.endsWith('/responses')) {
        return new Response(
          [
            'event: response.created',
            'data: {"response":{"id":"resp_123","status":"in_progress","output":[]}}',
            '',
            'event: response.completed',
            'data: {"response":{"id":"resp_123","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"{\\"optimizedPrompt\\":\\"fallback prompt\\"}"}]}]}}',
            '',
          ].join('\n'),
          {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
            },
          },
        )
      }

      throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    const payload = await adapter.requestJson({
      model: 'gpt-5.4',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/responses',
    ])

    assert.equal(requestBodies[0]?.model, 'gpt-5.4')
    assert.deepEqual(requestBodies[0]?.messages, [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'user prompt' },
    ])

    assert.equal(requestBodies[1]?.model, 'gpt-5.4')
    assert.equal(requestBodies[1]?.instructions, 'system instruction')
    assert.equal(requestBodies[1]?.input, 'user prompt')
    assert.deepEqual(requestBodies[1]?.reasoning, { effort: 'xhigh' })
    assert.equal('temperature' in requestBodies[1], false)
    assert.equal(payload.optimizedPrompt, 'fallback prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter can parse JSON from Responses API payloads', async () => {
  const originalFetch = global.fetch

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/chat/completions')) {
        return new Response('Not Found', { status: 404 })
      }

      if (url.endsWith('/responses')) {
        assert.match(String(init?.body ?? ''), /"reasoning":\{"effort":"medium"\}/)

        return new Response(JSON.stringify({
          id: 'resp_456',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: '{"optimizedPrompt":"json payload prompt"}',
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      }

      throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    const payload = await adapter.requestJson({
      model: 'gpt-5.4',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
      reasoningEffort: 'medium',
    })

    assert.equal(payload.optimizedPrompt, 'json payload prompt')
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

test('Mistral native adapter posts chat completions with bearer auth', async () => {
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
              content: '{"summary":"mistral-ready"}',
            },
          },
        ],
      }), { status: 200 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.mistral.ai/v1',
      cpamcApiKey: 'mistral-key',
    })
    const payload = await adapter.requestJson({
      model: 'mistral-large-latest',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.equal(adapter.protocol, 'mistral-native')
    assert.equal(capturedUrl, 'https://api.mistral.ai/v1/chat/completions')
    assert.equal(capturedHeaders.authorization, 'Bearer mistral-key')
    assert.equal(capturedHeaders['content-type'], 'application/json')
    assert.equal(capturedBody.model, 'mistral-large-latest')
    assert.deepEqual(capturedBody.messages, [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'user prompt' },
    ])
    assert.equal(payload.summary, 'mistral-ready')
  } finally {
    global.fetch = originalFetch
  }
})

test('Cohere native adapter posts v2 chat with bearer auth', async () => {
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
        message: {
          content: [
            {
              type: 'text',
              text: '{"summary":"cohere-ready"}',
            },
          ],
        },
      }), { status: 200 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.cohere.com',
      cpamcApiKey: 'cohere-key',
    })
    const payload = await adapter.requestJson({
      model: 'command-a-03-2025',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.equal(adapter.protocol, 'cohere-native')
    assert.equal(capturedUrl, 'https://api.cohere.com/v2/chat')
    assert.equal(capturedHeaders.authorization, 'Bearer cohere-key')
    assert.equal(capturedHeaders['content-type'], 'application/json')
    assert.equal(capturedBody.model, 'command-a-03-2025')
    assert.deepEqual(capturedBody.messages, [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'user prompt' },
    ])
    assert.equal(payload.summary, 'cohere-ready')
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

  assert.deepEqual(
    normalizeProviderModelCatalog('mistral-native', {
      data: [
        { id: 'mistral-small-latest' },
        { id: 'mistral-large-latest' },
      ],
    }).map((item) => item.id),
    ['mistral-small-latest', 'mistral-large-latest'],
  )

  assert.deepEqual(
    normalizeProviderModelCatalog('cohere-native', {
      models: [
        { name: 'command-a-03-2025' },
        { name: 'command-r-plus' },
      ],
    }).map((item) => item.id),
    ['command-a-03-2025', 'command-r-plus'],
  )
})

test('OpenAI-compatible adapter treats a missing /models endpoint as an empty catalog', async () => {
  const originalFetch = global.fetch

  try {
    global.fetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    const models = await adapter.listModels()
    assert.deepEqual(models, [])
  } finally {
    global.fetch = originalFetch
  }
})


test('OpenAI-compatible adapter does not retry auth_unavailable 500 responses', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      return new Response(JSON.stringify({
        error: {
          message: 'auth_unavailable: no auth available',
        },
      }), { status: 500 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /auth_unavailable/i,
    )

    assert.equal(attempts, 1)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries 504 responses up to maxAttempts', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      return new Response('gateway timeout', { status: 504 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /504/,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries thrown timeout-like network errors', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new TypeError('fetch failed: ETIMEDOUT while contacting upstream')
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /ETIMEDOUT/i,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter does not retry generic thrown internal errors', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new Error('stream error: stream ID 1023; INTERNAL_ERROR; received from peer')
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /INTERNAL_ERROR/,
    )

    assert.equal(attempts, 1)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter caps a single attempt timeout below the total budget', async () => {
  const originalFetch = global.fetch
  const startedAt = Date.now()

  try {
    global.fetch = (() => new Promise(() => {})) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 200,
        maxAttempts: 1,
        attemptTimeoutCapMs: 40,
      }),
      /request timeout after 40ms/i,
    )

    const elapsedMs = Date.now() - startedAt
    assert.ok(elapsedMs < 160, `expected capped timeout under 160ms, got ${elapsedMs}ms`)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter defaults model requests to two attempts', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new TypeError('fetch failed: ETIMEDOUT while contacting upstream')
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
      }),
      /ETIMEDOUT/i,
    )

    assert.equal(attempts, 2)
  } finally {
    global.fetch = originalFetch
  }
})
