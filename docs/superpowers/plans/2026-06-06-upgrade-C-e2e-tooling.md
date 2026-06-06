# Plan C — E2E Test Tooling Upgrade (Cucumber 11→13, fake-timers 14→15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Discovery-driven, HIGHEST-RISK plan.** This touches the one package (`@rtc/tests`) with a documented, delicate cucumber-cypress / timer interaction. `@cucumber/cucumber` jumps **two** majors (11→13) and `@sinonjs/fake-timers` one (14→15). The exact breakage cannot be enumerated before running; this plan gives the exact bump, the full e2e gate set, the known breaking-change classes, and a strict before/after green requirement. Per-failure fixes are discovered during execution.

**Goal:** Move `@rtc/tests` to `@cucumber/cucumber` 13.x and `@sinonjs/fake-timers` 15.x with the entire e2e suite green before and after.

**Architecture:** Both packages live only in `tests/package.json`. The risk is concentrated in the BDD harness: Cucumber drives Playwright (`cucumber-js` via `NODE_OPTIONS='--import tsx/esm'`) and there is a separate presenter-level Cucumber path; `@sinonjs/fake-timers` controls virtual time in the presenter/timer tests. A known fragility (documented in repo memory and ADRs) is that Cucumber/Cypress retry logic can starve the app's own timers — so any change in Cucumber's run loop or fake-timers' clock semantics must be validated against the full suite, not a smoke test.

**Tech Stack:** @cucumber/cucumber 13, @sinonjs/fake-timers 15, Playwright 1.60, Cypress 15, quickpickle, tsx/esbuild, Vitest (presenter configs).

---

## Background for the implementer (read once)

`tests/package.json` relevant devDeps and scripts:

- Deps: `@cucumber/cucumber ^11.0.0`, `@sinonjs/fake-timers ^14.0.0`, `@types/sinonjs__fake-timers ^15.0.1` (note: the *types* are already on 15), `@badeball/cypress-cucumber-preprocessor 24.0.1`, `cypress 15.14.2`, `@playwright/test ^1.60.0`, `quickpickle ^1.11`, `esbuild 0.28.0`, `vitest ^3.2`, `tsx ^4.19.0`.
- Scripts that exercise the bumped tools:
  - `test:e2e` = `pnpm gates && tsx scripts/run-all.ts` (the aggregate; runs the parallel suites).
  - `test:browser:playwright` = `NODE_OPTIONS='--import tsx/esm' tsx scripts/with-server.ts cucumber-js` (Cucumber → Playwright).
  - `test:presenter:cucumber-fake` = `NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber-presenter-fake.js`.
  - `test:presenter:cucumber-real` = `… cucumber-js --config cucumber-presenter-real.js`.
  - `test:presenter:vitest-fake` / `vitest-plain` = `vitest run --config …` (these exercise fake-timers).
  - `typecheck` = `tsc --noEmit`.

**Known breaking-change classes to triage against:**

- **Cucumber 12 → 13 (the two-major jump):**
  1. **Node/ESM & config:** Cucumber 12 changed supported Node versions and ESM/config handling; the `cucumber-presenter-*.js` config files and the `NODE_OPTIONS='--import tsx/esm'` loader path may need adjustment. The `cucumber.js`/`*.config.js` format and the `default` profile options can change.
  2. **API removals:** deprecated step-definition / `World` / hook / formatter APIs removed across 12–13. Custom `World`, `setWorldConstructor`, `Before/After` hook signatures, and any custom formatter are the likely break sites.
  3. **Formatter / exit-code / message-protocol** changes that `scripts/run-all.ts` or `scripts/with-server.ts` may parse.
- **@sinonjs/fake-timers 14 → 15:**
  4. `install()` option defaults / `toFake` list changes, or `Date`/`performance` faking behaviour shifts that affect the presenter timer tests. The matching `@types/sinonjs__fake-timers` is already `^15`, so types and runtime will align after the bump.
- **Repo-specific fragility (do not regress):** Cucumber/Cypress `.should()` retry can starve the app's RxJS timers; the resolution relies on asserting timer-settled outcomes only after a yielding wait, and on in-queue assertions. A Cucumber run-loop change could perturb this — watch the timer-driven scenarios specifically.

Run from repo root. Work on a feature branch off `main` (not on `main`). Consult the Cucumber 12 and 13 release notes / migration guides (the `context7` MCP tool can fetch them: resolve `@cucumber/cucumber`, query "13 migration breaking changes"; likewise `@sinonjs/fake-timers` "15 changelog").

