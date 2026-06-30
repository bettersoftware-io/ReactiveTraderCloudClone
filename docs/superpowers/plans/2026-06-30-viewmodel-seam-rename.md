# ViewModel Seam Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the UI dependency-injection seam from the shape-named `Hooks`/`AppHooks` to the role-named `ViewModel`, per [ADR-004](../../adr/ADR-004-viewmodel-seam-and-feature-flags.md) Decision 1.

**Architecture:** A pure, behaviour-preserving refactor. The seam (`useHooks` accessor + `HooksContext` + `HooksProvider` + `AppHooks` type + `createAppHooks` factory) is renamed wholesale to `useViewModel` / `ViewModelContext` / `ViewModelProvider` / `ViewModel` / `createViewModel`. No render output changes, so both committed visual golden sets and the full e2e suite are the safety net — they must stay byte-identical.

**Tech Stack:** TypeScript, React 19, react-rxjs, Vite, Vitest, Playwright. Monorepo: pnpm workspaces + Turborepo. Node 26.

## Global Constraints

- **Work inside the isolated worktree** (`.claude/worktrees/viewmodel-rename-and-flags-docs`). Never edit the live `main` working tree — `main` auto-pushes to origin.
- **Pure rename — zero behaviour change.** No new logic, no signature changes beyond identifier names (and the `HooksProvider` prop `hooks` → `viewModel`). Visual goldens and e2e MUST NOT need regeneration; if any golden drifts, a non-rename change leaked in — stop and investigate.
- **The type is the single source of truth.** `ViewModel` (née `AppHooks`) is implemented in three places — the real factory and two test harnesses — plus consumed by every dumb component. A half-applied rename will not typecheck; the rename in Task 2 is atomic by nature.
- **Run all gates from inside the worktree** (avoids the sibling-worktree ESLint glob pollution that bites runs from the primary checkout).
- **Replacement order matters:** apply `createAppHooks → createViewModel` *before* `AppHooks → ViewModel` is unnecessary because `AppHooks` is a substring of `createAppHooks`; instead apply the longest identifiers first (see Task 2). The perl identifier passes also rewrite the matching segment of import-path string literals (`#/ui/hooks/createAppHooks` → `#/ui/hooks/createViewModel`), so only the *directory* segment (`hooks`) needs a separate pass (Task 3).

---

## File Structure

The seam lives in `packages/client-react/src/ui/hooks/`. The rename map:

| Before | After |
|---|---|
| `src/ui/hooks/HooksContext.ts` | `src/ui/hooks/ViewModelContext.ts` |
| `src/ui/hooks/HooksProvider.tsx` | `src/ui/hooks/ViewModelProvider.tsx` |
| `src/ui/hooks/useHooks.ts` | `src/ui/hooks/useViewModel.ts` |
| `src/ui/hooks/useHooks.test.tsx` | `src/ui/hooks/useViewModel.test.tsx` |
| `src/ui/hooks/createAppHooks.ts` | `src/ui/hooks/createViewModel.ts` |
| `src/ui/hooks/createAppHooks.equities.test.ts` | `src/ui/hooks/createViewModel.equities.test.ts` |
| dir `src/ui/hooks/` (Task 3) | dir `src/ui/viewModel/` |
| `tests/ui/visual/react/buildFakeHooks.ts` (Task 4) | `tests/ui/visual/react/buildFakeViewModel.ts` |
| `tests/ui/contract/react/hooksFromWorld.ts` (Task 4) | `tests/ui/contract/react/viewModelFromWorld.ts` |

Identifier rename map (whole-identifier replacements):

| Before | After |
|---|---|
| `createAppHooks` | `createViewModel` |
| `AppHooks` | `ViewModel` |
| `HooksProvider` | `ViewModelProvider` |
| `HooksContext` | `ViewModelContext` |
| `useHooks` | `useViewModel` |
| `buildFakeHooks` (Task 4) | `buildFakeViewModel` |
| `reactHooks` (Task 4) | `reactViewModel` |

`useMachine.ts` / `useMachine.test.tsx` (a generic react-rxjs bridge, not the bundle) keep their names; they move only with the directory in Task 3.

---

### Task 1: Establish a green baseline

**Files:** none (verification only).

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed-clean starting point so any later red is attributable to the rename.

- [ ] **Step 1: Install dependencies in the worktree**

Run: `pnpm install`
Expected: completes; lockfile unchanged (`git status` shows no `pnpm-lock.yaml` diff).

- [ ] **Step 2: Typecheck + unit tests + lint baseline**

Run: `pnpm typecheck && pnpm test && pnpm check && pnpm lint:eslint`
Expected: all PASS. If anything fails on a clean `origin/main` branch, STOP and report — do not start the rename on a red baseline.

