import assert from 'node:assert/strict'
import test from 'node:test'

import { CpamcModelAdapter, normalizeTextArray } from '../src/lib/server/model-adapter'

test('adapter uses optimizer and judge models independently', async () => {
  const requestedModels: string[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { model: string }
    requestedModels.push(body.model)
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              requestedModels.length === 1
                ? {
                    optimizedPrompt: 'better prompt',
                    strategy: 'rebuild',
                    scoreBefore: 60,
                    majorChanges: ['more constraints'],
                    mve: 'single run',
                    deadEndSignals: ['vague output'],
                  }
                : {
                    score: 97,
                    hasMaterialIssues: false,
                    summary: 'ready',
                    findings: [],
                    suggestedChanges: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-4.1',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })
  await adapter.judgePrompt('candidate', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.deepEqual(requestedModels, ['gpt-4.1', 'gemini-3.1-pro'])
})

test('normalizeTextArray extracts useful text from object items', () => {
  const result = normalizeTextArray([
    'plain text',
    { issue: 'issue text' },
    { text: 'text field' },
    { nested: { a: 1 } },
  ])

  assert.deepEqual(result, [
    'plain text',
    'issue text',
    'text field',
    '{"nested":{"a":1}}',
  ])
})

test('adapter accepts prompt alias when optimizer omits optimizedPrompt', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            prompt: 'aliased optimized prompt',
            strategy: 'rebuild',
            scoreBefore: 88,
            majorChanges: ['clarified delivery'],
            mve: 'single run',
            deadEndSignals: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-4.1',
      judgeModel: 'gpt-4.1',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(optimization.optimizedPrompt, 'aliased optimized prompt')
  assert.equal(optimization.strategy, 'rebuild')
  assert.equal(optimization.scoreBefore, 88)
})


test('adapter coerces invalid numeric scores to safe fallbacks instead of propagating NaN', async () => {
  let callCount = 0

  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(
              callCount === 1
                ? {
                    optimizedPrompt: 'better prompt',
                    strategy: 'rebuild',
                    scoreBefore: 'not-a-number',
                    majorChanges: ['more constraints'],
                    mve: 'single run',
                    deadEndSignals: ['vague output'],
                  }
                : {
                    score: 'not-a-number',
                    hasMaterialIssues: false,
                    summary: 'ready',
                    findings: [],
                    suggestedChanges: [],
                  },
            ),
          },
        },
      ],
    }), { status: 200 })
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-4.1',
      judgeModel: 'gemini-3.1-pro',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })
  const review = await adapter.judgePrompt('candidate', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(optimization.scoreBefore, 0)
  assert.equal(review.score, 0)
})

test('adapter exposes provider telemetry on successful optimizer and judge calls', async () => {
  const requestedUrls: string[] = []

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith('/chat/completions')) {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                optimizedPrompt: 'telemetry prompt',
                strategy: 'rebuild',
                scoreBefore: 88,
                majorChanges: ['clarified output contract'],
                mve: 'single run',
                deadEndSignals: [],
              }),
            },
          },
        ],
      }), { status: 200 })
    }

    if (url.endsWith('/responses')) {
      return new Response(JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  score: 97,
                  hasMaterialIssues: false,
                  summary: 'ready',
                  findings: [],
                  suggestedChanges: [],
                }),
              },
            ],
          },
        ],
      }), { status: 200 })
    }

    throw new Error(`Unexpected URL: ${url}`)
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
      optimizerReasoningEffort: 'xhigh',
      judgeReasoningEffort: 'xhigh',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })
  const review = await adapter.judgePrompt('draft', 0, {
    goal: 'Keep the original task.',
    deliverable: 'Return the original requested deliverable.',
    driftGuard: ['Do not drift away from the original task.'],
  })

  assert.equal(optimization.requestTelemetry?.[0]?.requestLabel, 'optimizer')
  assert.equal(optimization.requestTelemetry?.[0]?.endpointKind, 'chat_completions')
  assert.equal(review.requestTelemetry?.[0]?.requestLabel, 'judge')
  assert.equal(review.requestTelemetry?.[0]?.endpointKind, 'responses')
  assert.deepEqual(requestedUrls, [
    'http://localhost:8317/v1/chat/completions',
    'http://localhost:8317/v1/responses',
  ])
})

test('adapter attaches provider telemetry to thrown optimizer errors', async () => {
  global.fetch = (async () => new Response('Gateway Timeout', { status: 504 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
      optimizerReasoningEffort: 'xhigh',
      judgeReasoningEffort: 'xhigh',
    },
  )

  await assert.rejects(
    () => adapter.optimizePrompt({
      currentPrompt: 'draft',
      goalAnchor: {
        goal: 'Keep the original task.',
        deliverable: 'Return the original requested deliverable.',
        driftGuard: ['Do not drift away from the original task.'],
      },
      threshold: 95,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /504|timeout/i)
      const telemetry = (error as Error & {
        requestTelemetry?: Array<{ requestLabel?: string; endpointKind?: string }>
      }).requestTelemetry
      assert.ok(Array.isArray(telemetry))
      assert.equal(telemetry?.[0]?.requestLabel, 'optimizer')
      assert.equal(telemetry?.[0]?.endpointKind, 'chat_completions')
      return true
    },
  )
})

test('adapter routes deep-round GPT-5 optimizer prompts to /responses when current prompt is long', async () => {
  const requestedUrls: string[] = []

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith('/responses')) {
      return new Response(JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  optimizedPrompt: 'deep-round responses prompt',
                  strategy: 'preserve',
                  scoreBefore: 94,
                  majorChanges: ['kept structure stable'],
                  mve: 'validate deep-round routing',
                  deadEndSignals: [],
                }),
              },
            ],
          },
        ],
      }), { status: 200 })
    }

    throw new Error(`Unexpected URL: ${url}`)
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-1',
      hash: 'hash',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
      optimizerReasoningEffort: 'xhigh',
      judgeReasoningEffort: 'xhigh',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'x'.repeat(2600),
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(optimization.optimizedPrompt, 'deep-round responses prompt')
  assert.equal(optimization.requestTelemetry?.[0]?.requestLabel, 'optimizer')
  assert.equal(optimization.requestTelemetry?.[0]?.endpointKind, 'responses')
  assert.deepEqual(requestedUrls, ['http://localhost:8317/v1/responses'])
})

