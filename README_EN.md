<p align="center">
  <img src="public/logo.png" alt="Prompt Optimizer Studio logo" width="160" />
</p>

# Prompt Optimizer Studio

[Chinese Home](README.md) | **English**

<p align="center">
  <a href="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square"><img alt="Latest release" src="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square" /></a>
  <a href="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square"><img alt="Self-hosted" src="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square" /></a>
  <a href="https://img.shields.io/badge/providers-openai--compatible%20%2B%20more-f4a261?style=flat-square"><img alt="Multi-provider support" src="https://img.shields.io/badge/providers-openai--compatible%20%2B%20more-f4a261?style=flat-square" /></a>
  <a href="LICENSE"><img alt="AGPL-3.0 License" src="https://img.shields.io/badge/license-AGPL--3.0-1d3557?style=flat-square" /></a>
</p>

Automated, pipeline-style prompt optimization for people who still want control. ✨ It turns one-off prompt rewriting into a pauseable, steerable, multi-round workflow.
Start from a draft prompt, let the system iterate round by round, and step in whenever the run drifts so you end with a copy-ready full prompt instead of a patch log.

> This repository currently ships the `Self-Hosted / Server Edition`.

<p align="center">
  <a href="#what-you-can-use-it-for"><strong>✨ What It Does</strong></a> ·
  <a href="#how-it-works"><strong>🔄 Workflow</strong></a> ·
  <a href="#start-here"><strong>🚀 Start Here</strong></a> ·
  <a href="#screenshots"><strong>🖼️ Screenshots</strong></a> ·
  <a href="docs/deployment/docker-self-hosted_EN.md"><strong>🐳 Docker Self-Hosted</strong></a> ·
  <a href="https://github.com/XBigRoad/prompt-optimizer-studio/releases"><strong>Releases</strong></a>
</p>

## What You Can Use It For

✨ If what you really want is a prompt you can copy and use, this is the section that matters.

Most prompt optimizers stop at showing diffs, patch fragments, or internal reasoning.

`Prompt Optimizer Studio` is built around a different promise:

| What you need | How Prompt Optimizer Studio helps |
| --- | --- |
| Stop reading patch fragments | It keeps the `latest full prompt` visible and copyable instead of only showing diffs |
| Want multi-round automation without a black box | It supports both `auto` and `step`, with visible pause points, stop rules, and manual-review handoff |
| Need to change scoring mid-run | It supports global rubric overrides and job-level rubric overrides; structured rubrics automatically render per-dimension score bars |
| Need history to stay interpretable | Older rounds prefer their own `rubric snapshot` and do not get retroactively polluted by a later rubric edit |
| Want failure states that tell the truth | Request failures, no-output rounds, invalid summaries, and invalid structured scores are surfaced with root-cause-oriented copy instead of one generic error bucket |
| Want to actually use review suggestions | Suggestions can be adopted into next-round steering or stable rules, and the latest panel can auto-adopt future rounds too |

## How It Works

🔄 In the current public build, the main path from draft prompt to final full prompt is:

```mermaid
flowchart LR
    A[Draft prompt] --> B[System derives goalAnchor and long-term guardrails]
    B --> C[Judge scores the current input prompt first]
    C --> D[Optimizer produces the next full prompt]
    D --> E[Judge writes the round run against the current rubric]
    E --> F{Has the same candidate reached a credible pass streak?}
    F -- Yes --> G[Complete / copy final prompt / fork a new job from final]
    F -- No --> H{Pause point, manual review, or operator takeover?}
    H -- No --> D
    H -- Yes --> I[Adjust steering, stable rules, task rubric, or run mode]
    I --> D
```

### Workflow Details

1. A new job starts by deriving a `goalAnchor`: long-term goal, long-term deliverable, long-term boundaries, plus a readable explanation.
2. Each round judges the current input prompt first, then passes de-scored structural feedback into the optimizer for the next rewrite.
3. The public build exposes two run modes:
   - `auto` keeps going until completion, `manual_review`, pause, or another stop rule.
   - `step` runs exactly one full round, then lands in `paused`.
