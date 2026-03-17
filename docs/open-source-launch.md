# 开源发布文案

**中文** | [英文](open-source-launch_EN.md)

这个文件用来存放 GitHub 仓库主页和公开发布时可直接复用的文案。

## 仓库名

`prompt-optimizer-studio`

## 定位文案

### GitHub About

自托管提示词优化工作台，支持自动多轮优化、人工纠偏，并交付可直接复制的最终完整提示词。

### GitHub Homepage

`https://github.com/XBigRoad/prompt-optimizer-studio/blob/main/docs/deployment/docker-self-hosted.md`

### 简短介绍

Prompt Optimizer Studio 把提示词优化做成了一个普通用户也能理解和接管的流程：先给出初版 prompt，再让 optimizer 和 reviewer 自动多轮推进；如果方向偏了，人可以立刻介入纠偏，最后拿到的是一份真正能直接复制使用的完整 prompt，而不是 patch 日志。

## 重点信息

- 自动化、多轮、流水线式优化提示词
- 人工始终在回路里，而不是只能事后重来
- 最终交付物是最新完整提示词，不是 diff 日志
- 轮次历史、偏题检查和停止规则都可见
- 支持任务级与全局评分标准覆写
- 支持中英双语界面切换
- 支持更广的 provider / 模型接入与 Docker 自托管

## Release 标题

`v0.1.3 - GPT-5 推理强度设置补丁`

## Release 历史

### v0.1.3

本次发布形态：

- 当前版本仍是 **Self-Hosted / Server Edition（自托管服务端版）**。
- 这是一个面向 `v0.1.2` 的补丁版本，重点修复公开版在 `gpt-5.4` 下无法显式配置与持久化推理强度的问题。

本次发布重点：

- **新增推理强度设置**：配置台现在支持为默认优化器 / 复核器保存 `Reasoning effort`，包含 `default / none / minimal / low / medium / high / xhigh`。
- **补齐 3002 公开线的持久化链路**：`settings` 与 `jobs` 现在都会记录 reasoning effort，后续任务与历史任务审计都能看到实际快照。
- **GPT-5 请求参数更一致**：对 `gpt-5` 家族模型，公开版会按设置传递 `reasoning_effort`，并在启用 reasoning 时避免继续发送不兼容的 `temperature`。
- **高推理强度超时保护**：`high / xhigh` 会自动放宽优化器 / 复核器 timeout，减少高推理负载下的误判超时。
- **为 v0.1.3 发布做的兼容修复**：设置页、API、数据库迁移与测试链路已同步补齐，目标是让公开版与私有线在 reasoning control 上至少达到同等级别的可见性。

### v0.1.2

本次发布形态：

- 当前版本是 **Self-Hosted / Server Edition（自托管服务端版）**。
- 数据保存在运行这套应用的机器或部署环境上。
- 未来可能会有独立的 `Web Local Edition`，但它不属于这次发布内容。

本次发布重点：

- **中英双语界面**：主界面支持 `中文 / EN` 切换，适合公开演示、跨语言团队和对外发布。
- **评分标准可配置**：配置台支持 `全局评分标准覆写`，新任务与任务详情页支持 `任务级评分标准覆写`，都接受 Markdown。
- **更广的模型 / provider 接入**：除了 OpenAI-compatible、Anthropic、Gemini，还增加了 Mistral、Cohere 原生支持，并提供 DeepSeek / Kimi / Qwen / GLM / OpenRouter 等常见平台预设。
- **接口协议手动覆盖**：在自动判断之外，允许从配置台手动指定协议，方便对接网关、兼容层或 provider 原生端点。
- **运行策略更完整**：设置页新增 `同时运行任务数`，与阈值、轮数一起组成当前公开版的默认运行控制项。
- **搜索式模型选择器**：首页、详情页、配置台统一成更稳定的搜索式模型选择器，并补了一轮 dropdown/滚动行为修复。
- **更可操作的控制室**：首页任务卡更聚焦“下一步动作”，并支持 `完成并归档`、`重新开始` 等收尾动作。

### v0.1.1

- 修复首页任务控制室在部分运行时环境下 `crypto.randomUUID` 不可用导致崩溃。
- 新增结果页 `初始版提示词 / 当前最新完整提示词` 对比模式。
- 增加 invalid round score 防护与更清楚的错误提示。
- 发布真实多轮 demo 数据，并同步刷新公开截图和 GitHub 发布文案。

### v0.1.0

- 首个公开版本。
- 自动化提示词优化流水线：系统会按轮次持续推进，而不是只做一次改写。
- 最终完整提示词优先：当前最新完整 prompt 始终可见、可复制。
- 人工控制闭环：支持暂停任务、补充下一轮引导、继续一轮、恢复自动运行。
- 目标锚点防漂移：尽量让多轮优化持续贴合原始任务意图。
- reviewer 隔离：reviewer 只看当前候选稿和评分规则，不看历史聚合问题列表，也看不到人工引导原文。
- Docker 自托管就绪：内置 Dockerfile、Compose 路径、持久化卷约定，以及 `/api/health` 健康检查。
- `AGPL-3.0-only` 协议：如果你修改后继续拿去做在线服务，对应源码也必须向用户提供。

## 建议 Topics

`prompt-optimizer`, `prompt-engineering`, `prompt-automation`, `human-in-the-loop`, `self-hosted`, `ai-tooling`, `openai-compatible`
