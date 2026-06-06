# Plan B — TypeScript 5 → 6 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Discovery-driven plan.** TypeScript 6 is a major release; the exact type errors it surfaces in *this* codebase cannot be enumerated before running the compiler. This plan gives concrete bump steps, the exact verification gates, the known classes of TS6 breakage, and a triage method. The per-error fixes are discovered during execution — that is expected and correct for a compiler major.

**Goal:** Move the workspace from TypeScript 5.9 to 6.x, keeping every package's `tsc` typecheck and the client's type-emit build green.

**Architecture:** `typescript` is declared only at the repo root (`^5.8`) and in `tests` (`^5.8`); all other packages invoke `tsc` against the hoisted compiler. Bumping those two declarations to `^6` moves the compiler everywhere. The work is: bump → run the full typecheck surface → triage TS6 errors (updated `lib.d.ts`, removed deprecated options, stricter checks) → confirm build and tests still pass. Independent of Plans A/C/D, but recommended after Plan A so the toolchain churn doesn't compound.

**Tech Stack:** TypeScript 6, pnpm workspaces + Turborepo, project-references via `tsconfig.base.json`.

---

## Background for the implementer (read once)

- `typescript` declarations: root `package.json` (`"typescript": "^5.8"`) and `tests/package.json` (`"typescript": "^5.8"`). No other package declares it (verified via the dependency report). The latest is **6.0.3** (`npm view typescript version`).
- Typecheck surface (`pnpm typecheck` = `turbo run typecheck`):
  - `@rtc/domain`, `@rtc/shared`, `@rtc/server`: `tsc --noEmit`.
  - `@rtc/client`: `tsc --noEmit && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.visual.json` (three programs).
  - `@rtc/tests`: `tsc --noEmit`.
- Build that uses `tsc` for emit: `@rtc/client` `build` = `vite build && tsc -p tsconfig.types.json --noCheck`, and root `build-types`/`build` paths. (`--noCheck` emits without type-checking, so the type gate is `pnpm typecheck`, not build.)
- Unit tests (`vitest`) transform TS via esbuild/swc, **not** `tsc`, so they are largely insensitive to the TS *version* except where types are asserted. Still run them as a gate.
- Shared config: `tsconfig.base.json` at the repo root; each package extends it.
- **Known TS6 breakage classes** to expect (triage against these):
  1. **Updated `lib.*.d.ts`** — DOM/ES library types tightened or changed signatures (e.g. stricter `Iterator`, `Array`/`Object` method types). Surfaces as new errors in code that relied on looser types.
  2. **Removed long-deprecated compiler options / flag behaviour** — a `compilerOptions` key in `tsconfig.base.json` or a package tsconfig may now be invalid or have a changed default.
  3. **Stricter inference / narrowing** in a few spots that previously type-checked.
- Run from repo root. Work on a feature branch off `main` (not on `main`). Consult the official TypeScript 6.0 release notes / migration guide for exact changes (the `context7` MCP tool can fetch current TypeScript docs: resolve `typescript`, then query "6.0 breaking changes").

---

## File Structure (what this plan changes)

**Modify:**
- `package.json` (root) — `typescript ^5.8 → ^6`.
- `tests/package.json` — `typescript ^5.8 → ^6`.
- `pnpm-lock.yaml` — regenerated.

**Possibly modify (discovered fallout):**
- `tsconfig.base.json` and/or per-package `tsconfig*.json` (removed/renamed options).
- Source/test files that TS6's stricter `lib`/inference flags as errors.

---

## Task 1: Baseline and branch

**Files:** none (verification only).

- [ ] **Step 1: Be on a feature branch off main**

Run: `git rev-parse --abbrev-ref HEAD` (expect a feature branch; if `main`, `git checkout -b chore/typescript-6`).

- [ ] **Step 2: Record the current compiler version and confirm green baseline**

Run:
```bash
pnpm exec tsc --version
pnpm typecheck
pnpm test
pnpm build
```
Expected: `Version 5.9.x`; typecheck clean; tests green; build ok. If red, STOP and report.

- [ ] **Step 3: Confirm no other package secretly declares typescript**

Run:
```bash
grep -RIn '"typescript"' package.json tests/package.json packages/*/package.json
```
Expected: matches ONLY in root `package.json` and `tests/package.json`. If any `packages/*` declares it too, add that file to the bump in Task 2 Step 1 and note it.

