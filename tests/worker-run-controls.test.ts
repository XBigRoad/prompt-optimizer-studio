import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  applyAutomaticReviewSuggestionAdoption,
  applyRepeatedNoOutputGuard,
  buildOptimizerReviewFeedback,
  nextCrediblePassStreak,
  reviewPassesCredibly,
  resolvePassTrackingAfterRound,
  resolveCandidateScoreBefore,
  resolveRoundCommitState,
  resolveRoundOutcome,
  resolvePartialFailureStatus,
  resolvePostFailureStatus,
  resolvePostReviewStatus,
  shouldCompleteAfterCredibleReview,
} from '../src/lib/server/worker'

test('step mode pauses after exactly one completed round', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 4,
    maxRounds: 8,
    runMode: 'step',
    pauseRequestedAt: null,
  }), 'paused')
})

test('cooperative pause wins after the current round finishes', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 4,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: '2026-03-08T10:00:00.000Z',
  }), 'paused')
})

test('auto mode falls back to manual review once the effective max round is reached', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: false,
    roundNumber: 8,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
  }), 'manual_review')
})

test('completion still wins over step or pause controls', () => {
  assert.equal(resolvePostReviewStatus({
    shouldComplete: true,
    roundNumber: 8,
    maxRounds: 8,
    runMode: 'step',
    pauseRequestedAt: '2026-03-08T10:00:00.000Z',
  }), 'completed')
})

test('step mode soft-lands infra failures with usable results back to paused', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'step',
    hasUsableResult: true,
    error: Object.assign(new Error('模型请求失败 (504): rawchat.cn | 504: Gateway time-out'), { status: 504, retriable: true }),
  }), 'paused')
})

test('auto mode soft-lands infra failures with usable results back into pending', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'auto',
    hasUsableResult: true,
    error: new Error('fetch failed: ETIMEDOUT'),
  }), 'pending')
})

test('hard failures remain failed when there is no usable result or the error is not infra', () => {
  assert.equal(resolvePostFailureStatus({
    runMode: 'step',
    hasUsableResult: false,
    error: Object.assign(new Error('模型请求失败 (504): Gateway time-out'), { status: 504, retriable: true }),
  }), 'failed')

  assert.equal(resolvePostFailureStatus({
    runMode: 'auto',
    hasUsableResult: true,
    error: new Error('候选稿分数字段无效：scoreBefore'),
  }), 'failed')
})

test('worker prefers judge score over optimizer self-score when recording candidate scoreBefore', () => {
  assert.equal(resolveCandidateScoreBefore({ score: 93 }, 61), 93)
  assert.equal(resolveCandidateScoreBefore(null, 61), 61)
  assert.equal(resolveCandidateScoreBefore(null, null), 0)
})

test('auto mode requeues partial optimizer infra failures when a usable candidate already exists', () => {
  assert.equal(resolvePartialFailureStatus({
    runMode: 'auto',
    hasOutputCandidate: false,
    hasUsableResult: true,
    optimizationError: new Error('模型请求失败：request timeout after 60000ms'),
    reviewError: null,
  }), 'pending')
})

test('auto mode requeues judge-side infra failures when optimizer already produced a candidate', () => {
  assert.equal(resolvePartialFailureStatus({
    runMode: 'auto',
    hasOutputCandidate: true,
    hasUsableResult: true,
    optimizationError: null,
    reviewError: new Error('模型请求失败：request timeout after 60000ms'),
  }), 'pending')
})

test('partial non-infra failures still remain failed even if a previous candidate exists', () => {
  assert.equal(resolvePartialFailureStatus({
    runMode: 'auto',
    hasOutputCandidate: false,
    hasUsableResult: true,
    optimizationError: new Error('候选稿分数字段无效：scoreBefore'),
    reviewError: null,
  }), 'failed')
})

test('rounds with both optimizer output and judge review remain settled', () => {
  assert.equal(resolveRoundOutcome({
    optimization: {
      optimizedPrompt: 'candidate-v2',
      strategy: 'preserve',
      scoreBefore: 97,
      majorChanges: [],
      mve: 'Run one dry check.',
      deadEndSignals: [],
    },
    review: {
      id: 'judge-1',
      jobId: 'job-1',
      candidateId: 'candidate-1',
      judgeIndex: 0,
      score: 97,
      hasMaterialIssues: false,
      summary: 'passed',
      driftLabels: [],
      driftExplanation: '',
      findings: [],
      suggestedChanges: [],
      createdAt: '2026-03-27T00:00:00.000Z',
    },
    optimizationError: null,
    reviewError: null,
  }), 'settled')
})

