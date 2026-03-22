<p align="center">
  <img src="public/logo.png" alt="Prompt Optimizer Studio logo" width="160" />
</p>

# Prompt Optimizer Studio（自托管提示词优化工作台）

**中文** | [英文](README_EN.md)

<p align="center">
  <a href="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square"><img alt="Latest release" src="https://img.shields.io/github/v/release/XBigRoad/prompt-optimizer-studio?display_name=tag&style=flat-square" /></a>
  <a href="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square"><img alt="Self-hosted" src="https://img.shields.io/badge/edition-self--hosted-2d6a4f?style=flat-square" /></a>
  <a href="https://img.shields.io/badge/providers-openai--compatible%20%2B%20more-f4a261?style=flat-square"><img alt="Multi-provider support" src="https://img.shields.io/badge/providers-openai--compatible%20%2B%20more-f4a261?style=flat-square" /></a>
  <a href="LICENSE"><img alt="AGPL-3.0 License" src="https://img.shields.io/badge/license-AGPL--3.0-1d3557?style=flat-square" /></a>
</p>

一个面向**自托管场景**的提示词优化工作台。你提交初版 prompt 后，系统会围绕当前版本做多轮优化与复核；如果方向偏了，你可以暂停、补充下一轮引导、调整长期规则、继续一轮或恢复自动运行。最后交付的是**可直接复制的完整 prompt**，而不只是 patch 记录。

> 当前公开仓库交付的是 `Self-Hosted / Server Edition（自托管服务端版）`。它不是官方在线 SaaS，也不承诺自动证明“唯一最优 prompt”。

**你会得到**

- 🧾 一份可以直接复制使用的完整 prompt
- 🔁 一条可暂停、可继续、可人工纠偏的多轮优化链路
- 🛠️ 一套留在自己环境里的配置、运行参数和结果记录

<p align="center">
  <a href="#-三句话先看懂"><strong>👀 先看懂</strong></a> ·
  <a href="#-工作流程"><strong>🧭 工作流程</strong></a> ·
  <a href="#-一轮怎么跑"><strong>🔄 一轮语义</strong></a> ·
  <a href="#-当前停止规则"><strong>🛑 停止规则</strong></a> ·
  <a href="#-人工引导与长期规则"><strong>🧩 引导与长期规则</strong></a> ·
  <a href="#-页面截图"><strong>🖼️ 页面截图</strong></a> ·
  <a href="#-开始使用"><strong>🚀 开始使用</strong></a> ·
  <a href="docs/deployment/docker-self-hosted.md"><strong>🐳 Docker 自托管</strong></a>
</p>

## 👀 三句话先看懂

| 你最关心的事 | 这里怎么回答 |
| --- | --- |
| **它是什么** | 一个把提示词优化做成“可暂停、可继续、可复核、可人工纠偏”的自托管工作台 |
| **它怎么跑** | 当前版本进入一轮后，系统会安排“复核当前版本”和“生成下一版”这两件事；新版本要到下一轮才会被评分 |
| **它不是什么** | 不是只展示 diff 的改写器，也不是替你自动盖章“这版一定最合适”的黑盒系统 |

## 🎯 你可以用它做什么

| 如果你现在遇到的是 | Prompt Optimizer Studio 更适合怎么帮你 |
| --- | --- |
| 手里有一个初版 prompt，但还不能直接交付 | 保留完整提示词主线，按轮次持续打磨，而不是只给你 patch 片段 |
| 想自动多轮推进，但又怕越跑越偏 | 让系统自动推进，同时保留暂停、下一轮引导、长期规则和单轮继续入口 |
| 需要把结果交给同事或客户 | 最后拿到的是一份可以直接复制使用的完整 prompt，而不是内部 diff 日志 |
| 想在自己的环境里接不同 provider / 模型 | 走自托管服务端路径，保留设置、运行参数和结果链路的可检查性 |

## 🧭 工作流程

```mermaid
flowchart LR
    A[输入初版完整 prompt] --> B[进入一轮调度]
    B --> C[复核当前输入 prompt]
    B --> D[生成下一版完整 prompt]
    C --> E{连续 3 轮过线了吗}
    D --> F[下一轮把新版本当作输入]
    E -- 否 --> F
    F --> B
    E -- 是 --> G[交付最近可用的完整 prompt]
```

