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

test('optimizer seed hands off only the latest prompt without review memory', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-input-judged-seed-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs } = await import('../src/lib/server/jobs')
    const { getOptimizerSeed } = await import('../src/lib/server/jobs/runtime')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Input judged seed job', rawPrompt: 'INITIAL PROMPT', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
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
      'candidate-r1',
      job.id,
      1,
      'ROUND 1 OUTPUT',
      'rebuild',
      88,
      0,
      '[]',
      'Run one dry check.',
      '[]',
      '[]',
      '[]',
      '2026-03-20T00:00:00.000Z',
    )

    db.prepare(`
      UPDATE jobs
      SET current_round = 1,
          last_review_patch_json = ?,
          last_review_score = 96,
          best_average_score = 96
      WHERE id = ?
    `).run(JSON.stringify(['old patch that must not be handed off']), job.id)

    const seed = getOptimizerSeed(job.id) as Record<string, unknown>
    assert.equal(seed.currentPrompt, 'ROUND 1 OUTPUT')
    assert.equal(Object.hasOwn(seed, 'previousFeedback'), false)
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

test('job detail exposes input-judged round runs and marks the latest output as pending next review', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-input-judged-detail-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobDetail } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Input judged detail job', rawPrompt: 'INITIAL PROMPT', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
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
      ) VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'candidate-r1',
      job.id,
      1,
      'ROUND 1 OUTPUT',
      'rebuild',
      88,
      94,
      '[]',
      'Run one dry check.',
      '[]',
      '[]',
      '[]',
      '2026-03-20T00:00:00.000Z',
      'candidate-r2',
      job.id,
      2,
      'ROUND 2 OUTPUT',
      'rebuild',
      94,
      96,
      '[]',
      'Run one dry check.',
      '[]',
      '[]',
      '[]',
      '2026-03-20T00:01:00.000Z',
    )

    db.prepare(`
      INSERT INTO round_runs (
        id,
        job_id,
        round_number,
        input_prompt,
        input_candidate_id,
        output_candidate_id,
        displayed_score,
        has_material_issues,
        summary,
        drift_labels_json,
        drift_explanation,
        findings_json,
        suggested_changes_json,
        round_status,
        optimizer_error,
        judge_error,
        pass_streak_after,
        optimizer_telemetry_json,
        judge_telemetry_json,
        created_at
      ) VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'round-1',
      job.id,
      1,
      'INITIAL PROMPT',
      null,
      'candidate-r1',
      94,
      0,
      'Round 1 review',
      '[]',
      '',
      '[]',
      '[]',
      'settled',
      null,
      null,
      0,
      JSON.stringify([{
        kind: 'attempt_started',
        requestLabel: 'optimizer',
        protocol: 'openai-compatible',
        endpointKind: 'responses',
        endpoint: 'http://localhost:8317/v1/responses',
        attempt: 1,
        maxAttempts: 2,
        timeoutMs: 240000,
        elapsedMs: null,
        status: null,
        retriable: null,
        message: 'attempt started',
        at: '2026-03-20T00:00:00.000Z',
      }]),
      JSON.stringify([{
        kind: 'attempt_succeeded',
        requestLabel: 'judge',
        protocol: 'openai-compatible',
        endpointKind: 'responses',
        endpoint: 'http://localhost:8317/v1/responses',
        attempt: 1,
        maxAttempts: 2,
        timeoutMs: 240000,
        elapsedMs: 5200,
        status: 200,
        retriable: false,
        message: 'attempt succeeded',
        at: '2026-03-20T00:00:01.000Z',
      }]),
      '2026-03-20T00:00:10.000Z',
      'round-2',
      job.id,
      2,
      'ROUND 1 OUTPUT',
      'candidate-r1',
      'candidate-r2',
      96,
      0,
      'Round 2 review',
      '[]',
      '',
      '[]',
      '[]',
      'settled',
      null,
      null,
      1,
      JSON.stringify([{
        kind: 'attempt_failed',
        requestLabel: 'optimizer',
        protocol: 'openai-compatible',
        endpointKind: 'chat_completions',
        endpoint: 'http://localhost:8317/v1/chat/completions',
        attempt: 1,
        maxAttempts: 2,
        timeoutMs: 120000,
        elapsedMs: 119490,
        status: 408,
        retriable: true,
        message: 'request timeout',
        at: '2026-03-20T00:01:00.000Z',
      }]),
      JSON.stringify([{
        kind: 'attempt_succeeded',
        requestLabel: 'judge',
        protocol: 'openai-compatible',
        endpointKind: 'responses',
        endpoint: 'http://localhost:8317/v1/responses',
        attempt: 1,
        maxAttempts: 2,
        timeoutMs: 240000,
        elapsedMs: 6100,
        status: 200,
        retriable: false,
        message: 'attempt succeeded',
        at: '2026-03-20T00:01:01.000Z',
      }]),
      '2026-03-20T00:01:10.000Z',
    )

    db.prepare(`
      UPDATE jobs
      SET status = 'manual_review',
          current_round = 2,
          best_average_score = 96,
          last_review_score = 96,
          final_candidate_id = 'candidate-r2'
      WHERE id = ?
    `).run(job.id)

    const detail = getJobDetail(job.id) as ({
      roundRuns?: Array<{
        roundNumber: number
        inputPrompt: string
        displayScore: number | null
        outputJudged: boolean
        outputCandidate?: { optimizedPrompt: string; averageScore: number } | null
        optimizerTelemetry?: Array<{ kind: string; endpointKind: string }>
        judgeTelemetry?: Array<{ kind: string; endpointKind: string }>
      }>
    } | null)

    assert.equal(detail?.roundRuns?.length, 2)
    assert.equal(detail?.roundRuns?.[0]?.roundNumber, 2)
    assert.equal(detail?.roundRuns?.[0]?.inputPrompt, 'ROUND 1 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.displayScore, 96)
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.optimizedPrompt, 'ROUND 2 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.averageScore, 0)
    assert.equal(detail?.roundRuns?.[0]?.outputJudged, false)
    assert.equal(detail?.roundRuns?.[0]?.optimizerTelemetry?.[0]?.kind, 'attempt_failed')
    assert.equal(detail?.roundRuns?.[0]?.judgeTelemetry?.[0]?.endpointKind, 'responses')
    assert.equal(detail?.roundRuns?.[1]?.outputJudged, true)
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

test('worker round writer keeps input review score out of the new output candidate record', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-input-judged-write-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobDetail } = await import('../src/lib/server/jobs')
    const { recordRoundRunForActiveWorker } = await import('../src/lib/server/jobs/runtime')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Input judged write job', rawPrompt: 'INITIAL PROMPT', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
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
      'candidate-r1',
      job.id,
      1,
      'ROUND 1 OUTPUT',
      'rebuild',
      88,
      0,
      '[]',
      'Run one dry check.',
      '[]',
      '[]',
      '[]',
      '2026-03-20T00:00:00.000Z',
    )

    const committed = recordRoundRunForActiveWorker(job.id, 'worker-a', {
      currentPrompt: 'ROUND 1 OUTPUT',
      currentCandidateId: 'candidate-r1',
      optimization: {
        optimizedPrompt: 'ROUND 2 OUTPUT',
        strategy: 'rebuild',
        scoreBefore: 94,
        majorChanges: ['压缩输出协议。'],
        mve: '用同一输入再跑一轮 judge。',
        deadEndSignals: ['不要为了稳妥而丢交付。'],
      },
      review: {
        score: 96,
        hasMaterialIssues: false,
        summary: '这一轮输入已经稳定。',
        driftLabels: [],
        driftExplanation: '',
        findings: ['结构稳定。'],
        suggestedChanges: ['继续压缩少量冗余措辞。'],
      },
      aggregatedIssues: ['轻微语气偏硬。'],
      appliedSteeringItems: [],
      outcome: 'settled',
      optimizerError: null,
      judgeError: null,
      passStreakAfter: 2,
      optimizerTelemetry: [],
      judgeTelemetry: [],
    })

    assert.equal(committed?.roundNumber, 2)

    const storedCandidate = db.prepare(`
      SELECT average_score
      FROM candidates
      WHERE id = ?
    `).get(committed?.outputCandidateId) as { average_score?: number } | undefined

    assert.equal(storedCandidate?.average_score, 0)

    const detail = getJobDetail(job.id)
    assert.equal(detail?.roundRuns?.[0]?.inputPrompt, 'ROUND 1 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.inputCandidateId, 'candidate-r1')
    assert.equal(detail?.roundRuns?.[0]?.displayScore, 96)
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.optimizedPrompt, 'ROUND 2 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.averageScore, 0)
    assert.equal(detail?.roundRuns?.[0]?.outputJudged, false)
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

test('round diagnostics keep the passed review even when no new output candidate is generated', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-input-judged-no-output-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests, getDb } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, getJobDetail } = await import('../src/lib/server/jobs')
    const { recordRoundRunForActiveWorker } = await import('../src/lib/server/jobs/runtime')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Input judged missing output job', rawPrompt: 'INITIAL PROMPT', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const db = getDb()
    db.prepare(`
      UPDATE jobs
      SET status = 'running',
          active_worker_id = 'worker-a',
          current_round = 2,
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
      'candidate-r2',
      job.id,
      2,
      'ROUND 2 OUTPUT',
      'rebuild',
      94,
      0,
      '[]',
      'Run one dry check.',
      '[]',
      '[]',
      '[]',
      '2026-03-20T00:01:00.000Z',
    )

    const committed = recordRoundRunForActiveWorker(job.id, 'worker-a', {
      currentPrompt: 'ROUND 2 OUTPUT',
      currentCandidateId: 'candidate-r2',
      optimization: null,
      review: {
        score: 96,
        hasMaterialIssues: false,
        summary: '这一轮输入已经达标。',
        driftLabels: [],
        driftExplanation: '',
        findings: [],
        suggestedChanges: [],
      },
      aggregatedIssues: [],
      appliedSteeringItems: [],
      outcome: 'optimizer_failed',
      optimizerError: 'request timeout after 360000ms',
      judgeError: null,
      passStreakAfter: 3,
      optimizerTelemetry: [],
      judgeTelemetry: [],
    })

    assert.equal(committed?.outputCandidateId, null)

    const detail = getJobDetail(job.id)
    assert.equal(detail?.roundRuns?.[0]?.inputPrompt, 'ROUND 2 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.displayScore, 96)
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate, null)
    assert.equal(detail?.roundRuns?.[0]?.optimizerError, 'request timeout after 360000ms')
    assert.equal(detail?.roundRuns?.[0]?.passStreakAfter, 3)
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