test('high-scoring raw prompts can soft-land without an optimizer candidate', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: true,
    outputCandidateId: null,
    currentCandidateId: null,
    finalCandidateId: null,
    roundNumber: 1,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: 98,
    reviewHasMaterialIssues: false,
    optimizationError: new Error('模型请求失败：request timeout after 239999ms'),
    reviewError: null,
  })

  assert.equal(commit.status, 'pending')
  assert.equal(commit.finalCandidateId, null)
})

test('non-completed rounds do not mark an output candidate as final just because one exists', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: true,
    outputCandidateId: 'candidate-2',
    currentCandidateId: 'candidate-1',
    finalCandidateId: null,
    roundNumber: 2,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: 93,
    reviewHasMaterialIssues: false,
    optimizationError: null,
    reviewError: null,
  })

  assert.equal(commit.status, 'running')
  assert.equal(commit.finalCandidateId, null)
})

test('partial failures keep the new candidate available without prematurely marking it as final', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: false,
    outputCandidateId: 'candidate-3',
    currentCandidateId: 'candidate-2',
    finalCandidateId: null,
    roundNumber: 3,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: null,
    reviewHasMaterialIssues: null,
    optimizationError: null,
    reviewError: new Error('模型请求失败：request timeout after 60000ms'),
  })

  assert.equal(commit.status, 'pending')
  assert.equal(commit.finalCandidateId, null)
})

test('clean no-output rounds stay resumable instead of failing immediately', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: true,
    outputCandidateId: null,
    currentCandidateId: null,
    finalCandidateId: null,
    roundNumber: 1,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: 85,
    reviewHasMaterialIssues: true,
    optimizationError: null,
    reviewError: null,
  })

  assert.equal(commit.status, 'pending')
  assert.equal(commit.errorMessage, null)
})

test('buildOptimizerReviewFeedback keeps concrete gaps but drops praise-only findings', () => {
  const items = buildOptimizerReviewFeedback({
    findings: [
      '候选提示词与目标锚点高度一致。',
      '高分复核未通过：关键结构前提仍未全部满足。',
      '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
      '缺少预算不足时怎么收缩菜单的规则。',
    ],
    suggestedChanges: [
      '补上预算不足时的回退方案。',
      'Decision Threshold: >= 85',
    ],
    dimensionReasons: [
      '输入约束完整度：没有给出明确边界条件。',
      '鲁棒性仍低于 95+ 门槛。',
    ],
  })

  assert.deepEqual(items, [
    '输入约束完整度：没有给出明确边界条件。',
    '鲁棒性仍需补强。',
    '输出契约与鲁棒性仍需补强。',
    '缺少预算不足时怎么收缩菜单的规则。',
    '补上预算不足时的回退方案。',
  ])
})

test('buildOptimizerReviewFeedback strips threshold-bound gatekeeper wording but keeps actionable gaps', () => {
  const items = buildOptimizerReviewFeedback({
    findings: [
      '高分复核未通过：关键结构前提仍未全部满足。',
      '输入约束完整度仍低于 95+ 门槛。',
      '这版仍挡在 95+ 外，输出契约与鲁棒性都还没过门槛。',
    ],
    suggestedChanges: [
      'Decision Threshold',
      '补上预算冲突 fallback。',
    ],
    dimensionReasons: [
      '鲁棒性 当前为 8/10，未达到 95+ 所需的 9/10。',
    ],
  })

  assert.deepEqual(items, [
    '鲁棒性 当前为 8/10，仍需补强。',
    '输入约束完整度仍需补强。',
    '输出契约与鲁棒性都还没过门槛。',
    '补上预算冲突 fallback。',
  ])
})

test('buildOptimizerReviewFeedback strips threshold boilerplate but keeps actionable gaps', () => {
  const items = buildOptimizerReviewFeedback({
    findings: [
      '这版已经进入高分次高档，但输出契约与鲁棒性还挡着 95+。',
      '高分复核未通过：关键结构前提仍未全部满足。',
      '缺少预算不足时怎么收缩菜单的规则。',
    ],
    suggestedChanges: [
      '补上预算不足时的回退方案。',
      'Decision Threshold: only minor tuning remains.',
    ],
    dimensionReasons: [
      '输入约束完整度 当前为 8/10，未达到 95+ 所需的 9/10。',
      '输出契约明确度：可判定格式还不够硬。',
    ],
  })

  assert.deepEqual(items, [
    '输入约束完整度 当前为 8/10，仍需补强。',
    '输出契约明确度：可判定格式还不够硬。',
    '输出契约与鲁棒性仍需补强。',
    '缺少预算不足时怎么收缩菜单的规则。',
    '补上预算不足时的回退方案。',
  ])
})

