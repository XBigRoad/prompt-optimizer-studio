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
    assert.equal(capturedBody.max_tokens, 4096)
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
    assert.ok(Date.now() - startedAt < 320)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to /responses when chat/completions is missing for chat-first requests', async () => {
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
      model: 'gpt-4.1',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 1,
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/responses',
    ])

    assert.equal(requestBodies[0]?.model, 'gpt-4.1')
    assert.deepEqual(requestBodies[0]?.messages, [
      { role: 'system', content: 'system instruction' },
      { role: 'user', content: 'user prompt' },
    ])

    assert.equal(requestBodies[1]?.model, 'gpt-4.1')
    assert.equal(requestBodies[1]?.instructions, 'system instruction')
    assert.equal(requestBodies[1]?.input, 'user prompt')
    assert.equal(requestBodies[1]?.max_output_tokens, 4096)
    assert.equal('reasoning' in requestBodies[1], false)
    assert.equal(requestBodies[1]?.temperature, 0.2)
    assert.equal(payload.optimizedPrompt, 'fallback prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to /responses when chat/completions returns Cloudflare-style 403 for chat-first requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  let chatAttempts = 0

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/chat/completions')) {
        chatAttempts += 1
        return new Response('<html><title>Attention Required! | Cloudflare</title><body>Access denied</body></html>', {
          status: 403,
          headers: {
            'Content-Type': 'text/html',
          },
        })
      }

      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          id: 'resp_cf_fallback',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: '{"optimizedPrompt":"responses-after-chat-cloudflare"}',
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
      model: 'gpt-4.1',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 5_000,
      maxAttempts: 2,
    })

    assert.equal(chatAttempts, 2)
    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/responses',
    ])
    assert.equal(payload.optimizedPrompt, 'responses-after-chat-cloudflare')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter does not fall back from chat/completions on permanent 403 responses', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      return new Response(JSON.stringify({
        error: {
          message: 'invalid_api_key: insufficient permissions',
        },
      }), { status: 403 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-4.1',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 5_000,
        maxAttempts: 3,
      }),
      /invalid_api_key/i,
    )

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
    ])
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter prefers /responses first for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          id: 'resp_pref',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: '{"optimizedPrompt":"responses-first prompt"}',
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

      throw new Error(`chat/completions should not be used first here: ${url}`)
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
      'https://gateway.example.com/codex/responses',
    ])
    assert.equal(payload.optimizedPrompt, 'responses-first prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to chat/completions when /responses is missing for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response('Not Found', { status: 404 })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-fallback prompt"}',
              },
            },
          ],
        }), { status: 200 })
      }

      throw new Error(`Unexpected URL: ${url}; body=${String(init?.body ?? '')}`)
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
      reasoningEffort: 'high',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-fallback prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to chat/completions when /responses returns a retriable failure for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  let responseAttempts = 0

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        responseAttempts += 1
        return new Response('gateway timeout', { status: 504 })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-retriable-responses prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 2,
      reasoningEffort: 'xhigh',
    })

    assert.equal(responseAttempts, 1)
    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-retriable-responses prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter treats auth_unavailable responses as recoverable for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  let responseAttempts = 0

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        responseAttempts += 1
        return new Response(JSON.stringify({
          error: {
            message: 'auth_unavailable: no auth available',
          },
        }), { status: 500 })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-auth-unavailable prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 2,
      reasoningEffort: 'xhigh',
    })

    assert.equal(responseAttempts, 1)
    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-auth-unavailable prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to chat/completions when /responses returns a gateway-style 403 JSON for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          error: {
            message: 'gateway rejected request: access denied by upstream WAF',
          },
        }), { status: 403 })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-403-json prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-403-json prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to chat/completions when /responses returns a Cloudflare-style 403 HTML for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response('<html><title>Access denied</title><body>Access denied | gateway.example.com used Cloudflare to restrict access</body></html>', {
          status: 403,
          headers: { 'Content-Type': 'text/html' },
        })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-cloudflare-403 prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-cloudflare-403 prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter does not recover from permanent 403 permission errors on GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)
      return new Response(JSON.stringify({
        error: {
          message: 'forbidden: invalid api key scope',
        },
      }), { status: 403 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 5_000,
        maxAttempts: 2,
        reasoningEffort: 'xhigh',
      }),
      /invalid api key scope/i,
    )

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
    ])
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to chat/completions when /responses returns Cloudflare-style 403 for GPT-5 reasoning requests', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response('<html><title>Attention Required! | Cloudflare</title><body>Access denied</body></html>', {
          status: 403,
          headers: {
            'Content-Type': 'text/html',
          },
        })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-responses-cloudflare"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 2,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-responses-cloudflare')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter does not fall back from /responses on permanent 403 responses', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      return new Response(JSON.stringify({
        error: {
          message: 'invalid_api_key: insufficient permissions',
        },
      }), { status: 403 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 5_000,
        maxAttempts: 2,
        reasoningEffort: 'xhigh',
      }),
      /invalid_api_key/i,
    )

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
    ])
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter treats INTERNAL_ERROR provider failures as retriable and falls back to chat/completions', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/responses')) {
        return new Response('{"error":{"message":"stream error: stream ID 21; INTERNAL_ERROR; received from peer"}}', { status: 500 })
      }

      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-after-internal-error prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.equal(payload.optimizedPrompt, 'chat-after-internal-error prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter falls back to /responses when chat/completions returns a gateway-style 403 after retries', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  let chatAttempts = 0

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/chat/completions')) {
        chatAttempts += 1
        return new Response(JSON.stringify({
          error: {
            message: 'gateway rejected request: access denied by upstream WAF',
          },
        }), { status: 403 })
      }

      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          id: 'resp_chat_fallback',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: '{"optimizedPrompt":"responses-after-chat-403 prompt"}',
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
      model: 'gpt-4.1',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 5_000,
      maxAttempts: 2,
    })

    assert.equal(chatAttempts, 2)
    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/responses',
    ])
    assert.equal(payload.optimizedPrompt, 'responses-after-chat-403 prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter does not fall back from chat/completions on permanent 403 permission errors', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  let chatAttempts = 0

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.endsWith('/chat/completions')) {
        chatAttempts += 1
        return new Response(JSON.stringify({
          error: {
            message: 'forbidden: invalid api key scope',
          },
        }), { status: 403 })
      }

      throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-4.1',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 5_000,
        maxAttempts: 2,
      }),
      /invalid api key scope/i,
    )

    assert.equal(chatAttempts, 1)
    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/chat/completions',
    ])
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries GPT-5 reasoning with lower effort directly via chat/completions', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  const requestBodies: Array<Record<string, unknown>> = []

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)

      if (requestedUrls.length === 1 && url.endsWith('/responses')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (requestedUrls.length === 2 && url.endsWith('/chat/completions')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (requestedUrls.length === 3 && url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"lower-effort chat retry prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.deepEqual(requestBodies.map((body) => {
      const reasoning = body.reasoning as { effort?: string } | undefined
      return body.reasoning_effort ?? reasoning?.effort ?? null
    }), [
      'xhigh',
      'high',
      'high',
    ])
    assert.equal(payload.optimizedPrompt, 'lower-effort chat retry prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter clamps GPT-5 chat fallback effort from xhigh to high after /responses failure', async () => {
  const originalFetch = global.fetch
  const requestBodies: Array<Record<string, unknown>> = []

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      requestBodies.push(body)

      if (url.endsWith('/responses')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (url.endsWith('/chat/completions')) {
        const reasoningEffort = String(body.reasoning_effort ?? '')
        if (reasoningEffort !== 'high') {
          return new Response(JSON.stringify({
            error: {
              message: `Unsupported value: '${reasoningEffort}' is not supported with the 'gpt-5.1' model. Supported values are: 'none', 'low', 'medium', and 'high'.`,
              type: 'upstream_error',
            },
          }), { status: 400 })
        }

        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"chat-fallback-high-success"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.equal(payload.optimizedPrompt, 'chat-fallback-high-success')
    assert.deepEqual(requestBodies.map((body) => {
      const reasoning = body.reasoning as { effort?: string } | undefined
      return body.reasoning_effort ?? reasoning?.effort ?? null
    }), [
      'xhigh',
      'high',
    ])
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter keeps stepping down reasoning effort until a transient timeout succeeds', async () => {
  const originalFetch = global.fetch
  const requestedUrls: string[] = []
  const requestBodies: Array<Record<string, unknown>> = []

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)

      if (requestedUrls.length === 1 && url.endsWith('/responses')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (requestedUrls.length === 2 && url.endsWith('/chat/completions')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (requestedUrls.length === 3 && url.endsWith('/chat/completions')) {
        return new Response('gateway timeout', { status: 504 })
      }

      if (requestedUrls.length === 4 && url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                content: '{"optimizedPrompt":"medium-retry prompt"}',
              },
            },
          ],
        }), { status: 200 })
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
      timeoutMs: 5_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.deepEqual(requestedUrls, [
      'https://gateway.example.com/codex/responses',
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/chat/completions',
      'https://gateway.example.com/codex/chat/completions',
    ])
    assert.deepEqual(requestBodies.map((body) => {
      const reasoning = body.reasoning as { effort?: string } | undefined
      return body.reasoning_effort ?? reasoning?.effort ?? null
    }), [
      'xhigh',
      'high',
      'high',
      'medium',
    ])
    assert.equal(payload.optimizedPrompt, 'medium-retry prompt')
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible GPT-5 reasoning probe can use more than the old 120s cap when total budget is larger', async () => {
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled: number[] = []

  try {
    global.fetch = (() => new Promise(() => {})) as typeof fetch
    global.setTimeout = (((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      scheduled.push(Number(delay ?? 0))
      queueMicrotask(() => callback(...args))
      return { ref() { return this }, unref() { return this } } as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    global.clearTimeout = (((_timer?: ReturnType<typeof setTimeout>) => {}) as typeof clearTimeout)

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 360_000,
        maxAttempts: 1,
        reasoningEffort: 'xhigh',
      }),
      /request timeout/i,
    )

    assert.equal(scheduled[0], 237_600)
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('OpenAI-compatible GPT-5 lower-effort retry caps high retries at 240s', async () => {
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled: number[] = []
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      if (attempts <= 2) {
        return new Response('gateway timeout', { status: 504 })
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"optimizedPrompt":"high-retry-success"}',
            },
          },
        ],
      }), { status: 200 })
    }) as typeof fetch
    global.setTimeout = (((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      scheduled.push(Number(delay ?? 0))
      return { ref() { return this }, unref() { return this } } as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    global.clearTimeout = (((_timer?: ReturnType<typeof setTimeout>) => {}) as typeof clearTimeout)

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    const payload = await adapter.requestJson({
      model: 'gpt-5.4',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 420_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.equal(payload.optimizedPrompt, 'high-retry-success')
    assert.ok(scheduled.includes(240_000))
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
})

test('OpenAI-compatible GPT-5 lower-effort retry caps medium retries at 180s', async () => {
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled: number[] = []
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      if (attempts <= 3) {
        return new Response('gateway timeout', { status: 504 })
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"optimizedPrompt":"medium-retry-success"}',
            },
          },
        ],
      }), { status: 200 })
    }) as typeof fetch
    global.setTimeout = (((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      scheduled.push(Number(delay ?? 0))
      return { ref() { return this }, unref() { return this } } as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    global.clearTimeout = (((_timer?: ReturnType<typeof setTimeout>) => {}) as typeof clearTimeout)

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://gateway.example.com/codex',
      cpamcApiKey: 'secret',
      apiProtocol: 'openai-compatible',
    })

    const payload = await adapter.requestJson({
      model: 'gpt-5.4',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 420_000,
      maxAttempts: 1,
      reasoningEffort: 'xhigh',
    })

    assert.equal(payload.optimizedPrompt, 'medium-retry-success')
    assert.ok(scheduled.includes(180_000))
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
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
    assert.deepEqual(capturedBody.generationConfig, {
      temperature: 0.2,
      maxOutputTokens: 4096,
    })
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


test('OpenAI-compatible adapter retries auth_unavailable 500 responses when the gateway recovers', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      if (attempts === 1) {
        return new Response(JSON.stringify({
          error: {
            message: 'auth_unavailable: no auth available',
          },
        }), { status: 500 })
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"optimizedPrompt":"retry-after-auth prompt"}',
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
      model: 'gpt-5.4',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 1_000,
      maxAttempts: 3,
    })

    assert.equal(payload.optimizedPrompt, 'retry-after-auth prompt')
    assert.equal(attempts, 2)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries recoverable 500 gateway wrapper responses when chat/completions recovers', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      if (attempts < 3) {
        return new Response(JSON.stringify({
          error: {
            message: 'gateway wrapper: upstream timed out before receiving the final model payload',
          },
        }), { status: 500 })
      }

      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"optimizedPrompt":"retry-after-gateway-wrapper-500"}',
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
      model: 'gpt-4.1',
      system: 'system instruction',
      user: 'user prompt',
      timeoutMs: 2_000,
      maxAttempts: 3,
    })

    assert.equal(payload.optimizedPrompt, 'retry-after-gateway-wrapper-500')
    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries 503 responses up to maxAttempts', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      return new Response('service unavailable', { status: 503 })
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-4.1',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 2_000,
        maxAttempts: 3,
      }),
      /503/,
    )

    assert.equal(attempts, 3)
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
        timeoutMs: 2_000,
        maxAttempts: 3,
      }),
      /504/,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries 503 responses up to maxAttempts', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      return new Response('service unavailable', { status: 503 })
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
        timeoutMs: 2_000,
        maxAttempts: 3,
      }),
      /503/,
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

