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

test('job detail exposes input-judged round runs and keeps output candidate unjudged', async () => {
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
    const jobsModule = await import('../src/lib/server/jobs')
    const { createJobs, getJobDetail, recordRoundRunForActiveWorker } = jobsModule as typeof import('../src/lib/server/jobs') & {
      recordRoundRunForActiveWorker: (jobId: string, workerOwnerId: string, input: {
        currentPrompt: string
        currentCandidateId?: string | null
        optimization: {
          optimizedPrompt: string
          strategy: 'preserve' | 'rebuild'
          scoreBefore: number
          majorChanges: string[]
          mve: string
          deadEndSignals: string[]
        } | null
        review: {
          score: number
          hasMaterialIssues: boolean
          dimensionScores?: Record<string, number> | null
          rubricDimensionsSnapshot?: Array<{ id: string; label: string; max: number }> | null
          summary: string
          driftLabels: string[]
          driftExplanation: string
          findings: string[]
          suggestedChanges: string[]
        } | null
        aggregatedIssues?: string[]
        appliedSteeringItems?: Array<{ id: string; text: string; createdAt: string }>
        outcome: 'settled' | 'judge_failed' | 'optimizer_failed' | 'both_failed' | 'legacy'
        optimizerError?: string | null
        judgeError?: string | null
        passStreakAfter?: number
      }) => { roundRunId: string; roundNumber: number; outputCandidateId: string | null } | null
    }

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

    const committedRound = recordRoundRunForActiveWorker(job.id, 'worker-a', {
      currentPrompt: 'ROUND 1 OUTPUT',
      currentCandidateId: 'candidate-r1',
      optimization: {
        optimizedPrompt: 'ROUND 2 OUTPUT',
        strategy: 'rebuild',
        scoreBefore: 94,
        majorChanges: ['Tightened the handoff contract.'],
        mve: 'Run one dry check.',
        deadEndSignals: [],
      },
        review: {
          score: 96,
          hasMaterialIssues: false,
          dimensionScores: {
            d1: 15,
            d2: 9,
          },
          rubricDimensionsSnapshot: [
            { id: 'd1', label: '目标清晰度', max: 15 },
            { id: 'd2', label: '输入约束完整度', max: 10 },
          ],
          summary: 'Round 2 review',
          driftLabels: [],
          driftExplanation: '',
        findings: ['Need one more pass for stability.'],
        suggestedChanges: ['Keep structure, refine detail density.'],
      },
      aggregatedIssues: ['Need one more pass for stability.', 'Keep structure, refine detail density.'],
      appliedSteeringItems: [],
      outcome: 'settled',
      passStreakAfter: 1,
    })

    assert.ok(committedRound)

    const detail = getJobDetail(job.id) as ({
      roundRuns?: Array<{
        roundNumber: number
        inputPrompt: string
        displayScore: number | null
        dimensionScores?: Record<string, number> | null
        outputJudged: boolean
        outputCandidate?: { optimizedPrompt: string; averageScore: number } | null
        rubricDimensionsSnapshot?: Array<{ id: string; label: string; max: number }> | null
      }>
    } | null)

    assert.equal(detail?.roundRuns?.length, 1)
    assert.equal(detail?.roundRuns?.[0]?.roundNumber, 2)
    assert.equal(detail?.roundRuns?.[0]?.inputPrompt, 'ROUND 1 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.displayScore, 96)
    assert.deepEqual(detail?.roundRuns?.[0]?.dimensionScores, {
      d1: 15,
      d2: 9,
    })
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.optimizedPrompt, 'ROUND 2 OUTPUT')
    assert.equal(detail?.roundRuns?.[0]?.outputCandidate?.averageScore, 0)
    assert.equal(detail?.roundRuns?.[0]?.outputJudged, false)
    assert.deepEqual(detail?.roundRuns?.[0]?.rubricDimensionsSnapshot, [
      { id: 'd1', label: '目标清晰度', max: 15 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
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

test('job detail keeps rubric dimension snapshots on candidate judge results', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const originalFetch = global.fetch
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-candidate-judge-snapshot-'))
  process.env.PROMPT_OPTIMIZER_DB_PATH = path.join(tempDir, 'test.db')
  process.chdir(tempDir)

  try {
    const { resetDbForTests } = await import('../src/lib/server/db')
    resetDbForTests()
    const { saveSettings } = await import('../src/lib/server/settings')
    const { createJobs, createCandidateWithJudges, getJobDetail } = await import('../src/lib/server/jobs')

    saveSettings({
      cpamcBaseUrl: 'http://localhost:8317/v1',
      cpamcApiKey: 'secret',
      defaultOptimizerModel: 'gpt-5.2',
      defaultJudgeModel: 'gpt-5.2',
    })

    global.fetch = stubGoalAnchorFetch()

    const [job] = await createJobs([
      { title: 'Candidate judge snapshot job', rawPrompt: 'INITIAL PROMPT', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    createCandidateWithJudges(job.id, {
      roundNumber: 1,
      optimizedPrompt: 'ROUND 1 OUTPUT',
      strategy: 'rebuild',
      scoreBefore: 88,
      averageScore: 92,
      majorChanges: ['补全输出结构。'],
      mve: 'Run one dry check.',
      deadEndSignals: [],
      aggregatedIssues: [],
      appliedSteeringItems: [],
      judgments: [
        {
          id: 'judge-1',
          jobId: job.id,
          candidateId: '',
          judgeIndex: 0,
          score: 92,
          hasMaterialIssues: false,
          dimensionScores: {
            d1: 14,
            d2: 9,
          },
          dimensionReasons: [],
          rubricDimensionsSnapshot: [
            { id: 'd1', label: '目标清晰度', max: 15 },
            { id: 'd2', label: '输入约束完整度', max: 10 },
          ],
          summary: '结构已经成型。',
          driftLabels: [],
          driftExplanation: '',
          findings: [],
          suggestedChanges: [],
          createdAt: '2026-03-20T00:00:00.000Z',
        },
      ],
    })

    const detail = getJobDetail(job.id)
    assert.deepEqual(detail?.candidates[0]?.judges[0]?.rubricDimensionsSnapshot, [
      { id: 'd1', label: '目标清晰度', max: 15 },
      { id: 'd2', label: '输入约束完整度', max: 10 },
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
