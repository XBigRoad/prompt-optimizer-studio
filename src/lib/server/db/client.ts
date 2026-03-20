import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { DEFAULT_SETTINGS, resolveDatabasePath } from '@/lib/server/constants'
import { DATABASE_SCHEMA_SQL } from '@/lib/server/db/schema'

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
  db.exec(DATABASE_SCHEMA_SQL)

  ensureColumn(db, 'settings', 'api_protocol', "TEXT NOT NULL DEFAULT 'auto'")
  ensureColumn(db, 'settings', 'default_optimizer_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'settings', 'default_judge_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'settings', 'default_optimizer_reasoning_effort', "TEXT NOT NULL DEFAULT 'default'")
  ensureColumn(db, 'settings', 'default_judge_reasoning_effort', "TEXT NOT NULL DEFAULT 'default'")
  ensureColumn(db, 'jobs', 'optimizer_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'judge_model', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'optimizer_reasoning_effort', "TEXT NOT NULL DEFAULT 'default'")
  ensureColumn(db, 'jobs', 'judge_reasoning_effort', "TEXT NOT NULL DEFAULT 'default'")
  ensureColumn(db, 'jobs', 'pending_optimizer_model', 'TEXT')
  ensureColumn(db, 'jobs', 'pending_judge_model', 'TEXT')
  ensureColumn(db, 'jobs', 'pending_optimizer_reasoning_effort', 'TEXT')
  ensureColumn(db, 'jobs', 'pending_judge_reasoning_effort', 'TEXT')
  ensureColumn(db, 'jobs', 'run_mode', "TEXT NOT NULL DEFAULT 'auto'")
  ensureColumn(db, 'jobs', 'goal_anchor_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, 'jobs', 'goal_anchor_explanation_json', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, 'jobs', 'max_rounds_override', 'INTEGER')
  ensureColumn(db, 'jobs', 'next_round_instruction', 'TEXT')
  ensureColumn(db, 'jobs', 'next_round_instruction_updated_at', 'TEXT')
  ensureColumn(db, 'jobs', 'pending_steering_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'jobs', 'active_worker_id', 'TEXT')
  ensureColumn(db, 'jobs', 'worker_heartbeat_at', 'TEXT')
  ensureColumn(db, 'jobs', 'cancel_requested_at', 'TEXT')
  ensureColumn(db, 'jobs', 'pause_requested_at', 'TEXT')
  ensureColumn(db, 'jobs', 'pass_streak', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'jobs', 'last_review_score', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'jobs', 'last_review_patch_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'candidates', 'applied_steering_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'judge_runs', 'drift_labels_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'judge_runs', 'drift_explanation', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'settings', 'custom_rubric_md', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'jobs', 'custom_rubric_md', 'TEXT')
  const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get() as { id?: number } | undefined
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO settings (
        id,
        cpamc_base_url,
        cpamc_api_key,
        api_protocol,
        default_optimizer_model,
        default_judge_model,
        default_optimizer_reasoning_effort,
        default_judge_reasoning_effort,
        score_threshold,
        judge_pass_count,
        max_rounds,
        no_improvement_limit,
        worker_concurrency,
        conversation_policy,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      DEFAULT_SETTINGS.cpamcBaseUrl,
      DEFAULT_SETTINGS.cpamcApiKey,
      DEFAULT_SETTINGS.apiProtocol,
      DEFAULT_SETTINGS.defaultOptimizerModel,
      DEFAULT_SETTINGS.defaultJudgeModel,
      DEFAULT_SETTINGS.defaultOptimizerReasoningEffort,
      DEFAULT_SETTINGS.defaultJudgeReasoningEffort,
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
