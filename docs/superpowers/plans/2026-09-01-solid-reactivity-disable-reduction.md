# Solid Reactivity Disable Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink client-solid's 97 `eslint-disable` directives (vs client-react's 20) — the entire gap is 77 × `solid/reactivity` — and write down the rationale for whatever legitimately remains, so the package stops looking undisciplined when it is actually one un-documented pattern.

**Architecture:** Three moves. (1) The 26 "native event-handler binding" disables are retired mechanically by the named-wrapper conversion — that work ships inside `2026-09-01-name-jsx-handlers.md` Task 2 (same files, one PR); this plan only verifies it happened. (2) The 45 "setup-scope read" disables get a per-site triage pass: convert to accessor reads where mechanical, keep (with the boilerplate justification upgraded to a site-specific one) where the keyed-remount semantics is load-bearing. (3) The 16 *unsuppressed* `solid/reactivity` warnings in the `docs/lint-warnings.md` ledger get the same fix-or-justify triage, and the stale `docs/STATUS.md` count (says 11) is corrected. Finally the pattern gets a README section so the next reader doesn't need archaeology.

**Tech Stack:** eslint-plugin-solid (`solid/reactivity`), the lint-warnings ledger (`pnpm sync:lint-warnings` / `pnpm check:lint-warnings-drift`), contract suite (507 specs) + solid e2e + visual goldens as behaviour witnesses.

**Spec:** 2026-09-01 audit facts: 77 `solid/reactivity` disables — 45× "setup-scope read is intentional: this component remounts when the value changes", 26× "native event-handler binding…", 6 bespoke. Top files: `Tile.tsx` (7), `NumberFilter.tsx` (7), `ChartPlot.tsx` (7), `DateFilter.tsx` (5). All 97 carry `--` justifications. No doc explains the mass. STATUS.md:91 says 11 outstanding warnings; the ledger header says 16.

## Global Constraints

- Worktree + PR per task; shipping-repo-changes rules.
- **Behaviour-freeze:** contract suite, solid e2e, and the visual tier are the witnesses — a solid/reactivity restructure that changes when a value is read CAN change behaviour (that is the rule's whole point), so every conversion must keep tests green with zero assertion edits; run the local visual tier for files with golden coverage (see `MEMORY` recipe: install+build first, start vite by binary path from the worktree).
- A KEPT disable must carry a **site-specific** justification (what remount key makes the setup-scope read correct, e.g. the `JarvisPanelLayer` one) — the copy-pasted boilerplate is what this plan retires.
- Ledger discipline: any change to warning counts requires `pnpm sync:lint-warnings` and committing `docs/lint-warnings.md` (drift-gated in CI).

---

### Task 1: Verify the 26 event-binding disables died with the handler migration

**Files:** none (verification only; the edits ship in `2026-09-01-name-jsx-handlers.md` Task 2).

- [ ] **Step 1: Count**

Run: `grep -rn "native event-handler binding" packages/client-solid/src | wc -l`
Expected: 0. If >0, the handler-migration PR has not landed or missed sites — finish that plan's Task 2 first; do not duplicate its work here.

### Task 2: Triage the 45 setup-scope disables

**Files:**
- Modify: the files listed by `grep -rln "setup-scope read is intentional" packages/client-solid/src` (~20 files; `Tile.tsx`, `NumberFilter.tsx`, `ChartPlot.tsx`, `DateFilter.tsx`, `NavigatorStrip.tsx`, `RfqCard.tsx` are the top).

**Interfaces:**
- Consumes: nothing. Produces: fewer directives; each survivor's justification names its remount key.

- [ ] **Step 1: Build the triage table**

Run: `grep -rn "setup-scope read is intentional" packages/client-solid/src > /tmp/setup-scope-sites.txt` and for each site record: the prop/signal read, the component's mount keying (`<For>`/`<Show keyed>`/`keyed` parent lookup), and whether the read feeds (a) one-time setup (initial value of a local signal, an id, a constant for the instance's lifetime) or (b) something that would visibly lag if the prop changed without remount.

- [ ] **Step 2: Convert category (b) — reads that should be reactive**

For a read that computes rendered output, replace the setup-scope read with an accessor so the read happens in tracked scope:

