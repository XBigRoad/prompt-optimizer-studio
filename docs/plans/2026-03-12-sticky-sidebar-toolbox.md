# Sticky Sidebar Toolbox Implementation Plan

> **For Codex/Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 把当前过重的左侧栏收成一个更轻、更紧凑、滚动时始终可用的顶部工具盒，同时把正文观感拉回更舒展的状态。

**Architecture:** 保留左侧独立全局工具区，但把现有整块侧栏改成单一 `sidebar-toolbox` 卡片：品牌、导航、语言都收进这一个紧凑模块。正文布局不改语义，只通过缩窄 rail、移除多余包裹和统一节奏来恢复更好的版心与首屏阅读感。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + CSS modules via `globals.css` + SSR layout tests

---

### Task 1: 锁住紧凑工具盒与 sticky 行为

**Files:**
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/tests/studio-frame.test.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/tests/control-room-layout.test.ts`

**Step 1: 写失败测试**
- 断言 `StudioFrame` 渲染 `data-ui="sidebar-toolbox"`
- 断言不再出现分散的 sidebar section 结构标记
- 断言 CSS 中 rail 变窄，且 `sidebar-toolbox` 为 `position: sticky`

**Step 2: 跑测试确认失败**
- Run: `node --import tsx --test tests/studio-frame.test.ts tests/control-room-layout.test.ts`

**Step 3: 记录目标**
- rail 更窄
- toolbox 单卡片
- sticky 跟随滚动

### Task 2: 实现紧凑工具盒与更舒展的正文版心

**Files:**
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/components/studio-frame.tsx`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening/src/styles/globals.css`

**Step 1: 改 `StudioFrame` 结构**
- 将品牌、导航、语言收进单一 `sidebar-toolbox`
- 保留左侧独立工具区，但移除多余 section 分层
- 为关键节点补 `data-ui` 标记，方便测试

**Step 2: 改侧栏与正文 CSS**
- 缩窄 rail 宽度
- 让 `sidebar-toolbox` sticky
- 压缩品牌与语言切换高度
- 减轻边框/背景重量，让正文更显主角

**Step 3: 保持移动端可用**
- 小屏仍按现有单列策略下沉
- 不破坏语言切换和导航点击区

### Task 3: 验证与人工回看

**Files:**
- No code changes required unless regression found

**Step 1: 跑定向测试**
- Run: `node --import tsx --test tests/studio-frame.test.ts tests/control-room-layout.test.ts`

**Step 2: 跑全量门禁**
- Run: `npm run check`

**Step 3: 浏览器回看**
- 首页 `/`
- 配置页 `/settings`
- 确认左侧工具盒在滚动时始终可用

