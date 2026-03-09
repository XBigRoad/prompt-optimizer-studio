# Prompt Optimizer Studio（提示词优化工作台）

[English](README_EN.md) | **中文**

<p align="center">
  <a href="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square"><img alt="Latest release" src="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square" /></a>
  <a href="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square"><img alt="Self-hosted" src="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square" /></a>
  <a href="https://img.shields.io/badge/storage-local%20SQLite-52796f?style=flat-square"><img alt="Local SQLite" src="https://img.shields.io/badge/storage-local%20SQLite-52796f?style=flat-square" /></a>
  <a href="https://img.shields.io/badge/providers-OpenAI%20compatible%20%7C%20Anthropic%20%7C%20Gemini-f4a261?style=flat-square"><img alt="Provider support" src="https://img.shields.io/badge/providers-OpenAI%20compatible%20%7C%20Anthropic%20%7C%20Gemini-f4a261?style=flat-square" /></a>
  <a href="LICENSE"><img alt="AGPL-3.0 License" src="https://img.shields.io/badge/license-AGPL--3.0-1d3557?style=flat-square" /></a>
</p>

一个自托管、本地优先的提示词优化工作台：它把**最新、可直接复制的完整提示词**放在第一位，同时保留暂停、人工引导、继续一轮、恢复自动运行与任务级最大轮数覆盖这些关键控制能力。

> 当前发布形态：`Self-Hosted / Server Edition（自托管服务端版）`
>
> 当前仓库不是官方 SaaS，也不是浏览器本地存储版；未来的 `Web Local Edition` 会作为独立产品形态推进。

## 使用入口

- [首个版本 Release](https://github.com/XBigRoad/prompt-optimizer-studio/releases/tag/v0.1.0)
- [快速开始](#快速开始)
- [常见问题](#常见问题)
- [Docker 自托管](docs/deployment/docker-self-hosted.md)

## 项目文档

- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [开源发布文案](docs/open-source-launch.md)
- [许可证](LICENSE)

## 项目简介

`Prompt Optimizer Studio` 面向那些想做多轮提示词优化、但又不想失去控制权的人。

和很多只展示 patch、diff 或内部修改说明的工具不同，它始终把**当前最新完整提示词**作为主交付物。你可以随时复制当前结果，也可以在过程里中断自动优化，手动纠偏后再继续推进。

## 为什么和普通 Prompt Optimizer 不一样

- **结果优先，不是改动优先**
  - 结果台首先展示完整提示词，而不是只给你 patch 或修改说明。
- **人工控制闭环完整**
  - 支持 `暂停`、`继续一轮`、`恢复自动运行`、`任务级最大轮数覆盖`。
- **中途人工引导可控**
  - 你可以在运行过程中追加下一轮引导，影响后续结果，而不是只能从头再来。
- **reviewer 隔离更严格**
  - reviewer 不看历史聚合问题，也看不到人工引导原文。
- **多协议接入但不暴露底层路径**
  - 前台始终只填 `Base URL`、`API Key` 和模型别名，后端自动路由到 OpenAI-compatible、Anthropic 或 Gemini 协议。

## 核心能力

- **完整提示词优先**
  - 始终优先交付可直接复制的完整提示词。
- **人工引导 + 自动优化结合**
  - 允许在中间暂停、补充下一轮引导，再继续跑。
- **目标防漂移**
  - 通过紧凑的 `goalAnchor` 和轻量优化上下文，减少越优化越偏题的问题。
- **统一模型接入体验**
  - 公开 UI 只保留单一任务模型别名，不暴露 provider 内部路径。
- **自托管优先**
  - 本地 SQLite、Docker 路径、`/api/health` 健康检查都已就绪。

## 页面截图

当前截图基于 `npm run demo:seed` 生成的本地演示数据拍摄。

| 任务控制室 | 结果台 | 配置台 |
| --- | --- | --- |
| <img src="docs/screenshots/dashboard-control-room.png" alt="任务控制室" width="100%" /> | <img src="docs/screenshots/job-detail-result-desk.png" alt="结果台" width="100%" /> | <img src="docs/screenshots/settings-console.png" alt="配置台" width="100%" /> |

## 快速开始

### 环境要求

- `Node 22.22.x`
- `npm`

### 本地开发

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

### 完整检查

```bash
npm run check
```

### Docker 自托管

```bash
cp .env.example .env
docker compose up -d --build
```

打开：

```text
http://localhost:3000
```

可选健康检查：

```bash
curl http://localhost:3000/api/health
```

完整部署说明见 [Docker 自托管文档](docs/deployment/docker-self-hosted.md)。

## 配置方式

应用通过**配置台**完成配置。

前台保持为统一输入：

- `Base URL`
- `API Key`
- 默认任务模型别名
- 当前公开的运行项：`scoreThreshold`、`maxRounds`

当前支持：

- **OpenAI-compatible**：`GET /models` + `POST /chat/completions`
- **Anthropic 官方 API**：`GET /v1/models` + `POST /v1/messages`
- **Gemini 官方 API**：`GET /v1beta/models` + `POST /v1beta/models/{model}:generateContent`

常见 `Base URL` 示例：

- `https://api.openai.com/v1`
- `https://api.anthropic.com`
- `https://generativelanguage.googleapis.com`

如果你接的是官方 API，`Base URL` 直接填写官方根地址即可，不需要额外自建代理路径。

## 发布形态

当前仓库发布的是 **Self-Hosted / Server Edition（自托管服务端版）**。

- 本地 `npm` 运行时，数据保存在运行应用的机器上。
- Docker 自托管时，数据保存在服务端挂载卷中，而不是用户浏览器里。
- 由服务端发起请求，仍然是兼容 OpenAI-compatible Base URL 最广的一种形态。
- `Web Local Edition` 会作为另一种独立产品形态后续推进，但当前仓库没有交付它。

默认 SQLite 数据库位置：

```text
data/prompt-optimizer.db
```

也可以用环境变量覆盖：

```bash
PROMPT_OPTIMIZER_DB_PATH=/your/custom/path.db
```

## 常见问题

- **这是官方在线 SaaS 吗？**
  - 不是。当前仓库是自托管服务端版。
- **数据存在哪里？**
  - 存在运行这套应用的机器或挂载卷里的 SQLite 数据库中。
- **支持哪些模型 / API？**
  - UI 仍然只填 `Base URL`、`API Key` 和模型别名，后端支持 OpenAI-compatible、Anthropic 官方 API 和 Gemini 官方 API。
- **官方 API 没有自定义 Base URL 也能用吗？**
  - 可以。直接填写官方根地址即可，后端会自动识别协议。
- **优化过程中可以人工干预吗？**
  - 可以。你可以暂停任务、补充下一轮人工引导、只继续一轮，或者恢复自动运行。
- **为什么使用 AGPL-3.0？**
  - 因为这个项目希望即使被别人改成在线服务继续对外提供，也必须继续公开对应源码。

## 贡献与许可证

- 贡献说明：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 安全策略：[`SECURITY.md`](SECURITY.md)
- 行为准则：[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

本项目采用 `AGPL-3.0-only` 许可证。

用人话来说：

- 你可以使用、研究、修改和自托管它
- 如果你分发修改版，或者把修改版作为在线服务提供给其他用户使用，就需要按 AGPL 提供对应源码
- 完整条款见 [`LICENSE`](LICENSE)
