# TASKS（看板）

> 规则：
> - 一次只推进一个主任务，从 `SESSION_STATE.md` 的 `next_task_id` 开始
> - 默认保持小步推进；交接三件套不计入工作文件限制
> - 每完成一个 task，必须同步更新 `TASKS.md / SESSION_STATE.md / HANDOFF_LOG.md`

## Legend
- ⬜️ 未开始
- 🟨 进行中
- ✅ 已完成
- 🧊 暂缓

---

## 当前阶段
- 阶段：`R3 — Tune / Launch Hardening`
- 发布目标：`v0.2.0`
- 当前主线：在公开版发布前补齐“控制力升级 + 连接兼容性 + 发布收口”

---

## 已完成

### DOCS-BOOTSTRAP-001（PLANNER / 建立持续任务与交接三件套）✅

目标：
- 给当前项目补一个可持续维护的任务板
- 给后续多轮协作补一个连续 handoff 机制
- 把用户刚确认的 v0.2 待办同步进项目节奏

验收：
- [x] 建立 `docs/TASKS.md`
- [x] 建立 `docs/SESSION_STATE.md`
- [x] 建立 `docs/HANDOFF_LOG.md`
- [x] 已同步当前 v0.2 核心待办与约束

Work files:
- `docs/TASKS.md`
- `docs/SESSION_STATE.md`
- `docs/HANDOFF_LOG.md`

### PLAN-2026-03-11-API-RELEASE（PLANNER / 广覆盖 API 接入与 Release 分发策略定稿）✅

目标：
- 明确“支持更多热门国内外模型/API”的实现方式
- 不把方案做成脆弱的 provider 白名单
- 明确 GitHub Releases 历史版本下载策略

验收：
- [x] 已形成协议族优先的 provider 设计文档
- [x] 已把 Release 历史版本策略与当前 workflow 对齐
- [x] 已给出 v0.2 的优先级重排建议

Work files:
- `docs/plans/2026-03-11-provider-coverage-and-release-strategy-design.md`
- `docs/TASKS.md`
- `docs/SESSION_STATE.md`

---

## 当前待办

### V0.2-02（WORKER / 广覆盖 Provider Adapter 与协议识别）✅

目标：
- 支持不止三家，而是覆盖当前常见国内外热门模型平台
- 保持前台仍以 `Base URL / API Key / 模型名` 为主
- 后台按协议族分流，不暴露 provider 内部路径

验收：
- [x] 增加协议族 adapter 层：`openai-compatible / anthropic-native / gemini-native / mistral-native / cohere-native`
- [x] 设置页新增 `接口协议` 字段，支持 `自动判断 + 手动覆盖`
- [x] 连接测试与模型拉取按协议正确分流
- [x] 设置页文案更新为“OpenAI-compatible + 多家官方原生接口”

建议 work files:
- `docs/plans/2026-03-11-provider-coverage-and-release-strategy-design.md`
- `src/lib/server/model-adapter.ts`
- `src/app/api/settings/route.ts`

### V0.2-03（WORKER / UI 原语成熟化与设置页选择器升级）✅

目标：
- 不只优化模型选择器，而是系统性替换高交互风险的自研原语
- 保留当前西瓜配色和控制室结构
- 优先让设置页、首页、详情页的核心交互更成熟

验收：
- [x] 模型字段改成真正的搜索下拉组件（cmdk + Radix Popover）
- [x] 首页控制板 Tabs、历史展开 Accordion、危险操作确认 Dialog 全部换成成熟原语
- [x] 不改西瓜配色，只优化交互、排版、滚动与一致性（侧栏可滚动、首页变短）

建议 work files:
- `src/components/settings-control-room.tsx`
- `src/components/dashboard-control-room.tsx`
- `src/components/job-detail-control-room.tsx`

### V0.2-04（WORKER / 手动完成任务并归档）✅

目标：
- 给用户一个“接受当前结果并完成”的明确动作
- 避免只能通过取消任务或卡最大轮数来结束任务
- 完成后自然流入“最新结果 / 历史任务”

验收：
- [x] 后端提供显式 complete action（`POST /api/jobs/[id]/complete`）
- [x] 详情页控制区提供 `完成并归档` 动作（ConfirmDialog 防误触）
- [x] 仅允许在安全状态触发（`paused / manual_review / failed`；拒绝 `running/pending/cancelled`）

建议 work files:
- `src/lib/server/jobs.ts`
- `src/app/api/jobs/[id]/complete/route.ts`
- `src/components/job-detail-control-room.tsx`

### HOTFIX-2026-03-11-UI-TIGHTENING（WORKER / UI 统一化二次收口）✅

目标：
- 收口侧栏、详情页、设置页这三处仍然明显“重复 / 过长 / 失衡”的 UI
- 保持西瓜配色、单模型别名和现有后端语义不变
- 用已有轻量 i18n 把中英文文案切换继续做干净，不让中文界面混入英文标题

