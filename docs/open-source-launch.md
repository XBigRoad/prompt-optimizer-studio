# 开源发布文案

**中文** | [英文](open-source-launch_EN.md)

这个文件用来存放 GitHub 仓库主页和公开发布时可直接复用的文案。

## 仓库名

`prompt-optimizer-studio`

## 定位文案

### GitHub About

自动化提示词优化流水线，支持人工引导并交付可直接复制的最终完整提示词。

### 简短介绍

Prompt Optimizer Studio 把提示词打磨过程做成了一个可操作的流水线。你先给初版提示词，再让 optimizer 和 reviewer 自动多轮推进；如果方向偏了，人可以立刻介入纠偏，最后得到的是一份真正能拿去用的完整 prompt。

## 重点信息

- 自动化、多轮、流水线式优化提示词
- 人工始终在回路里，而不是只能事后重来
- 最终交付物是最新完整提示词，不是 diff 日志
- 轮次历史、偏题检查和停止规则都可见
- 支持本地 SQLite 与 Docker 的自托管部署

## Release 标题

`v0.1.0 - Self-Hosted Prompt Optimization Pipeline`

## Release Notes

Prompt Optimizer Studio 已经可以作为首个公开版本发布。

本次发布形态：

- 当前版本是 **Self-Hosted / Server Edition（自托管服务端版）**。
- 数据保存在运行这套应用的机器或部署环境上。
- 未来可能会有独立的 `Web Local Edition`，但它不属于这次发布内容。

本次发布重点：

- 自动化提示词优化流水线：系统会按轮次持续推进，而不是只做一次改写。
- 最终完整提示词优先：当前最新完整 prompt 始终可见、可复制。
- 人工控制闭环：支持暂停任务、补充下一轮引导、继续一轮、恢复自动运行。
- 目标锚点防漂移：尽量让多轮优化持续贴合原始任务意图。
- reviewer 隔离：reviewer 只看当前候选稿和评分规则，不看历史聚合问题列表，也看不到人工引导原文。
- 多协议模型接入：可在配置台统一填写 `Base URL`、`API Key` 和模型别名，后端会自动路由到 OpenAI-compatible、Anthropic 原生或 Gemini 原生协议。
- Docker 自托管就绪：内置 Dockerfile、Compose 路径、持久化卷约定，以及 `/api/health` 健康检查。
- `AGPL-3.0-only` 协议：如果你修改后继续拿去做在线服务，对应源码也必须向用户提供。

## 建议 Topics

`prompt-engineering`, `prompt-optimizer`, `automation`, `prompt-pipeline`, `nextjs`, `react`, `typescript`, `sqlite`, `docker`, `openai-compatible`, `anthropic`, `gemini`, `local-first`, `self-hosted`, `developer-tools`, `ai-tooling`
