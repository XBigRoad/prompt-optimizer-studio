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

test('settings routes persist apiProtocol and use it for model discovery plus connection test', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-routes-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  const requestedUrls: string[] = []

  try {
    global.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify({
        models: [
          { name: 'command-a-03-2025' },
          { name: 'command-r-plus' },
        ],
      }), { status: 200 })
    }) as typeof fetch

    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()

    const settingsRoute = await import('../src/app/api/settings/route')
    const modelsRoute = await import('../src/app/api/settings/models/route')
    const testConnectionRoute = await import('../src/app/api/settings/test-connection/route')

    const saveResponse = await settingsRoute.POST(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://api.cohere.com',
        cpamcApiKey: 'cohere-key',
        apiProtocol: 'cohere-native',
        defaultOptimizerModel: 'command-a-03-2025',
        defaultJudgeModel: 'command-a-03-2025',
        scoreThreshold: 95,
        maxRounds: 8,
      }),
    }))

    assert.equal(saveResponse.status, 200)
    const savePayload = (await saveResponse.json()) as {
      settings: {
        apiProtocol: string
      }
    }
    assert.equal(savePayload.settings.apiProtocol, 'cohere-native')

    const getModelsResponse = await modelsRoute.GET()
    assert.equal(getModelsResponse.status, 200)
    const getModelsPayload = (await getModelsResponse.json()) as {
      models: Array<{ id: string; label: string }>
    }
    assert.deepEqual(getModelsPayload.models.map((item) => item.id), ['command-a-03-2025', 'command-r-plus'])

    const connectionResponse = await testConnectionRoute.POST(new Request('http://localhost/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://gateway.example.com',
        cpamcApiKey: 'cohere-key',
        apiProtocol: 'cohere-native',
      }),
    }))

    assert.equal(connectionResponse.status, 200)
    assert.ok(requestedUrls.includes('https://api.cohere.com/v2/models'))
    assert.ok(requestedUrls.includes('https://gateway.example.com/v2/models'))
  } finally {
    global.fetch = originalFetch
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
