import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

function stubGoalAnchorFetch() {
  return (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            goal: '保持任务原始目标',
            deliverable: '输出原始任务要求的最终结果',
            driftGuard: ['不要把任务改成别的事情'],
            sourceSummary: '系统识别到原始任务要求保留核心目标。',
            rationale: ['原始 prompt 很短，但明确给出了任务目标。'],
          }),
        },
      },
    ],
  }), { status: 200 })) as typeof fetch
}

test('pending steering items append, delete, and clear in order', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-steering-list-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, addPendingSteeringItem, removePendingSteeringItem, clearPendingSteeringItems } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Steering list job', rawPrompt: 'A', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const first = addPendingSteeringItem(job.id, '先保留原始任务目标。')
    const second = addPendingSteeringItem(job.id, '最后输出仍然必须是一键复制的完整提示词。')

    assert.deepEqual(second.pendingSteeringItems.map((item) => item.text), [
      '先保留原始任务目标。',
      '最后输出仍然必须是一键复制的完整提示词。',
    ])

    const removed = removePendingSteeringItem(job.id, first.pendingSteeringItems[0].id)
    assert.deepEqual(removed.pendingSteeringItems.map((item) => item.text), [
      '最后输出仍然必须是一键复制的完整提示词。',
    ])

    const cleared = clearPendingSteeringItems(job.id)
    assert.deepEqual(cleared.pendingSteeringItems, [])
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

test('legacy single steering migrates into the pending list and consumption removes only captured ids', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-steering-consume-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { addPendingSteeringItem, consumePendingSteeringItems, createJobs, getJobById, getOptimizerSeed } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Steering migrate job', rawPrompt: 'B', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const legacyUpdatedAt = '2026-03-09T11:00:00.000Z'
    getDb().prepare(`
      UPDATE jobs
      SET next_round_instruction = ?,
          next_round_instruction_updated_at = ?
      WHERE id = ?
    `).run('保留老中医式判断。', legacyUpdatedAt, job.id)

    const migrated = getJobById(job.id)
    assert.deepEqual(migrated?.pendingSteeringItems.map((item) => item.text), ['保留老中医式判断。'])

    const seed = getOptimizerSeed(job.id)
    addPendingSteeringItem(job.id, '但最终还是要输出完整提示词。')
    const consumed = consumePendingSteeringItems(job.id, seed.pendingSteeringItems.map((item) => item.id))

    assert.deepEqual(consumed.pendingSteeringItems.map((item) => item.text), ['但最终还是要输出完整提示词。'])
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

test('goal-anchor draft can be generated from selected pending steering only and confirmed save consumes only that subset', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-steering-draft-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { addPendingSteeringItem, buildGoalAnchorDraftFromPendingSteering, createJobs, updateJobGoalAnchor } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Steering draft job', rawPrompt: 'C', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    addPendingSteeringItem(job.id, '语气更直接。')
    addPendingSteeringItem(job.id, '不要丢掉原始结论。')
    const seeded = addPendingSteeringItem(job.id, '保持像老中医一样的主判断。')
    const selectedIds = [
      seeded.pendingSteeringItems[0].id,
      seeded.pendingSteeringItems[2].id,
    ]

    const draft = buildGoalAnchorDraftFromPendingSteering(job.id, selectedIds)
    assert.equal(draft.goalAnchor.goal, '保持任务原始目标')
    assert.equal(draft.goalAnchor.deliverable, '输出原始任务要求的最终结果')
    assert.deepEqual(draft.consumePendingSteeringIds, selectedIds)
    assert.equal(draft.goalAnchor.driftGuard.some((item) => item.includes('语气更直接。')), true)
    assert.equal(draft.goalAnchor.driftGuard.some((item) => item.includes('保持像老中医一样的主判断。')), true)
    assert.equal(draft.goalAnchor.driftGuard.some((item) => item.includes('不要丢掉原始结论。')), false)

    const saved = updateJobGoalAnchor(job.id, draft.goalAnchor, { consumePendingSteeringIds: draft.consumePendingSteeringIds })
    assert.deepEqual(saved.pendingSteeringItems.map((item) => item.text), ['不要丢掉原始结论。'])
    assert.equal(saved.goalAnchor.driftGuard.some((item) => item.includes('语气更直接。')), true)
    assert.equal(saved.goalAnchor.driftGuard.some((item) => item.includes('保持像老中医一样的主判断。')), true)
    assert.equal(saved.goalAnchor.driftGuard.some((item) => item.includes('不要丢掉原始结论。')), false)
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

test('candidate history exposes applied steering items for the consumed round', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-steering-history-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { addPendingSteeringItem, createCandidateWithJudges, createJobs, getJobDetail, getOptimizerSeed } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Steering history job', rawPrompt: 'D', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    addPendingSteeringItem(job.id, '保持语气更像真人。')
    addPendingSteeringItem(job.id, '不要把结果改成说明文。')
    const seed = getOptimizerSeed(job.id)

    createCandidateWithJudges(job.id, {
      roundNumber: 1,
      optimizedPrompt: 'LATEST PROMPT',
      strategy: 'preserve',
      scoreBefore: 90,
      averageScore: 95,
      majorChanges: ['保持完整交付物'],
      mve: '检查一轮输出',
      deadEndSignals: [],
      aggregatedIssues: ['减少过度安全化'],
      appliedSteeringItems: seed.pendingSteeringItems,
      judgments: [
        {
          id: crypto.randomUUID(),
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 95,
          hasMaterialIssues: false,
          summary: '结果更贴近原任务。',
          driftLabels: [],
          driftExplanation: '',
          findings: ['结构稳定'],
          suggestedChanges: ['继续压缩冗余措辞'],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    const detail = getJobDetail(job.id)
    assert.deepEqual(detail?.candidates[0]?.appliedSteeringItems.map((item) => item.text), [
      '保持语气更像真人。',
      '不要把结果改成说明文。',
    ])
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


test('pending steering items can append a selected edited batch in order', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-steering-batch-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { addPendingSteeringItems, createJobs } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Batch steering job', rawPrompt: 'E', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const updated = addPendingSteeringItems(job.id, [
      '  先补一条预算兜底。  ',
      '',
      '把采购缺货时的替代规则写具体。',
    ])

    assert.deepEqual(updated.pendingSteeringItems.map((item) => item.text), [
      '先补一条预算兜底。',
      '把采购缺货时的替代规则写具体。',
    ])
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
