# Open Source Launch Copy

This file keeps copy-ready text for the GitHub repository page and the first public release.

## Repository Name

`prompt-optimizer-studio`

## GitHub About

### English

Local-first prompt optimization control room with pause/resume, one-round stepping, human steering, and final full prompts you can copy directly.

### 中文

一个本地优先的提示词优化控制室：支持暂停/恢复、继续一轮、人工引导，并始终优先交付可直接复制的完整提示词。

## Repository Short Pitch

### English

Prompt Optimizer Studio is built for people who want iterative prompt optimization without losing control. It keeps the latest full prompt front and center, lets operators pause and inject one-time steering between rounds, and supports any OpenAI-compatible Base URL and API key without exposing provider-internal paths in the UI.

### 中文

Prompt Optimizer Studio 面向那些想做多轮提示词优化、但又不想失去控制权的人。它把最新完整提示词始终放在最前面，支持中途暂停并插入一次性的下一轮人工引导，同时兼容任意 OpenAI-compatible Base URL 与 API Key，并且不会在 UI 中暴露 provider 内部路径。

## Suggested Topics

`prompt-engineering`, `prompt-optimizer`, `nextjs`, `react`, `typescript`, `sqlite`, `openai-compatible`, `local-first`, `developer-tools`, `ai-tooling`

## Release Title

`v0.1.0 - Control Room Release`

## Release Notes

### English

Prompt Optimizer Studio is now ready for its first public release.

Highlights:
- Final-prompt-first workflow: the latest full prompt stays copyable and visible at all times.
- Human steering loop: pause a task, add one-time guidance, continue one round, or resume auto.
- Goal-anchor drift guard: keep optimization aligned with the original task intent.
- Reviewer isolation: the reviewer only sees the current candidate and scoring rules, not historical aggregate issue lists.
- OpenAI-compatible connectivity: configure your own Base URL and API key from the settings console.
- Control-room UI: redesigned home, detail, and settings pages with a cleaner operator-first layout.
- Worker lease fix: prevents the same running job from being claimed multiple times.

Known note:
- If an older local database already contains duplicate round numbers produced before the worker-lease fix, those historical rows can still appear until cleaned up.

### 中文

Prompt Optimizer Studio 现在已经可以作为首个公开版本发布。

本次发布重点：
- 最终完整提示词优先：当前最新完整 prompt 始终可见、可复制。
- 人工控制闭环：支持暂停任务、补充一次性下一轮引导、继续一轮、恢复自动运行。
- 目标锚点防漂移：尽量让多轮优化持续贴合原始任务意图。
- reviewer 隔离：reviewer 只看当前候选稿和评分规则，不看历史聚合问题列表。
- 兼容 OpenAI 风格接入：可在设置页配置自己的 Base URL 和 API Key。
- 控制室式 UI：首页、详情页、设置页都改成了更适合操作的产品化结构。
- worker 租约修复：避免同一个运行中任务被重复 claim。

已知说明：
- 如果本地旧数据库里还保留着修复前产生的重复轮号数据，这些历史轮次在清洗前仍可能继续显示。

## Social Preview Direction

### English

A prompt optimizer that does not hide the result behind diffs.
Pause it, steer it, and copy the latest full prompt at any time.

### 中文

不是只给你 diff 的 prompt optimizer。
你可以暂停它、引导它，并在任意时刻直接复制最新完整提示词。