test('strict no-output failures stop auto mode at manual review instead of quietly requeueing', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: true,
    outputCandidateId: null,
    currentCandidateId: 'candidate-1',
    finalCandidateId: null,
    roundNumber: 2,
    maxRounds: 8,
    runMode: 'auto',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: 94,
    reviewHasMaterialIssues: true,
    optimizationError: null,
    reviewError: null,
    strictNoOutputFailureMessage: '仍有未解决缺口却未产出新稿。',
  })

  assert.equal(commit.status, 'manual_review')
  assert.equal(commit.finalCandidateId, null)
  assert.match(commit.errorMessage ?? '', /仍有未解决缺口却未产出新稿/)
})

test('automatic review suggestion adoption writes filtered suggestions into stable rules', async () => {
  const originalCwd = process.cwd()
  const originalDbPath = process.env.PROMPT_OPTIMIZER_DB_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-worker-auto-adopt-'))
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

    const [job] = await createJobs([
      { title: 'Worker auto adoption job', rawPrompt: 'Prompt', optimizerModel: 'gpt-5.2', judgeModel: 'gpt-5.2' },
    ])

    const result = applyAutomaticReviewSuggestionAdoption({
      jobId: job.id,
      enabled: true,
      toStableRules: true,
      suggestedChanges: [
        '补预算冲突 fallback。',
        'Decision Threshold: >= 90',
        '  补预算冲突 fallback。  ',
        '',
      ],
    })

    const updatedJob = getJobById(job.id)
    assert.deepEqual(result?.addedTexts, ['补预算冲突 fallback。'])
    assert.deepEqual(result?.skippedDuplicateTexts, [])
    assert.equal(updatedJob?.goalAnchor.driftGuard.includes('补预算冲突 fallback。'), true)
  } finally {
    process.chdir(originalCwd)
    if (originalDbPath === undefined) {
      delete process.env.PROMPT_OPTIMIZER_DB_PATH
    } else {
      process.env.PROMPT_OPTIMIZER_DB_PATH = originalDbPath
    }
  }
})

test('strict no-output failures pause step mode instead of pretending the round settled cleanly', () => {
  const commit = resolveRoundCommitState({
    shouldComplete: false,
    hasReview: true,
    outputCandidateId: null,
    currentCandidateId: 'candidate-1',
    finalCandidateId: null,
    roundNumber: 2,
    maxRounds: 8,
    runMode: 'step',
    pauseRequestedAt: null,
    threshold: 95,
    reviewScore: 94,
    reviewHasMaterialIssues: true,
    optimizationError: null,
    reviewError: null,
    strictNoOutputFailureMessage: '仍有未解决缺口却未产出新稿。',
  })

  assert.equal(commit.status, 'paused')
  assert.equal(commit.finalCandidateId, null)
  assert.match(commit.errorMessage ?? '', /仍有未解决缺口却未产出新稿/)
})

test('repeated no-output optimizer failures stop auto reruns after the configured limit', () => {
  const guarded = applyRepeatedNoOutputGuard({
    status: 'pending',
    finalCandidateId: null,
    errorMessage: '模型请求失败：request timeout after 180000ms',
  }, {
    runMode: 'auto',
    noImprovementLimit: 2,
    stalledOptimizerRounds: 2,
    noProgressRounds: 2,
    hasOutputCandidate: false,
    optimizationError: new Error('模型请求失败：request timeout after 180000ms'),
  })

  assert.equal(guarded.status, 'manual_review')
  assert.equal(guarded.finalCandidateId, null)
  assert.match(guarded.errorMessage ?? '', /连续 2 轮未生成新版本/)
})

