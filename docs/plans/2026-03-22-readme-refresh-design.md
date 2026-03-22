# V0.1.7 README Refresh Design

## Goal

Refresh the repository homepage README so it is easier to scan, more honest about what the product does, and visually aligned with the current V0.1.7 UI.

## Scope

- Rewrite README.md and README_EN.md hero/introduction sections.
- Rebalance the section order so value, workflow, and screenshots are easier to scan.
- Keep claims grounded in public behavior.
- Re-capture the three README screenshots from the current self-hosted demo instance.

## Non-goals

- No product semantics change.
- No UI redesign beyond refreshed screenshots.
- No claim of authoritative compare winner.
- No SaaS-style overstatement.

## Chosen approach

### A. Copy-only refresh
Fast, but leaves screenshots stale.

### B. Copy refresh + screenshot refresh (**chosen**)
Keeps text and imagery aligned with the current public candidate without changing product behavior.

### C. Large README rewrite
Potentially stronger marketing-wise, but too easy to become bloated or overstated.

## Content decisions

- Lead with a plain-language summary: draft prompt in, multi-round optimization, human steering available, full prompt out.
- Add a concise “what it is / what it is not” framing.
- Keep the workflow diagram.
- Keep quick-start and configuration sections, but make the top of the README easier to skim.
- Preserve bilingual parity between README.md and README_EN.md.

## Screenshot decisions

- Use the seeded local demo DB for consistency.
- Capture current dashboard, job detail, and settings screens.
- Replace the PNG assets in `docs/screenshots/` and refresh the manifest.

## Verification

- Confirm README links and screenshot paths remain valid.
- Confirm screenshot assets exist and are updated.
- Run `git diff --check` after edits.