---

## File Structure (what this plan changes)

**Modify:**
- `tests/package.json` — `@cucumber/cucumber ^11 → ^13`, `@sinonjs/fake-timers ^14 → ^15`.
- `pnpm-lock.yaml` — regenerated.

**Possibly modify (discovered fallout):**
- `tests/cucumber-presenter-fake.js`, `tests/cucumber-presenter-real.js` (Cucumber config/profile format).
- `tests/scripts/with-server.ts`, `tests/scripts/run-all.ts` (if they parse Cucumber output/exit codes).
- Cucumber step definitions / `World` / hooks / custom formatters under `tests/` (API removals).
- Presenter timer tests / setup that call `@sinonjs/fake-timers` (`install` options).

---

## Task 1: Capture a trustworthy green baseline and branch

**Files:** none (verification only).

- [ ] **Step 1: Be on a feature branch off main**

Run: `git rev-parse --abbrev-ref HEAD` (expect a feature branch; if `main`, `git checkout -b chore/e2e-tooling-upgrade`).

- [ ] **Step 2: Record current versions**

Run:
```bash
pnpm --filter @rtc/tests exec cucumber-js --version
node -e "console.log('fake-timers', require('./tests/node_modules/@sinonjs/fake-timers/package.json').version)"
```
Expected: cucumber `11.x`, fake-timers `14.x`.

- [ ] **Step 3: Establish the e2e baseline (this is mandatory here, not optional)**

Run each, recording pass/fail and timing:
```bash
pnpm --filter @rtc/tests typecheck
pnpm --filter @rtc/tests test:e2e
pnpm --filter @rtc/tests test:presenter:cucumber-fake
pnpm --filter @rtc/tests test:presenter:cucumber-real
pnpm --filter @rtc/tests test:presenter:vitest-fake
pnpm --filter @rtc/tests test:presenter:vitest-plain
```
Expected: all pass. **You need this reference to distinguish upgrade regressions from pre-existing flakiness.** If any is already red or flaky at baseline, note exactly which, and treat only *newly* red scenarios as in-scope regressions in later tasks. If the baseline is broadly red, STOP and report — do not upgrade onto an unknown-state suite.

---

## Task 2: Bump fake-timers first (smaller blast radius), get its tests green

Doing the one-major fake-timers bump on its own isolates clock-semantics fallout from the larger Cucumber jump.

**Files:** `tests/package.json`, `pnpm-lock.yaml`; possibly presenter timer test/setup files.

- [ ] **Step 1: Edit the version**

In `tests/package.json`, change `"@sinonjs/fake-timers": "^14.0.0"` to `"@sinonjs/fake-timers": "^15.0.0"`. (`@types/sinonjs__fake-timers` is already `^15.0.1` — leave it.)

- [ ] **Step 2: Install and confirm**

Run:
```bash
pnpm install
node -e "console.log(require('./tests/node_modules/@sinonjs/fake-timers/package.json').version)"
```
Expected: `15.x`.

- [ ] **Step 3: Run the fake-timers-sensitive gates and triage**

Run:
```bash
pnpm --filter @rtc/tests typecheck
pnpm --filter @rtc/tests test:presenter:vitest-fake
pnpm --filter @rtc/tests test:presenter:cucumber-fake
```
Expected ideal: green. If a clock test fails, triage against breakage class 4: open the failing test/setup, check the `install({...})` options against the fake-timers 15 changelog (a default in `toFake`, `now`, or `shouldAdvanceTime` may have changed), and adjust the call to restore the intended virtual-time behaviour. Re-run until green.

- [ ] **Step 4: Commit**

```bash
git add tests/package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @sinonjs/fake-timers 14 -> 15 (e2e); fix clock fallout"
```

---

## Task 3: Bump Cucumber 11 → 13 and restore the BDD harness

**Files:** `tests/package.json`, `pnpm-lock.yaml`; possibly `cucumber-presenter-*.js`, `scripts/with-server.ts`, `scripts/run-all.ts`, step defs / `World` / hooks / formatters.

- [ ] **Step 1: Edit the version**

In `tests/package.json`, change `"@cucumber/cucumber": "^11.0.0"` to `"@cucumber/cucumber": "^13.0.0"`.

- [ ] **Step 2: Install and confirm**

Run:
```bash
pnpm install
pnpm --filter @rtc/tests exec cucumber-js --version
```
Expected: `13.x`. (Re-run `pnpm install` if a `@rollup/rollup-*`/optional-dep error appears.)

