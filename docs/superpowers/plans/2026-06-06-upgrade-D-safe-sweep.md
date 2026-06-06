# Plan D — Safe Patch/Minor Dependency Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all low-risk patch/minor dependencies (react, react-dom, ws, @types/react, @types/node, cypress, tsx, turbo) to their latest within the current major, with one verification pass.

**Architecture:** Every update here stays within the existing major version, so the changes are non-breaking by semver contract. Most are within the declared `^` caret ranges and update via lockfile; `cypress` is pinned to an exact version and needs a manual edit. A single full-workspace verification (typecheck, tests, build, visual, e2e) confirms the sweep is clean. Independent of Plans A/B/C; runnable anytime.

**Tech Stack:** pnpm workspaces + Turborepo; the updated packages are build/test/runtime libraries already in use.

---

## Background for the implementer (read once)

Targets (current → latest-in-major, from `pnpm outdated -r` on 2026-06-06):

| Package | Current | Target | Declared in | Range style |
|---|---|---|---|---|
| `react` | 19.2.4 | 19.2.7 | `packages/client` | `^19` (caret) |
| `react-dom` | 19.2.4 | 19.2.7 | `packages/client` | `^19` (caret) |
| `@types/react` | 19.2.14 | 19.2.17 | `packages/client` | `^19` (caret) |
| `@types/node` | 25.5.0 | 25.9.2 | `packages/client`, `packages/server`(?), `tests` | `^25.5.0` (caret) |
| `tsx` | 4.21.0 | 4.22.4 | `packages/client`, `packages/server`, `tests` | `^4` (caret) |
| `turbo` | 2.8.17 | 2.9.16 | root | `^2.4` (caret) |
| `ws` | 8.20.0 | 8.21.0 | `packages/server` | `^8.20.0` (caret) |
| `cypress` | 15.14.2 | 15.16.0 | `tests` | **exact pin** |

Notes:
- All caret-ranged packages can advance via `pnpm update --latest` *within their major* — but to be deterministic and reviewable, this plan updates them by an explicit `pnpm update <pkg>@<major>` per package, which respects the major and refreshes the lockfile.
- **`cypress` is pinned exactly** (`"cypress": "15.14.2"`) — `pnpm update` will NOT move it. It needs a manual edit to `"15.16.0"`.
- This is devDependency-heavy; `react`/`react-dom`/`ws` are the only runtime deps, and only by patch/minor.
- Run from repo root. Work on a feature branch off `main` (not on `main`).

---

## File Structure (what this plan changes)

**Modify:**
- `packages/client/package.json` — bump resolved `react`, `react-dom`, `@types/react`, `@types/node`, `tsx` (caret unchanged; lockfile refreshes).
- `packages/server/package.json` — `ws`, `tsx`, `@types/node` (lockfile refreshes; caret unchanged).
- `tests/package.json` — `@types/node`, `tsx`; **`cypress` exact pin `15.14.2 → 15.16.0`**.
- `package.json` (root) — `turbo` (lockfile refreshes).
- `pnpm-lock.yaml` — regenerated.

---

## Task 1: Baseline and branch

**Files:** none (verification only).

- [ ] **Step 1: Be on a feature branch off main**

Run: `git rev-parse --abbrev-ref HEAD`
Expected: a feature branch. If `main`, run `git checkout -b chore/dep-safe-sweep`.

- [ ] **Step 2: Confirm a green baseline**

Run:
```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @rtc/client test:visual
```
Expected: typecheck clean; tests green; build ok; `Visual summary: 2/2 runner(s) passed.` If red, STOP and report — do not sweep on a red baseline.

---

## Task 2: Bump the caret-ranged packages

**Files:** `pnpm-lock.yaml` (+ no `package.json` edits needed for caret packages).

- [ ] **Step 1: Update the caret packages to latest-within-major**

Run from repo root:
```bash
pnpm update -r react@19 react-dom@19 @types/react@19 @types/node@25 tsx@4 turbo@2 ws@8
```
This advances each to the highest version satisfying its major across every workspace package, refreshing `pnpm-lock.yaml`. The `^` ranges in package.json are already compatible, so they need no edit.

- [ ] **Step 2: Verify the resolved versions moved**

Run:
```bash
pnpm --filter @rtc/client exec node -e "console.log('react', require('react/package.json').version); console.log('react-dom', require('react-dom/package.json').version)"
pnpm --filter @rtc/server exec node -e "console.log('ws', require('ws/package.json').version)"
pnpm exec turbo --version
```
Expected: react/react-dom `19.2.7`, ws `8.21.0`, turbo `2.9.16` (or the newest within-major at run time). Note any that did not move.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(deps): sweep patch/minor (react, react-dom, ws, types, tsx, turbo)"
```

---

## Task 3: Bump the exact-pinned cypress

**Files:** `tests/package.json`, `pnpm-lock.yaml`.

- [ ] **Step 1: Edit the exact pin**

In `tests/package.json`, change `"cypress": "15.14.2"` to `"cypress": "15.16.0"` (same major; non-breaking).

- [ ] **Step 2: Install**

Run:
```bash
pnpm install
pnpm --filter @rtc/tests exec cypress --version | head -1
```
Expected: Cypress `15.16.0`.

- [ ] **Step 3: Commit**

```bash
git add tests/package.json pnpm-lock.yaml
git commit -m "chore(deps): bump cypress 15.14.2 -> 15.16.0 (within major)"
```

---

## Task 4: Full verification and finish the branch

**Files:** none (verification only).

- [ ] **Step 1: Verify the workspace is still green**

Run:
```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @rtc/client test:visual
```
Expected: all green; `Visual summary: 2/2 runner(s) passed.` These are within-major updates; failures would be unexpected. If something breaks, triage the specific package (most likely a `@types/*` definition tightening surfaced by `pnpm typecheck`) and fix minimally.

- [ ] **Step 2: Run the e2e suite (cypress moved)**

Run:
```bash
pnpm --filter @rtc/tests test:e2e
```
Expected: passes. Cypress 15.14→15.16 is a patch/minor; the e2e harness behaviour should be unchanged. If a Cypress-specific failure appears, confirm it is not pre-existing flakiness (re-run once); a genuine Cypress regression within a minor is rare but if real, document it.

- [ ] **Step 3: Confirm clean tree and finish**

Run: `git status --porcelain` (expect clean).
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch.

---

## Self-review notes (for the implementer)

- **Spec coverage:** every package in the roadmap's "Plan D" row is updated — react, react-dom, ws, @types/react, @types/node, cypress, tsx, turbo (Tasks 2–3). The exact-pin caveat for cypress is handled separately (Task 3) so it is not silently skipped by `pnpm update`.
- **No placeholders:** exact commands and exact version strings throughout. Targets may have advanced slightly by run time; the `@<major>` constraint keeps every move within-major regardless.
- **YAGNI:** no major bumps here by design — those are Plans A/B/C.
