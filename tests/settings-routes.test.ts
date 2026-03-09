import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('settings models GET returns an empty list before connection is configured', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-routes-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const route = await import('../src/app/api/settings/models/route')

    const response = await route.GET()
    assert.equal(response.status, 200)

    const payload = (await response.json()) as { models: Array<{ id: string; label: string }> }
    assert.deepEqual(payload.models, [])
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
