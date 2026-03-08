import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('job controls support cancel, next-round model updates, and legacy error mapping', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
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

    const [pendingJob, runningJob] = createJobs([
      { title: 'Pending job', rawPrompt: 'A', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
      { title: 'Running job', rawPrompt: 'B', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const updatedPending = updateJobModels(pendingJob.id, {
      optimizerModel: 'gpt-5.4',
      judgeModel: 'gemini-3.1-pro',
    })
    assert.match(updatedPending.goalAnchor.goal, /A/)
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-paused-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const {
      claimNextRunnableJob,
      clearConsumedNextRoundInstruction,
      createJobs,
      getJobById,
      getOptimizerSeed,
      listJobs,
      pauseJob,
      resumeJobAuto,
      resumeJobStep,
      updateJobGoalAnchor,
      updateJobNextRoundInstruction,
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

    const [job] = createJobs([
      { title: 'Step job', rawPrompt: 'Improve this prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    assert.equal(job.status, 'pending')
    assert.equal(job.runMode, 'auto')
    assert.equal(job.maxRoundsOverride, null)
    assert.equal(job.pauseRequestedAt, null)
    assert.equal(job.nextRoundInstruction, null)
    assert.ok(job.goalAnchor.goal.length > 0)

    const steered = updateJobNextRoundInstruction(job.id, 'Keep the output warmer and more direct.')
    assert.equal(steered.nextRoundInstruction, 'Keep the output warmer and more direct.')

    const anchored = updateJobGoalAnchor(job.id, {
      goal: '保持分诊目标',
      deliverable: '输出结构化分诊结果',
      driftGuard: ['不要退化成泛化建议'],
    })
    assert.equal(anchored.goalAnchor.deliverable, '输出结构化分诊结果')

    const firstSeed = getOptimizerSeed(job.id)
    assert.equal(firstSeed.nextRoundInstruction, 'Keep the output warmer and more direct.')
    assert.ok(firstSeed.nextRoundInstructionUpdatedAt)
    assert.equal(firstSeed.goalAnchor.goal, '保持分诊目标')

    const consumed = clearConsumedNextRoundInstruction(job.id, firstSeed.nextRoundInstructionUpdatedAt)
    assert.equal(consumed.nextRoundInstruction, null)

    updateJobNextRoundInstruction(job.id, 'First steering note.')
    const staleSeed = getOptimizerSeed(job.id)
    updateJobNextRoundInstruction(job.id, 'Newer steering note.')
    const preserved = clearConsumedNextRoundInstruction(job.id, staleSeed.nextRoundInstructionUpdatedAt)
    assert.equal(preserved.nextRoundInstruction, 'Newer steering note.')

    const cleared = updateJobNextRoundInstruction(job.id, '')
    assert.equal(cleared.nextRoundInstruction, null)

    const pausedPending = pauseJob(job.id)
    assert.equal(pausedPending.status, 'paused')
    assert.equal(pausedPending.pauseRequestedAt, null)
    assert.equal(claimNextRunnableJob(), null)

    const resumedStep = resumeJobStep(job.id)
    assert.equal(resumedStep.status, 'pending')
    assert.equal(resumedStep.runMode, 'step')

    const claimed = claimNextRunnableJob()
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
      crypto.randomUUID(),
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

    const listed = listJobs().find((item) => item.id === job.id)
    assert.equal(listed?.latestPrompt, 'LATEST PROMPT FROM CANDIDATE')
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})
