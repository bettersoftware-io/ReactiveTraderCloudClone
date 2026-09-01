# Devtools State Doctrine + Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bless the devtools-app state layer as-designed — `useSyncExternalStore` over `InspectorStore` is the devtools bridge, plain `useState` for view state — write that doctrine into §20, and give devtools-app the dumb-UI grep gates every client already has (it currently has zero).

**Architecture:** Docs + three new grep-gate entries in `tests/scripts/grep-gates.ts` (verified clean today: devtools-app/src has 0 `setTimeout`/`setInterval`/`localStorage`/`fetch(` outside `__tests__`). The alternative — a `bind()`-style reactive layer over `InspectorStore` — is explicitly deferred, recorded in `docs/IDEAS.md`.

**Tech Stack:** Markdown; the gates runner (`pnpm --filter tests gates`, i.e. `tests/scripts/grep-gates.ts`, executed by `test:e2e`'s orchestration).

**Spec:** 2026-09-01 session decision: "Bless + gate it", with "Build a bind() layer" kept open for later. Facts: `packages/devtools-app/src/useInspectorState.ts` is a 17-line `useSyncExternalStore` wrapper over `InspectorStore.getSnapshot()/subscribe()`; view state is `useState` in `useTimeline`/`useNavigation`/`useRecording`/`panels/flash.ts`; `devtools-core` is an rxjs-only leaf that must not import `client-core`, so `react-bindings`' `createViewModel` is structurally unavailable; `LiveHistory` is a build-once ref in `InspectorApp.tsx` (one of the three sanctioned `react-hooks/refs` exemptions).

## Global Constraints

- Worktree + one PR (docs + gates are one reviewable unit — the gates enforce the doctrine the docs state).
- Gates are numbered — continue from the current highest (37 today; re-check at execution time: `grep -n 'name: "' tests/scripts/grep-gates.ts | tail -1`).
- Every gate excludes `__tests__`/`.test.`/`.spec.` like gates 26–37 do.

---

### Task 1: The three devtools-app gates

**Files:**
- Modify: `tests/scripts/grep-gates.ts` (append after gate 37's entry)

**Interfaces:**
- Consumes: the existing gate entry shape `{ name, pattern, paths, excludes }` (paths are relative to `tests/`, hence the `../packages/…` prefix).

- [ ] **Step 1: Prove the gates would pass today**

Run: `grep -rnE "setTimeout|setInterval" packages/devtools-app/src --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: no output. Repeat for `localStorage` and `fetch\(`. If any hit appears (code moved since 2026-09-01), stop and re-scope the gate with a documented exclusion rather than weakening the pattern.

- [ ] **Step 2: Append the entries**

```ts
  {
    name: "38. No setTimeout/setInterval in devtools-app src (flash/timing runs through rAF or the store)",
    pattern: "setTimeout|setInterval",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
  {
    name: "39. No localStorage in devtools-app src (the inspector holds no persistence; state lives in InspectorStore)",
    pattern: "localStorage",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
  {
    name: "40. No fetch/WebSocket construction in devtools-app src (transport is the injected Duplex)",
    pattern: "fetch\\(|new WebSocket",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
```

(Adjust the leading numbers if the tail has moved past 37.)

- [ ] **Step 3: Run the gates**

Run: `pnpm --filter tests gates`
Expected: all gates pass, the three new names listed.

- [ ] **Step 4: Commit**

```bash
git add tests/scripts/grep-gates.ts
git commit -m "gates: dumb-UI grep gates for devtools-app (timers, storage, transport)"
```

### Task 2: Doctrine in §20 + the deferred bind() idea

**Files:**
- Modify: `docs/architecture/20-devtools.md` (add a subsection after the section describing the inspector app — locate with `grep -n "InspectorStore\|useInspectorState" docs/architecture/20-devtools.md | head -3`)
- Modify: `docs/IDEAS.md`
- Modify: `docs/architecture/12-architectural-gates.md` (the grep-gates inventory — add the three new gates to its table/list; locate with `grep -n "grep-gates\|gate" docs/architecture/12-architectural-gates.md | head`)

- [ ] **Step 1: Add the doctrine subsection to §20**

```markdown
### State-layer doctrine: useSyncExternalStore IS the devtools bridge

devtools-app deliberately does **not** use `@rtc/react-bindings`. The reason
is structural, not stylistic: `devtools-core` is an rxjs-only leaf that may
not import `client-core`, so `createViewModel`/`bind()` are unavailable to
the packages built on it. The sanctioned pattern is therefore:

- **Live data** flows rxjs → `InspectorStore` (copy-on-write,
  `getSnapshot()`/`subscribe()`) → React via `useInspectorState.ts` — a
  17-line `useSyncExternalStore` wrapper. That file is the ONLY seam between
  the store and React.
- **View state** (selection, filters, nav, recording toggles) is plain
  `useState` in the owning hook (`useTimeline`, `useNavigation`,
  `useRecording`) — it is inspector chrome, not application state, and does
  not belong in the store.
- **Time travel** (`LiveHistory`) is a build-once ref in `InspectorApp.tsx`
  — one of the three sanctioned `react-hooks/refs` exemptions in
  `eslint.config.mjs`.

Grep gates 38–40 hold the tier to the same dumb-UI bars as the clients (no
timers, no storage, no self-made transport). A reactive `bind()`-style layer
over `InspectorStore` was considered and deferred — see `docs/IDEAS.md`.
```

(Renumber "38–40" if Task 1 landed different numbers.)

- [ ] **Step 2: IDEAS.md entry**

```markdown
- **Devtools `bind()` layer** — a thin reactive-bindings layer over
  `InspectorStore` (the devtools analogue of `react-bindings`), replacing the
  `useSyncExternalStore` seam and folding `useTimeline`/`useNavigation`
  `useState` view state into store-backed selectors. Considered 2026-09-01,
  deferred: real work for an 11-component UI already holding ≥95% coverage.
  Revisit if the inspector grows enough view state to make prop-drilling or
  render-scope bugs recur.
```

- [ ] **Step 3: Update §12's gate inventory, verify links, commit + ship**

Add the three gates to `docs/architecture/12-architectural-gates.md` wherever gates 26–37 are enumerated, same format as its neighbours.

Run: `pnpm check:doc-links` → exit 0. `pnpm --filter tests gates` → green.

```bash
git add docs/architecture/20-devtools.md docs/architecture/12-architectural-gates.md docs/IDEAS.md
git commit -m "docs: devtools state-layer doctrine (useSyncExternalStore is the bridge) + gate inventory"
```

Push, PR, CI loop, merge per shipping-repo-changes.