---

## Task 2: Bump TypeScript and run the typecheck gate

**Files:** `package.json`, `tests/package.json`, `pnpm-lock.yaml`; possibly `tsconfig*.json` and flagged source files.

- [ ] **Step 1: Edit the declarations**

Set `"typescript": "^6"` in both `package.json` (root) and `tests/package.json` (plus any extra package found in Task 1 Step 3).

- [ ] **Step 2: Install and confirm the compiler moved**

Run:
```bash
pnpm install
pnpm exec tsc --version
```
Expected: `Version 6.0.x`. (If install errors on a missing optional dep, re-run `pnpm install`.)

- [ ] **Step 3: Run the full typecheck surface and triage**

Run:
```bash
pnpm typecheck
```
Expected ideal: clean. For each error TS6 surfaces, triage against the known breakage classes:
- If a **`compilerOptions` key is rejected** (removed/renamed): open `tsconfig.base.json` (or the named package tsconfig) and update/remove the option per the TS6 release notes. Re-run.
- If a **`lib.d.ts` type tightened** (a call that no longer matches): adjust the call site to the corrected type, or add the minimal, correct type annotation. Do NOT silence with `any`/`@ts-ignore` unless there is genuinely no correct typing and you document why.
- If **stricter narrowing/inference** flags a real latent bug, fix the bug; if it is a false positive of a known TS6 change, apply the minimal correct annotation.

Re-run `pnpm typecheck` until clean. If errors are numerous, fix them package-by-package (run a single program, e.g. `pnpm --filter @rtc/client exec tsc --noEmit`) to keep the work reviewable.

- [ ] **Step 4: Confirm the build still emits**

Run:
```bash
pnpm build
```
Expected: succeeds (client emits types via `tsc -p tsconfig.types.json --noCheck`; `--noCheck` means the type gate is Step 3, but a removed/renamed option could still break emit config — fix the same way).

- [ ] **Step 5: Run the unit tests**

Run:
```bash
pnpm test
```
Expected: green (vitest transforms via esbuild, so most tests are version-insensitive; failures would indicate a type-level test or a genuine behavioural assumption — triage normally).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(deps): upgrade TypeScript to 6.x; fix surfaced type errors"
```

---

## Task 3: e2e typecheck + full verification + finish the branch

**Files:** none expected (verification only).

- [ ] **Step 1: Typecheck the e2e package explicitly**

Run:
```bash
pnpm --filter @rtc/tests typecheck
```
Expected: clean (the `tests` package has heavy Playwright/Cucumber typings; TS6 is most likely to surface library-type changes here). Triage any error as in Task 2 Step 3.

- [ ] **Step 2: Run the e2e suite to confirm nothing type-adjacent broke at runtime**

Run:
```bash
pnpm --filter @rtc/tests test:e2e
```
Expected: passes (TS version rarely affects runtime, since execution is via `tsx`/esbuild; this is a safety gate). Distinguish a real regression from pre-existing flakiness by re-running once.

- [ ] **Step 3: Full verification and clean tree**

Run:
```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @rtc/client test:visual
git status --porcelain
```
Expected: all green; `Visual summary: 2/2 runner(s) passed.`; clean tree.

- [ ] **Step 4: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch.

If TS6 surfaces a class of errors that is too large to resolve in reasonable effort (e.g. a sweeping `lib` change touching dozens of files), STOP and report — that is a signal to either scope a focused follow-up or defer TS6, rather than mass-suppressing with `any`.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Plan B in the roadmap = `typescript` major, cross-cutting (root + tests). Task 2 bumps both declarations; Task 1 Step 3 guards against a hidden third declaration. Every typecheck program in the workspace is exercised (Task 2 Step 3 runs `pnpm typecheck` which fans out to all; Task 3 Step 1 isolates the e2e package).
- **Discovery honesty:** the plan does not fabricate specific line fixes (impossible before running TS6); it provides the exact gates, the known TS6 breakage taxonomy, a per-class triage rule, and a "stop if it explodes" guard. The bump steps and commands are exact.
- **Out of scope:** vite/vitest (Plan A), cucumber/fake-timers (Plan C), the safe sweep (Plan D).