test('adapter routes heavy-pack GPT-5 optimizer prompts to /responses even when current prompt is below the raw length threshold', async () => {
  const requestedUrls: string[] = []

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith('/responses')) {
      return new Response(JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  optimizedPrompt: 'heavy-pack responses prompt',
                  strategy: 'rebuild',
                  scoreBefore: 82,
                  majorChanges: ['switched to responses-preferred for heavy compiled packs'],
                  mve: 'validate heavy-pack routing',
                  deadEndSignals: [],
                }),
              },
            ],
          },
        ],
      }), { status: 200 })
    }

    throw new Error(`Unexpected URL: ${url}`)
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-heavy',
      hash: 'hash-heavy',
      skillMd: 'skill'.repeat(800),
      rubricMd: 'rubric'.repeat(250),
      templateMd: 'template'.repeat(80),
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
      optimizerReasoningEffort: 'xhigh',
      judgeReasoningEffort: 'xhigh',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'x'.repeat(2200),
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(optimization.optimizedPrompt, 'heavy-pack responses prompt')
  assert.equal(optimization.requestTelemetry?.[0]?.requestLabel, 'optimizer')
  assert.equal(optimization.requestTelemetry?.[0]?.endpointKind, 'responses')
  assert.deepEqual(requestedUrls, ['http://localhost:8317/v1/responses'])
})

test('adapter routes medium compiled GPT-5 optimizer prompts to /responses when system prompt crosses the runtime threshold', async () => {
  const requestedUrls: string[] = []

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith('/responses')) {
      return new Response(JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  optimizedPrompt: 'medium-compiled responses prompt',
                  strategy: 'preserve',
                  scoreBefore: 90,
                  majorChanges: ['shifted medium compiled load onto responses'],
                  mve: 'validate medium compiled routing',
                  deadEndSignals: [],
                }),
              },
            ],
          },
        ],
      }), { status: 200 })
    }

    throw new Error(`Unexpected URL: ${url}`)
  }) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-medium',
      hash: 'hash-medium',
      skillMd: 's'.repeat(2163),
      rubricMd: 'r'.repeat(760),
      templateMd: 't'.repeat(745),
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
      optimizerReasoningEffort: 'xhigh',
      judgeReasoningEffort: 'xhigh',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'short seed prompt that still compiles into a medium system load',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(optimization.optimizedPrompt, 'medium-compiled responses prompt')
  assert.equal(optimization.requestTelemetry?.[0]?.requestLabel, 'optimizer')
  assert.equal(optimization.requestTelemetry?.[0]?.endpointKind, 'responses')
  assert.deepEqual(requestedUrls, ['http://localhost:8317/v1/responses'])
})

test('adapter decodes double-escaped optimizer prompts into real multiline text', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            optimizedPrompt: '# 角色\\n你是一名提示词优化师。\\n\\n## 目标\\n输出最终版本。',
            strategy: 'rebuild',
            scoreBefore: 86,
            majorChanges: ['restored multiline prompt formatting'],
            mve: 'open latest prompt detail',
            deadEndSignals: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-escaped',
      hash: 'hash-escaped',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-4.1',
      judgeModel: 'gpt-4.1',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(
    optimization.optimizedPrompt,
    '# 角色\n你是一名提示词优化师。\n\n## 目标\n输出最终版本。',
  )
})

test('adapter falls back to the internal single-run MVE placeholder when optimizer omits MVE', async () => {
  global.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            optimizedPrompt: 'fallback mve prompt',
            strategy: 'rebuild',
            scoreBefore: 86,
            majorChanges: ['trimmed placeholder leakage'],
            deadEndSignals: [],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch

  const adapter = new CpamcModelAdapter(
    {
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      scoreThreshold: 95,
    },
    {
      id: 'pack-fallback-mve',
      hash: 'hash-fallback-mve',
      skillMd: 'skill',
      rubricMd: 'rubric',
      templateMd: 'template',
      createdAt: new Date().toISOString(),
    },
    {
      optimizerModel: 'gpt-4.1',
      judgeModel: 'gpt-4.1',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    goalAnchor: {
      goal: 'Keep the original task.',
      deliverable: 'Return the original requested deliverable.',
      driftGuard: ['Do not drift away from the original task.'],
    },
    threshold: 95,
  })

  assert.equal(optimization.mve, 'single run')
})
