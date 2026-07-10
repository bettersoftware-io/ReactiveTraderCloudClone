# Atomic Test-ID Renames — Implementation Plan

> **⚠️ MERGED AS PLAN, NOT EXECUTED.** This file is merged to record an
> approved, ready-to-run plan. **No code has changed.** A future SDD session
> executes it task-by-task. This mirrors the plan-now / execute-later
> convention used by power-saver mode and feature flags. Do not treat any
> checkbox here as done until a session actually runs the task and its
> verification passes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make test-ID renames atomic. Move the `TESTIDS` registry out of
`tests/` into a new zero-dep `@rtc/testids` package, replace every hardcoded
`data-testid`/`testID` literal in `@rtc/client-react` and
`@rtc/client-react-native` with a registry reference, then widen grep gate 1 to
police the client `src` trees so a raw literal fails CI at the definition site.

**Architecture:** New leaf package `@rtc/testids` (pure, imports nothing) is a
production `dependency` of both shipping clients and of `tests`. Components call
the registry's string constants and ID-builder functions at render time (which
is why it must be a runtime dependency, not a devDependency). Gate 1's scope is
extended **last**, only after zero literals remain, so CI is green at every
step. Full rationale, options analysis, and the re-derived scope counts live in
the design spec — read it first.

**Tech Stack:** TypeScript, pnpm workspaces + Turborepo, `tsx` grep gates,
React 19 (web) / Expo RN 0.86 (mobile), Vitest, Playwright, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-07-10-atomic-testid-renames-design.md` —
read it before any task; its §3 (registry-relocation decision), §4 (dynamic-ID
strategy), and §1.1 (re-derived scope) are the contract.

## Global Constraints

- Follow the `shipping-repo-changes` skill: isolate in a git worktree BEFORE
  touching files (local `main` auto-pushes); open a PR; merge only on green CI
  + user OK. Never edit the primary checkout directly.
- **Re-derive every count with fresh greps at execution time.** The spec's
  numbers were true on 2026-07-10 and drift as the UI changes. The acceptance
  signal is **zero remaining raw literals**, not any specific number.
- **No test-ID value may change.** This is move-and-reference only; rendered
  attribute strings must be byte-identical before/after. The registry already
  encodes the exact strings — copy it verbatim.
- **Registry is framework-neutral:** web (`data-testid`) and RN (`testID`)
  import the *same* `TESTIDS` object and builders. Do not fork it.
- **Keep gate 1 green throughout.** The `tests/`-side registry re-export
  (Task 2) must preserve the existing import path so no test file breaks; the
  gate-1 scope widening is the LAST task (Task 8).
- **Biome `useBlockStatements`:** braces on all control statements. Run
  `pnpm exec biome ci <touched files>` before finishing each task.
- **Full lint gauntlet per task that touches code:**
  `pnpm check && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css &&
  pnpm typecheck`. Run `pnpm check:doc-links` after any `.md` edit.
- **Violation probes are mandatory** for the gate change (Task 8): show the
  gate FAIL on a deliberate temp literal, revert, show PASS; record both
  outputs (enforcement-gap-closure spec §3.1).
- **Commit-message style:** `feat(testids): …` / `refactor(testids): …` /
  `docs: …` with the repo's standard trailers (copy the exact trailer block
  from `git log -1`).
- **Do not regenerate visual goldens.** Test IDs are not rendered pixels; a
  golden diff is a red flag to investigate, never to bless (spec §7).

---

### Task 1: Scaffold the `@rtc/testids` package

**Files:**
- Create: `packages/testids/package.json`
- Create: `packages/testids/tsconfig.json`
- Create: `packages/testids/src/index.ts` (empty stub: `export {};` for now)
- Create: `packages/testids/README.md`

**Interfaces:**
- Consumes: nothing (pure leaf — this is the whole point of the design).
- Produces: an installable `@rtc/testids` workspace package. Later tasks fill
  `src/index.ts` with the registry.

**Gate-wiring checklist (from `docs/architecture/16-trailheads.md` §"Add a
package", recipe 5 — do each, in this order):**

- [ ] **Step 1: `package.json`.** Model it on `packages/shared/package.json`
  (a tsc-built leaf that ships `dist/`). It MUST include a `typecheck` script
  and a `test` (or `test:*`) script — both are required by
  `scripts/check-workspace-scripts.mjs` (`pnpm check:scripts`), which reads the
  `packages/*` glob from `pnpm-workspace.yaml`. Minimum shape:

```jsonc
{
  "name": "@rtc/testids",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```
  Match the exact `build`/`clean` idiom the other tsc-built packages use —
  open `packages/shared/package.json` and `packages/ws-effects/package.json`
  and copy their script bodies verbatim (they may use `tsc --build && tsc-alias`
  if they rely on `#/` path aliases; `@rtc/testids` has no internal imports, so
  plain `tsc --build` suffices — confirm by checking whether `shared` runs
  `tsc-alias`). If any dependency is declared later, the `rxjs`-only /
  single-dep constraints do NOT apply here (testids is not in the domain
  lineage) — but it should declare **no** runtime deps at all.

- [ ] **Step 2: `tsconfig.json`.** Extend `../../tsconfig.base.json`, mirroring
  `packages/ws-effects/tsconfig.json` (`compilerOptions.outDir: "dist"`,
  `include: ["src"]`). No root references list to update.

- [ ] **Step 3: `src/index.ts`.** Stub `export {};` for now; Task 2 fills it.

- [ ] **Step 4: `README.md`.** Use the identity-card template from
  `docs/architecture/16-trailheads.md` Global Constraints. State explicitly (per
  spec §3 Option A′): "This is a production `dependency` of both clients even
  though it is test-marker infrastructure, because components call its
  ID-builder functions at render time; it carries zero runtime deps and adds no
  bundle weight beyond a frozen string map." Note it is a pure leaf importing
  nothing.

- [ ] **Step 5: ESLint / stylelint / Biome / knip.** Confirm NO edit is needed
  (standard `src/**/*.ts` layout is covered by the repo-wide globs and
  `tsconfig.eslint.json`'s `packages/*/src/**/*.ts` include). Do NOT add a
  `knip.json` entry yet — decide in Step 7 by running knip.

- [ ] **Step 6: dependency-cruiser (optional hardening).** Add a leaf-boundary
  rule to `.dependency-cruiser.cjs` forbidding `^packages/testids/src` from
  importing any other `^packages/` path, following the existing rule style
  (name, `severity: "error"`, comment, `from`/`to` regexes). This is optional;
  if added, it must be violation-probed in Task 8's style (temp import →
  observe fail → revert). If the probe is awkward, skip the rule and note the
  leaf boundary as structural in the README.

- [ ] **Step 7: Verify (recipe 5 change-impact order).** From repo root:
  `pnpm install` → `pnpm build` → `pnpm typecheck` → `pnpm test` →
  `pnpm lint:dead` (add a `knip.json` entry ONLY if this reports false-positive
  unused exports) → `pnpm check:scripts` → `pnpm check:deps` →
  `pnpm check:versions`. All must pass. Record `check:scripts` output (it is the
  gate that proves the new package satisfies the workspace-script policy).

---

### Task 2: Move the registry into `@rtc/testids`; re-export from `tests/`

**Files:**
- Modify: `packages/testids/src/index.ts` (paste the registry)
- Modify: `tests/browser/page-objects/contracts/testids.ts` (becomes a
  re-export)

**Interfaces:**
- Consumes: `@rtc/testids` (from Task 1).
- Produces: `export const TESTIDS` from `@rtc/testids`, and an unchanged import
  surface for all 27 existing test consumers.

- [ ] **Step 1:** Copy the **entire** current body of
  `tests/browser/page-objects/contracts/testids.ts` — the
  `export const TESTIDS = { … } as const;` object, all comments, all builder
  functions — verbatim into `packages/testids/src/index.ts`. It has zero
  imports, so no adjustment is needed. Keep the `as const`.

- [ ] **Step 2:** Replace the body of
  `tests/browser/page-objects/contracts/testids.ts` with a single re-export so
  every existing consumer keeps working unchanged:

```ts
export { TESTIDS } from "@rtc/testids";
```
  (Confirm the 27 consumers import `{ TESTIDS }` by name —
  `grep -rn "from \".*contracts/testids\"" tests` — they do today. A named
  re-export preserves them all with zero edits.)

- [ ] **Step 3:** Add `"@rtc/testids": "workspace:*"` to `tests/package.json`
  dependencies. Run `pnpm install`.

- [ ] **Step 4: Verify gate 1 still green.** The re-export file still contains
  no raw literals; gate 1 excludes it by path. Run
  `pnpm --filter tests gates` and confirm gate 1 PASSes. Run
  `pnpm --filter tests test` (or the test tiers that consume `TESTIDS`) to
  prove the re-export resolves. Full gauntlet + `pnpm check:deps` (a new
  `tests → @rtc/testids` edge is inward-legal; confirm no dep-cruiser
  complaint).

---

### Task 3: Wire `@rtc/testids` into both client packages

**Files:**
- Modify: `packages/client-react/package.json`
- Modify: `packages/client-react-native/package.json`

**Interfaces:**
- Produces: `@rtc/testids` importable from web and RN component code.

- [ ] **Step 1:** Add `"@rtc/testids": "workspace:*"` to the `dependencies`
  (NOT `devDependencies` — see spec §3 Option A′; the builder functions run at
  render time) of both `packages/client-react/package.json` and
  `packages/client-react-native/package.json`.
- [ ] **Step 2:** `pnpm install`; then `pnpm build` to confirm topological
  order resolves `@rtc/testids` before the clients.
- [ ] **Step 3: Verify** `pnpm check:deps` (new client → testids edges are
  inward-legal), `pnpm check:versions`, `pnpm typecheck`. No component edits
  yet — this task only makes the import available.

---

### Task 4: Migrate `@rtc/client-react` — `shell/` + `fx/`

**Files:**
- Modify: every `*.tsx` under `packages/client-react/src/ui/shell/` and
  `packages/client-react/src/ui/fx/` that carries a `data-testid`.

**Interfaces:**
- Consumes: `@rtc/testids` (`import { TESTIDS } from "@rtc/testids";`).
- Produces: zero `data-testid="…"` literals in these two domains.

- [ ] **Step 1:** Enumerate the sites:
  `grep -rn 'data-testid' packages/client-react/src/ui/shell packages/client-react/src/ui/fx --include='*.tsx' | grep -v '\.test\.'`
  (was ~57 + ~49 occurrences on 2026-07-10). For each, find the matching
  registry entry (the strings are identical — the registry was built from these
  literals). Static: `data-testid="header"` → `data-testid={TESTIDS.shell.header}`.
  Dynamic: `` data-testid={`tile-${pair}`} `` → `data-testid={TESTIDS.liveRates.tile(pair)}`.
- [ ] **Step 2:** Use `#/`-alias-free bare `@rtc/testids` import (it is an
  external workspace package, not a subpath). Respect the repo's import-ordering
  ESLint rule.
