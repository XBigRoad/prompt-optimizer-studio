import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { DEFAULT_SETTINGS, resolveDatabasePath } from '@/lib/server/constants'

let database: DatabaseSync | null = null

export function getDb() {
  if (database) {
    return database
  }

  const databasePath = resolveDatabasePath()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cpamc_base_url TEXT NOT NULL DEFAULT '',
      cpamc_api_key TEXT NOT NULL DEFAULT '',
      default_optimizer_model TEXT NOT NULL DEFAULT '',
      default_judge_model TEXT NOT NULL DEFAULT '',
      score_threshold INTEGER NOT NULL DEFAULT 95,
      judge_pass_count INTEGER NOT NULL DEFAULT 3,
      max_rounds INTEGER NOT NULL DEFAULT 8,
      no_improvement_limit INTEGER NOT NULL DEFAULT 2,
      worker_concurrency INTEGER NOT NULL DEFAULT 1,
      conversation_policy TEXT NOT NULL DEFAULT 'stateless',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_pack_versions (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      skill_md TEXT NOT NULL,
      rubric_md TEXT NOT NULL,
      template_md TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_groups (
      id TEXT PRIMARY KEY,
      policy TEXT NOT NULL,
      jobs_assigned INTEGER NOT NULL,
      max_jobs INTEGER NOT NULL,
      retired INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      retired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      raw_prompt TEXT NOT NULL,
      optimizer_model TEXT NOT NULL DEFAULT '',
      judge_model TEXT NOT NULL DEFAULT '',
      pending_optimizer_model TEXT,
      pending_judge_model TEXT,
      status TEXT NOT NULL,
      run_mode TEXT NOT NULL DEFAULT 'auto',
      pack_version_id TEXT NOT NULL,
      current_round INTEGER NOT NULL DEFAULT 0,
      best_average_score REAL NOT NULL DEFAULT 0,
      goal_anchor_json TEXT NOT NULL DEFAULT '{}',
      max_rounds_override INTEGER,
      next_round_instruction TEXT,
      next_round_instruction_updated_at TEXT,
      pass_streak INTEGER NOT NULL DEFAULT 0,
      last_review_score REAL NOT NULL DEFAULT 0,
      last_review_patch_json TEXT NOT NULL DEFAULT '[]',
      final_candidate_id TEXT,
      conversation_policy TEXT NOT NULL,
      conversation_group_id TEXT,
      cancel_requested_at TEXT,
      pause_requested_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (pack_version_id) REFERENCES prompt_pack_versions(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      optimized_prompt TEXT NOT NULL,
      strategy TEXT NOT NULL,
      score_before REAL NOT NULL,
      average_score REAL NOT NULL,
      major_changes_json TEXT NOT NULL,
      mve TEXT NOT NULL,
      dead_end_signals_json TEXT NOT NULL,
      aggregated_issues_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS judge_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      judge_index INTEGER NOT NULL,
      score REAL NOT NULL,
      has_material_issues INTEGER NOT NULL,
      summary TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      suggested_changes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_candidates_job_round ON candidates(job_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_judge_runs_candidate_idx ON judge_runs(candidate_id, judge_index);
  `)

  ensureColumn(db, 'settings', 'default_optimizer_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'settings', 'default_judge_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'optimizer_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'judge_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'pending_optimizer_model', 'TEXT')
  ensureColumn(db, 'jobs', 'pending_judge_model', 'TEXT')
  ensureColumn(db, 'jobs', 'run_mode', "TEXT NOT NULL DEFAULT 'auto'")
  ensureColumn(db, 'jobs', 'goal_anchor_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, 'jobs', 'max_rounds_override', 'INTEGER')
  ensureColumn(db, 'jobs', 'next_round_instruction', 'TEXT')
  ensureColumn(db, 'jobs', 'next_round_instruction_updated_at', 'TEXT')
  ensureColumn(db, 'jobs', 'cancel_requested_at', 'TEXT')
  ensureColumn(db, 'jobs', 'pause_requested_at', 'TEXT')
  ensureColumn(db, 'jobs', 'pass_streak', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'jobs', 'last_review_score', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'jobs', 'last_review_patch_json', "TEXT NOT NULL DEFAULT '[]'")

  const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get() as { id?: number } | undefined
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO settings (
        id,
        cpamc_base_url,
        cpamc_api_key,
        default_optimizer_model,
        default_judge_model,
        score_threshold,
        judge_pass_count,
        max_rounds,
        no_improvement_limit,
        worker_concurrency,
        conversation_policy,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      DEFAULT_SETTINGS.cpamcBaseUrl,
      DEFAULT_SETTINGS.cpamcApiKey,
      DEFAULT_SETTINGS.defaultOptimizerModel,
      DEFAULT_SETTINGS.defaultJudgeModel,
      DEFAULT_SETTINGS.scoreThreshold,
      DEFAULT_SETTINGS.judgePassCount,
      DEFAULT_SETTINGS.maxRounds,
      DEFAULT_SETTINGS.noImprovementLimit,
      DEFAULT_SETTINGS.workerConcurrency,
      DEFAULT_SETTINGS.conversationPolicy,
      new Date().toISOString(),
    )
  }

  migrateLegacySingleModel(db)
  database = db
  return db
}

export function resetDbForTests() {
  if (database) {
    database.close()
    database = null
  }
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>
  const exists = columns.some((column) => column.name === columnName)
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

function hasColumn(db: DatabaseSync, tableName: string, columnName: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>
  return columns.some((column) => column.name === columnName)
}

function migrateLegacySingleModel(db: DatabaseSync) {
  if (!hasColumn(db, 'settings', 'model_name')) {
    return
  }

  const row = db.prepare(`
    SELECT model_name, default_optimizer_model, default_judge_model
    FROM settings
    WHERE id = 1
  `).get() as {
    model_name?: string
    default_optimizer_model?: string
    default_judge_model?: string
  } | undefined

  const legacyModel = row?.model_name?.trim() ?? ''
  const hasNewDefaults = Boolean(row?.default_optimizer_model?.trim() || row?.default_judge_model?.trim())

  if (legacyModel && !hasNewDefaults) {
    db.prepare(`
      UPDATE settings
      SET default_optimizer_model = ?, default_judge_model = ?
      WHERE id = 1
    `).run(legacyModel, legacyModel)
  }

  const backfillModel = legacyModel || DEFAULT_SETTINGS.defaultOptimizerModel
  if (backfillModel) {
    db.prepare(`
      UPDATE jobs
      SET optimizer_model = CASE WHEN optimizer_model = '' THEN ? ELSE optimizer_model END,
          judge_model = CASE WHEN judge_model = '' THEN ? ELSE judge_model END
      WHERE optimizer_model = '' OR judge_model = ''
    `).run(backfillModel, backfillModel)
  }
}