- [ ] **Step 3: UI tiers baseline (the rename's safety net)**

Run: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-react test:ui:visual:react`
Expected: contract PASS; visual PASS with **zero** golden drift.

---

### Task 2: Atomic rename — files, symbols, error message, test expectations (dir stays `hooks/`)

**Files:**
- Rename + edit (via `git mv` + identifier pass): the 6 seam files in `src/ui/hooks/` (see File Structure).
- Modify: every tracked file referencing a renamed identifier (~45 files: `src/AppRoot.tsx`, all `src/ui/**` consumers, the two test harnesses `tests/ui/visual/react/buildFakeHooks.ts` and `tests/ui/contract/react/hooksFromWorld.ts`, and contract/visual harness files).

**Interfaces:**
- Consumes: the identifier rename map above.
- Produces: `createViewModel(presenters, machines, commands): ViewModel`, `useViewModel(): ViewModel`, `<ViewModelProvider viewModel={…}>`, `ViewModelContext`. Consumed by Task 3 (dir rename) and Task 4 (builder rename).

- [ ] **Step 1: `git mv` the six seam files**

```bash
cd packages/client-react/src/ui/hooks
git mv HooksContext.ts ViewModelContext.ts
git mv HooksProvider.tsx ViewModelProvider.tsx
git mv useHooks.ts useViewModel.ts
git mv useHooks.test.tsx useViewModel.test.tsx
git mv createAppHooks.ts createViewModel.ts
git mv createAppHooks.equities.test.ts createViewModel.equities.test.ts
cd -
```

- [ ] **Step 2: Apply the identifier passes across all tracked files**

Longest identifiers first so substrings don't get partially rewritten. (`perl` is used for portable `\b` word boundaries on macOS + Linux.)

```bash
cd packages/client-react
for sym_pair in \
  'createAppHooks=>createViewModel' \
  'AppHooks=>ViewModel' \
  'HooksProvider=>ViewModelProvider' \
  'HooksContext=>ViewModelContext' \
  'useHooks=>useViewModel' ; do
  from="${sym_pair%%=>*}"; to="${sym_pair##*=>}"
  git grep -lZ -w "$from" -- 'src' 'tests' | xargs -0 perl -pi -e "s/\\b\Q$from\E\\b/$to/g"
done
cd -
```

Note: `useHooks → useViewModel` also rewrites the error-message prefix in `useViewModel.ts` (`"useHooks must be used within HooksProvider"`), and `HooksProvider → ViewModelProvider` rewrites the suffix — so the thrown message becomes `"useViewModel must be used within ViewModelProvider"` and the matching assertion in `useViewModel.test.tsx` is updated by the same passes.

- [ ] **Step 3: Rename the `HooksProvider` prop `hooks` → `viewModel`**

The provider's prop is `hooks` (not covered by the identifier passes). Edit `src/ui/hooks/ViewModelProvider.tsx`:

```tsx
interface ViewModelProviderProps {
  viewModel: ViewModel;
  children: ReactNode;
}

export function ViewModelProvider({
  viewModel,
  children,
}: ViewModelProviderProps): ReactElement {
  return (
    <ViewModelContext.Provider value={viewModel}>{children}</ViewModelContext.Provider>
  );
}
```

And update the single call site in `src/AppRoot.tsx`:

```tsx
<ViewModelProvider viewModel={viewModelRef.current}>
```

(The local `hooksRef` in `AppRoot.tsx` may be renamed `viewModelRef` for clarity — optional, mechanical.)

- [ ] **Step 4: Sweep comments/prose for stale "hooks bundle" wording**

```bash
git grep -ni 'hooks bundle\|business-logic hooks\|the hooks seam\|HooksProvider\|useHooks\|AppHooks' -- packages/client-react/src packages/client-react/tests
```

Expected: only intentional/unrelated matches remain (e.g. `useMachine`, generic "React hooks", `buildFakeHooks`/`reactHooks` which Task 4 handles). Update any seam-describing comments to "ViewModel" wording. Real residue from the rename → fix inline.

- [ ] **Step 5: Typecheck (all four client-react projects)**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS (covers `tsconfig`, `tsconfig.node.json`, `tsconfig.ui-visual.json`, `tsconfig.ui-contract.json` — i.e. src + both UI test harnesses).

- [ ] **Step 6: Unit + UI-contract tests**

Run: `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract`
Expected: PASS, same test count as baseline.

- [ ] **Step 7: Format + lint the renamed code**

Run: `pnpm check:fix && pnpm lint:eslint`
Expected: clean (no errors). `check:fix` re-sorts any imports the rename reordered.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(client): rename UI DI seam Hooks/AppHooks → ViewModel (ADR-004)"
```

---

### Task 3: Rename the directory `src/ui/hooks/` → `src/ui/viewModel/`

**Files:**
- Move: `src/ui/hooks/` → `src/ui/viewModel/` (all contents incl. `useMachine.ts`, `useMachine.test.tsx`, `__tests__/`).
- Modify: every import specifier `#/ui/hooks/…` → `#/ui/viewModel/…`.

**Interfaces:**
- Consumes: Task 2 output.
- Produces: `#/ui/viewModel/useViewModel`, `#/ui/viewModel/createViewModel`, `#/ui/viewModel/useMachine`, etc.

- [ ] **Step 1: Move the directory**

```bash
cd packages/client-react/src/ui
git mv hooks viewModel
cd -
```

- [ ] **Step 2: Rewrite the import-path directory segment**

```bash
cd packages/client-react
git grep -lZ '#/ui/hooks/' -- 'src' 'tests' | xargs -0 perl -pi -e 's{#/ui/hooks/}{#/ui/viewModel/}g'
cd -
```

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(client): move src/ui/hooks → src/ui/viewModel (ADR-004)"
```

---

### Task 4: Rename the test-harness builders for consistency

**Files:**
- `git mv tests/ui/visual/react/buildFakeHooks.ts tests/ui/visual/react/buildFakeViewModel.ts`
- `git mv tests/ui/contract/react/hooksFromWorld.ts tests/ui/contract/react/viewModelFromWorld.ts`
- Modify: their import sites (e.g. `tests/ui/visual/react/VisualScenario.tsx`, `tests/ui/contract/react/render.tsx`).

**Interfaces:**
- Consumes: Task 3 output.
- Produces: `buildFakeViewModel(data: AppData): ViewModel`, `reactViewModel(world: World): ViewModel`.

- [ ] **Step 1: `git mv` the two files**

```bash
cd packages/client-react
git mv tests/ui/visual/react/buildFakeHooks.ts tests/ui/visual/react/buildFakeViewModel.ts
git mv tests/ui/contract/react/hooksFromWorld.ts tests/ui/contract/react/viewModelFromWorld.ts
cd -
```

- [ ] **Step 2: Rename the function identifiers + their import paths**

```bash
cd packages/client-react
git grep -lZ -e 'buildFakeHooks' -e 'reactHooks' -e 'hooksFromWorld' -- 'tests' | xargs -0 perl -pi -e \
  's/\bbuildFakeHooks\b/buildFakeViewModel/g; s/\breactHooks\b/reactViewModel/g; s{hooksFromWorld}{viewModelFromWorld}g'
cd -
```

- [ ] **Step 3: Typecheck both UI test projects + run both UI tiers**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-react test:ui:visual:react`
Expected: contract PASS; visual PASS with **zero** golden drift.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(client): rename ViewModel test-harness builders for consistency (ADR-004)"
```

---

### Task 5: Full verification gauntlet + open PR

**Files:** none (verification + PR).

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: a green branch + PR.

- [ ] **Step 1: Run the full gate set from inside the worktree**

```bash
pnpm typecheck
pnpm test
pnpm check
pnpm lint:eslint
pnpm lint:eslint:types
pnpm lint:css
pnpm --filter @rtc/client-react test:ui:contract:coverage   # CI-only gate: UI contract coverage ≥95%
pnpm --filter @rtc/client-react test:ui:visual              # all visual tiers, both committed sets
```

Expected: all PASS; visual tiers report **zero** golden drift (pure rename). `test:ui:contract:coverage` ≥95% (unchanged from baseline — no source logic moved).

- [ ] **Step 2: e2e (skip Cypress — busy-spins on local arm64)**

Run: `pnpm test:e2e:no-cypress`
Expected: PASS. (Cypress x86 e2e is unverifiable locally; it runs on the PR's CI — Step 4.)

- [ ] **Step 3: Confirm no golden/source drift snuck in**

Run: `git status --porcelain` and `git diff --stat origin/main`
Expected: only renamed files + import edits + the two new docs (ADR-004, this plan). **No** `*.png` golden changes. If any golden changed, a non-rename change leaked — investigate before pushing.

- [ ] **Step 4: Push the branch and open the PR**

Per the `shipping-repo-changes` skill (use it for the push/PR). PR body should note: pure rename per ADR-004, zero render/behaviour change, goldens byte-identical, the x86 Cypress e2e gate runs on CI. Wait for CI green (the x86 Cypress + x86 visual gates are CI-only) before merging.

---

## Self-Review

**1. Spec coverage (ADR-004 Decision 1):**
- Type `AppHooks → ViewModel` — Task 2 (`AppHooks` pass). ✓
- `createAppHooks → createViewModel` — Task 2. ✓
- `HooksContext → ViewModelContext`, `HooksProvider → ViewModelProvider` (+ prop `hooks → viewModel`) — Task 2 Steps 2–3. ✓
- `useHooks → useViewModel` (+ error message + test assertion) — Task 2 Steps 2, 4. ✓
- dir `hooks/ → viewModel/` — Task 3. ✓
- builders `buildFakeHooks/reactHooks` — Task 4. ✓
- "pure rename, goldens unchanged" invariant — Tasks 1/4/5 verify zero drift. ✓

**2. Placeholder scan:** every step has concrete commands/paths; no TBD/TODO. ✓

**3. Type/identifier consistency:** the single rename map (File Structure) is the one source; every task draws from it. The provider prop rename (`hooks → viewModel`) is the one non-identifier edit and is shown in full (Task 2 Step 3). `useMachine` is explicitly excluded from renaming. ✓

**Risk note:** the `git grep -w` / `perl \b` passes target whole identifiers, so `useMachine`, the lowercase dir token `hooks` (Task 3 handles separately), `buildFakeHooks`/`reactHooks` (Task 4 handles separately), and generic "React hooks" prose are not clobbered by Task 2. The Task 2 Step 4 sweep catches any prose residue.