- [ ] **Step 3: Verify** no literal remains in these two dirs:
  `grep -rnE 'data-testid="[a-z]' packages/client-react/src/ui/shell packages/client-react/src/ui/fx` → empty (excluding tests). Run the full
  gauntlet + the shell/fx UI-contract specs
  (`pnpm --filter @rtc/client-react test`) + relevant Playwright e2e to prove
  attribute values are unchanged. **Do NOT regenerate goldens** — if any golden
  diffs, stop and investigate (spec §7).

---

### Task 5: Migrate `@rtc/client-react` — `credit/` + `equities/` + `admin/`

**Files:**
- Modify: every `*.tsx` under `packages/client-react/src/ui/credit/`,
  `…/ui/equities/`, `…/ui/admin/` that carries a `data-testid`.

**Interfaces:** identical to Task 4, for the remaining three domains
(~25 + ~26 + ~14 occurrences on 2026-07-10). Builder examples for this batch:
`credit.newRfq.dirButton(dir)`, `credit.newRfq.instrumentOption(id)`,
`credit.newRfq.dealer(id)`, `credit.rfqs.filterPill(f)`, `credit.rfqs.card(id)`,
`admin.incident.inject(kind)`.

- [ ] **Step 1:** Enumerate + map to registry entries (same method as Task 4).
- [ ] **Step 2:** Replace static → constant, dynamic → builder call.
- [ ] **Step 3: Verify** `grep -rnE 'data-testid="[a-z]' packages/client-react/src` → **zero** (all web domains now done; excluding tests). Full
  gauntlet + credit/equities/admin contract specs + Playwright e2e. No golden
  regen.

