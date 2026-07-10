# Enforcement Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Atlas's boundary claims machine-checked (dep-cruiser pair rules for all 9 packages, RN dumb-UI gates 30–33), correct the gate-1 "gap" wording to its by-design rationale, and author the plan-only atomic-test-ID-renames PR.

**Architecture:** Two PRs. PR A (branch `worktree-enforcement-gap-closure`): config + gate + doc edits, zero UI code changes, everything passes on today's tree. PR B (separate branch off main): two documentation files (spec + plan) for the deferred atomic-renames refactor. **PR B merges first** so PR A's doc links to the plan file resolve after PR A catches up to main.

**Tech Stack:** dependency-cruiser config (CJS), `tests/scripts/grep-gates.ts` (tsx), GitHub-flavored Markdown.

**Spec:** `docs/superpowers/specs/2026-07-10-enforcement-gap-closure-design.md` — read it before any task.

## Global Constraints

- Work ONLY in the worktree your dispatch names — never the primary checkout. Do NOT run git mutating commands; the controller commits.
- **Violation probes are mandatory** (spec §3.1): every new rule/gate must be shown to FAIL on a deliberate temp violation and PASS after revert, with outputs recorded in your report. A rule that cannot be made to fail is not shipped — for `client-core-framework-free` the spec's fallback is to drop that one rule and leave the boundary documented as structural.
- Biome `useBlockStatements`: braces on all control statements; run `pnpm exec biome ci <touched files>` before reporting.
- Commit-message style: `feat(gates): …` / `docs: …` with the standard trailers (copy from `git log`).
- Verification commands: `pnpm check:deps` (dep-cruiser) and `pnpm --filter tests gates` (grep gates; CI runs it inside "Architecture + supply-chain gates"). `pnpm check:doc-links` for any md edit.
- The plan-file path both PRs reference: `docs/superpowers/plans/2026-07-10-atomic-testid-renames.md`.

---

### Task 1: Dependency-cruiser pair rules

**Files:**
- Modify: `.dependency-cruiser.cjs` (append to `forbidden`, after `ws-effects-stays-pure`)

**Interfaces:**
- Produces: rule names `client-core-stays-inner`, `client-core-framework-free`, `react-bindings-no-apps`, `clients-never-import-each-other`, `prototype-isolated` (Task 3 cites these names verbatim).

