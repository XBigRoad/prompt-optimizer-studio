# Prompt Optimizer Studio

A local-first control room for iterative prompt refinement that keeps the latest copy-ready full prompt front and center, while still letting the operator pause, steer, step one round, or resume auto.

一个本地优先的提示词优化控制室：把最新、可直接复制的完整提示词始终放在最前面，同时保留暂停、人工引导、继续一轮与恢复自动运行这些关键控制能力。

<p align="center">
  <a href="#english">English</a> ·
  <a href="#中文">中文</a>
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-control-room.png" alt="Prompt Optimizer Studio dashboard" width="92%" />
</p>

## Screenshots

| Control Room | Result Desk |
| --- | --- |
| <img src="docs/screenshots/dashboard-control-room.png" alt="Dashboard control room" width="100%" /> | <img src="docs/screenshots/job-detail-result-desk.png" alt="Job detail result desk" width="100%" /> |

| Settings Console |
| --- |
| <img src="docs/screenshots/settings-console.png" alt="Settings console" width="100%" /> |

---

## English

### What It Is

`Prompt Optimizer Studio` is a local-first web app for running iterative prompt optimization jobs with explicit operator control.

Instead of showing only patches or diff fragments, it always keeps the **current latest full prompt** as the main output. You can pause a job, add one-time steering for the next round, continue exactly one round, resume automatic execution, or override the max round limit per task.

### Why This Exists

Most prompt optimizers fail in one of two ways:

- They optimize automatically but gradually drift away from the original intent.
- They show internal edits, but not a final prompt you can directly copy and use.

This project is built to solve both problems:

- Keep the **final full prompt** front and center.
- Keep the operator in control during long-running optimization loops.
- Keep the reviewer isolated from historical aggregation noise.
- Keep the optimizer context intentionally small so each round stays on-task.

### Core Capabilities

- **Final-prompt-first delivery**
  - The job detail page always shows the latest complete prompt as the primary artifact.
- **Human steering between rounds**
  - Pause a task and inject one-time guidance for the next round.
- **Goal-anchor drift guard**
  - Each task maintains a compact goal anchor so optimization does not over-generalize into “safer but wrong” output.
- **Independent reviewer loop**
  - The reviewer sees the current candidate and scoring rules, not historical aggregated issue lists.
- **Slim optimizer context**
  - The optimizer receives only the current prompt, the latest slim patch, and optional next-round steering.
- **Run controls that matter**
  - `Pause`, `Continue One Round`, `Resume Auto`, and per-task `Max Rounds Override` are built into the workflow.
- **Broad provider compatibility**
  - Keep the UI on `Base URL` + `API Key` + model alias while the backend auto-selects OpenAI-compatible, Anthropic native, or Gemini native protocols.
- **Single visible task model alias**
  - The UI keeps optimizer/reviewer model display simple and task-friendly, without exposing provider-internal route names.

### How It Works

1. Create a task from a raw prompt or an existing draft prompt.
2. The system derives a compact `goalAnchor` from the prompt.
3. The optimizer produces a revised **full prompt**, not just a patch.
4. The reviewer scores the current candidate independently.
5. The operator can pause, steer, step one round, or resume automatic execution.
6. The current best full prompt remains copyable at all times.

### Product Shape

- **Home page = Control Room**
  - Prioritizes tasks that need action, active runs, recent results, and discoverable history.
- **Job detail = Result Desk**
  - Prioritizes the latest full prompt, then goal understanding, controls, and diagnostics.
- **Settings = Console**
  - Separates connection, default model behavior, and the small set of runtime controls that actually affect behavior today.

### Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `SQLite` via `node:sqlite`
- `framer-motion`
- `lucide-react`

### Quick Start

#### Prerequisites

- `Node 22.22.x`
- `npm`

#### Install

```bash
npm install
```

#### Start Development Server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

#### Verify Everything

```bash
npm run check
```

#### Run With Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Then open:

```text
http://localhost:3000
```

Optional health check:

```bash
curl http://localhost:3000/api/health
```

Docker stores the SQLite database in `/app/data/prompt-optimizer.db` inside the container, backed by the named Compose volume by default.

For the full self-hosted Docker guide, see `docs/deployment/docker-self-hosted.md`.

### Configuration

The app is configured from the **Settings** page.

The front-end stays intentionally simple:

- `Base URL`
- `API Key`
- default task model alias
- scoring threshold
- max rounds

The backend infers the wire protocol from `Base URL`, so the UI does not expose provider-specific route details.

Supported today:

- **OpenAI-compatible** endpoints using `GET /models` and `POST /chat/completions`
- **Anthropic official API** using `GET /v1/models` and `POST /v1/messages`
- **Gemini official API** using `GET /v1beta/models` and `POST /v1beta/models/{model}:generateContent`

Common `Base URL` examples:

- `https://api.openai.com/v1`
- `https://api.anthropic.com`
- `https://generativelanguage.googleapis.com`

The public settings page currently exposes only the runtime controls that are truly active: `scoreThreshold` and `maxRounds`.

### Deployment Model