---

### Task 6: Migrate `@rtc/client-react-native` — `shell/` + `analytics/` + loose `ui/*.tsx`

**Files:**
- Modify: every file under `packages/client-react-native/src/ui/shell/`,
  `…/ui/analytics/`, and the loose `packages/client-react-native/src/ui/*.tsx`
  roots (`SpotTile.tsx`, `TradeTicket.tsx`, `TradeRow.tsx`, `Blotter.tsx`,
  `ConnectionBanner.tsx`, `SurfaceCard.tsx`, `AppearanceScreen.tsx`) that carry
  a `testID`.

**Interfaces:**
- Consumes: `@rtc/testids` (same object; RN uses `testID` prop instead of
  `data-testid` — the registry values are identical and framework-neutral).
- Produces: zero `testID="…"` literals in these sections.

- [ ] **Step 1:** Enumerate:
  `grep -rn 'testID' packages/client-react-native/src/ui/shell packages/client-react-native/src/ui/analytics packages/client-react-native/src/ui/*.tsx | grep -v '\.test\.'`
  (~17 + ~14 + ~21 occurrences on 2026-07-10). Map each to its registry entry.
  Static: `testID="header"` → `testID={TESTIDS.shell.header}`. Dynamic:
  `` testID={`tile-${pair}`} `` → `testID={TESTIDS.liveRates.tile(pair)}`.
