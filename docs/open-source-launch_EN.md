# Open Source Launch Copy

[Chinese](open-source-launch.md) | **English**

This file keeps copy-ready text for the GitHub repository page and public release materials.

## Repository Name

`prompt-optimizer-studio`

## Positioning

### GitHub About

Self-hosted prompt optimizer for multi-round refinement with human steering and copy-ready final prompts.

### GitHub Homepage

`https://github.com/XBigRoad/prompt-optimizer-studio/blob/main/docs/deployment/docker-self-hosted.md`

### Short Pitch

Prompt Optimizer Studio turns prompt optimization into a workflow ordinary prompt users can actually follow: start from a draft prompt, let optimizer and reviewer refine it across rounds, step in when the direction drifts, and leave with a full prompt you can actually copy and use.

## Key Messages

- automated, multi-round, pipeline-style prompt optimization
- human steering stays inside the loop instead of outside it
- the final deliverable is the latest full prompt, not a diff log
- round history, drift checks, and stop rules stay visible
- configurable scoring standards at both global and per-job level
- bilingual operator UI
- broader provider and model connectivity with self-hosted Docker deployment

## Release Title

`v0.1.3 - GPT-5 reasoning-effort settings patch`

## Release History

### v0.1.3

Release shape:

- This release remains the **Self-Hosted / Server Edition**.
- It is a patch release on top of `v0.1.2`, focused on fixing the public build so `gpt-5.4` reasoning effort can be configured and audited explicitly.

Highlights:

- **Reasoning-effort controls in settings**: the Config Desk now persists a default reasoning effort for optimizer and reviewer, including `default / none / minimal / low / medium / high / xhigh`.
- **Public-line persistence is now complete**: both `settings` and `jobs` store reasoning effort snapshots so public jobs can be audited after the fact.
- **More correct GPT-5 request shaping**: the public build now forwards `reasoning_effort` for `gpt-5` family models and avoids sending incompatible `temperature` settings when reasoning is enabled.
- **Timeout protection for higher reasoning levels**: `high / xhigh` automatically expand optimizer / reviewer timeouts to reduce false timeouts under heavier reasoning load.
- **v0.1.3 compatibility patch across the stack**: the settings UI, settings API, database migration path, and verification tests were all updated together so the public line regains reasoning-control visibility comparable to the private line.

### v0.1.2

Release shape:

- This release remains the **Self-Hosted / Server Edition**.
- Data stays on the machine or deployment environment running the app.
- A separate `Web Local Edition` may come later, but it is not part of this release.

Highlights:

- **Bilingual UI**: the main operator surfaces now switch between `中文 / EN`.
- **Configurable scoring standards**: the Config Desk supports a global scoring override, while submission and job detail views support task-level scoring overrides in Markdown.
- **Broader provider coverage**: beyond OpenAI-compatible, Anthropic, and Gemini, the public build now includes Mistral and Cohere native support plus presets for DeepSeek, Kimi, Qwen, GLM, and OpenRouter.
- **Protocol override**: the Config Desk can now force a provider protocol when auto-detection is not enough.
- **More complete runtime controls**: concurrent jobs is now configurable alongside threshold and max rounds.
- **Searchable model picker**: the Control Room, Result Desk, and Config Desk now share a more stable searchable model picker and refined dropdown behavior.
- **More operational task controls**: decision cards are clearer, and jobs can be completed/archived or restarted from the UI.

### v0.1.1

- Fixed the dashboard crash in environments where `crypto.randomUUID` was unavailable.
- Added a result comparison mode between the initial prompt and the current latest full prompt.
- Hardened invalid round-score handling and clarified related error messages.
- Published a real multi-round demo dataset together with refreshed screenshots and GitHub launch copy.

### v0.1.0

- First public release.
- Automated prompt optimization pipeline with visible round-by-round progress.
- Final full prompt stays visible and copyable.
- Human steering loop with pause, next-round guidance, continue-one-round, and resume-auto controls.
- Goal-anchor drift guard and reviewer isolation.
- Docker-ready self-hosted deployment with `/api/health`.
- AGPL-3.0-only licensing for source-available hosted modifications.

## Suggested Topics

`prompt-optimizer`, `prompt-engineering`, `prompt-automation`, `human-in-the-loop`, `self-hosted`, `ai-tooling`, `openai-compatible`