test('repeated no-output guard stays inactive when a new candidate was produced or the limit is not reached', () => {
  const withOutput = applyRepeatedNoOutputGuard({
    status: 'pending',
    finalCandidateId: null,
    errorMessage: null,
  }, {
    runMode: 'auto',
    noImprovementLimit: 2,
    stalledOptimizerRounds: 3,
    noProgressRounds: 3,
    hasOutputCandidate: true,
    optimizationError: new Error('timeout'),
  })

  const belowLimit = applyRepeatedNoOutputGuard({
    status: 'pending',
    finalCandidateId: null,
    errorMessage: null,
  }, {
    runMode: 'auto',
    noImprovementLimit: 3,
    stalledOptimizerRounds: 2,
    noProgressRounds: 2,
    hasOutputCandidate: false,
    optimizationError: new Error('timeout'),
  })

  assert.equal(withOutput.status, 'pending')
  assert.equal(belowLimit.status, 'pending')
})

test('repeated no-output guard also stops clean no-progress loops when the optimizer keeps returning equivalent prompts', () => {
  const guarded = applyRepeatedNoOutputGuard({
    status: 'pending',
    finalCandidateId: null,
    errorMessage: null,
  }, {
    runMode: 'auto',
    noImprovementLimit: 2,
    stalledOptimizerRounds: 0,
    noProgressRounds: 2,
    hasOutputCandidate: false,
    optimizationError: null,
  })

  assert.equal(guarded.status, 'manual_review')
  assert.match(guarded.errorMessage ?? '', /等价版本|未生成新版本/)
})

test('repeated no-output guard stays inactive while a reviewed candidate is building a credible pass streak toward completion', () => {
  const guarded = applyRepeatedNoOutputGuard({
    status: 'pending',
    finalCandidateId: null,
    errorMessage: null,
  }, {
    runMode: 'auto',
    noImprovementLimit: 2,
    stalledOptimizerRounds: 0,
    noProgressRounds: 2,
    hasOutputCandidate: false,
    optimizationError: null,
    currentCandidateId: 'candidate-1',
    passStreakAfter: 2,
    requiredPassCount: 3,
  })

  assert.equal(guarded.status, 'pending')
  assert.equal(guarded.errorMessage, null)
})

test('raw prompts cannot auto-complete until there is a reviewed candidate artifact', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: '',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '当前版本已经很强，但还需要继续确认真实终稿。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 2,
    passStreakCandidateId: null,
    currentCandidateId: null,
    outputCandidateId: null,
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), false)
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 2,
    passStreakCandidateId: 'candidate-3',
    currentCandidateId: null,
    outputCandidateId: null,
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), false)
})

test('fallback异语言诊断不能算作可信高分通过', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '本轮诊断已完成，但模型返回了异语言摘要。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(reviewPassesCredibly(review, 95), false)
  assert.equal(nextCrediblePassStreak({
    currentPassStreak: 2,
    review,
    threshold: 95,
    optimizationError: null,
  }), 0)
})

test('缺失摘要 fallback 不能算作可信高分通过', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '本轮诊断已完成，但评分器没有写出有效摘要；这轮结果不计入可信通过。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(reviewPassesCredibly(review, 95), false)
})

test('optimizer失败轮次不能继续累计可信通过', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '这轮提示词目标保持稳定，但仍建议继续优化。',
    driftLabels: [],
    driftExplanation: '',
    findings: ['保持当前目标，但还可以继续收紧规则。'],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(reviewPassesCredibly(review, 95), true)
  assert.equal(nextCrediblePassStreak({
    currentPassStreak: 1,
    review,
    threshold: 95,
    optimizationError: new Error('模型请求失败：request timeout after 239999ms'),
  }), 0)
  assert.equal(nextCrediblePassStreak({
    currentPassStreak: 1,
    review,
    threshold: 95,
    optimizationError: null,
  }), 2)
})

test('a newer optimizer candidate resets the credible streak onto the new candidate instead of inheriting the old one', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '这一轮复核通过，但同时又生成了下一版候选稿。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.deepEqual(resolvePassTrackingAfterRound({
    currentPassStreak: 1,
    currentPassStreakCandidateId: 'candidate-1',
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: 'candidate-1',
    outputCandidateId: 'candidate-2',
  }), {
    passStreak: 0,
    passStreakCandidateId: 'candidate-2',
  })

  assert.deepEqual(resolvePassTrackingAfterRound({
    currentPassStreak: 1,
    currentPassStreakCandidateId: 'candidate-1',
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: 'candidate-1',
    outputCandidateId: null,
  }), {
    passStreak: 2,
    passStreakCandidateId: 'candidate-1',
  })

  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 0,
    passStreakCandidateId: 'candidate-2',
    currentCandidateId: 'candidate-1',
    outputCandidateId: 'candidate-2',
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), false)
})

