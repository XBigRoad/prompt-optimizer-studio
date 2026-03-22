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

A **self-hosted** prompt-optimization workspace for people who still want control. You start with a draft prompt, the system pushes it through multi-round optimization and review, and you can step in whenever the run drifts. The deliverable is a **copy-ready full prompt**, not just a patch log.

> This repository ships the `Self-Hosted / Server Edition`. It is not an official hosted SaaS, and it does not claim to automatically prove a single globally optimal prompt.

<p align="center">
  <a href="#three-things-to-know-first"><strong>✨ First Look</strong></a> ·
  <a href="#what-you-can-use-it-for"><strong>🧭 Use Cases</strong></a> ·
  <a href="#how-it-works"><strong>🔄 Workflow</strong></a> ·
  <a href="#screenshots"><strong>🖼️ Screenshots</strong></a> ·
  <a href="#start-here"><strong>🚀 Start Here</strong></a> ·
  <a href="docs/deployment/docker-self-hosted_EN.md"><strong>🐳 Docker Self-Hosted</strong></a>
</p>

## Three Things to Know First

| The question | The short answer |
| --- | --- |
| **What is it?** | A self-hosted workspace that turns prompt optimization into a pauseable, steerable, reviewable process |
| **How does it run?** | Draft prompt → optimizer / reviewer rounds → human steering when needed → final full prompt |
| **What is it not?** | Not just a diff viewer, and not a black box claiming it found the one globally best prompt |

## What You Can Use It For

| If your situation looks like this | Prompt Optimizer Studio is better suited to |
| --- | --- |
| You have a draft prompt but it is not ready to hand off yet | Keep refining toward a usable full prompt instead of only showing patch fragments |
| You want automatic multi-round improvement without losing control | Let optimizer and reviewer run while keeping pause, next-round steering, and one-round-continue controls available |
| You need something you can pass to teammates or clients | End with a full prompt you can directly copy and use |
| You want to connect your own providers and models | Run it as a self-hosted server path with inspectable settings, runtime, and result history |

## How It Works

```mermaid
flowchart LR
    A[Draft prompt] --> B[Start automated optimization loop]
    B --> C[Optimizer produces next full prompt]
    C --> D[Reviewer scores quality and checks drift]
    D --> E{Target reached or stop rule hit?}
    E -- No --> F{Need human steering?}
    F -- No --> B
    F -- Yes --> G[Pause / add next-round guidance / resume]
    G --> B
    E -- Yes --> H[Copy the final full prompt]
```

## Why It Feels Different From A Patch Viewer

- **Full prompt first**
  - The main deliverable is the latest full prompt, not a diff-oriented audit trail.
- **Human steering stays in the main path**
  - You can pause, steer, continue one round, or resume auto without restarting everything.
- **Stop logic stays visible**
  - Jobs keep moving until they pass or hit an explicit stopping condition.
- **It tries to reduce silent drift**
  - `goalAnchor`, drift checks, and reviewer isolation all help preserve task intent.

## Screenshots

The screenshots below were captured from the current public candidate running as a local self-hosted instance.

| Control Room | Result Desk | Config Desk |
| --- | --- | --- |
| <img src="docs/screenshots/dashboard-control-room.png" alt="Control Room" width="100%" /> | <img src="docs/screenshots/job-detail-result-desk.png" alt="Result Desk" width="100%" /> | <img src="docs/screenshots/settings-console.png" alt="Config Desk" width="100%" /> |

## Start Here

| What you want to do now | Entry |
| --- | --- |
| Run it locally first | [Quick Start](#quick-start) |
| Self-host with Docker | [Docker Self-Hosted Guide](docs/deployment/docker-self-hosted_EN.md) |
| Check release history | [Releases](https://github.com/XBigRoad/prompt-optimizer-studio/releases) |
| Read common questions and limits | [FAQ](#faq) |

More: [Configuration](#configuration) · [Project Docs](#project-docs)

## Project Docs

- [Chinese Home](README.md)
- [Contributing](CONTRIBUTING_EN.md)
- [Security Policy](SECURITY_EN.md)
- [Code of Conduct](CODE_OF_CONDUCT_EN.md)
- [Open Source Launch Copy](docs/open-source-launch_EN.md)
- [License](LICENSE)

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

The Config Desk now exposes:

- `Base URL`
- `API Key`
- quick provider preset
- API protocol override
- global scoring override
- default task model alias
- runtime defaults: `workerConcurrency`, `scoreThreshold`, `maxRounds`

At the job level, the public build also supports:

- task-level scoring override during submission
- current scoring preview inside the Result Desk
- editing task-level scoring override from the job detail page

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
- **Which APIs does it support?**
  - The current public build supports OpenAI-compatible, Anthropic, Gemini, Mistral, and Cohere, with presets and protocol mapping for DeepSeek, Kimi, Qwen, GLM, and OpenRouter.
- **Can I customize the scoring rubric?**
  - Yes. The Config Desk supports a global scoring override, and each job can also carry its own task-level scoring override in Markdown.
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