test('OpenAI-compatible adapter retries thrown EOF transport failures', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new Error('socket hang up: unexpected EOF from upstream')
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
      /EOF/i,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries thrown INTERNAL_ERROR transport failures', async () => {
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

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries thrown EOF transport failures', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new Error('upstream EOF while reading model response')
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-4.1',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /\bEOF\b/i,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter retries thrown socket hang up transport failures', async () => {
  const originalFetch = global.fetch
  let attempts = 0

  try {
    global.fetch = (async () => {
      attempts += 1
      throw new Error('socket hang up while proxying upstream response')
    }) as typeof fetch

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-4.1',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 1_000,
        maxAttempts: 3,
      }),
      /socket hang up/i,
    )

    assert.equal(attempts, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('OpenAI-compatible adapter lets long requests use the full timeout budget by default', async () => {
  const originalFetch = global.fetch
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  const scheduled: number[] = []

  try {
    global.fetch = (() => new Promise(() => {})) as typeof fetch
    global.setTimeout = (((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      scheduled.push(Number(delay ?? 0))
      queueMicrotask(() => callback(...args))
      return { ref() { return this }, unref() { return this } } as ReturnType<typeof setTimeout>
    }) as typeof setTimeout)
    global.clearTimeout = (((_timer?: ReturnType<typeof setTimeout>) => {}) as typeof clearTimeout)

    const adapter = createProviderAdapter({
      cpamcBaseUrl: 'https://api.openai.com/v1',
      cpamcApiKey: 'sk-openai',
    })

    await assert.rejects(
      () => adapter.requestJson({
        model: 'gpt-5.4',
        system: 'system instruction',
        user: 'user prompt',
        timeoutMs: 120_000,
        maxAttempts: 1,
      }),
      /request timeout after 120000ms/i,
    )

    assert.equal(scheduled[0], 120_000)
  } finally {
    global.fetch = originalFetch
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
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
