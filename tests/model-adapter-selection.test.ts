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
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
      optimizerReasoningEffort: 'default',
      judgeReasoningEffort: 'default',
    },
  )

  await adapter.optimizePrompt({
    currentPrompt: 'draft',
    previousFeedback: [],
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

  assert.deepEqual(requestedModels, ['gpt-5.2', 'gemini-3.1-pro'])
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
      optimizerModel: 'gpt-5.2',
      judgeModel: 'gemini-3.1-pro',
      optimizerReasoningEffort: 'default',
      judgeReasoningEffort: 'default',
    },
  )

  const optimization = await adapter.optimizePrompt({
    currentPrompt: 'draft',
    previousFeedback: [],
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

test('xhigh reasoning doubles optimizer and judge request timeouts', async () => {
  const originalFetch = global.fetch
  const originalAbortTimeout = AbortSignal.timeout
  const capturedTimeouts: number[] = []
  let callCount = 0

  try {
    AbortSignal.timeout = ((ms: number) => {
      capturedTimeouts.push(ms)
      return originalAbortTimeout.call(AbortSignal, ms)
    }) as typeof AbortSignal.timeout

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
        optimizerModel: 'gpt-5.4',
        judgeModel: 'gpt-5.4',
        optimizerReasoningEffort: 'xhigh',
        judgeReasoningEffort: 'xhigh',
      },
    )

    await adapter.optimizePrompt({
      currentPrompt: 'draft',
      previousFeedback: [],
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

    assert.deepEqual(capturedTimeouts, [360_000, 240_000])
  } finally {
    global.fetch = originalFetch
    AbortSignal.timeout = originalAbortTimeout
  }
})