- [ ] **Step 2:** Import `{ TESTIDS } from "@rtc/testids"`.
- [ ] **Step 3: Verify** no literal in these paths:
  `grep -rnE 'testID="[a-z]' packages/client-react-native/src/ui/shell packages/client-react-native/src/ui/analytics packages/client-react-native/src/ui/*.tsx`
  → empty (excluding tests). Full gauntlet +
  `pnpm --filter @rtc/client-react-native test`. RN has no visual-golden tier
  (deferred), so lean on contract/unit tests; optionally spot-check via
  `pnpm dev:ios` from the primary checkout.

---

### Task 7: Migrate `@rtc/client-react-native` — `credit/` + `equities/`

**Files:**
- Modify: every file under `packages/client-react-native/src/ui/credit/` and
  `…/ui/equities/` that carries a `testID` (~27 + ~36 occurrences on
  2026-07-10 — the two largest RN sections).

**Interfaces:** identical to Task 6, for the two remaining RN sections.

- [ ] **Step 1:** Enumerate + map to registry entries.
- [ ] **Step 2:** Replace static → constant, dynamic → builder call.
- [ ] **Step 3: Verify** `grep -rnE 'testID="[a-z]' packages/client-react-native/src` → **zero** (all RN sections now done; excluding
  tests). Full gauntlet + `pnpm --filter @rtc/client-react-native test`.

---

### Task 8: Extend gate 1 to the client `src` trees (LAST — only after zero literals remain)

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (gate 1's `paths`, and add the
  RN `testID` literal form).
- Modify: `docs/architecture/12-architectural-gates.md` (gate 1 row: update the
  scope description from "tests/ only" to "tests/ + both client `src` trees").
- Modify: `docs/architecture/16-trailheads.md` (the gate-1 side-note reworded
  by the enforcement-gap-closure PR — update it to say the definition site is
  now policed and remove the "by design, tests-only" caveat).

**Interfaces:**
- Consumes: a tree with zero raw client literals (Tasks 4–7 complete).
- Produces: gate 1 policing `packages/client-react/src` and
  `packages/client-react-native/src` (NOT `client-prototype` — spec §6).

- [ ] **Step 1: Precondition check.** Confirm zero literals remain:
  `grep -rnE 'data-testid="[a-z]' packages/client-react/src` and
  `grep -rnE 'testID="[a-z]' packages/client-react-native/src` both empty
  (excluding `*.test.*`/`*.spec.*`). If either is non-empty, STOP — a prior
  task is incomplete; do not weaken the gate to accommodate a literal.
