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
- self-hosted deployment with local SQLite and Docker support

## Release Title

`v0.1.0 - Self-Hosted Prompt Optimization Pipeline`

## Release Notes

Prompt Optimizer Studio is ready for its first public release.

Release shape:

- This release is the **Self-Hosted / Server Edition**.
- Data is stored on the machine or deployment environment running the app.
- A separate `Web Local Edition` may come later, but it is not part of this release.

Highlights:

- Automated prompt optimization pipeline: the app keeps iterating round by round instead of stopping at a single rewrite.
- Final-prompt-first workflow: the latest full prompt stays visible and copyable at all times.
- Human steering loop: pause a task, add next-round guidance, continue one round, or resume auto.
- Goal-anchor drift guard: keep optimization aligned with the original task intent.
- Reviewer isolation: the reviewer sees the current candidate and scoring rules, not historical aggregate issue lists or steering raw text.
- Multi-provider connectivity: configure `Base URL`, `API Key`, and model alias from the Config Desk while the backend routes to OpenAI-compatible, Anthropic native, or Gemini native protocols.
- Docker-ready self-hosting: ship with a Dockerfile, Compose path, persistent volume convention, and `/api/health` endpoint.
- AGPL-3.0-only license: modified hosted versions must make their corresponding source available to users.

## Suggested Topics

`prompt-engineering`, `prompt-optimizer`, `automation`, `prompt-pipeline`, `nextjs`, `react`, `typescript`, `sqlite`, `docker`, `openai-compatible`, `anthropic`, `gemini`, `local-first`, `self-hosted`, `developer-tools`, `ai-tooling`