- [ ] **Step 3: Typecheck the package and triage API removals**

Run:
```bash
pnpm --filter @rtc/tests typecheck
```
Expected ideal: clean. Cucumber 12–13 removed deprecated APIs (breakage class 2). Errors will point at custom `World`, `setWorldConstructor`, hook signatures, or formatter imports. Fix each against the migration guide: update import paths/symbols and signatures to the 13.x API. Re-run until clean.

- [ ] **Step 4: Run the Cucumber-driven presenter configs and triage config/profile changes**

Run:
```bash
pnpm --filter @rtc/tests test:presenter:cucumber-fake
pnpm --filter @rtc/tests test:presenter:cucumber-real
```
Expected ideal: green. If Cucumber rejects `cucumber-presenter-fake.js` / `cucumber-presenter-real.js` (breakage class 1 — config/profile format or ESM/loader handling), update those config files to the 13.x format. The `NODE_OPTIONS='--import tsx/esm'` loader path is the most fragile part of the ESM story — if the loader is no longer honoured, consult the migration guide for the 13.x-supported ESM/transpilation hook. Re-run until green.

- [ ] **Step 5: Run the full Playwright-driven e2e suite and triage run-loop/output changes**

Run:
```bash
pnpm --filter @rtc/tests test:e2e
```
Expected: matches the Task 1 baseline. Triage classes:
- **Harness scripts** (`scripts/with-server.ts`, `scripts/run-all.ts`): if they parse Cucumber exit codes, formatter output, or the message protocol (breakage class 3), adapt them to 13.x.
- **Timer-driven scenarios** (the documented fragility): if a previously-green timer scenario flakes, check whether Cucumber 13's run loop changed the yield/retry timing; restore the intended settle (assert after a yielding wait; keep assertions in-queue). Do NOT paper over a real timer-starvation regression by inflating waits blindly — match the documented pattern.
Re-run until the suite matches the baseline (only previously-green scenarios must be green again).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(deps): bump @cucumber/cucumber 11 -> 13 (e2e); restore BDD harness"
```

---

## Task 4: Full verification and finish the branch

**Files:** none (verification only).

- [ ] **Step 1: Run the complete e2e + presenter matrix against the baseline**

Run:
```bash
pnpm --filter @rtc/tests typecheck
pnpm --filter @rtc/tests test:e2e
pnpm --filter @rtc/tests test:presenter:cucumber-fake
pnpm --filter @rtc/tests test:presenter:cucumber-real
pnpm --filter @rtc/tests test:presenter:vitest-fake
pnpm --filter @rtc/tests test:presenter:vitest-plain
```
Expected: every suite that was green in Task 1 Step 3 is green again. Compare scenario-by-scenario against the baseline notes; any newly-red scenario is an in-scope regression to fix before finishing.

- [ ] **Step 2: Confirm the rest of the workspace is unaffected**

Run:
```bash
pnpm typecheck
pnpm test
git status --porcelain
```
Expected: green (Plan C only touches `tests/`, so other packages should be untouched); clean tree.

- [ ] **Step 3: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch.

**Rollback stance:** if Cucumber 13 proves intractable within reasonable effort (e.g. a removed API with no clean 13.x equivalent, or an irreducible timer-starvation regression), the fake-timers 15 bump (Task 2) is independently valuable and already committed — keep it, revert ONLY the Cucumber change (`git revert` the Task 3 commit or reset `@cucumber/cucumber` to `^11` and `pnpm install`), document the Cucumber blocker as a finding, and finish with fake-timers landed. Do not leave the e2e suite red.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Plan C in the roadmap = `@cucumber/cucumber` 11→13 + `@sinonjs/fake-timers` 14→15 in `@rtc/tests`. Both are bumped (Tasks 2 and 3), each isolated so fallout is attributable. The spec's "full e2e green before and after" requirement is enforced by the mandatory baseline (Task 1 Step 3) and the scenario-by-scenario comparison (Task 4 Step 1). The documented timer fragility is called out as a specific triage target (Task 3 Step 5).
- **Discovery honesty:** no fabricated line-level fixes; instead, exact bump steps + the full gate set + a per-class breakage taxonomy + a hard rollback stance. This is the correct shape for a two-major bump into a fragile package.
- **Out of scope:** vite/vitest (Plan A), TypeScript 6 (Plan B), the safe sweep (Plan D), and `cypress`/`@badeball/cypress-cucumber-preprocessor`/`quickpickle` majors (not in this roadmap; cypress moves only by minor in Plan D).