```tsx
// before
// eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
const label = formatPair(props.pair);
…
<span>{label}</span>

// after — the read moves inside JSX (tracked), directive deleted
function pairLabel(): string {
  return formatPair(props.pair);
}
…
<span>{pairLabel()}</span>
```

Use `createMemo` instead of a plain accessor only when the computation is
non-trivial per read (the repo's memo doctrine: don't memoize reflexively).

- [ ] **Step 3: Upgrade category (a) — reads that are genuinely instance-constant**

Keep the directive but replace the boilerplate with the site's actual remount
key, following the `JarvisPanelLayer.tsx` precedent:

```tsx
// eslint-disable-next-line solid/reactivity -- setup-scope read is correct: `props.pair` is fixed for this Tile's lifetime (LiveRatesGrid keys its <For> on pair, so a pair change remounts the tile)
```

The claim must be verified against the parent (`<For each=… >` key) before
writing it — a justification naming the wrong parent is worse than the
boilerplate.

- [ ] **Step 4: Verify behaviour-freeze**

Run: `pnpm --filter @rtc/client-solid test` (contract 507 green, zero
assertion edits), `pnpm lint:eslint` (0 errors), `pnpm sync:lint-warnings`
(+ commit the ledger if counts moved), and the local visual tier for touched
golden-covered components; `pnpm test:e2e` once at the end.

- [ ] **Step 5: Commit + ship**

```bash
git add packages/client-solid/src docs/lint-warnings.md
git commit -m "lint(solid): setup-scope disables — convert reactive reads, name each survivor's remount key"
```

Push, PR, CI loop, merge.

### Task 3: The 16 ledgered warnings + the stale STATUS count

**Files:**
- Modify: the files listed in `docs/lint-warnings.md` (16 `solid/reactivity` warnings, 6 files)
- Modify: `docs/lint-warnings.md` (regenerated)
- Modify: `docs/STATUS.md:91` area (via the tracking-workstream-status skill's conventions)

- [ ] **Step 1: Fix-or-justify each ledgered warning**

Same triage as Task 2 applied to the 16 *unsuppressed* sites: convert to a
tracked read where category (b); where category (a), add the sanctioned
site-specific disable (moving the site from the warning column to the
justified-disable column is the STATUS-recorded intent: "fix or justified
`eslint-disable`").

- [ ] **Step 2: Regenerate the ledger; correct STATUS**

Run: `pnpm sync:lint-warnings` → `docs/lint-warnings.md` should now read 0 (or
the small residual, each with a reason it can't be fixed). Update the
`docs/STATUS.md` "Outstanding lint warnings" entry: correct the stale 11→
current count, or close the entry outright if the ledger reached 0.

- [ ] **Step 3: Verify + commit + ship**

Run: `pnpm check:lint-warnings-drift` → exit 0; `pnpm --filter @rtc/client-solid test` → green; `pnpm check:doc-links` → exit 0.

```bash
git add packages/client-solid/src docs/lint-warnings.md docs/STATUS.md
git commit -m "lint(solid): clear the ledgered solid/reactivity warnings; sync STATUS"
```

Push, PR, CI loop, merge.

### Task 4: Write the pattern down

**Files:**
- Modify: `packages/client-solid/README.md` (new section)

- [ ] **Step 1: Add the section**

```markdown
## solid/reactivity and this port

`eslint-plugin-solid`'s `reactivity` rule fires on reads of reactive values
outside tracked scope. This port's remaining directives fall into exactly one
sanctioned shape:

- **Instance-constant setup reads** — a component whose parent keys its
  mount on the value (`<For>`/keyed `<Show>`), so the value cannot change
  without a remount. Each disable names its remount key; a disable without a
  named key is a review defect.

Two shapes that USED to be suppressed here are now structural and need no
directive: props-callback event handlers are named wrappers
(`rtc/name-jsx-handlers`), and reactive reads feeding rendered output are
accessors/memos. Unsuppressed warnings are ledgered in
[`docs/lint-warnings.md`](../../docs/lint-warnings.md) (CI drift-gated).
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm check:doc-links` → exit 0.

```bash
git add packages/client-solid/README.md
git commit -m "docs(solid): the one sanctioned solid/reactivity disable shape"
```

Fold this commit into whichever of Task 2/3's PR is still open, or ship
standalone if both merged.