## 🔄 一轮怎么跑

当前产品语义不是“先优化，再给新版本打分”。一轮里真正发生的是下面这件事：

| 这一轮里发生什么 | 实际含义 |
| --- | --- |
| **当前完整 prompt 进入这一轮** | 这一版既是本轮复核对象，也是生成下一版时的输入基础 |
| **复核侧检查当前输入 prompt** | 用户看到的本轮分数，针对的是进入这一轮之前的版本 |
| **优化侧生成下一版完整 prompt** | 本轮新产出的版本不会在本轮评分，要到下一轮才会被复核 |
| **runtime 自动决定执行方式** | 在不同 provider / 模型 / 稳定性条件下，同轮调度可能并行，也可能顺序执行 |

一句话概括：**本轮展示的是上一版 prompt 的评分，本轮产出的是下一版 prompt。**

## 🛑 当前停止规则

当前公开版的停止规则可以直接理解成：

- 用户设置**分数阈值**
- 系统固定要求**连续 3 轮复核过线**
- “过线”指的是：
  - 本轮复核分数 `>= scoreThreshold`
  - 且没有 material issues
- 到第 3 次连续过线时：
  - 如果本轮也成功生成了新版本，就直接交付这份新版本
  - 如果本轮复核过线，但新版本没有成功生成，就回退交付刚刚通过复核的当前版本
- 如果还没满足连续 3 轮过线就先达到 `maxRounds`，任务会停到人工复核，而不是假装已经完成

## 🧩 人工引导与长期规则

这里有两个概念，当前产品里是分开的：

| 概念 | 当前真实行为 |
| --- | --- |
| **下一轮引导** | 只作为下一轮的一次性补充，按当前顺序被 optimizer 吸收 |
| **长期规则** | 会持续约束后续轮次，但只有你明确保存后才会更新 |

补充说明：

- 复核侧不会直接看到你写的下一轮引导原文，只会看到下一轮实际产出的完整 prompt
- 你可以从待生效引导里勾选部分内容，先生成长期规则草稿，再决定是否保存
- 未被选中或未保存的引导，不会自动写进长期规则
- 如果某条下一轮引导被写进了新的完整 prompt，后续轮次会因为完整 prompt 本身更新而自然继承它，而不是因为系统把这条引导永久附着在后台

## 🖼️ 页面截图

以下截图基于当前公开构建版本的本地自托管实例拍摄。

| 任务控制室 | 结果台 | 配置台 |
| --- | --- | --- |
| <img src="docs/screenshots/dashboard-control-room.png" alt="任务控制室" width="100%" /> | <img src="docs/screenshots/job-detail-result-desk.png" alt="结果台" width="100%" /> | <img src="docs/screenshots/settings-console.png" alt="配置台" width="100%" /> |

## 🚀 开始使用

