# README Emoji Refresh Implementation Plan

> **For Codex/Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a more expressive emoji layer to the public README files without changing product meaning or making the homepage feel noisy.

**Architecture:** Keep all existing runtime-aligned content intact, then add emojis only at strong visual anchors: section titles, navigation links, and key summary bullets. Avoid inserting emojis into dense explanatory paragraphs where they would reduce readability.

**Tech Stack:** Markdown, Git, GitHub repository homepage rendering

---

### Task 1: Refresh the Chinese README visual anchors

**Files:**
- Modify: `README.md`

**Step 1: Update the hero support copy**

Add emoji markers to the short "what you get" bullets and the top navigation labels.

**Step 2: Update section headings**

Add visible but restrained emoji prefixes to major Chinese section headings such as:

- `三句话先看懂`
- `你可以用它做什么`
- `工作流程`
- `一轮怎么跑`
- `当前停止规则`
- `人工引导与长期规则`
- `页面截图`
- `开始使用`
- `项目文档`
- `快速开始`
- `配置方式`
- `Provider 与兼容性`
- `发布形态`
- `常见问题`
- `贡献与许可证`

**Step 3: Keep explanatory prose unchanged**

Do not rewrite product semantics while adding emojis.

### Task 2: Refresh the English README visual anchors

**Files:**
- Modify: `README_EN.md`

**Step 1: Mirror the same hierarchy**

Add matching emoji anchors to the English navigation labels and major section headings.

**Step 2: Add emoji to key summary bullets**

Keep the content aligned with the Chinese README while making the page easier to scan.

**Step 3: Preserve the runtime-aligned wording**

Do not regress the round semantics, stop rule, steering, or provider wording.

### Task 3: Verify and publish

**Files:**
- Modify: `README.md`
- Modify: `README_EN.md`

**Step 1: Run formatting verification**

Run:

```bash
git diff --check
```

Expected: no whitespace or conflict-marker issues.

**Step 2: Check the exact diff**

Run:

```bash
git diff -- README.md README_EN.md docs/plans/2026-03-22-readme-emoji-refresh-plan.md
```

Expected: emoji-focused README changes only.

**Step 3: Commit and push**

Run:

```bash
git add README.md README_EN.md docs/plans/2026-03-22-readme-emoji-refresh-plan.md
git commit -m "📃 docs(readme): 增强首页视觉节奏"
git push origin HEAD
git push origin HEAD:main
```

Expected: hotfix branch and `main` both include the refreshed homepage README.
