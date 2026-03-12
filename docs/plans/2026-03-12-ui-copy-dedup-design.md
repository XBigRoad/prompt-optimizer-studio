# UI Copy Dedup Implementation Plan

> **For Codex/Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Remove repeated section/page naming so the control room reads with one clear title per surface instead of tab-name, eyebrow, and heading repeating the same words.

**Architecture:** Keep the existing component structure and watermelon design system, but tighten copy hierarchy. The change is mostly presentational: remove duplicate headings, keep only semantically distinct eyebrow labels, and lock the new rules with SSR layout tests.

**Tech Stack:** Next.js 16, React 19, TypeScript, SSR layout tests with `node --import tsx --test`

---

### Task 1: Lock the dedup rules in layout tests

**Files:**
- Modify: `tests/control-room-layout.test.ts`

**Step 1: Write the failing assertions for sidebar and dashboard dedup**
Add assertions that verify:
- Sidebar still renders `Prompt Optimizer`
- Sidebar no longer repeats the current page name in the brand block
- Dashboard lane content for `待你处理 / 自动运行中 / 成果总览 / 排队中` does not repeat the exact label as both eyebrow and heading in the same rendered lane

**Step 2: Run the focused test file to confirm failure**
Run:
```bash
cd /Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening
node --import tsx --test tests/control-room-layout.test.ts
```
Expected: FAIL on the new duplicate-copy assertions.

**Step 3: Commit the red test checkpoint**
```bash
git add tests/control-room-layout.test.ts
git commit -m "test(ui): lock title dedup behavior"
```

### Task 2: Dedup sidebar and dashboard lane headings

**Files:**
- Modify: `src/components/studio-frame.tsx`
- Modify: `src/components/dashboard-control-room.tsx`
- Modify: `src/styles/globals.css`

**Step 1: Sidebar brand block**
Update `src/components/studio-frame.tsx` so the sidebar brand block shows only `Prompt Optimizer` and no longer repeats the current page title.

**Step 2: Dashboard lane heading policy**
Update `src/components/dashboard-control-room.tsx` so:
- The page hero keeps one page-level title (`任务控制室`)
- Each lane content block no longer repeats the tab label as both eyebrow and large heading
- Lane content should keep the description text, and if a label is still needed, keep only one textual title per lane block
- History panel follows the same rule

**Step 3: CSS cleanup**
Update `src/styles/globals.css` only as needed to preserve spacing/alignment after removing duplicated heading layers.

**Step 4: Re-run the focused test file**
Run:
```bash
node --import tsx --test tests/control-room-layout.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/studio-frame.tsx src/components/dashboard-control-room.tsx src/styles/globals.css tests/control-room-layout.test.ts
git commit -m "refactor(ui): remove repeated sidebar and lane titles"
```

### Task 3: Dedup settings and job detail section naming

**Files:**
- Modify: `src/components/settings-control-room.tsx`
- Modify: `src/components/job-detail-control-room.tsx`
- Modify: `tests/control-room-layout.test.ts`

**Step 1: Write the failing assertions for settings/detail naming**
Extend `tests/control-room-layout.test.ts` to assert:
- Settings hero does not render `配置台` as both eyebrow and main heading
- Settings connection block does not pair a near-synonym eyebrow and title that restate the same thing too closely
- Job detail sections keep semantically distinct eyebrow/title pairs only where the eyebrow adds meaning instead of repeating the heading

**Step 2: Run the focused test file to confirm failure**
Run:
```bash
node --import tsx --test tests/control-room-layout.test.ts
```
Expected: FAIL on the new settings/detail duplicate-copy assertions.

**Step 3: Implement dedup in settings page**
Update `src/components/settings-control-room.tsx` so:
- Hero keeps `配置台` as the main title and a distinct eyebrow such as `连接与策略`
- Connection/default model/scoring/runtime sections each use one clear primary title; eyebrows stay only if they add distinct grouping context
- Remove any remaining same-meaning repetition

**Step 4: Implement dedup in detail page**
Update `src/components/job-detail-control-room.tsx` so:
- Keep the job title as the page headline
- Only retain eyebrow labels that communicate a different layer, not the same wording as the section heading
- Remove duplicated naming in result, goal, control, and diagnostics sections where the eyebrow restates the heading

**Step 5: Re-run the focused test file**
Run:
```bash
node --import tsx --test tests/control-room-layout.test.ts
```
Expected: PASS.

**Step 6: Commit**
```bash
git add src/components/settings-control-room.tsx src/components/job-detail-control-room.tsx tests/control-room-layout.test.ts
git commit -m "refactor(ui): remove repeated page and section labels"
```

### Task 4: Final verification

**Files:**
- No additional file changes required unless verification exposes issues

**Step 1: Run the full project gate**
Run:
```bash
cd /Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/.worktrees/open-source-hardening
npm run check
```
Expected: PASS.

**Step 2: Manual smoke in browser**
Check on `http://127.0.0.1:3002`:
- Sidebar no longer repeats page names
- Dashboard lanes no longer show the same name twice
- Settings page hero/sections read with one clear title per block
- Detail page sections feel lighter without losing orientation

**Step 3: Commit any verification-driven tweaks**
If verification required no extra edits, do not create an extra commit. If small fixes were needed, make one final commit with a focused message.