This repository currently ships the **Self-Hosted / Server Edition**.

What that means today:

- Run it locally with `npm run dev` or `npm run start`: data is stored on the machine running the app.
- Deploy it with Docker via `docker compose up -d`: data is stored in the mounted server-side volume for that deployment, not in each user browser.
- The self-hosted server runtime remains the broadest compatibility path for OpenAI-compatible Base URLs because requests originate from the server, not a browser sandbox.
- This release does **not** currently provide an official hosted browser-local edition.

Future direction:

- A planned `Web Local Edition` may offer a hosted frontend with browser-local storage and centralized frontend updates.
- That future edition is still a design-stage direction, not a shipping feature in the current repo.
- See `docs/plans/2026-03-09-web-local-edition-design.md`.

### Storage (Current Self-Hosted Edition)

By default, the local SQLite database is stored at:

```text
data/prompt-optimizer.db
```

You can override it with:

```bash
PROMPT_OPTIMIZER_DB_PATH=/your/custom/path.db
```

The Docker Compose setup defaults to:

```text
/app/data/prompt-optimizer.db
```

That file lives inside the container but persists through the named Docker volume mounted at `/app/data`.

### Operator Controls

At the task level, the app supports:

- `Pause`
- `Continue One Round`
- `Resume Auto`
- `Retry`
- `Cancel`
- `Next-Round Steering`
- `Max Rounds Override`

### Design Principles

- **Control before automation**
- **Full result before internal diff**
- **Small context before bloated history**
- **Operator clarity before provider complexity**
- **Product UI before debug-tool aesthetics**

### Current Notes

- Newer builds include a worker-lease fix that prevents the same running job from being claimed multiple times.
- If an old local database already contains duplicate round numbers from pre-fix builds, those historical records may still appear until cleaned up.

### Roadmap

- Historical data cleanup for legacy duplicate rounds
- Future `Web Local Edition` with browser-local persistence and hosted frontend updates
- Better prompt-pack management
- Richer result comparison views
- Safer import/export for prompt jobs

### Who This Is For

- prompt engineers who want operator control
- product builders who need copy-ready final prompts
- local tool users who prefer UI-managed model routing
- teams who want iterative refinement without hidden prompt drift

### Project Status

Active development.

### Contributing And Security

- Contribution guide: [`/CONTRIBUTING.md`](CONTRIBUTING.md)
- Security policy: [`/SECURITY.md`](SECURITY.md)

### License

This project is released under the `MIT` License. See `/LICENSE`.

---

## 中文

### 它是什么

`Prompt Optimizer Studio` 是一个本地优先的提示词优化工作台，用来运行可控的多轮优化任务。

它不是只展示 patch 或 diff 片段，而是始终把**当前最新完整提示词**放在第一位。你可以中途暂停任务、插入“下一轮人工引导”、只继续一轮、恢复自动运行，或者对单个任务覆盖最大轮数。

### 为什么要做它

大多数 prompt optimizer 最后会出两个典型问题：

- 自动优化越跑越偏，逐渐背离最初意图。
- 只展示内部修改过程，却不给你一个可以直接复制使用的最终提示词。

这个项目就是为了解决这两个问题：

- 让**最终完整提示词**始终是主交付物。
- 让操作者在长链路优化过程中始终保有控制权。
- 让 reviewer 不被历史聚合问题污染。
- 让 optimizer 只吃最小必要上下文，减少越迭代越跑偏的风险。

### 核心能力

- **最终完整提示词优先**
  - 详情页首先展示可直接复制的最新完整 prompt。
- **支持中途人工引导**
  - 可以先暂停，再给下一轮补一句明确引导。
- **目标锚点防漂移**
  - 每个任务都有一个紧凑的 `goalAnchor`，防止优化过程退化成“更安全但不再正确”的版本。
- **reviewer 独立复核**
  - reviewer 只看当前候选稿和评分规则，不看历史聚合问题列表。
- **optimizer 轻上下文**
  - optimizer 只接收当前 prompt、最新精简 patch，以及可选的下一轮人工引导。
- **关键运行控制完整**
  - 工作流内置 `暂停`、`继续一轮`、`恢复自动运行`、任务级 `最大轮数覆盖`。
- **多 provider 接入兼容**
  - 前台始终只填 `Base URL`、`API Key` 和模型别名，后端会自动选择 OpenAI-compatible、Anthropic 原生或 Gemini 原生协议。
- **对用户只保留单一任务模型别名**
  - optimizer / reviewer 的模型展示保持简洁，不向用户暴露 provider 内部路径或底层路由名字。

### 工作方式

1. 从原始提示词或已有草稿创建任务。
2. 系统先从原始 prompt 提炼一个紧凑的 `goalAnchor`。
3. optimizer 输出的是新的**完整提示词**，而不是只给 patch。
4. reviewer 独立对当前候选稿打分和复核。
5. 操作者可以暂停、插入引导、只推进一轮，或恢复自动运行。
6. 当前最好版本的完整 prompt 始终可复制。

### 产品结构

- **首页 = 任务控制室**
  - 优先展示需要你处理的任务、自动运行中的任务、最新结果，以及更容易发现的历史任务。