| 你现在想做什么 | 入口 |
| --- | --- |
| 先在本地跑起来 | [快速开始](#快速开始) |
| 用 Docker 自托管 | [Docker 自托管文档](docs/deployment/docker-self-hosted.md) |
| 看版本更新记录 | [Releases](https://github.com/XBigRoad/prompt-optimizer-studio/releases) |
| 了解常见问题与限制 | [常见问题](#常见问题) |

更多信息： [配置方式](#配置方式) · [项目文档](#项目文档)

## 📚 项目文档

- [英文首页](README_EN.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [开源发布文案](docs/open-source-launch.md)
- [许可证](LICENSE)

## ⚡ 快速开始

### 📦 环境要求

- `Node 22.22.x`
- `npm`

### 💻 本地开发

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

### ✅ 完整检查

```bash
npm run check
```

### 🐳 Docker 自托管

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

## ⚙️ 配置方式

应用通过**配置台**完成配置。

当前配置台提供：

- `Base URL`
- `API Key`
- `快速选择服务商`
- `接口协议`（自动判断 / 手动覆盖）
- `全局评分标准覆写`
- 默认任务模型
- 默认推理强度
- 默认运行项：`workerConcurrency`、`scoreThreshold`、`maxRounds`

任务层还支持：

- 新建任务时填写 `任务级评分标准覆写`
- 新建任务时选择模型与推理强度
- 在任务详情页调整任务模型、推理强度和轮数上限
- 在结果台直接查看当前评分标准、下一轮引导和长期规则

## 🔌 Provider 与兼容性

当前公开版支持：

- **OpenAI-compatible 网关**
  - 通过模型列表探测和 capability-aware request routing 接入
  - 会根据 endpoint 能力在 `chat/completions` 与 `responses` 之间选择合适路径，并在必要时 fallback
- **Anthropic 官方 API**
- **Gemini 官方 API**
- **Mistral 官方 API**
- **Cohere 官方 API**

常见 provider 预设包括：

- `OpenAI`
- `Anthropic (Claude)`
- `Google Gemini`
- `Mistral`
- `Cohere`
- `DeepSeek`
- `Moonshot (Kimi)`
- `通义千问 (Qwen)`
- `智谱 (GLM)`
- `OpenRouter`

常见 `Base URL` 示例：

- `https://api.openai.com/v1`
- `https://api.anthropic.com`
- `https://generativelanguage.googleapis.com`

如果你接的是官方 API，`Base URL` 直接填写官方根地址即可，不需要额外自建代理路径。

## 🏗️ 发布形态

当前仓库发布的是 **Self-Hosted / Server Edition（自托管服务端版）**。

- 本地 `npm` 运行时，数据保存在运行应用的机器上
- Docker 自托管时，数据保存在服务端挂载卷中，而不是用户浏览器里
- 由服务端发起请求，适合接自托管网关或官方 API
- `Web Local Edition` 会作为另一种独立产品形态后续推进，但当前仓库没有交付它

默认数据库位置：

```text
data/prompt-optimizer.db
```

也可以用环境变量覆盖：

```bash
PROMPT_OPTIMIZER_DB_PATH=/your/custom/path.db
```

## ❓ 常见问题

- **这是官方在线 SaaS 吗？**
  - 不是。当前仓库是自托管服务端版。
- **这个项目最终产出什么？**
  - 产出的是一份可以直接复制使用的完整提示词，它来自自动化多轮优化流程。
- **优化过程中可以人工干预吗？**
  - 可以。你可以暂停任务、补充下一轮引导、调整长期规则、只继续一轮，或者恢复自动运行。
- **为什么本轮得分和本轮新版本不是同一个东西？**
  - 因为当前产品语义是“复核当前输入 prompt，同时生成下一版 prompt”。所以本轮分数对应当前输入版本，新版本要到下一轮才会被评分。
- **可以调整评分规则吗？**
  - 可以。配置台支持 `全局评分标准覆写`，单个任务也支持 `任务级评分标准覆写`，都接受 Markdown。
- **可以切换推理强度吗？**
  - 可以。创建任务、配置台和任务详情页都支持设置模型与推理强度。
- **支持哪些模型 / API？**
  - 当前公开版支持 OpenAI-compatible、Anthropic、Gemini、Mistral、Cohere，并为 DeepSeek / Kimi / Qwen / GLM / OpenRouter 提供预设入口与协议映射。
- **可以切换英文界面吗？**
  - 可以。当前公开版已经提供 `中文 / EN` 切换。
- **数据存在哪里？**
  - 存在运行这套应用的机器或挂载卷里的数据库中。
- **为什么使用 AGPL-3.0？**
  - 因为这个项目希望即使被别人改成在线服务继续对外提供，也必须继续公开对应源码。

## 🤝 贡献与许可证

- 贡献说明：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 安全策略：[`SECURITY.md`](SECURITY.md)
- 行为准则：[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

本项目采用 `AGPL-3.0-only` 许可证。

用人话来说：

- 你可以使用、研究、修改和自托管它
- 如果你分发修改版，或者把修改版作为在线服务提供给其他用户使用，就需要按 AGPL 提供对应源码
- 完整条款见 [`LICENSE`](LICENSE)
