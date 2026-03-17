import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { normalizeModelCatalog } from '../src/lib/server/models'

test('normalizes OpenAI-style model payloads into alias-only ids', () => {
  const result = normalizeModelCatalog({
    data: [
      { id: 'gpt-5.4' },
      { id: 'gemini-3.1-pro' },
      { id: 'gpt-5.4' },
      { id: 'xingyun/gpt-5.2' },
      { id: 'imds/gpt-5.2' },
      { id: 'gpt-5.2' },
      { id: '  ' },
    ],
  })

  assert.deepEqual(result, ['gpt-5.4', 'gemini-3.1-pro', 'gpt-5.2'])
})

test('createJobs snapshots explicit and default task models plus reasoning defaults', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-models-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.4',
      defaultJudgeModel: 'gemini-3.1-pro',
      defaultOptimizerReasoningEffort: 'xhigh',
      defaultJudgeReasoningEffort: 'high',
    })

    global.fetch = (async () => {
      throw new Error('skip remote goal anchor generation in test')
    }) as typeof fetch

    const [explicitJob, defaultJob] = await createJobs([
      {
        title: 'Explicit models',
        rawPrompt: 'prompt A',
        optimizerModel: 'gpt-5.2',
        judgeModel: 'gemini-3.1-pro',
      },
      {
        title: 'Default models',
        rawPrompt: 'prompt B',
      },
    ])

    assert.equal(explicitJob.optimizerModel, 'gpt-5.2')
    assert.equal(explicitJob.judgeModel, 'gemini-3.1-pro')
    assert.equal(explicitJob.optimizerReasoningEffort, 'xhigh')
    assert.equal(explicitJob.judgeReasoningEffort, 'high')
    assert.equal(defaultJob.optimizerModel, 'gpt-5.4')
    assert.equal(defaultJob.judgeModel, 'gemini-3.1-pro')
    assert.equal(defaultJob.optimizerReasoningEffort, 'xhigh')
    assert.equal(defaultJob.judgeReasoningEffort, 'high')
  } finally {
    process.chdir(originalCwd)
    global.fetch = originalFetch
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
