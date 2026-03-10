import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('job controls support cancel, next-round model updates, and legacy error mapping', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const {
      createJobs,
      getJobById,
      listJobs,
      updateJobModels,
      updateJobGoalAnchor,
      cancelJob,
      resetJobForRetry,
      updateJobProgress,
      applyPendingJobModels,
      getJobDisplayError,
    } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => new Response(JSON.stringify({
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

    const [pendingJob, runningJob] = await createJobs([
      { title: 'Pending job', rawPrompt: 'A', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
      { title: 'Running job', rawPrompt: 'B', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    assert.equal(pendingJob.goalAnchor.goal, '保持任务原始目标')
    assert.equal(runningJob.goalAnchor.deliverable, '输出原始任务要求的最终结果')
    assert.equal(pendingJob.goalAnchorExplanation.sourceSummary, '系统识别到原始任务要求保留核心目标。')

    const updatedPending = updateJobModels(pendingJob.id, {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gemini-3.1-pro',
    })
    assert.equal(updatedPending.goalAnchor.goal, '保持任务原始目标')
    assert.equal(updatedPending.optimizerModel, 'gpt-5.4')
    assert.equal(updatedPending.judgeModel, 'gemini-3.1-pro')

    const updatedAnchor = updateJobGoalAnchor(pendingJob.id, {
      goal: '保持任务 A 的核心目标',
      deliverable: '输出任务 A 的最终结果',
      driftGuard: ['不要改成别的任务'],
    })
    assert.equal(updatedAnchor.goalAnchor.goal, '保持任务 A 的核心目标')

    updateJobProgress(runningJob.id, {
      status: 'running',
      currentRound: 1,
      bestAverageScore: 95,
      errorMessage: '请先配置模型名称。',
    })

    const scheduled = updateJobModels(runningJob.id, {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gpt-5.4',
    })
    assert.equal(scheduled.optimizerModel, 'gpt-5.2')
    assert.equal(scheduled.pendingOptimizerModel, 'gpt-5.4')
    assert.equal(getJobDisplayError(scheduled.errorMessage), '这是旧版本遗留失败记录。现在可以直接修改模型后重新开始。')
    assert.equal(getJobDisplayError('候选稿分数字段无效：scoreBefore'), '模型本轮返回了无效分数，系统已拦截这次结果写入。请直接重试；若反复出现，建议更换模型或稍后再试。')

    const cancelled = cancelJob(runningJob.id)
    assert.equal(cancelled.status, 'running')
    assert.ok(cancelled.cancelRequestedAt)

    const promoted = applyPendingJobModels(runningJob.id)
    assert.equal(promoted.optimizerModel, 'gpt-5.4')
    assert.equal(promoted.pendingOptimizerModel, null)

    updateJobProgress(runningJob.id, {
      status: 'cancelled',
      currentRound: 1,
      bestAverageScore: 95,
      errorMessage: '任务已取消。',
    })

    const restarted = resetJobForRetry(runningJob.id)
    assert.equal(restarted.status, 'pending')
    assert.equal(restarted.optimizerModel, 'gpt-5.4')
    assert.equal(restarted.errorMessage, null)
    assert.equal(restarted.cancelRequestedAt, null)
    assert.equal(getJobById(runningJob.id)?.judgeModel, 'gpt-5.4')

    const listedPending = listJobs().find((job) => job.id === pendingJob.id)
    assert.equal(listedPending?.latestPrompt, 'A')
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

test('job controls support paused state, resume modes, and max round overrides', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-paused-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const {
      addPendingSteeringItem,
      claimNextRunnableJob,
      clearPendingSteeringItems,
      consumePendingSteeringItems,
      createJobs,
      getJobById,
      getOptimizerSeed,
      listJobs,
      pauseJob,
      resumeJobAuto,
      resumeJobStep,
      updateJobGoalAnchor,
      updateJobMaxRoundsOverride,
      updateJobProgress,
    } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
      maxRounds: 8,
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Step job', rawPrompt: 'Improve this prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    assert.equal(job.status, 'pending')
    assert.equal(job.runMode, 'auto')
    assert.equal(job.maxRoundsOverride, null)
    assert.equal(job.pauseRequestedAt, null)
    assert.deepEqual(job.pendingSteeringItems, [])
    assert.ok(job.goalAnchor.goal.length > 0)
    assert.match(job.goalAnchor.goal, /Improve this prompt/)
    assert.ok(job.goalAnchorExplanation.sourceSummary.length > 0)
    assert.equal(job.goalAnchorExplanation.rationale.length >= 1, true)

    const steered = addPendingSteeringItem(job.id, 'Keep the output warmer and more direct.')
    assert.deepEqual(steered.pendingSteeringItems.map((item) => item.text), ['Keep the output warmer and more direct.'])

    const anchored = updateJobGoalAnchor(job.id, {
      goal: '保持分诊目标',
      deliverable: '输出结构化分诊结果',
      driftGuard: ['不要退化成泛化建议'],
    })
    assert.equal(anchored.goalAnchor.deliverable, '输出结构化分诊结果')

    const firstSeed = getOptimizerSeed(job.id)
    assert.deepEqual(firstSeed.pendingSteeringItems.map((item) => item.text), ['Keep the output warmer and more direct.'])
    assert.equal(firstSeed.goalAnchor.goal, '保持分诊目标')

    const consumed = consumePendingSteeringItems(job.id, firstSeed.pendingSteeringItems.map((item) => item.id))
    assert.deepEqual(consumed.pendingSteeringItems, [])

    addPendingSteeringItem(job.id, 'First steering note.')
    const staleSeed = getOptimizerSeed(job.id)
    addPendingSteeringItem(job.id, 'Newer steering note.')
    const preserved = consumePendingSteeringItems(job.id, staleSeed.pendingSteeringItems.map((item) => item.id))
    assert.deepEqual(preserved.pendingSteeringItems.map((item) => item.text), ['Newer steering note.'])

    const cleared = clearPendingSteeringItems(job.id)
    assert.deepEqual(cleared.pendingSteeringItems, [])

    const pausedPending = pauseJob(job.id)
    assert.equal(pausedPending.status, 'paused')
    assert.equal(pausedPending.pauseRequestedAt, null)
    assert.equal(claimNextRunnableJob('worker-a'), null)

    const resumedStep = resumeJobStep(job.id)
    assert.equal(resumedStep.status, 'pending')
    assert.equal(resumedStep.runMode, 'step')

    const claimed = claimNextRunnableJob('worker-a')
    assert.equal(claimed?.id, job.id)
    assert.equal(claimed?.status, 'running')

    const pauseRequested = pauseJob(job.id)
    assert.equal(pauseRequested.status, 'running')
    assert.ok(pauseRequested.pauseRequestedAt)

    updateJobProgress(job.id, {
      status: 'manual_review',
      currentRound: 8,
      bestAverageScore: 93,
      errorMessage: '达到最大轮数，已停止自动优化。',
    })

    assert.throws(
      () => resumeJobAuto(job.id),
      /请先提高任务级最大轮数后再继续运行。/,
    )

    const overridden = updateJobMaxRoundsOverride(job.id, 12)
    assert.equal(overridden.maxRoundsOverride, 12)

    const resumedAuto = resumeJobAuto(job.id)
    assert.equal(resumedAuto.status, 'pending')
    assert.equal(resumedAuto.runMode, 'auto')
    assert.equal(resumedAuto.maxRoundsOverride, 12)
    assert.equal(resumedAuto.pauseRequestedAt, null)
    assert.equal(resumedAuto.errorMessage, null)
    assert.equal(getJobById(job.id)?.status, 'pending')

    const { getDb } = await import('../src/lib/server/db')
    const candidateId = crypto.randomUUID()
    getDb().prepare(`
      INSERT INTO candidates (
        id,
        job_id,
        round_number,
        optimized_prompt,
        strategy,
        score_before,
        average_score,
        major_changes_json,
        mve,
        dead_end_signals_json,
        aggregated_issues_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      candidateId,
      job.id,
      1,
      'LATEST PROMPT FROM CANDIDATE',
      'preserve',
      80,
      90,
      '[]',
      'mve',
      '[]',
      '[]',
      new Date().toISOString(),
    )

    getDb().prepare(`
      INSERT INTO judge_runs (
        id,
        job_id,
        candidate_id,
        judge_index,
        score,
        has_material_issues,
        summary,
        drift_labels_json,
        drift_explanation,
        findings_json,
        suggested_changes_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      job.id,
      candidateId,
      0,
      88,
      1,
      '偏离目标',
      JSON.stringify(['over_safety_generalization']),
      '为了规避风险，输出已经退化成泛化安全建议。',
      JSON.stringify(['目标不再聚焦原任务']),
      JSON.stringify(['恢复原始交付物']),
      new Date().toISOString(),
    )

    const listed = listJobs().find((item) => item.id === job.id)
    assert.equal(listed?.latestPrompt, 'LATEST PROMPT FROM CANDIDATE')

    const detail = (await import('../src/lib/server/jobs')).getJobDetail(job.id)
    assert.deepEqual(detail?.candidates[0]?.judges[0]?.driftLabels, ['over_safety_generalization'])
    assert.equal(detail?.candidates[0]?.judges[0]?.driftExplanation, '为了规避风险，输出已经退化成泛化安全建议。')
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

test('job claim lease prevents double-claiming the same running job', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-claim-lease-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { claimNextRunnableJob, createJobs } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
      maxRounds: 8,
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Claim job', rawPrompt: 'Improve this prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const firstClaim = claimNextRunnableJob('worker-a')
    assert.equal(firstClaim?.id, job.id)
    assert.equal(firstClaim?.status, 'running')

    const secondClaim = claimNextRunnableJob('worker-b')
    assert.equal(secondClaim, null)
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

test('stale running job lease can be reclaimed by another worker', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-claim-recover-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { claimNextRunnableJob, createJobs } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
      maxRounds: 8,
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Recover job', rawPrompt: 'Improve this prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const firstClaim = claimNextRunnableJob('worker-a')
    assert.equal(firstClaim?.id, job.id)

    getDb().prepare(`
      UPDATE jobs
      SET active_worker_id = 'worker-a',
          worker_heartbeat_at = '2026-03-08T00:00:00.000Z'
      WHERE id = ?
    `).run(job.id)

    const reclaimed = claimNextRunnableJob('worker-b')
    assert.equal(reclaimed?.id, job.id)
    assert.equal(reclaimed?.status, 'running')
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


test('job detail route builds a goal-anchor draft from selected steering ids only', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-route-draft-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { addPendingSteeringItem, createJobs } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => new Response(JSON.stringify({
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

    const [job] = await createJobs([
      { title: 'Route steering draft job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    addPendingSteeringItem(job.id, '语气更直接。')
    const seeded = addPendingSteeringItem(job.id, '不要丢掉原始结论。')
    const selectedId = seeded.pendingSteeringItems[1].id

    const response = await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steeringAction: { type: 'build_goal_anchor_draft', itemIds: [selectedId] },
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as {
      goalAnchorDraft: { driftGuard: string[] }
      consumePendingSteeringIds: string[]
    }
    assert.deepEqual(payload.consumePendingSteeringIds, [selectedId])
    assert.equal(payload.goalAnchorDraft.driftGuard.some((item) => item.includes('不要丢掉原始结论。')), true)
    assert.equal(payload.goalAnchorDraft.driftGuard.some((item) => item.includes('语气更直接。')), false)
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


test('createCandidateWithJudges rejects invalid numeric scores with a clear error before SQLite write', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-invalid-scores-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, createCandidateWithJudges } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => new Response(JSON.stringify({
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

    const [job] = await createJobs([
      { title: 'Invalid score job', rawPrompt: 'A', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    assert.throws(
      () => createCandidateWithJudges(job.id, {
        roundNumber: 1,
        optimizedPrompt: 'candidate',
        strategy: 'preserve',
        scoreBefore: Number('not-a-number'),
        averageScore: 90,
        majorChanges: [],
        mve: 'mve',
        deadEndSignals: [],
        aggregatedIssues: [],
        judgments: [],
      }),
      /候选稿分数字段无效：scoreBefore/,
    )
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