- [ ] **Step 2: Widen gate 1's paths.** In `tests/scripts/grep-gates.ts`, add
  `"../packages/client-react/src"` and
  `"../packages/client-react-native/src"` to the gate-1 entry's `paths` array
  (it currently is `["."]`). Keep the existing
  `"browser/page-objects/contracts/testids.ts"` and `"/node_modules/"`
  excludes; add `.test.`/`.spec.` excludes if the pattern picks up test files
  (mirror gates 26–29's exclude list). Confirm `packages/testids/src` is NOT
  flagged (it holds no `data-testid="`/`testID="` string literals — it builds
  them from template strings and constants); add an explicit exclude only if a
  probe shows a false positive.
- [ ] **Step 3: Add the RN `testID` literal form.** Gate 1's pattern is
  `data-testid="[a-z]`. RN uses `testID`, so add a sibling gate entry (e.g.
  gate "1b" or fold an alternation `data-testid="[a-z]|testID="[a-z]` into the
  pattern — choose whichever keeps the output readable and does not renumber
  existing gates). Follow the existing `Gate` object shape.
- [ ] **Step 4: Update the two docs** (12-architectural-gates.md,
  16-trailheads.md) to describe the widened scope. Run `pnpm check:doc-links`.
- [ ] **Step 5: Violation probe (mandatory, spec §5 / enforcement-gap §3.1).**
  Temporarily add `data-testid="probe-fail"` to one web component and
  `testID="probe-fail"` to one RN component. Run `pnpm --filter tests gates`;
  observe gate 1 FAIL, naming both files. Revert both. Re-run; observe gate 1
  PASS. **Record both outputs in the completion report** — a gate that cannot
  be made to fail is not shipped.

---

### Task 9: Full-gauntlet integration + inventory docs

**Files:**
- Modify: `docs/architecture/13-codebase-map.md` (add the `@rtc/testids` L1
  package row; update any "hardcoded test IDs" note on the client cards).
- Verify-only: no code changes beyond doc touch-ups surfaced here.

**Interfaces:**
- Consumes: all prior tasks complete.
- Produces: a merge-ready branch.

- [ ] **Step 1: Inventory docs.** Add `@rtc/testids` to
  `docs/architecture/13-codebase-map.md` §L1 (package line map). Update the
  client L1 cards if they carry a "test IDs are hardcoded" boundary fact.
- [ ] **Step 2: Full gauntlet, whole tree** (the enforcement-gap-closure §3.3
  list): `pnpm check` (Biome), `pnpm lint:eslint`, `pnpm lint:eslint:types`,
  `pnpm lint:css`, actionlint (if workflow files touched — they are not here),
  `pnpm check:scripts`, `pnpm lint:dead` (knip), `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e`, UI-contract coverage (`test:ui:contract:coverage`, the
  ≥95% CI-only-but-runnable gate), `pnpm check:deps`,
  `pnpm --filter tests gates`, `pnpm check:doc-links`.
- [ ] **Step 3: Acceptance sweep** (spec §8): all seven criteria — package
  exists+builds; zero literals in both clients; every dynamic attribute uses a
  builder; gate-1 probe fail/pass recorded; full gauntlet green; goldens
  unchanged (no regen ran); prototype untouched (its 8 literals still inline).
- [ ] **Step 4: Whole-branch review** before merge (the RN dumb-UI paint bugs
  jsdom cannot see are why the mobile workstream mandates an opus whole-branch
  review; a pure attribute-rename refactor is low-risk, but confirm no `testID`
  landed on the wrong element by spot-checking the diff). Then follow
  `shipping-repo-changes` to PR + merge on green + user OK.

---

## Task dependency graph

- Task 1 → Task 2 → Task 3 (scaffold, move, wire — strictly sequential).
- Tasks 4, 5 (web) and 6, 7 (RN) depend on Task 3 and are otherwise
  **independent of each other** — a subagent-driven session may run the four
  migration tasks in parallel (disjoint file sets: web-shell/fx, web-credit/
  equities/admin, RN-shell/analytics/loose, RN-credit/equities). Each runs its
  own covering contract/e2e tests.
- Task 8 depends on **all** of 4–7 (its precondition is zero literals anywhere).
- Task 9 depends on Task 8.

Run one full gauntlet per phase (the four parallel migrations = one phase,
verified together before Task 8), not one per file.
