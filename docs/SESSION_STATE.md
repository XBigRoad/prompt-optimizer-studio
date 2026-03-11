# SESSION_STATE（真相源：当前进度）

> 新会话先读本文件，再按 `next_task_id` 续接；历史背景补充看 `docs/HANDOFF_2026-03-08.md`。

last_updated: 2026-03-11

project:
  name: "Prompt Optimizer Studio"
  repo_root: "/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening"
  canonical_repo: "/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio"
  current_branch: "codex/open-source-hardening"
  ops_level: "DEV"
  release_target: "v0.2.0"

current_phase: "R3 — Tune / Launch Hardening"

scope_lock:
- "继续保持单模型别名；optimizer / reviewer 对用户只表现为同一个任务模型。"
- "reviewer 不能看到历史聚合问题，也不能看到 pending steering 原文。"
- "optimizer 只接收最新完整提示词、精简 patch、以及本轮待生效人工引导。"
- "不向用户暴露 provider 内部路径；前台继续是 Base URL / API Key / 模型名。"
- "优先做公开版控制力与发布收口，不做无关架构重构。"

## Canonical task pointer
last_completed_task_id: "V0.2-02"
next_task_id: "V0.2-03"
next_task_owner: "WORKER"

## Human-readable block
next_task:
  id: "V0.2-03"
  owner: "WORKER"
  description: "UI 原语成熟化与设置页选择器升级：优先把模型选择器、tabs/accordion、危险操作确认和反馈系统替换成成熟组件。"

blockers:
- "需要先确定 UI 原语选型（Radix/React Aria 等），避免引入重型 UI kit。"

notes:
- "2026-03-08 的 handoff 仍保留为历史背景，但从现在开始以 `TASKS.md / SESSION_STATE.md / HANDOFF_LOG.md` 为持续更新三件套。"
- "已把 `/Volumes/1TB_No.1/Mac Mini/提示词优化流水线.md` 里的三项待办同步进项目任务板。"
- "2026-03-11 已新增设计文档：`docs/plans/2026-03-11-provider-coverage-and-release-strategy-design.md`。"
- "已完成 V0.2-02：新增 apiProtocol（自动/手动协议）并扩展 provider adapter 覆盖 Mistral/Cohere；OpenAI-compatible 覆盖 Kimi/Qwen/GLM/DeepSeek 等平台。"
- "本轮已通过门禁：`npm run check`。"
- "当前 release workflow 已存在：push `v*` tag 后自动跑 `npm run check` 并创建 GitHub Release。"
- "当前工作树里存在一个未处理的自动生成文件改动：`next-env.d.ts`；本次文档整理没有动它。"
- "如果进入新对话，推荐读取顺序：`SESSION_STATE.md` -> `TASKS.md` -> `HANDOFF_LOG.md` -> 相关设计/代码。"