4. `completed` does **not** mean “one passing review.” By default, the **same candidate must earn multiple credible passes in a row** (public default: 3) without material issues or drift.
5. If the run hits the round cap, trips a strict no-output guard, or needs operator judgment, it lands in `manual_review`. That means “your decision is needed now,” not necessarily “the task is dead.”
6. If an infra fault happens but the round still produced a usable result, the system tries to soft-land instead of hard-failing:
   - `step` usually goes back to `paused`
   - `auto` usually goes back to `pending`
7. Every round writes a `round run`. Successful structured reviews keep both `dimensionScores` and `rubricDimensionsSnapshot`, so the Result Desk can render trustworthy per-dimension score bars.
8. The latest review-suggestion panel supports two paths:
   - adopt suggestions into next-round steering
   - write them directly into stable rules
   It can also auto-adopt future rounds.
9. After completion, you can do more than copy the final prompt. You can also:
   - continue the current job
   - restart from the beginning
   - `fork` a fresh job from the final prompt

## Start Here

🚀 If you want to get started right now, these are the only links you need first:

| What you want to do now | Entry |
| --- | --- |
| Run it locally | [Quick Start](#quick-start) |
| Self-host with Docker | [Docker Self-Hosted Guide](docs/deployment/docker-self-hosted_EN.md) |
| Check release packages and updates | [Releases](https://github.com/XBigRoad/prompt-optimizer-studio/releases) |
| Read common questions | [FAQ](#faq) |

More: [Configuration](#configuration) · [Screenshots](#screenshots)

## What Makes It Feel Different

- **Full prompt first**
  - The main deliverable is the prompt you can actually ship, not a diff viewer.
- **Operator in the loop**
  - Human intervention is a first-class control path, not an afterthought.
- **Multi-round automation with visible stop logic**
  - Runs can complete, pause, or land in `manual_review` under explicit rules instead of disappearing into a black box.
- **Intent protection**
  - `goalAnchor`, drift labels, and reviewer isolation help reduce silent prompt drift.
- **Structured scoring as a product surface**
  - Structured rubrics render per-dimension score bars, and history prefers the round-local rubric snapshot instead of faking alignment later.
- **Failure states that try to stay honest**
  - No-output rounds, provider failures, invalid summaries, and invalid structured scores are surfaced as distinct causes instead of all collapsing into one vague message.

## Project Docs

- [Chinese Home](README.md)
- [Contributing](CONTRIBUTING_EN.md)
- [Security Policy](SECURITY_EN.md)
- [Code of Conduct](CODE_OF_CONDUCT_EN.md)
- [Open Source Launch Copy](docs/open-source-launch_EN.md)
- [License](LICENSE)

## Screenshots

The screenshots below are captured from a `v0.1.8` self-hosted instance.

| Control Room | Result Desk | Config Desk |
| --- | --- | --- |
| <img src="docs/screenshots/dashboard-control-room.png" alt="Control Room" width="100%" /> | <img src="docs/screenshots/job-detail-result-desk.png" alt="Result Desk" width="100%" /> | <img src="docs/screenshots/settings-console.png" alt="Config Desk" width="100%" /> |

## Quick Start

### Requirements

- `Node 22.22.x`
- `npm`

### Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Full Verification

```bash
npm run check
```

That command runs:

- `typecheck`
- `test`
- `build`

### Docker Self-Hosted

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://localhost:3000
```

Optional health check:

```bash
curl http://localhost:3000/api/health
```

For full deployment instructions, see the [Docker self-hosted guide](docs/deployment/docker-self-hosted_EN.md).

## Configuration

The app is configured from the **Config Desk**.

The current public UI exposes these core controls:

- `Base URL`
- `API Key`
- quick provider preset
- API protocol override
- global scoring override
- default task model alias
- default reasoning effort
- runtime defaults: `workerConcurrency`, `scoreThreshold`, `maxRounds`

At the job level, the public build also supports:

- task-level scoring override during submission
- current scoring preview inside the Result Desk
- editing task-level scoring override from the job detail page
- adjusting task model, reasoning effort, and max-round override from job detail
- maintaining next-round steering and stable rules separately
- adopting review suggestions manually or automatically from the latest panel

Supported today:

- **OpenAI-compatible**: `GET /models` + `POST /chat/completions`
- **Anthropic official API**: `GET /v1/models` + `POST /v1/messages`
- **Gemini official API**: `GET /v1beta/models` + `POST /v1beta/models/{model}:generateContent`
- **Mistral official API**: `GET /models` + `POST /chat/completions`
- **Cohere official API**: `GET /v2/models` + `POST /v2/chat`

Common provider presets include:

- `OpenAI`
- `Anthropic (Claude)`
- `Google Gemini`
- `Mistral`
- `Cohere`
- `DeepSeek`
- `Moonshot (Kimi)`
- `Qwen`
- `GLM`
- `OpenRouter`

Common `Base URL` examples:

- `https://api.openai.com/v1`
- `https://api.anthropic.com`
- `https://generativelanguage.googleapis.com`

Official APIs work directly from their provider root. No custom proxy path is required.

Additional notes:

- The visible settings UI presents a unified “default task model + reasoning effort”; the public build applies that default to optimizer and judge together.
- Job-level rubric overrides accept Markdown. Only **structured, parseable** rubrics render per-dimension score bars; free-form text is not guessed into fake dimensions.
- If you edit a job-level rubric mid-run:
  - new rounds score against the new rubric
  - old rounds keep their old snapshot
- Model or reasoning-effort edits made while a job is already running usually take effect on the next round, not by rewriting the round currently in flight.

## Deployment Model

This repository currently ships the **Self-Hosted / Server Edition**.

- Local `npm` runs store data on the machine running the app.
- Docker deployments store data in the mounted server-side volume, not in each user's browser.
- Server-originated requests remain the broadest compatibility path for OpenAI-compatible endpoints.
- A separate `Web Local Edition` is planned later, but it is not shipped here today.

Default SQLite path:

```text
data/prompt-optimizer.db
```

You can override it with:

```bash
PROMPT_OPTIMIZER_DB_PATH=/your/custom/path.db
```

## FAQ

- **Is this a hosted SaaS?**
  - No. This repository currently ships the self-hosted server edition.
- **What is the main output?**
  - A copy-ready full prompt produced by an automated multi-round optimization pipeline.
- **Can I intervene during optimization?**
  - Yes. You can pause a task, add next-round steering, continue one round, or resume automatic execution.
- **When is a job actually considered complete?**
  - The public build does not stop on a single passing review. By default, the same candidate must earn multiple credible passes in a row (default: 3) with no material issues or drift before the job becomes `completed`.
- **What puts a job into `manual_review`?**
  - Common triggers include hitting the max-round cap, tripping the strict no-output guard, or reaching a point where the operator should decide what happens next.
- **Which APIs does it support?**
  - The current public build supports OpenAI-compatible, Anthropic, Gemini, Mistral, and Cohere, with presets and protocol mapping for DeepSeek, Kimi, Qwen, GLM, and OpenRouter.
- **Can I customize the scoring rubric?**
  - Yes. The Config Desk supports a global scoring override, and each job can also carry its own task-level scoring override in Markdown.
- **Will editing the rubric mid-run break older rounds?**
  - No. Older rounds prefer their own `rubricDimensionsSnapshot`, while new rounds use the rubric you saved later.
- **Why do some rounds show score bars and others do not?**
  - Score bars appear only when the round returned a credible structured review and the rubric can be aligned safely. Provider failures, invalid structured scores, or unstructured rubrics do not render fake bars.
- **Can review suggestions flow into future rounds automatically?**
  - Yes. You can adopt them manually into next-round steering or stable rules, and the latest panel can auto-adopt future suggestions too.
- **Can I keep working after a job is completed?**
  - Yes. Completed jobs can continue, restart, or fork a fresh job from the final prompt.
- **Can I switch the interface to English?**
  - Yes. The current public build already includes an in-app `中文 / EN` toggle.
- **Where is data stored?**
  - In the local SQLite database on the machine or mounted volume running the app.
- **Why AGPL-3.0?**
  - Because modified hosted versions should remain source-available to the users who depend on them.

## Contributing And License

- Contribution guide: [`CONTRIBUTING_EN.md`](CONTRIBUTING_EN.md)
- Security policy: [`SECURITY_EN.md`](SECURITY_EN.md)
- Code of conduct: [`CODE_OF_CONDUCT_EN.md`](CODE_OF_CONDUCT_EN.md)

This project is licensed under `AGPL-3.0-only`.

In plain language:

- you can use, study, modify, and self-host it
- if you distribute a modified version, or run a modified version for other users over a network, you must provide the corresponding source code under AGPL as well
- see [`LICENSE`](LICENSE) for the full text
