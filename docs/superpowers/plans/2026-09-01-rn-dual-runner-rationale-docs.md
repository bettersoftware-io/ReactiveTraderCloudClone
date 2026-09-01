# RN Dual-Runner Rationale Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the load-bearing "why jest in RN" rationale out of a single 2026-07-01 commit message and into the docs a reader actually consults, so the question stops being re-asked.

**Architecture:** Docs-only, two touch points: the test-strategy chapter (which already *describes* the dual runner in §9.9 without justifying it) gains the why; the RN package README (351 lines, currently zero mention of testing) gains a Testing section with the two traps that repeatedly bite.

**Tech Stack:** Markdown; `pnpm check:doc-links`.

**Spec:** Facts established 2026-09-01: the package runs `"test": "vitest run --passWithNoTests && jest"` — vitest owns `*.test.ts` (node env), jest-expo owns `*.test.tsx` (`jest.config.js` `testMatch`). The recorded rationale is commit `cc9365e4c`: *"vitest cannot render RN (Flow `import typeof` in react-native source is unparseable by esbuild, even with server.deps.inline). Fell back to a scoped jest-expo island."* The fail-fast spike that produced it is `docs/superpowers/plans/2026-07-01-phase2-walking-skeleton.md` (Task 2, fallback branch at line 192). Coverage caveats live in `packages/client-react-native/README-COVERAGE.md` (jest 63.89% / vitest 26.48%, different providers and denominators — neither is "the number").

## Global Constraints

- Work in a worktree via `./scripts/new-worktree.sh <name>`; one docs-only PR.
- Quote the commit rationale verbatim (it is the primary source); cite the commit hash.
- `pnpm check:doc-links` before push.

---

### Task 1: The why, in `docs/architecture/09-test-strategy.md` §9.9

**Files:**
- Modify: `docs/architecture/09-test-strategy.md` (locate the §9.9 dual-runner paragraph: `grep -n "dual runner" docs/architecture/09-test-strategy.md`)

- [ ] **Step 1: Insert the rationale block after the existing dual-runner description**

```markdown
**Why jest and not vitest for the `.tsx` half.** Decided by a pre-registered
fail-fast spike (2026-07-01, [walking-skeleton plan Task 2](../superpowers/plans/2026-07-01-phase2-walking-skeleton.md)):
vitest was tried first with a full `vitest.rn.config.ts`
(`server.deps.inline` for the RN packages) and failed structurally — from
commit `cc9365e4c`, verbatim:

> vitest cannot render RN (Flow `import typeof` in react-native source is
> unparseable by esbuild, even with server.deps.inline). Fell back to a
> scoped jest-expo island.

Beyond the parse blocker, the jest island carries machinery with no vitest
equivalent: the `jest-expo` preset (bootstraps the RN runtime — globals,
`__DEV__`, platform/asset resolution), a composed resolver that restores
pre-`exports`-map resolution for react-native and filters
react-native-worklets' `.native.` extensions under pnpm, pnpm-aware
`transformIgnorePatterns`, and ~12 KB of native-module mocks (reanimated,
Skia, expo-blur/haptics/sensors) in `jest.setup.ts`. Revisit only if RN
ships Flow-free ESM source or vitest gains an RN transform — until then the
split is: **`.test.ts` = vitest (node logic), `.test.tsx` = jest (renders
RN)**. Coverage for the two halves is measured separately and is not
comparable — see
[`README-COVERAGE.md`](../../packages/client-react-native/README-COVERAGE.md).
```

Adjust relative link prefixes to the chapter's actual location.

- [ ] **Step 2: Verify + commit**

Run: `pnpm check:doc-links` → exit 0.

```bash
git add docs/architecture/09-test-strategy.md
git commit -m "docs(test-strategy): record WHY the RN package runs a jest island"
```

### Task 2: Testing section in the RN README

**Files:**
- Modify: `packages/client-react-native/README.md` (append a `## Testing` section before any final links section)

- [ ] **Step 1: Add the section**

```markdown
## Testing

Two runners, split by extension — the mode is in the filename:

| glob | runner | environment |
|---|---|---|
| `**/*.test.ts` | vitest (`pnpm --filter @rtc/client-react-native test:unit:coverage`) | node — pure logic, no RN imports |
| `**/*.test.tsx` | jest-expo (`… test:native:coverage`) | RN runtime + RNTL |

`pnpm test` runs both. Why jest exists here at all: vitest cannot parse
react-native's Flow source (`import typeof`) — see
[docs/architecture/09-test-strategy.md](../../docs/architecture/09-test-strategy.md)
§9.9 for the full rationale and revisit conditions.

Two traps:

1. **A `.test.ts` file under jest reports "No tests found" and exits 0** — a
   vacuous pass. If your test renders RN it must be `.test.tsx`; if it is
   pure logic it must not import react-native.
2. **The coverage numbers of the two halves are not comparable** and neither
   is "the package's coverage" — different providers, each denominator is the
   whole package while each runner sees half the tests. See
   [README-COVERAGE.md](README-COVERAGE.md).
```

- [ ] **Step 2: Verify + commit + ship**

Run: `pnpm check:doc-links` → exit 0.

```bash
git add packages/client-react-native/README.md
git commit -m "docs(rn): README Testing section — dual runner, extension split, traps"
```

Push, PR, CI loop, merge per shipping-repo-changes.
