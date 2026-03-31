import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('job route adds multiple steering notes in one request and preserves order', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-review-suggestion-route-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    const [job] = await createJobs([
      { title: 'Review suggestion route job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const response = await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: {
            type: 'add_many',
            texts: ['先明确预算分档。', '再补一条缺货替代规则。'],
          },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as {
      job: {
        pendingSteeringItems: Array<{ text: string }>
      }
      steeringActionResult: {
        addedTexts: string[]
        skippedDuplicateTexts: string[]
      }
    }
    assert.deepEqual(payload.job.pendingSteeringItems.map((item) => item.text), ['先明确预算分档。', '再补一条缺货替代规则。'])
    assert.deepEqual(payload.steeringActionResult.addedTexts, ['先明确预算分档。', '再补一条缺货替代规则。'])
    assert.deepEqual(payload.steeringActionResult.skippedDuplicateTexts, [])
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})

test('job route reports duplicate steering notes without appending them again', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-review-suggestion-route-dup-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    const [job] = await createJobs([
      { title: 'Review suggestion route duplicate job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: {
            type: 'add_many',
            texts: ['先明确预算分档。'],
          },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    const response = await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: {
            type: 'add_many',
            texts: ['先明确预算分档。', ' 先明确预算分档。 ', '再补一条缺货替代规则。'],
          },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as {
      job: {
        pendingSteeringItems: Array<{ text: string }>
      }
      steeringActionResult: {
        addedTexts: string[]
        skippedDuplicateTexts: string[]
      }
    }
    assert.deepEqual(payload.job.pendingSteeringItems.map((item) => item.text), ['先明确预算分档。', '再补一条缺货替代规则。'])
    assert.deepEqual(payload.steeringActionResult.addedTexts, ['再补一条缺货替代规则。'])
    assert.deepEqual(payload.steeringActionResult.skippedDuplicateTexts, ['先明确预算分档。'])
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})

test('job route can write review suggestions straight into stable rules and clear same-text pending duplicates', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-review-suggestion-route-stable-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    const [job] = await createJobs([
      { title: 'Review suggestion route stable job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: {
            type: 'add_many',
            texts: ['先明确预算分档。', '再补一条缺货替代规则。'],
          },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    const response = await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: {
            type: 'add_many',
            target: 'stable',
            texts: ['先明确预算分档。', '补预算冲突 fallback。'],
          },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as {
      job: {
        pendingSteeringItems: Array<{ text: string }>
        goalAnchor: { driftGuard: string[] }
      }
      steeringActionResult: {
        addedTexts: string[]
        skippedDuplicateTexts: string[]
      }
    }
    assert.deepEqual(payload.job.pendingSteeringItems.map((item) => item.text), ['再补一条缺货替代规则。'])
    assert.deepEqual(payload.job.goalAnchor.driftGuard.slice(-2), ['先明确预算分档。', '补预算冲突 fallback。'])
    assert.deepEqual(payload.steeringActionResult.addedTexts, ['先明确预算分档。', '补预算冲突 fallback。'])
    assert.deepEqual(payload.steeringActionResult.skippedDuplicateTexts, [])
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
