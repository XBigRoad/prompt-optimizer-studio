# Open Source Launch Copy

[Chinese](open-source-launch.md) | **English**

This file keeps copy-ready text for the GitHub repository page and public release materials.

## Repository Name

`prompt-optimizer-studio`

## Positioning

### GitHub About

Automated prompt optimization pipeline with human steering and copy-ready final prompts.

### Short Pitch

Prompt Optimizer Studio turns prompt refinement into an operator-friendly pipeline. Start from a draft prompt, let optimizer and reviewer iterate automatically, step in when the direction drifts, and end with a full prompt you can actually ship.

## Key Messages

- automated, multi-round, pipeline-style prompt optimization
- human steering stays inside the loop instead of outside it
- the final deliverable is the latest full prompt, not a diff log
- round history, drift checks, and stop rules stay visible
- stronger task-creation, task-detail, and runtime-parameter traceability
- multi-provider connectivity with self-hosted Docker deployment

## Release Title

`v0.1.4 - Interaction Fixes, Clearer Errors, and Runtime Fail-Soft Handling`

## Release History

### v0.1.4

Release shape:

- This release remains the **Self-Hosted / Server Edition**.
- Data stays on the machine or deployment environment running the app.
- A separate `Web Local Edition` may come later, but it is not part of this release.

Highlights:

1. **Task-creation interaction fixes**
   - Fixed an issue where the dashboard submission panel could not be expanded again after being collapsed.
   - Fixed a related issue where the page could become blocked by a hidden layer after collapsing the submission panel.
   - The primary path for creating new jobs from the dashboard is now more stable.

2. **Clearer error handling**
   - Gateway and upstream failures such as `504 Gateway Timeout`, `Bad Gateway`, `Cloudflare`, and `upstream` are now recognized more consistently.
   - These cases are now presented as retryable infrastructure failures instead of exposing raw upstream error pages directly to users.
   - It is easier to tell when to retry immediately versus checking the provider, gateway, or network path.

3. **More stable multi-round execution**
   - When a job already has a usable result, later infrastructure failures now preserve more of the current result and execution progress.
   - `step` mode now soft-lands into `paused`.
   - `auto` mode now soft-lands into `manual review`.
   - A later gateway failure no longer has to make the whole job appear fully lost.

4. **Regression coverage**
   - Added coverage for infrastructure error classification.
   - Added coverage for fail-soft behavior in multi-round execution.
   - Added regression coverage for collapsing and re-expanding the dashboard submission panel.

### v0.1.3

Release shape:

- This release remains the **Self-Hosted / Server Edition**.
- Data stays on the machine or deployment environment running the app.
- A separate `Web Local Edition` may come later, but it is not part of this release.

Highlights:

1. **More controllable runtime parameters**
   - Every model can now be configured with a reasoning-effort level.
   - Runtime parameters now travel more cleanly across settings, job creation, job detail, API, and database snapshots.
   - Task-level model and reasoning changes are easier to trace and audit.

2. **Improved task creation and detail experience**
   - The dashboard submission flow can carry key runtime parameters directly into new jobs.
   - The job detail summary now shows `Reasoning effort` instead of lower-value summary metadata.
   - Model selection, parameter editing, and result inspection are more consistent along the main public path.

3. **Clearer result and state visibility**
   - Missing scores, failed states, and best-score displays are presented more clearly.
   - It is easier to tell what state a job actually reached and whether comparable output exists.
   - A set of prompt-understanding and goal-anchor improvements is now aligned into the public path as well.

4. **Stability and audit-chain improvements**
   - Parameter snapshots are more complete across settings, jobs, API, UI, and DB.
   - This release also includes a batch of general fixes around task creation, detail rendering, runtime parameter sync, and runtime stability.
   - The public line stays aligned without pulling in the experiment desk or unverified skill / rubric / prompt-pack semantics.

### v0.1.2

- Added bilingual UI switching.
- Added global and per-job scoring-standard overrides.
- Expanded provider/model connectivity and protocol override support.

### v0.1.1

- Fixed the dashboard crash in environments where `crypto.randomUUID` was unavailable.
- Added a result comparison mode between the initial prompt and the current latest full prompt.
- Hardened invalid round-score handling and clarified related error messages.

### v0.1.0

- First public release.
- Automated prompt optimization pipeline with visible round-by-round progress.
- Final full prompt stays visible and copyable.
- Human steering loop with pause, next-round guidance, continue-one-round, and resume-auto controls.
- Goal-anchor drift guard and reviewer isolation.
- Docker-ready self-hosted deployment with `/api/health`.
- AGPL-3.0-only licensing for source-available hosted modifications.

## Suggested Topics

`prompt-engineering`, `prompt-optimizer`, `automation`, `prompt-pipeline`, `nextjs`, `react`, `typescript`, `sqlite`, `docker`, `openai-compatible`, `anthropic`, `gemini`, `self-hosted`, `developer-tools`, `ai-tooling`
