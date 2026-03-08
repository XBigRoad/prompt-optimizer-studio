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