- [ ] **Step 1: Append the rules** (match the existing objects' style exactly):

```js
    {
      name: "client-core-stays-inner",
      severity: "error",
      comment:
        "@rtc/client-core is the shared application core — it must not depend on bindings, any client, or the server.",
      from: { path: "^packages/client-core/src" },
      to: {
        path: "^packages/(react-bindings|client-react|client-react-native|client-prototype|server)/",
      },
    },
    {
      name: "client-core-framework-free",
      severity: "error",
      comment:
        "@rtc/client-core is framework-free by contract (its README's headline claim) — no React/DOM/RN modules.",
      from: { path: "^packages/client-core/src" },
      to: { path: "node_modules/(react|react-dom|react-native)/" },
    },
    {
      name: "react-bindings-no-apps",
      severity: "error",
      comment:
        "@rtc/react-bindings is the React↔RxJS bridge — it may depend on client-core/domain/react, never on an app or the server.",
      from: { path: "^packages/react-bindings/src" },
      to: {
        path: "^packages/(client-react|client-react-native|client-prototype|server)/",
      },
    },
    {
      name: "clients-never-import-each-other",
      severity: "error",
      comment:
        "The clients are peers composed from the same core — they must never import one another (CLAUDE.md dependency rule).",
      from: {
        path: "^packages/(client-react|client-react-native|client-prototype)/src",
      },
      to: {
        path: "^packages/(client-react|client-react-native|client-prototype)/",
        pathNot: "^packages/$1/",
      },
    },
    {
      name: "prototype-isolated",
      severity: "error",
      comment:
        "@rtc/client-prototype is a design-comprehension island — react/react-dom only, no @rtc/* imports (CLAUDE.md).",
      from: { path: "^packages/client-prototype/src" },
      to: {
        path: "^packages/(domain|shared|client-core|react-bindings|client-react|client-react-native|server|ws-effects)/",
      },
    },
```

**Note on `clients-never-import-each-other`:** dependency-cruiser supports group-matching — `$1` in `to.pathNot` refers to `from.path`'s first capture group. Verify this works with a probe (client-react → client-react-native must FAIL; client-react → its own files must PASS). If `$1` group-referencing does not behave as documented in the installed version, replace with three explicit per-client rules (`web-imports-no-sibling-clients`, `rn-imports-no-sibling-clients`, `prototype-imports-no-sibling-clients`) — same six directed pairs, no cleverness.

- [ ] **Step 2: Baseline run** — `pnpm check:deps` → expect green (spec verified zero violations today). If it is NOT green, STOP and report; do not tune rules to hide a real finding.
- [ ] **Step 3: Violation probes** — one per rule; for each: add the temp import at the top of a real file, run `pnpm check:deps`, confirm the output names YOUR rule, revert, re-run green. Suggested probes:
  - `client-core-stays-inner`: `import "@rtc/react-bindings";` in `packages/client-core/src/index.ts`
  - `client-core-framework-free`: `import "react";` in `packages/client-core/src/index.ts` (react resolves — it's in the workspace root store; if dep-cruiser reports it as unresolvable instead of matching the rule, record that and apply the spec's drop-fallback)
  - `react-bindings-no-apps`: `import "@rtc/client-react";` in `packages/react-bindings/src/index.ts`
  - `clients-never-import-each-other`: `import "@rtc/client-react-native";` in `packages/client-react/src/index.ts` AND the self-import PASS check
  - `prototype-isolated`: `import "@rtc/domain";` in `packages/client-prototype/src/main.tsx`
  (Some probes may ALSO trip pnpm strict resolution or tsc — that's fine; you only need dep-cruiser's output to name the rule. Use `--no-cache` if dep-cruiser caches.)
- [ ] **Step 4: Lint** — `pnpm exec biome ci .dependency-cruiser.cjs` clean.
- [ ] **Step 5: Report** with every probe's actual output lines.

---

### Task 2: RN dumb-UI gates 30–33

**Files:**
- Modify: `tests/scripts/grep-gates.ts`

**Interfaces:**
- Consumes: gates 26–29's exact shapes (`name`/`pattern`/`paths`/`excludes` and the `checkNoUiTimer` custom check at `tests/scripts/grep-gates.ts:193`).
- Produces: gate names starting `30.`–`33.` (Task 3 cites the numbers).

- [ ] **Step 1: Parameterize the timer check.** Rename `checkNoUiTimer` → `checkNoUiTimers(path: string): string[]` (same body, `path` replaces the hardcoded `"../packages/client-react/src/ui/"`), update gate 29's entry to `customCheck: () => checkNoUiTimers("../packages/client-react/src/ui/")` — keeping gate 29's behaviour byte-identical.
- [ ] **Step 2: Append gates 30–33** after gate 29, mirroring 26–29 (RN has no `src/ui/viewModel/` dir, so that exclude is dropped):

```ts
  {
    name: "30. No rxjs/react-rxjs imports in RN src/ui (only the bindings bridge may)",
    pattern: 'from "rxjs"|@react-rxjs|@rx-state',
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "31. No localStorage/AsyncStorage in RN src/ui (persistence belongs behind PreferencesPort)",
    pattern: "localStorage|AsyncStorage",
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "32. No fetch/import.meta.env/expo-constants in RN src/ui (transport & config belong in the app layer)",
    pattern: "fetch\\(|import\\.meta\\.env|expo-constants",
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "33. No setTimeout/setInterval anywhere in RN src/ui",
    pattern: "",
    paths: [],
    customCheck: () => {
      return checkNoUiTimers("../packages/client-react-native/src/ui/");
    },
  },
```

- [ ] **Step 3: Baseline** — `pnpm --filter tests gates` → all gates green including the four new ones and unchanged 1–29. If 30–33 flag anything real, STOP and report (spec says the tree is clean today).
- [ ] **Step 4: Violation probes** — for each of 30–33: append a violating line (e.g. `import { of } from "rxjs";`, `AsyncStorage.getItem("x");`, `fetch("/x");`, `setTimeout(() => {}, 1);`) to a real file under `packages/client-react-native/src/ui/`, run the gates, confirm the named gate fails, revert, re-run green. Also confirm gate 29 still fails on a web-side probe (the refactor in Step 1 must not have broken it).
- [ ] **Step 5: Lint + types** — `pnpm exec biome ci tests/scripts/grep-gates.ts` and `pnpm --filter tests typecheck` (or the tests workspace's typecheck script name — read `tests/package.json`).
- [ ] **Step 6: Report** with probe outputs.

---

### Task 3: Documentation truth-up

**Files:**
- Modify: `docs/architecture/12-architectural-gates.md`, `docs/dependency-cruiser.md`, `packages/client-core/README.md:13`, `packages/client-react-native/README.md:15`, `docs/architecture/16-trailheads.md` (lines ~82 and ~108), `docs/architecture/13-codebase-map.md` (enforcement mentions in the client-core / RN / prototype cards — grep for "no dedicated"/"No gate"/"structural" first)

**Interfaces:**
- Consumes: rule names from Task 1, gate numbers 30–33 from Task 2 (fixed by this plan — safe to write in parallel), and the PR-B plan path `docs/superpowers/plans/2026-07-10-atomic-testid-renames.md` (write it as a REAL markdown link — PR B merges before PR A, and PR A catches up to main before its final CI run, so the checker will see the file).

- [ ] **Step 1: Gates doc** — add rows 30–33 to the table in `docs/architecture/12-architectural-gates.md` in the established row style; update the closing paragraph ("Gates 26–29 are the machine-readable definition of 'dumb UI'…") to say 26–29 (web) + 30–33 (RN) and that the SolidJS-port contract now has the same guardrails on both shipped clients.
- [ ] **Step 2: dependency-cruiser doc** — replace the "Scope note" paragraph (`docs/dependency-cruiser.md:95-100`) with a description of full coverage: name the five new rules, state every package is now covered by at least one pair rule, and delete the "open, low-priority TODO" sentence. Add the five rules to whatever rule enumeration the doc carries (read it first).
- [ ] **Step 3: READMEs** — rewrite `packages/client-core/README.md:13`'s "Must never import" cell: keep the structural-enforcement description, replace "There is no single named grep-gate for this rule… no dedicated dependency-cruiser pair rule for client-core yet" with citations of `client-core-stays-inner` + `client-core-framework-free` (or just the former if Task 1 dropped the latter — coordinate with the controller). Same for `packages/client-react-native/README.md:15`: "No gate mechanically enforces this here" → cite gates 30–33, keep the rxjs-in-app-layer example.
- [ ] **Step 4: Trailheads** — `docs/architecture/16-trailheads.md:82`: extend the parenthetical so it states the tests/-only scope is by design (components = definition site; tests = registry-guarded consumption; drift fails tests loudly) and link the atomic-renames plan. Line ~84 (step 5, testids.ts) gains "see the [atomic-renames plan](../superpowers/plans/2026-07-10-atomic-testid-renames.md) for the deferred registry-import refactor". Recipe 4's change-impact checklist: add gates 30–33 for the RN path. Line ~108 (recipe 5, dep-cruiser bullet): update "today only cover domain, shared, client-react, server, ws-effects" to reflect all-9 coverage while KEEPING the instruction that new packages still need hand-written rules.
- [ ] **Step 5: §13 cards** — update the client-core / RN / prototype L1 cards' boundary-fact sentences to cite the new rules/gates (grep the file for the stale phrasings first; keep edits minimal).
- [ ] **Step 6: Verify** — `pnpm check:doc-links` (NOTE: will fail on the PR-B plan link until PR B's files are present — if so, record it as the expected cross-PR dependency and let the controller sequence it; every OTHER link must resolve). Grep the repo for the replaced phrases ("no dedicated pair rules", "No gate mechanically enforces", "There is no single named grep-gate") → zero hits outside historical docs (`docs/superpowers/plans/`, `.superpowers/`, task reports).
- [ ] **Step 7: Report.**

---

### Task 4: PR B documents (atomic test-ID renames — spec + plan, docs only)

**Files (in the PR-B worktree the controller names in your dispatch):**
- Create: `docs/superpowers/specs/2026-07-10-atomic-testid-renames-design.md`
- Create: `docs/superpowers/plans/2026-07-10-atomic-testid-renames.md`

**Interfaces:**
- Consumes: the enforcement-gap-closure spec §2.4 (PR B requirements); the real registry at `tests/browser/page-objects/contracts/testids.ts`; the real literal counts (verify with the greps below); the power-saver plan's "MERGED AS PLAN, NOT EXECUTED" banner convention (find it under `docs/superpowers/` and copy its exact form).
- Produces: the two files PR A's docs link to.

- [ ] **Step 1: Research.** Count and locate the literals yourself: `grep -rn 'data-testid="' packages/client-react/src packages/client-prototype/src --include='*.tsx' | grep -cv testids` and `grep -rn 'testID="' packages/client-react-native/src | wc -l`; read `tests/browser/page-objects/contracts/testids.ts` in full (shape: nested objects + functions like `` tile: (pair) => `tile-${pair}` ``); read gate 1's definition (`tests/scripts/grep-gates.ts:213-217`); check how `tests` imports the registry today and confirm no `packages/* → tests` dependency exists anywhere (`grep '"tests"' packages/*/package.json`). Decide whether client-prototype participates (it has its own literals but is an isolated island — recommend excluding it, with rationale).
- [ ] **Step 2: Write the spec** covering, per the parent spec §2.4: the registry-relocation decision — evaluate `@rtc/testids` new dev-only package vs fold into `@rtc/shared` vs keep-in-tests (rejected: would need a forbidden `packages → tests` edge); pick `@rtc/testids` unless research shows a blocker, with the wiring costs stated honestly (workspace add = knip entry + typecheck script + eslint/tsconfig paths per the all-gates-on-package-add policy, now itself gated by `check:scripts`); dynamic-ID strategy (the registry's function entries — components must call the same functions, so the package must be runtime-importable by UI code, dev-dependency vs dependency decision stated); migration approach for both clients; gate-1 scope extension to `packages/*/src` once migration completes; explicit statement that visual goldens are unaffected (testids don't render) and UI contract tests are the safety net.
- [ ] **Step 3: Write the plan** — bite-sized tasks per the writing-plans skill (a future session must execute it with zero context from this one): package scaffold task (with the exact gate-wiring checklist from §16 recipe 5), registry move + tests-side re-export task (keeping gate 1 green throughout), per-domain migration tasks for web, per-section tasks for RN, gate-1 scope-extension task (the LAST task, only after zero literals remain), full-gauntlet integration task. Both documents open with the MERGED-AS-PLAN banner.
- [ ] **Step 4: Verify** — `node scripts/check-doc-links.mjs` clean in the PR-B worktree; every file/count cited exists/reproduces. **Step 5: Report.**

---

### Task 5: PR B integration (merge first)

Controller-led (no subagent): commit Task 4's files on the PR-B branch, push, `gh pr create`, CI loop per shipping-repo-changes, **user reviews and merges** (or explicitly delegates the merge), confirm on origin/main.

---

### Task 6: PR A integration

Controller-led: after PR B lands, in the PR-A worktree `git merge origin/main` (brings the plan file in → Task 3's link resolves), then: `pnpm check:deps`, `pnpm --filter tests gates`, `pnpm check:doc-links`, `pnpm exec biome ci .`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm check:scripts`, `pnpm lint:dead`, `pnpm typecheck`, `pnpm test`. Push, PR, CI loop, catch up to main if moved, hold for user review.

---

## Self-review notes (completed)

- Spec coverage: §2.1→Task 1, §2.2→Task 2, §2.3→Task 3, §2.4→Tasks 4-5, §3→probe steps in 1-2 + Task 6 gauntlet, acceptance §3.4 → Task 3 Step 6 grep + Task 6.
- No placeholders; both conditional rules carry explicit fallbacks and probe-based decisions.
- Type consistency: rule names and gate numbers are fixed here and cited identically in Tasks 1/2/3; the PR-B plan path is identical in Global Constraints, Task 3, and Task 4.
- Cross-PR link dependency handled by explicit merge ordering (Task 5 before Task 6) and called out in Task 3 Step 6.