- **详情页 = 结果台**
  - 先看最新完整提示词，再看目标理解、控制区和诊断区。
- **设置页 = 配置台**
  - 把连接、默认模型和当前真正生效的运行控制拆开管理。

### 技术栈

- `Next.js 16`
- `React 19`
- `TypeScript`
- `SQLite`（基于 `node:sqlite`）
- `framer-motion`
- `lucide-react`

### 快速开始

#### 环境要求

- `Node 22.22.x`
- `npm`

#### 安装依赖

```bash
npm install
```

#### 启动开发环境

```bash
npm run dev
```

然后打开：

```text
http://localhost:3000
```

#### 完整检查

```bash
npm run check
```

#### 使用 Docker 启动

```bash
cp .env.example .env
docker compose up -d --build
```

然后打开：

```text
http://localhost:3000
```

可选健康检查：

```bash
curl http://localhost:3000/api/health
```

Docker 默认会把 SQLite 数据库存到容器内的 `/app/data/prompt-optimizer.db`，并通过 Compose 的命名卷持久化。

完整 Docker 自托管说明见 `docs/deployment/docker-self-hosted.md`。

### 配置方式

应用通过**设置页**完成配置。

前台保持为一套统一输入：

- `Base URL`
- `API Key`
- 默认任务模型别名
- 分数阈值
- 最大轮数

后端会根据 `Base URL` 自动判断底层协议，因此前台不会暴露 provider 专用路径。

当前支持：

- **OpenAI-compatible**：`GET /models` + `POST /chat/completions`
- **Anthropic 官方 API**：`GET /v1/models` + `POST /v1/messages`
- **Gemini 官方 API**：`GET /v1beta/models` + `POST /v1beta/models/{model}:generateContent`

常见 `Base URL` 示例：

- `https://api.openai.com/v1`
- `https://api.anthropic.com`
- `https://generativelanguage.googleapis.com`

当前公开设置页只保留真正会影响行为的运行项：`scoreThreshold` 和 `maxRounds`。

### 发布形态

当前这个仓库发布的是 **Self-Hosted / Server Edition（自托管服务端版）**。

这意味着：

- 你可以直接用 `npm run dev` / `npm run start` 在本机运行，数据保存在运行这套应用的机器上。
- 也可以用 `docker compose up -d` 做自托管部署，数据保存在容器挂载的服务端卷里，而不是每个用户自己的浏览器里。
- 自托管服务端运行时仍然是兼容任意 OpenAI-compatible Base URL 的最佳路径，因为请求由服务端发出，不受浏览器沙箱限制。
- 当前仓库版本**并不等于**“官方在线版 + 浏览器本地存储版”。

未来方向：

- 计划中的 `Web Local Edition` 会是另一种产品形态：线上访问，但数据保存在用户浏览器本地，同时前端更新可以统一下发。
- 这个方向目前还只是设计方案，不是当前仓库已经交付的功能。
- 设计文档见 `docs/plans/2026-03-09-web-local-edition-design.md`。

### 数据存储（当前自托管版）

默认 SQLite 数据库位置：

```text
data/prompt-optimizer.db
```

也可以通过下面的环境变量覆盖：

```bash
PROMPT_OPTIMIZER_DB_PATH=/your/custom/path.db
```

Docker Compose 默认会把数据库放在：

```text
/app/data/prompt-optimizer.db
```

这个文件位于容器内部，但会通过挂载到 `/app/data` 的命名卷持续保留。

### 任务控制能力

任务级支持：

- `暂停`
- `继续一轮`
- `恢复自动运行`
- `重试`
- `取消`
- `下一轮人工引导`
- `最大轮数覆盖`

### 设计原则

- **控制优先于自动化**
- **完整结果优先于内部 diff**
- **轻上下文优先于长历史回灌**
- **用户可理解优先于 provider 复杂度暴露**
- **产品化界面优先于调试工具式界面**

### 当前说明

- 新版本已经加入 worker 租约修复，避免同一个运行中任务被重复 claim，进而重复写入相同轮号。
- 如果旧的本地数据库里已经残留了修复前产生的重复轮号，这些历史记录仍可能继续显示，直到后续做一次数据清洗。

### 路线图

- 清理历史遗留的重复轮号数据
- 未来 `Web Local Edition`：浏览器本地存储 + 托管前端更新
- 更好的 prompt pack 管理能力
- 更丰富的结果对比视图
- 更安全的任务导入导出能力

### 适合谁

- 想保留人工控制权的 prompt engineer
- 需要“最终可复制提示词”而不是 diff 的产品/应用开发者
- 偏好通过 UI 配置模型接入的本地工具用户
- 希望多轮优化但又不想悄悄偏题的团队

### 项目状态

持续开发中。

### 参与贡献与安全

- 贡献说明：[`/CONTRIBUTING.md`](CONTRIBUTING.md)
- 安全策略：[`/SECURITY.md`](SECURITY.md)

### 许可证

本项目采用 `MIT` 许可证，详见 `/LICENSE`。
