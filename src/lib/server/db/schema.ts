export const DATABASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cpamc_base_url TEXT NOT NULL DEFAULT '',
    cpamc_api_key TEXT NOT NULL DEFAULT '',
    api_protocol TEXT NOT NULL DEFAULT 'auto',
    default_optimizer_model TEXT NOT NULL DEFAULT '',
    default_judge_model TEXT NOT NULL DEFAULT '',
    default_optimizer_reasoning_effort TEXT NOT NULL DEFAULT 'default',
    default_judge_reasoning_effort TEXT NOT NULL DEFAULT 'default',
    score_threshold INTEGER NOT NULL DEFAULT 95,
    judge_pass_count INTEGER NOT NULL DEFAULT 3,
    max_rounds INTEGER NOT NULL DEFAULT 8,
    no_improvement_limit INTEGER NOT NULL DEFAULT 2,
    worker_concurrency INTEGER NOT NULL DEFAULT 2,
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
    optimizer_reasoning_effort TEXT NOT NULL DEFAULT 'default',
    judge_reasoning_effort TEXT NOT NULL DEFAULT 'default',
    pending_optimizer_model TEXT,
    pending_judge_model TEXT,
    pending_optimizer_reasoning_effort TEXT,
    pending_judge_reasoning_effort TEXT,
    status TEXT NOT NULL,
    run_mode TEXT NOT NULL DEFAULT 'auto',
    pack_version_id TEXT NOT NULL,
    current_round INTEGER NOT NULL DEFAULT 0,
    best_average_score REAL NOT NULL DEFAULT 0,
    goal_anchor_json TEXT NOT NULL DEFAULT '{}',
    goal_anchor_explanation_json TEXT NOT NULL DEFAULT '{}',
    max_rounds_override INTEGER,
    next_round_instruction TEXT,
    next_round_instruction_updated_at TEXT,
    pending_steering_json TEXT NOT NULL DEFAULT '[]',
    pass_streak INTEGER NOT NULL DEFAULT 0,
    last_review_score REAL NOT NULL DEFAULT 0,
    last_review_patch_json TEXT NOT NULL DEFAULT '[]',
    final_candidate_id TEXT,
    conversation_policy TEXT NOT NULL,
    conversation_group_id TEXT,
    active_worker_id TEXT,
    worker_heartbeat_at TEXT,
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
    applied_steering_json TEXT NOT NULL DEFAULT '[]',
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
    drift_labels_json TEXT NOT NULL DEFAULT '[]',
    drift_explanation TEXT NOT NULL DEFAULT '',
    findings_json TEXT NOT NULL,
    suggested_changes_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_candidates_job_round ON candidates(job_id, round_number);
  CREATE INDEX IF NOT EXISTS idx_judge_runs_candidate_idx ON judge_runs(candidate_id, judge_index);
`
