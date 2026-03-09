# Prompt Optimizer Studio Web Local Edition Design

## Summary

This document defines a future `Web Local Edition` for Prompt Optimizer Studio.

Goal:
- let users open a hosted web app and automatically receive frontend updates,
- while keeping task data in the user's own browser storage instead of on our server,
- without rewriting the current self-hosted product into an unstable hybrid.

Recommendation:
- keep the current repository release as the `Self-Hosted / Server Edition`,
- design `Web Local Edition` as a separate product shape that reuses prompt semantics and UI patterns,
- do not describe the current release as a browser-local hosted app, because that would be inaccurate.

## Current Reality

The current implementation is not a pure frontend app.

Current release characteristics:
- Next.js app with server routes
- local SQLite persistence via `node:sqlite`
- background worker loop for claiming and running jobs
- task state and optimization flow stored on the host machine that runs the app

Implication:
- if this current build is deployed to a remote server, data will live on that server instance,
- not in each user's browser local storage.

Therefore the current repo should be presented as:
- local-first
- self-hosted
- machine-local data persistence

Not as:
- hosted online edition with browser-local-only persistence

## Problem Statement

The product now has two valid but different distribution goals.

Goal A - current edition:
- self-hosted
- server-backed
- stable long-running worker behavior
- local SQLite on the machine running the app

Goal B - desired future edition:
- hosted web access
- frontend updates distributed to all users immediately
- user data remains in the browser
- no operator-managed backend persistence

Trying to merge both goals into one runtime too early would create product confusion and technical fragility.

## Options Considered

### Option 1 - Keep only the current self-hosted edition

Pros:
- lowest engineering risk
- matches current codebase truthfully
- easiest to open-source now

Cons:
- users do not receive updates automatically
- onboarding is heavier for non-technical users

### Option 2 - Recommended: keep current edition and plan a separate Web Local Edition

Pros:
- preserves current working architecture
- allows automatic update distribution for hosted users later
- keeps data-local story possible for the hosted edition
- avoids lying in README about current storage behavior

Cons:
- requires a second execution model
- requires schema migration and browser-storage work

### Option 3 - Convert the current app directly into a browser-local hosted app

Pros:
- single visible product line

Cons:
- highest engineering risk
- breaks the current worker and persistence model
- likely to create reliability regressions during transition
- harder to communicate clearly during open-source launch

## Recommendation

Choose Option 2.

Product naming:
- current release: `Prompt Optimizer Studio (Self-Hosted)`
- future release: `Prompt Optimizer Studio Web Local`

Communication rule:
- current README must describe only the self-hosted edition as shipped today
- future browser-local hosted edition should be described as planned work, not present reality

## Product Principles For Web Local Edition

The future hosted browser-local edition should preserve the same core product rules:
- final full prompt remains the main artifact
- optimizer and reviewer keep their current separation
- reviewer still does not see historical aggregated issue lists
- optimizer still receives slim patch + current prompt + optional next-round steering
- provider internal routes must not be exposed to users
- next-round steering remains a one-shot next-round instruction, not a permanent hidden rule

## Architecture Direction

### Runtime Model

Web Local Edition should be a hosted frontend that executes task orchestration in the browser.

Recommended pieces:
- hosted static frontend bundle
- IndexedDB for jobs, candidates, settings, and local metadata
- browser-side task engine
- Web Worker for long-running optimization loops where possible
- import/export for backup and device transfer

### Storage Model

Data should live in the browser, not on our server.

Recommended browser-stored data:
- settings
- model aliases
- tasks and task metadata
- candidates and reviewer results
- goal anchors and next-round steering
- version metadata for migrations

Important constraint:
- browser-local storage means no built-in cross-device sync
- if users switch devices or clear browser data, data can be lost unless exported first

### Update Model

Hosted frontend code can be updated centrally.

Behavior:
- user opens the hosted app
- browser loads the latest frontend bundle
- app compares local schema version with expected schema version
- app runs migration or shows a blocking upgrade prompt if needed

Result:
- application updates can reach all users
- local user data can remain in-browser if migrations are handled correctly

## Major Technical Gaps To Solve

### 1. Replace server persistence

Current server-side SQLite logic cannot be reused as-is.

Need:
- IndexedDB repository layer
- browser-safe job querying and mutation layer
- local migration framework

### 2. Replace server worker semantics

Current background worker assumes a server process.

Need:
- browser-side job runner
- pause/resume-safe loop lifecycle
- resilience against tab suspension and page reloads

### 3. Handle browser lifecycle constraints

A browser is not a server.

Need to define:
- what happens if the tab is closed
- what happens if the browser throttles background tabs
- how to resume interrupted work after reopening

### 4. Provider compatibility in browsers

Some OpenAI-compatible endpoints will fail from browsers due to CORS or auth constraints.

Need:
- explicit compatibility guidance
- graceful connection tests
- clear error messages that distinguish endpoint incompatibility from model errors

### 5. Local secret handling

In browser-local mode, API keys are stored client-side.

Need:
- explicit user-facing warning about client-side key storage
- clear docs on trusted usage patterns
- optional session-only storage mode if we later decide to support it

## UX Implications

### Current Self-Hosted README messaging

Must say:
- this repo ships a self-hosted edition today
- data is stored on the machine running the app
- if deployed to a remote server, data lives on that deployment environment

Must not say:
- data only lives in each user browser for the current release
- official hosted browser-local edition already exists

### Future Web Local UX requirements

The hosted browser-local edition should add:
- import/export entry points
- local storage status visibility
- update available / migration required state
- API key storage explanation
- browser-compatibility help text

## Migration Strategy

Do not migrate the current app in place first.

Recommended sequence:
1. keep the current self-hosted release stable
2. document the future Web Local Edition separately
3. extract shared prompt and presentation semantics where sensible
4. build browser-local repositories and a browser task runner behind a separate runtime boundary
5. test update migration with real stored browser data before any hosted launch

## Risks

Key risks for Web Local Edition:
- browser tab suspension interrupts runs
- endpoint CORS issues make some providers unusable from browsers
- local migrations can corrupt data if versioning is weak
- users may wrongly assume browser-local means cross-device sync
- client-side API key storage can be unacceptable for some users

## Non-Goals For This Phase

Not part of this design phase:
- implementing Web Local Edition now
- replacing the current self-hosted release
- promising an official hosted URL already exists
- changing current optimizer/reviewer prompt semantics

## Documentation Actions

Immediate documentation changes recommended now:
- update `README.md` to describe the current release truthfully as self-hosted / machine-local
- mention `Web Local Edition` as a future direction, not as a shipping feature
- keep database-path documentation for the current edition

## Decision

Approved direction:
- keep the current release positioned as self-hosted
- document a future hosted browser-local edition separately
- avoid misleading hosted/local claims in current public docs
