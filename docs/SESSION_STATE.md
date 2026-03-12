# SESSION_STATE（真相源：当前进度）

> 新会话先读本文件，再按 `next_task_id` 续接；历史背景补充看 `docs/HANDOFF_2026-03-08.md`。

last_updated: 2026-03-12

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
last_completed_task_id: "HOTFIX-2026-03-12-BEGINNER-FRIENDLY-MODEL-PICKER"
next_task_id: "V0.2-05"
next_task_owner: "WORKER"

## Human-readable block
next_task:
  id: "V0.2-05"
  owner: "WORKER"
  description: "README 与开源发布页二次收口：强化“自动流水线式优化提示词”的定位，并把中英文切换逻辑统一成真正的整页切换。"

blockers:
- "V0.2-05 仍需统一 README / About / Release / Topics / 截图的中英文叙事与切换方式。"

notes:
- "2026-03-08 的 handoff 仍保留为历史背景，但从现在开始以 `TASKS.md / SESSION_STATE.md / HANDOFF_LOG.md` 为持续更新三件套。"
- "已把 `/Volumes/1TB_No.1/Mac Mini/提示词优化流水线.md` 里的三项待办同步进项目任务板。"
- "2026-03-11 已新增设计文档：`docs/plans/2026-03-11-provider-coverage-and-release-strategy-design.md`。"
- "已完成 V0.2-02：新增 apiProtocol（自动/手动协议）并扩展 provider adapter 覆盖 Mistral/Cohere；OpenAI-compatible 覆盖 Kimi/Qwen/GLM/DeepSeek 等平台。"
- "已完成 V0.2-03：引入 Radix + cmdk，模型选择器升级为可搜索 Combobox；首页改为 Tabs 并把历史任务并到最新结果右侧；危险操作加入确认弹窗；侧栏修复滚动。"
- "已完成 V0.2-04：新增“完成并归档”动作（/api/jobs/[id]/complete），允许在 paused/manual_review/failed 状态接受最新候选稿为最终结果，并清理运行态残留字段。"
- "已完成 HOTFIX-2026-03-11-UI-TIGHTENING：侧栏提示压缩；详情页去掉重复摘要标签并压缩任务级评分标准；设置页重排为连接横条 + 默认模型/评分标准/运行策略三栏；首页成果总览/历史任务继续按等高内部滚动收口。"
- "已完成 HOTFIX-2026-03-12-SETTINGS-SELECT-AND-LOCAL-DB：设置页固定选项下拉统一成自定义 Select；移除重复的 `协议识别` 摘要卡；首屏刷新滑入动画收口；开发服务器已切回 canonical repo 的 SQLite 库。"
- "已完成 HOTFIX-2026-03-12-BEGINNER-FRIENDLY-MODEL-PICKER：模型选择器闭合态改成标准选择器按钮，展开后才显示搜索与手输兜底；首页/详情/设置三处统一成同一交互。"
- "已把 `V0.2-01` 从当前阻塞项下沉为后续候选：`rubric` 已完成，`eval-set` 延期。"
- "本轮已通过门禁：`npm run check`。"
- "已完成一轮浏览器 smoke：设置页、首页投递台、详情页三处模型选择器都验证通过；详情页里出现的 `Expected ',' or ']' ...` 是该历史失败任务自身的 `errorMessage`，不是当前页面请求解析失败。"
- "当前 release workflow 已存在：push `v*` tag 后自动跑 `npm run check` 并创建 GitHub Release。"
- "如果进入新对话，推荐读取顺序：`SESSION_STATE.md` -> `TASKS.md` -> `HANDOFF_LOG.md` -> 相关设计/代码。"
