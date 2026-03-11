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

### V0.2-03（WORKER / UI 原语成熟化与设置页选择器升级）⬜️

目标：
- 不只优化模型选择器，而是系统性替换高交互风险的自研原语
- 保留当前西瓜配色和控制室结构
- 优先让设置页、首页、详情页的核心交互更成熟

验收：
- [ ] 模型字段改成真正的搜索下拉组件
- [ ] 首页控制板、历史展开、详情页折叠/确认/反馈有明确的成熟原语替换方案
- [ ] 不改西瓜配色，只优化交互、排版、滚动、反馈与一致性

建议 work files:
- `src/components/settings-control-room.tsx`
- `src/components/dashboard-control-room.tsx`
- `src/components/job-detail-control-room.tsx`

### V0.2-01（PLANNER / 评测策略配置化设计定稿）⬜️

目标：
- 允许用户配置 `rubric / eval-set`
- 默认仍然使用系统内置规则
- 明确“只影响新任务”的默认语义

验收：
- [ ] 设置页交互方案定稿：`系统默认 / 自定义`
- [ ] 确认 settings schema 与 prompt-pack versioning 变更点
- [ ] 明确 `eval-set` 对 reviewer 生效、对 optimizer 不直接透传的边界

建议 work files:
- `docs/plans/2026-03-11-evaluation-config-design.md`
- `src/lib/server/types.ts`
- `src/lib/server/prompt-pack.ts`

### V0.2-04（WORKER / 手动完成任务并归档）⬜️

目标：
- 给用户一个“接受当前结果并完成”的明确动作
- 避免只能通过取消任务或卡最大轮数来结束任务
- 完成后自然流入“最新结果 / 历史任务”

验收：
- [ ] 后端提供显式 complete action
- [ ] 详情页控制区提供 `完成并归档` 或等价动作
- [ ] 仅允许在安全状态触发（优先 `paused / manual_review`）

建议 work files:
- `src/lib/server/jobs.ts`
- `src/app/api/jobs/[id]/complete/route.ts`
- `src/components/job-detail-control-room.tsx`

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