验收：
- [x] 左侧 `How to use` 缩成一条极短提示，不再保留旧长句
- [x] 详情页移除“原始任务摘要：”重复标签，并把 `单任务评分标准` 下沉为动作区后的紧凑折叠块
- [x] 设置页改成“顶部连接横条 + 下方默认模型 / 评分标准 / 运行策略”三段结构，去掉 `连接 / 默认模型` 重复标题
- [x] 首页 `成果总览 / 历史任务` 继续按并排等高思路收口，历史区域保持内部滚动
- [x] 本轮门禁再次通过：`npm run check`

建议 work files:
- `src/components/studio-frame.tsx`
- `src/components/job-detail-control-room.tsx`
- `src/components/settings-control-room.tsx`
- `src/styles/globals.css`
- `tests/control-room-layout.test.ts`

### HOTFIX-2026-03-12-SETTINGS-SELECT-AND-LOCAL-DB（WORKER / 设置页下拉统一 + 首屏动画收口 + 本地库恢复）✅

目标：
- 把设置页里仍然混用的原生下拉收口成统一交互
- 去掉“协议识别 / 接口协议”的重复表达
- 修复首页刷新时内容块滑入过强、像 bug 的入场动画
- 把本地开发环境切回用户真实使用过的 SQLite 库，恢复历史记录可见性

验收：
- [x] 设置页 `快速选择服务商 / 接口协议` 统一成同一套自定义下拉样式
- [x] 删除连接区重复的 `协议识别` 摘要卡，仅保留 `接口协议` 这一处可操作入口
- [x] 页面首屏与首页 lane 内容不再在刷新时做明显上移滑入
- [x] 本地 `3002` 已通过 `PROMPT_OPTIMIZER_DB_PATH` 指回 canonical repo 的数据库，历史任务重新可见
- [x] 本轮门禁再次通过：`npm run check`

建议 work files:
- `src/components/ui/select-field.tsx`
- `src/components/settings-control-room.tsx`
- `src/components/studio-frame.tsx`
- `src/components/dashboard-control-room.tsx`
- `src/styles/globals.css`
- `tests/control-room-layout.test.ts`
- `tests/studio-frame.test.ts`

### HOTFIX-2026-03-12-BEGINNER-FRIENDLY-MODEL-PICKER（WORKER / 模型选择器新手友好化）✅

目标：
- 把模型选择器从“像输入框的高级控件”收口成“默认先选、找不到再手输”的更直观交互
- 保持单模型别名 UX，不暴露 provider 内部路径
- 首页投递台、详情页、设置页三处体验统一

验收：
- [x] 闭合态改成标准选择器心智：按钮式触发器，不再默认露出搜索输入框
- [x] 打开后才显示搜索框与模型列表，并保留“可直接输入模型名”的兜底路径
- [x] 标签同步收口：`默认任务模型` / `任务模型`
- [x] 首页投递台、详情页、设置页三处浏览器 smoke 已通过
- [x] 本轮门禁再次通过：`npm run check`

建议 work files:
- `src/components/ui/model-alias-combobox.tsx`
- `src/components/settings-control-room.tsx`
- `src/components/job-detail-control-room.tsx`
- `src/components/dashboard-shell.tsx`
- `src/styles/globals.css`
- `tests/control-room-layout.test.ts`

### V0.2-05（WORKER / README 与开源发布页二次收口）⬜️

目标：
- 强化“自动、流水线式优化提示词，持续产出高质量完整 prompt”的核心定位
- 中英文内容切换逻辑一致
- 发布页与仓库首页的产品描述统一

验收：
- [ ] README 第一屏清楚表达自动优化流水线价值
- [ ] 中文/英文视图切换逻辑一致
- [ ] About / Release / Topics / screenshots 同步完成

建议 work files:
- `README.md`
- `docs/open-source-launch_ZH.md`
- `docs/open-source-launch_EN.md`

---

## 后续候选

### V0.2-01（PLANNER / eval-set 配置化设计定稿）🧊

目标：
- 保持当前已完成的 `rubric` 配置能力不动
- 单独为 `eval-set` 设计后续版本的配置路径
- 明确它只影响 reviewer，不直接透传给 optimizer

触发条件：
- `V0.2-05` 发布收口完成后再启动
- 用户确认重新打开评测链路扩展范围

说明：
- `rubric` 已完成，不再作为当前阻塞项
- `eval-set` 继续延期到后续版本

### V0.2-05A（WORKER / Release 资产与历史版本下载收口）🧊

目标：
- 保证每个 tag 版本都能在 GitHub Releases 中被下载
- 除源码外，再补一份自托管/Docker 使用资产
- 发布文案中明确“历史版本可下载”的路径

触发条件：
- `V0.2-02` 到 `V0.2-05` 基本完成后再启动

### V0.2-06（WORKER / 发布前最终巡检）🧊

目标：
- 统一做一次代码、文档、Docker、截图、License、发布文案巡检

触发条件：
- `V0.2-01` 到 `V0.2-05` 都完成后再启动

---

## 外部同步来源

- `/Volumes/1TB_No.1/Mac Mini/提示词优化流水线.md`
- 用户最近确认的产品方向：`rubric/eval-set 可配置`、`整体 UI 成熟化`、`手动完成任务`、`支持更多热门国内外模型/API`、`GitHub Releases 历史版本可下载`
