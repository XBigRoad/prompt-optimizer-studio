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
    assert.equal(
      getJobDisplayError("Expected ',' or ']' after array element in JSON at position 14184 (line 31 column 1)"),
      '模型返回了格式不完整的结构化结果，系统没法继续解析这一轮。请直接重试；若反复出现，建议补充更明确的格式要求，或切换模型后再试。',
    )
    assert.equal(
      getJobDisplayError("Expected ',' or ']' after array element in JSON at position 14184 (line 31 column 1)", 'en'),
      'The model returned an incomplete structured result, so this round could not be parsed. Retry directly; if it keeps happening, tighten the format requirement or switch models.',
    )

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


test('createJobs persists a task-level rubric override from job input', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-create-job-rubric-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobById } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      {
        title: 'Create job rubric',
        rawPrompt: 'Prompt',
        optimizerModel: 'gpt-5.2',
        judgeModel: 'gpt-5.2',
        customRubricMd: '# 任务级评分标准\n\n1. 保持原意 (50)',
      },
    ])

    assert.equal(job.customRubricMd, '# 任务级评分标准\n\n1. 保持原意 (50)')
    assert.equal(getJobById(job.id)?.customRubricMd, '# 任务级评分标准\n\n1. 保持原意 (50)')
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

test('createJobs fallback keeps goal anchors prompt-specific when model generation fails', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-goal-anchor-fallback-'))
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
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('network down')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: '寿喜烧大师', rawPrompt: '帮助用户做美味的寿喜烧', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    assert.match(job.goalAnchor.goal, /寿喜烧/)
    assert.match(job.goalAnchor.deliverable, /寿喜烧/)
    assert.doesNotMatch(job.goalAnchor.deliverable, /主要输出产物与完成目标/)
    assert.equal(job.goalAnchor.driftGuard.some((item) => /寿喜烧|步骤|做法|食材/.test(item)), true)
    assert.match(job.goalAnchorExplanation.sourceSummary, /寿喜烧/)
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

test('job reads repair legacy generic goal anchors without touching specific anchors', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-goal-anchor-repair-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { getDb, resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobById, listJobs } = await import('../src/lib/server/jobs')

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
              goal: '初始目标',
              deliverable: '初始交付物',
              driftGuard: ['初始边界'],
              sourceSummary: '初始说明',
              rationale: ['初始理由'],
            }),
          },
        },
      ],
    }), { status: 200 })) as typeof fetch

    const [genericJob, specificJob] = await createJobs([
      { title: '寿喜烧大师', rawPrompt: '帮助用户做美味的寿喜烧', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
      { title: '冷笑话生成器', rawPrompt: '生成优质冷笑话', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
    db.prepare(`
      UPDATE jobs
      SET goal_anchor_json = ?,
          goal_anchor_explanation_json = ?
      WHERE id = ?
    `).run(
      JSON.stringify({
        goal: '帮助用户做美味的寿喜烧',
        deliverable: '保持原任务要求的主要输出产物与完成目标。',
        driftGuard: [
          '不要把原任务改写成更安全但更泛化的任务。',
          '不要删除原任务要求的关键输出或核心判断。',
          '不要退化成泛泛说明、免责声明或合规套话。',
        ],
      }),
      JSON.stringify({
        sourceSummary: '帮助用户做美味的寿喜烧',
        rationale: [
          '系统把任务理解为：帮助用户做美味的寿喜烧',
          '关键交付物被提炼为：保持原任务要求的主要输出产物与完成目标。',
          '防漂移条款用于防止优化过程把任务改写成更泛化、更安全但不再忠实原始意图的版本。',
        ],
      }),
      genericJob.id,
    )

    const preservedAnchor = {
      goal: '生成优质冷笑话',
      deliverable: '一组优质冷笑话文本（可直接阅读/使用）',
      driftGuard: [
        '不输出冷笑话以外的内容（如长篇解释、教程或无关写作）',
        '不把任务改写为泛化的“讲笑话”或其他类型幽默而非冷笑话',
        '不将产出替换为笑话创作建议、框架或评价标准而不是具体笑话',
      ],
    }
    db.prepare(`
      UPDATE jobs
      SET goal_anchor_json = ?,
          goal_anchor_explanation_json = ?
      WHERE id = ?
    `).run(
      JSON.stringify(preservedAnchor),
      JSON.stringify({
        sourceSummary: '用户要求：生成优质冷笑话。',
        rationale: [
          '原始提示唯一目标是产出“冷笑话”，无需扩展到其他写作任务',
          'deliverable 明确为可直接使用的笑话文本，符合“生成”这一产出导向',
          'driftGuard 约束内容范围与类型，防止偏离冷笑话生成的核心目标',
        ],
      }),
      specificJob.id,
    )

    const repaired = getJobById(genericJob.id)
    const untouched = listJobs().find((job) => job.id === specificJob.id)

    assert.match(repaired?.goalAnchor.deliverable ?? '', /寿喜烧/)
    assert.doesNotMatch(repaired?.goalAnchor.deliverable ?? '', /主要输出产物与完成目标/)
    assert.equal(repaired?.goalAnchor.driftGuard.some((item) => /寿喜烧|步骤|做法/.test(item)), true)
    assert.equal(untouched?.goalAnchor.goal, preservedAnchor.goal)
    assert.equal(untouched?.goalAnchor.deliverable, preservedAnchor.deliverable)
    assert.deepEqual(untouched?.goalAnchor.driftGuard, preservedAnchor.driftGuard)
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

test('job reads also repair malformed structured-prompt anchors that were derived from heading noise or false cooking matches', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-goal-anchor-malformed-repair-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { getDb, resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobById } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const rawPrompt = `
# Role: 提示词架构师（Prompt Architect V4.2）

## 0. 初始化与身份锁定
- 时间锚点：{Current_Date}
- 你是“Prompt Architect V4.2”，不是通用聊天助手，不降级为普通提示词优化器。

## 2. 核心目标
你的唯一职责是：根据用户任务，自动路由到三条互斥路径之一（A 硬逻辑 / B 软感官 / C 多维系统），并交付唯一、结构化、可直接使用的高质量 Prompt 体系，而不是退化为通用提示词优化建议。

## 3. MVE
原始任务明确围绕“1个最小验证实验”展开，核心目标不是泛化建议。
`

    const [job] = await createJobs([
      { title: 'Malformed structured anchor', rawPrompt, optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
    db.prepare(`
      UPDATE jobs
      SET goal_anchor_json = ?,
          goal_anchor_explanation_json = ?
      WHERE id = ?
    `).run(
      JSON.stringify({
        goal: '# Role: 提示词架构师（Prompt Architect V4.2） ## 0.',
        deliverable: '一份法指导的做法指导，包含关键步骤、所需食材与注意事项。',
        driftGuard: [
          '不要改成泛泛的做菜建议，必须继续聚焦法指导。',
          '不要只给概述或食材清单，必须保留可执行步骤与关键要点。',
          '不要偏离到无关的背景科普或其他料理。',
        ],
      }),
      JSON.stringify({
        sourceSummary: rawPrompt.replace(/\s+/g, ' ').trim(),
        rationale: [
          '系统把任务理解为：# Role: 提示词架构师（Prompt Architect V4.2） ## 0.',
          '关键交付物被提炼为：一份法指导的做法指导，包含关键步骤、所需食材与注意事项。',
        ],
      }),
      job.id,
    )

    const repaired = getJobById(job.id)

    assert.ok(repaired)
    assert.doesNotMatch(repaired.goalAnchor.goal, /^#|Role:|## 0/)
    assert.match(repaired.goalAnchor.goal, /最小验证实验|互斥路径|Prompt 体系/)
    assert.match(repaired.goalAnchor.deliverable, /Prompt 体系|可直接使用/)
    assert.doesNotMatch(repaired.goalAnchor.deliverable, /做法指导|食材|料理/)
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

test('manual completion marks job completed and keeps pending steering', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-complete-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const {
      addPendingSteeringItem,
      completeJob,
      createCandidateWithJudges,
      createJobs,
      getJobById,
      pauseJob,
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
      { title: 'Complete job', rawPrompt: 'Improve this prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const candidateId = createCandidateWithJudges(job.id, {
      roundNumber: 1,
      optimizedPrompt: 'OPTIMIZED PROMPT',
      strategy: 'preserve',
      scoreBefore: 80,
      averageScore: 90,
      majorChanges: ['Keep structure stable'],
      mve: 'mve',
      deadEndSignals: [],
      aggregatedIssues: [],
      appliedSteeringItems: [],
      judgments: [
        {
          id: crypto.randomUUID(),
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 90,
          hasMaterialIssues: false,
          summary: 'Looks good',
          driftLabels: [],
          driftExplanation: '',
          findings: [],
          suggestedChanges: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    addPendingSteeringItem(job.id, 'Steering note that should remain as readonly record.')
    pauseJob(job.id)

    // Simulate leftovers from previous runtime mutations; completion should clean these.
    getDb().prepare(`
      UPDATE jobs
      SET pending_optimizer_model = 'gpt-5.4',
          pending_judge_model = 'gpt-5.4',
          active_worker_id = 'worker-x',
          worker_heartbeat_at = '2026-03-09T00:00:00.000Z',
          cancel_requested_at = '2026-03-09T00:00:00.000Z',
          pause_requested_at = '2026-03-09T00:00:00.000Z',
          error_message = 'boom'
      WHERE id = ?
    `).run(job.id)

    const completed = completeJob(job.id)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.finalCandidateId, candidateId)
    assert.equal(completed.pendingSteeringItems.length, 1)
    assert.equal(completed.pendingSteeringItems[0]?.text, 'Steering note that should remain as readonly record.')
    assert.equal(completed.pendingOptimizerModel, null)
    assert.equal(completed.pendingJudgeModel, null)
    assert.equal(completed.cancelRequestedAt, null)
    assert.equal(completed.pauseRequestedAt, null)
    assert.equal(completed.errorMessage, null)
    assert.equal(getJobById(job.id)?.status, 'completed')
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

test('cannot manually complete a running job', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-complete-running-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { claimNextRunnableJob, completeJob, createJobs } = await import('../src/lib/server/jobs')

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
      { title: 'Running complete job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const claimed = claimNextRunnableJob('worker-a')
    assert.equal(claimed?.id, job.id)
    assert.equal(claimed?.status, 'running')

    assert.throws(() => completeJob(job.id), /运行中/)
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

test('job complete route marks a paused job completed and returns updated job', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-complete-route-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createCandidateWithJudges, createJobs, pauseJob } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/complete/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Route complete job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const candidateId = createCandidateWithJudges(job.id, {
      roundNumber: 1,
      optimizedPrompt: 'OPT',
      strategy: 'preserve',
      scoreBefore: 80,
      averageScore: 90,
      majorChanges: [],
      mve: 'mve',
      deadEndSignals: [],
      aggregatedIssues: [],
      appliedSteeringItems: [],
      judgments: [
        {
          id: crypto.randomUUID(),
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 90,
          hasMaterialIssues: false,
          summary: 'ok',
          driftLabels: [],
          driftExplanation: '',
          findings: [],
          suggestedChanges: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    pauseJob(job.id)

    const response = await route.POST(
      new Request(`http://localhost/api/jobs/${job.id}/complete`, { method: 'POST' }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as { job: { status: string; finalCandidateId: string | null } }
    assert.equal(payload.job.status, 'completed')
    assert.equal(payload.job.finalCandidateId, candidateId)
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

test('job complete route rejects when no candidate exists yet', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-complete-route-empty-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, pauseJob } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/complete/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Route complete empty job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    pauseJob(job.id)

    const response = await route.POST(
      new Request(`http://localhost/api/jobs/${job.id}/complete`, { method: 'POST' }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 409)
    const payload = await response.json() as { error?: string }
    assert.match(payload.error ?? '', /至少一轮|候选稿|取消任务/)
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

test('job detail route persists a single-task rubric override', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-job-rubric-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobById } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
      customRubricMd: '# 全局评分标准',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Job rubric override', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const response = await route.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customRubricMd: '# 单任务评分标准\n\n1. 输出契约明确度 (20)',
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as { job: { customRubricMd: string | null } }
    assert.equal(payload.job.customRubricMd, '# 单任务评分标准\n\n1. 输出契约明确度 (20)')
    assert.equal(getJobById(job.id)?.customRubricMd, '# 单任务评分标准\n\n1. 输出契约明确度 (20)')
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

test('job rubric route resolves job override before settings and default', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-job-rubric-route-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')
    const route = await import('../src/app/api/jobs/[id]/rubric/route')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
      customRubricMd: '# 全局评分标准',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      {
        title: 'Job rubric route',
        rawPrompt: 'Prompt',
        optimizerModel: 'gpt-5.2',
        judgeModel: 'gpt-5.2',
      },
    ])

    const updateRoute = await import('../src/app/api/jobs/[id]/route')
    await updateRoute.PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customRubricMd: '# 单任务评分标准' }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    )

    const response = await route.GET(
      new Request(`http://localhost/api/jobs/${job.id}/rubric`),
      { params: Promise.resolve({ id: job.id }) },
    )
    const payload = await response.json() as { rubricMd: string; source: string }
    assert.equal(response.status, 200)
    assert.equal(payload.source, 'job')
    assert.equal(payload.rubricMd, '# 单任务评分标准')
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


test('getJobDetail collapses duplicate round numbers and keeps the latest candidate for each round', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-controls-round-dedupe-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobDetail, getJobById } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Round dedupe job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
    const earlyId = crypto.randomUUID()
    const lateId = crypto.randomUUID()

    db.prepare(`
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
      earlyId,
      job.id,
      1,
      'OLDER ROUND 1 PROMPT',
      'preserve',
      80,
      88,
      '[]',
      'mve',
      '[]',
      '[]',
      '2026-03-09T10:00:00.000Z',
    )

    db.prepare(`
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
      lateId,
      job.id,
      1,
      'NEWER ROUND 1 PROMPT',
      'preserve',
      81,
      90,
      '[]',
      'mve',
      '[]',
      '[]',
      '2026-03-09T10:05:00.000Z',
    )

    const detail = getJobDetail(job.id)
    assert.equal(detail?.candidates.length, 1)
    assert.equal(detail?.candidates[0]?.roundNumber, 1)
    assert.equal(detail?.candidates[0]?.optimizedPrompt, 'NEWER ROUND 1 PROMPT')
    assert.equal(getJobById(job.id)?.latestPrompt, 'NEWER ROUND 1 PROMPT')
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


test('worker round writer derives the next round from the highest stored candidate and active lease', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-worker-round-write-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, createCandidateWithJudgesForActiveWorker } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = (async () => {
      throw new Error('simulated goal anchor generation failure')
    }) as typeof fetch

    const [job] = await createJobs([
      { title: 'Worker round writer', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
    db.prepare(`
      UPDATE jobs
      SET status = 'running',
          active_worker_id = 'worker-a',
          current_round = 1,
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), job.id)

    db.prepare(`
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
        applied_steering_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      job.id,
      2,
      'EXISTING ROUND 2',
      'preserve',
      80,
      88,
      '[]',
      'mve',
      '[]',
      '[]',
      '[]',
      '2026-03-09T10:00:00.000Z',
    )

    const committed = createCandidateWithJudgesForActiveWorker(job.id, 'worker-a', {
      optimizedPrompt: 'NEW ROUND 3',
      strategy: 'preserve',
      scoreBefore: 88,
      averageScore: 91,
      majorChanges: ['keep structure'],
      mve: 'mve',
      deadEndSignals: [],
      aggregatedIssues: [],
      appliedSteeringItems: [],
      judgments: [
        {
          id: crypto.randomUUID(),
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 91,
          hasMaterialIssues: false,
          summary: 'ok',
          driftLabels: [],
          driftExplanation: '',
          findings: [],
          suggestedChanges: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    assert.equal(committed?.roundNumber, 3)

    const blocked = createCandidateWithJudgesForActiveWorker(job.id, 'worker-b', {
      optimizedPrompt: 'SHOULD NOT WRITE',
      strategy: 'preserve',
      scoreBefore: 90,
      averageScore: 92,
      majorChanges: [],
      mve: 'mve',
      deadEndSignals: [],
      aggregatedIssues: [],
      appliedSteeringItems: [],
      judgments: [
        {
          id: crypto.randomUUID(),
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 92,
          hasMaterialIssues: false,
          summary: 'blocked',
          driftLabels: [],
          driftExplanation: '',
          findings: [],
          suggestedChanges: [],
          createdAt: new Date().toISOString(),
        },
      ],
    })

    assert.equal(blocked, null)
    const maxRound = db.prepare(`SELECT MAX(round_number) AS max_round FROM candidates WHERE job_id = ?`).get(job.id) as { max_round?: number }
    assert.equal(maxRound.max_round, 3)
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