test('reviewed candidates finish only after the same candidate earns three consecutive credible reviews', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-2',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '候选提示词高度一致，但还需要继续确认终稿稳定性。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  const firstPass = resolvePassTrackingAfterRound({
    currentPassStreak: 0,
    currentPassStreakCandidateId: 'candidate-2',
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: 'candidate-2',
    outputCandidateId: null,
  })

  const secondPass = resolvePassTrackingAfterRound({
    currentPassStreak: firstPass.passStreak,
    currentPassStreakCandidateId: firstPass.passStreakCandidateId,
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: 'candidate-2',
    outputCandidateId: null,
  })

  const thirdPass = resolvePassTrackingAfterRound({
    currentPassStreak: secondPass.passStreak,
    currentPassStreakCandidateId: secondPass.passStreakCandidateId,
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: 'candidate-2',
    outputCandidateId: null,
  })

  assert.deepEqual(firstPass, {
    passStreak: 1,
    passStreakCandidateId: 'candidate-2',
  })
  assert.deepEqual(secondPass, {
    passStreak: 2,
    passStreakCandidateId: 'candidate-2',
  })
  assert.deepEqual(thirdPass, {
    passStreak: 3,
    passStreakCandidateId: 'candidate-2',
  })
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: secondPass.passStreak,
    passStreakCandidateId: secondPass.passStreakCandidateId,
    currentCandidateId: 'candidate-2',
    outputCandidateId: null,
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), false)
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: thirdPass.passStreak,
    passStreakCandidateId: thirdPass.passStreakCandidateId,
    currentCandidateId: 'candidate-2',
    outputCandidateId: null,
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), true)
})

test('raw prompt high scores do not build a credible pass streak before any candidate exists', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: '',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '当前版本整体稳定，但还没有形成可复核的候选稿。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.deepEqual(resolvePassTrackingAfterRound({
    currentPassStreak: 0,
    currentPassStreakCandidateId: null,
    review,
    threshold: 95,
    optimizationError: null,
    currentCandidateId: null,
    outputCandidateId: null,
  }), {
    passStreak: 0,
    passStreakCandidateId: null,
  })
})

test('optimizer errors still block credible streak accumulation even when the reviewed candidate stays the same', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '候选提示词已经高度稳定，可以进入连续复核。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.deepEqual(resolvePassTrackingAfterRound({
    currentPassStreak: 2,
    currentPassStreakCandidateId: 'candidate-1',
    review,
    threshold: 95,
    optimizationError: new Error('timeout'),
    currentCandidateId: 'candidate-1',
    outputCandidateId: null,
  }), {
    passStreak: 0,
    passStreakCandidateId: 'candidate-1',
  })
})

test('存在 drift labels 的高分复核不能算作可信通过', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-1',
    judgeIndex: 0,
    score: 98,
    hasMaterialIssues: false,
    summary: '结构完整，但仍丢了关键约束。',
    driftLabels: ['constraint_loss'],
    driftExplanation: '预算约束在重写后被丢掉了。',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(reviewPassesCredibly(review, 95), false)
  assert.equal(nextCrediblePassStreak({
    currentPassStreak: 2,
    review,
    threshold: 95,
    optimizationError: null,
  }), 0)
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 2,
    passStreakCandidateId: 'candidate-3',
    currentCandidateId: 'candidate-3',
    outputCandidateId: null,
    review,
    threshold: 95,
    requiredPassCount: 3,
  }), false)
})

test('credible review completion honors the configured score threshold', () => {
  const review = {
    id: 'judge-1',
    jobId: 'job-1',
    candidateId: 'candidate-7',
    judgeIndex: 0,
    score: 88,
    hasMaterialIssues: false,
    summary: '当前候选稿足够完整，可以按照设定阈值判断是否通过。',
    driftLabels: [],
    driftExplanation: '',
    findings: [],
    suggestedChanges: [],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  assert.equal(reviewPassesCredibly(review, 80), true)
  assert.equal(reviewPassesCredibly(review, 99), false)
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 3,
    passStreakCandidateId: 'candidate-7',
    currentCandidateId: 'candidate-7',
    outputCandidateId: null,
    review,
    threshold: 80,
    requiredPassCount: 3,
  }), true)
  assert.equal(shouldCompleteAfterCredibleReview({
    passStreakAfter: 3,
    passStreakCandidateId: 'candidate-7',
    currentCandidateId: 'candidate-7',
    outputCandidateId: null,
    review,
    threshold: 99,
    requiredPassCount: 3,
  }), false)
})
