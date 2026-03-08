# Goal Anchor Drift Guard Implementation Plan

> **For Codex/Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a stable, editable goal anchor so optimization can stay professionally flexible without drifting away from the user’s core objective.

**Architecture:** Introduce a small `GoalAnchor` structure stored on each job. Generate a conservative initial anchor from the raw prompt, surface it in job detail for editing, and inject it into both optimizer and reviewer prompts, with reviewer treating goal fidelity as a hard gate.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node SQLite, node:test

---

### Task 1: Add Goal Anchor Model And Tests

**Files:**
- Create: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/goal-anchor.ts`
- Create: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/tests/goal-anchor.test.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/types.ts`

**Step 1: Write the failing test**

Add tests for:
- deriving an initial goal anchor from raw prompt
- normalizing edited goal anchors
- serializing and parsing stored goal anchors

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/goal-anchor.test.ts`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Add the helper module and types.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/goal-anchor.test.ts`
Expected: PASS

### Task 2: Persist Goal Anchor On Jobs

**Files:**
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/db.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/jobs.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/tests/task-controls.test.ts`

**Step 1: Write the failing test**

Add assertions for:
- new jobs get an initial goal anchor
- goal anchor can be updated
- list/detail reads return normalized goal anchor

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/task-controls.test.ts`
Expected: FAIL because jobs do not yet store goal anchor.

**Step 3: Write minimal implementation**

Add DB column(s), mapping, and update helper.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/task-controls.test.ts`
Expected: PASS

### Task 3: Inject Goal Anchor Into Optimizer And Reviewer

**Files:**
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/prompting.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/model-adapter.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/engine/optimization-cycle.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/lib/server/worker.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/tests/prompting.test.ts`

**Step 1: Write the failing test**

Add tests asserting:
- optimizer prompt includes goal anchor
- reviewer prompt includes goal anchor and hard-gate wording
- reviewer prompt still excludes historical aggregated issues

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/prompting.test.ts`
Expected: FAIL because prompts do not include goal anchor yet.

**Step 3: Write minimal implementation**

Thread goal anchor through worker seed and prompt builders.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/prompting.test.ts`
Expected: PASS

### Task 4: Add Goal Anchor Editor To Job Detail

**Files:**
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/components/job-detail-shell.tsx`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/app/api/jobs/[id]/route.ts`
- Modify: `/Volumes/1TB_No.1/Dev_Workspace/prompt-optimizer-studio/src/styles/globals.css`

**Step 1: Keep tests green**

Run: `npm test -- tests/goal-anchor.test.ts tests/task-controls.test.ts tests/prompting.test.ts`
Expected: PASS

**Step 2: Write minimal implementation**

Expose and save:
- goal
- deliverable
- driftGuard

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

### Task 5: Full Verification

**Files:**
- Modify: none unless verification fails

**Step 1: Run full verification**

Run: `npm run check`
Expected: `typecheck`, `test`, and `build` all pass.
