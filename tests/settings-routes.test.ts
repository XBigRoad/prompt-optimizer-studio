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
        workerConcurrency: 3,
      }),
    }))

    assert.equal(saveResponse.status, 200)
    const savePayload = (await saveResponse.json()) as {
      settings: {
        apiProtocol: string
        workerConcurrency: number
      }
    }
    assert.equal(savePayload.settings.apiProtocol, 'cohere-native')
    assert.equal(savePayload.settings.workerConcurrency, 3)

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

test('settings connection test degrades gracefully when an OpenAI-compatible gateway does not expose /models', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-gateway-no-models-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    global.fetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch

    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()

    const modelsRoute = await import('../src/app/api/settings/models/route')
    const testConnectionRoute = await import('../src/app/api/settings/test-connection/route')

    const modelsResponse = await modelsRoute.POST(new Request('http://localhost/api/settings/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://gateway.example.com/codex',
        cpamcApiKey: 'secret',
        apiProtocol: 'openai-compatible',
      }),
    }))

    assert.equal(modelsResponse.status, 200)
    const modelsPayload = (await modelsResponse.json()) as { models: Array<{ id: string; label: string }> }
    assert.deepEqual(modelsPayload.models, [])

    const connectionResponse = await testConnectionRoute.POST(new Request('http://localhost/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://gateway.example.com/codex',
        cpamcApiKey: 'secret',
        apiProtocol: 'openai-compatible',
      }),
    }))

    assert.equal(connectionResponse.status, 200)
    const connectionPayload = (await connectionResponse.json()) as {
      ok: boolean
      message: string
      models: Array<{ id: string; label: string }>
    }
    assert.equal(connectionPayload.ok, true)
    assert.deepEqual(connectionPayload.models, [])
    assert.match(connectionPayload.message, /未返回模型列表/)
    assert.match(connectionPayload.message, /手动填写模型别名/)
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

test('settings models POST degrades a missing OpenAI-compatible /models endpoint to an empty list', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-models-404-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    global.fetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch

    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()

    const modelsRoute = await import('../src/app/api/settings/models/route')
    const response = await modelsRoute.POST(new Request('http://localhost/api/settings/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://gateway.example.com/codex',
        cpamcApiKey: 'secret',
        apiProtocol: 'openai-compatible',
      }),
    }))

    assert.equal(response.status, 200)
    const payload = (await response.json()) as { models: Array<{ id: string; label: string }> }
    assert.deepEqual(payload.models, [])
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

test('settings route defaults worker concurrency to 2 and persists updates', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-concurrency-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const settingsRoute = await import('../src/app/api/settings/route')

    const initialResponse = await settingsRoute.GET()
    assert.equal(initialResponse.status, 200)
    const initialPayload = (await initialResponse.json()) as { settings: { workerConcurrency: number } }
    assert.equal(initialPayload.settings.workerConcurrency, 2)

    const saveResponse = await settingsRoute.POST(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerConcurrency: 4,
      }),
    }))

    assert.equal(saveResponse.status, 200)
    const savePayload = (await saveResponse.json()) as { settings: { workerConcurrency: number } }
    assert.equal(savePayload.settings.workerConcurrency, 4)

    const getResponse = await settingsRoute.GET()
    assert.equal(getResponse.status, 200)
    const getPayload = (await getResponse.json()) as { settings: { workerConcurrency: number } }
    assert.equal(getPayload.settings.workerConcurrency, 4)
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})

test('settings route preserves an explicit legacy worker concurrency value of 1', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-legacy-concurrency-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { getDb, resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const db = getDb()
    db.prepare('UPDATE settings SET worker_concurrency = 1 WHERE id = 1').run()
    resetDbForTests()

    const settingsRoute = await import('../src/app/api/settings/route')
    const response = await settingsRoute.GET()
    assert.equal(response.status, 200)

    const payload = (await response.json()) as { settings: { workerConcurrency: number } }
    assert.equal(payload.settings.workerConcurrency, 1)
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})

test('settings rubric route returns the effective global rubric', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-rubric-route-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const route = await import('../src/app/api/settings/rubric/route')

    saveSettings({
      customRubricMd: '# 全局评分标准\n\n1. 目标一致性 (20)',
    })

    const response = await route.GET()
    const payload = await response.json() as { rubricMd: string; source: string }
    assert.equal(response.status, 200)
    assert.equal(payload.source, 'settings')
    assert.equal(payload.rubricMd, '# 全局评分标准\n\n1. 目标一致性 (20)')
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})


test('settings route persists custom rubric markdown', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-settings-rubric-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const settingsRoute = await import('../src/app/api/settings/route')

    const saveResponse = await settingsRoute.POST(new Request('http://localhost/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpamcBaseUrl: 'https://api.openai.com/v1',
        cpamcApiKey: 'secret',
        apiProtocol: 'openai-compatible',
        defaultOptimizerModel: 'gpt-5.2',
        defaultJudgeModel: 'gpt-5.2',
        customRubricMd: '# 自定义评分标准\n\n1. 目标清晰度 (20)',
      }),
    }))

    assert.equal(saveResponse.status, 200)
    const savePayload = (await saveResponse.json()) as { settings: { customRubricMd: string } }
    assert.equal(savePayload.settings.customRubricMd, '# 自定义评分标准\n\n1. 目标清晰度 (20)')

    const getResponse = await settingsRoute.GET()
    assert.equal(getResponse.status, 200)
    const getPayload = (await getResponse.json()) as { settings: { customRubricMd: string } }
    assert.equal(getPayload.settings.customRubricMd, '# 自定义评分标准\n\n1. 目标清晰度 (20)')
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
