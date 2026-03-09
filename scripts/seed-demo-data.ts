import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resetDbForTests, getDb } from '../src/lib/server/db'
import { serializeGoalAnchor } from '../src/lib/server/goal-anchor'
import { serializeGoalAnchorExplanation } from '../src/lib/server/goal-anchor-explanation'
import { ensurePromptPackVersion } from '../src/lib/server/prompt-pack'
import { saveSettings } from '../src/lib/server/settings'
import type { JobDetail } from '../src/lib/server/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const defaultDbPath = path.join(repoRoot, 'data', 'readme-demo.db')
const manifestPath = path.join(repoRoot, 'docs', 'screenshots', 'demo-manifest.json')
const fixturePath = path.join(repoRoot, 'scripts', 'demo-fixtures', 'real-live-script-job.json')

const targetDbPath = path.resolve(process.env.PROMPT_OPTIMIZER_DB_PATH?.trim() || defaultDbPath)
process.env.PROMPT_OPTIMIZER_DB_PATH = targetDbPath
process.chdir(repoRoot)

for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${targetDbPath}${suffix}`, { force: true })
}

resetDbForTests()

function main() {
  const detail = loadFixture()
  const pack = ensurePromptPackVersion()

  saveSettings({
    cpamcBaseUrl: '',
    cpamcApiKey: '',
    defaultOptimizerModel: '',
    defaultJudgeModel: '',
    scoreThreshold: 95,
    judgePassCount: 3,
    maxRounds: 8,
    noImprovementLimit: 2,
    workerConcurrency: 1,
    conversationPolicy: 'stateless',
  })

  insertJobDetail(detail, pack.id)
  writeManifest(detail.job.id)

  console.log(`Demo database ready: ${targetDbPath}`)
  console.log(`Seeded job: ${detail.job.title} (${detail.job.id})`)
  console.log(`Fixture source: ${path.relative(repoRoot, fixturePath)}`)
  console.log(`Manifest written: ${manifestPath}`)
}

function loadFixture() {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Demo fixture not found: ${fixturePath}`)
  }

  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as JobDetail
}

function insertJobDetail(detail: JobDetail, packVersionId: string) {
  const db = getDb()
  const { job } = detail
  const candidates = [...detail.candidates].sort((left, right) => left.roundNumber - right.roundNumber)

  db.prepare(`
    INSERT INTO jobs (
      id,
      title,
      raw_prompt,
      optimizer_model,
      judge_model,
      pending_optimizer_model,
      pending_judge_model,
      status,
      run_mode,
      pack_version_id,
      current_round,
      best_average_score,
      goal_anchor_json,
      goal_anchor_explanation_json,
      max_rounds_override,
      next_round_instruction,
      next_round_instruction_updated_at,
      pending_steering_json,
      pass_streak,
      last_review_score,
      last_review_patch_json,
      final_candidate_id,
      conversation_policy,
      conversation_group_id,
      cancel_requested_at,
      pause_requested_at,
      error_message,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.title,
    job.rawPrompt,
    job.optimizerModel,
    job.judgeModel,
    job.pendingOptimizerModel,
    job.pendingJudgeModel,
    job.status,
    job.runMode,
    packVersionId,
    job.currentRound,
    job.bestAverageScore,
    serializeGoalAnchor(job.goalAnchor),
    serializeGoalAnchorExplanation(job.goalAnchorExplanation),
    job.maxRoundsOverride,
    JSON.stringify(job.pendingSteeringItems ?? []),
    job.passStreak,
    job.lastReviewScore,
    JSON.stringify(job.lastReviewPatch ?? []),
    job.finalCandidateId,
    job.conversationPolicy,
    job.conversationGroupId,
    job.cancelRequestedAt,
    job.pauseRequestedAt,
    job.errorMessage,
    job.createdAt,
    job.updatedAt,
  )

  const insertCandidate = db.prepare(`
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
  `)

  const insertJudge = db.prepare(`
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
  `)

  for (const candidate of candidates) {
    insertCandidate.run(
      candidate.id,
      job.id,
      candidate.roundNumber,
      candidate.optimizedPrompt,
      candidate.strategy,
      candidate.scoreBefore,
      candidate.averageScore,
      JSON.stringify(candidate.majorChanges ?? []),
      candidate.mve,
      JSON.stringify(candidate.deadEndSignals ?? []),
      JSON.stringify(candidate.aggregatedIssues ?? []),
      JSON.stringify(candidate.appliedSteeringItems ?? []),
      candidate.createdAt,
    )

    const judges = [...candidate.judges].sort((left, right) => left.judgeIndex - right.judgeIndex)
    for (const judge of judges) {
      insertJudge.run(
        judge.id,
        job.id,
        candidate.id,
        judge.judgeIndex,
        judge.score,
        judge.hasMaterialIssues ? 1 : 0,
        judge.summary,
        JSON.stringify(judge.driftLabels ?? []),
        judge.driftExplanation ?? '',
        JSON.stringify(judge.findings ?? []),
        JSON.stringify(judge.suggestedChanges ?? []),
        judge.createdAt,
      )
    }
  }
}

function writeManifest(jobId: string) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    fixture: path.relative(repoRoot, fixturePath),
    jobCount: 1,
    dashboardFeaturedJobId: jobId,
    detailScreenshotJobId: jobId,
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  resetDbForTests()
}
