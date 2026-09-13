# Dockview Tab Stacks (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make centre-drop tab stacks first-class visually under the Dockview engine — an inactive tab collapses to a muted title chip, the active tab keeps the full panel head, with separator and active affordance — pixel-proven by a new chrome scenario and user-accepted via a skin strip.

**Architecture:** Pure chrome: dockview 7.0.4 already marks `dv-active-tab`/`dv-inactive-tab` on `.dv-tab` (probe-verified), controls already live per-group in the actions slot (probe: 0 controls per tab), and stacking mechanics shipped in Phase 1. The only bridge change is one attribute (`data-panel-title`) on each client's tab slot so `dockview-hud.css` can render the inactive chip via `content: attr(...)` without touching the hashed CSS-module classes. All new rules are structurally scoped so a single-tab bar (the current chrome) stays byte-identical — proven by the full visual assert.

**Tech Stack:** dockview 7.0.4 (pinned), plain CSS in `packages/layout-dockview/src/styles/dockview-hud.css`, React + Solid bridges, playwright visual tier.

**Spec:** [../specs/2026-09-10-dockview-native-features-design.md](../specs/2026-09-10-dockview-native-features-design.md) §3 Phase 2.

## Global Constraints

- dockview stays at 7.0.4; no new dependencies.
- Both web clients move together (React + Solid bridges get identical one-line attribute).
- No new theme tokens (`applyTokens` never unsets — a new token would have to be REQUIRED in all cells; this design needs none: it reuses `--text-muted`, `--text-primary`, `--border-primary`, `--accent-primary`, `--font-display`).
- Zero pixel movement in every pre-existing golden (single-tab bars, in-house engine, everything) — the closing measurement task proves it.
- Gap-0 integer-model invariants hold; no measure-and-correct loops.
- Stacks stay layer-3 (blob-private): the new scenario is deliberately single-engine (`shell/layout-dockview-stacked`, no in-house twin) — the first such scenario; its comment must say why (in-house cannot express a stack; the parity gate's scope is the shared subset per the spec doctrine).

## Probe facts the tasks rely on (measured 2026-09-12, this branch)

- Stacked bar height stays 38px; tabs get `dv-tab dv-active-tab` / `dv-tab dv-inactive-tab`.
- Each tab contains `.rtc-dock-tab > div[data-testid="dock-tab-<panelId>"]` (the bridge's tab slot) holding either the rich `.panelHeadContent` (hashed module class) or the `.panelTitle` span.
- Controls are NOT duplicated per tab — the group actions slot shows the active panel's `PanelHeadControls`.
- Today's defect: an inactive rich-head tab renders its full interactive head slot (rates' Live Rates ▸ Watchlist ▸ CHARTS, 279px) beside the active tab — reads as one merged header, no tab affordance, no separator.

---

### Task 1: Bridge attribute `data-panel-title` (both clients)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (~line 266, the tab-slot div)
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (the twin tab-slot div)
- Test: `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.test.tsx` (or the file that already asserts `data-dock-strip`; create the assertion beside the existing tab-slot ones), solid twin.

**Interfaces:**
- Produces: `div[data-testid="dock-tab-<panelId>"][data-panel-title="<title>"]` — consumed by Task 2's CSS `attr()`.

- [ ] **Step 1: Failing test** — in the existing dockview bridge test (react), assert the tab slot carries the panel's title:

```tsx
expect(screen.getByTestId("dock-tab-fx-rates")).toHaveAttribute(
  "data-panel-title",
  "Live Rates",
);
```

- [ ] **Step 2: Run to verify it fails** (`pnpm --filter @rtc/client-react test -- DockviewLayoutEngine`). Expected: attribute missing.
- [ ] **Step 3: Implement** — on the tab-slot div (react, and the same in solid):

```tsx
<div
  data-testid={`dock-tab-${panelId}`}
  data-panel-title={title}
  data-dock-strip={strip === undefined ? "false" : "true"}
  className={styles.tabSlot}
>
```

- [ ] **Step 4: Tests pass** (react + solid unit suites for the bridge).
- [ ] **Step 5: Commit** `feat(clients): dockview tab slot carries data-panel-title for the stacked-tab chrome`.

### Task 2: Stacked-tab treatment in dockview-hud.css

**Files:**
- Modify: `packages/layout-dockview/src/styles/dockview-hud.css` (new section after the leaf-inset rule)
- Test: `packages/layout-dockview/src/dockviewHud.test.ts` (stylesheet pins, like the leaf-inset pin)

**Interfaces:**
- Consumes: `data-panel-title` from Task 1; dockview's `dv-active-tab`/`dv-inactive-tab`.

- [ ] **Step 1: Failing stylesheet pins** — extend `dockviewHud.test.ts`:

```ts
it("collapses an inactive stacked tab to its muted title chip", () => {
  expect(css).toMatch(/\.dv-inactive-tab [^{]*\[data-panel-title\] > \* \{[^}]*display: none/);
  expect(css).toMatch(/\.dv-inactive-tab [^{]*\[data-panel-title\]::before \{[^}]*content: attr\(data-panel-title\)/);
});

it("separates stacked tabs and marks the active one only in multi-tab bars", () => {
  expect(css).toMatch(/\.dv-tab \+ \.dv-tab \{[^}]*border-inline-start: 1px solid/);
  expect(css).toMatch(/:has\(\.dv-tab \+ \.dv-tab\) \.dv-tab\.dv-active-tab \{[^}]*inset 0 -2px 0 0/);
});
```

- [ ] **Step 2: Run to verify both fail.**
- [ ] **Step 3: Implement** in `dockview-hud.css`:

```css
/* --- Stacked tabs (Phase 2, spec 2026-09-10 §3) ------------------------
 * Only a MULTI-tab bar gets any of this: the inactive-tab rules cannot
 * match a lone tab (dockview marks it dv-active-tab), and the two shared
 * rules scope themselves via `+` / `:has(+)`. A single-tab bar — every
 * pre-existing golden — must stay byte-identical. */

/* The INACTIVE tab collapses to a muted title chip: its rich head-slot
 * widgets (Live Rates ▸ Watchlist ▸ CHARTS) belong to the PANEL, not the
 * bar — showing them un-focused read as one merged header (the Phase 2
 * probe's 279px inactive tab). The chip's text comes from the bridge's
 * data-panel-title attribute because the head's real children are hashed
 * CSS-module nodes this framework-neutral sheet must not name. Font
 * values mirror PanelHead.module.css `.panelTitle` (11px/15px 600
 * --font-display, 0.06em) so the chip sits in the head's own type. */
.dockview-theme-rtc .dv-tab.dv-inactive-tab [data-panel-title] > * {
  display: none;
}

.dockview-theme-rtc .dv-tab.dv-inactive-tab [data-panel-title]::before {
  content: attr(data-panel-title);
  display: block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 14px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 11px;
  line-height: 36px; /* 38px head minus the active tab's 2px inset seat */
  letter-spacing: 0.06em;
  color: var(--text-muted, #64748b);
}

.dockview-theme-rtc .dv-tab.dv-inactive-tab:hover [data-panel-title]::before {
  color: var(--text-primary, #f1f5f9);
}

/* 1px seam between stacked tabs — the card-border colour, so the bar reads
 * as one head with sections rather than two butted headers. `+` cannot
 * match in a single-tab bar. */
.dockview-theme-rtc .dv-tab + .dv-tab {
  border-inline-start: 1px solid var(--border-primary, #334155);
}

/* Active affordance, multi-tab bars only (`:has` guard): a 2px accent seat
 * on the bar's bottom edge — the same edge the in-house title tab uses. */
.dockview-theme-rtc
  .dv-tabs-and-actions-container:has(.dv-tab + .dv-tab)
  .dv-tab.dv-active-tab {
  box-shadow: inset 0 -2px 0 0 var(--accent-primary, #3b82f6);
}
```

- [ ] **Step 4: Stylesheet pins pass; full layout-dockview suite green.**
- [ ] **Step 5: Commit** `feat(layout-dockview): stacked-tab chrome — inactive title chip, tab seam, active seat`.

### Task 3: Stacked fixture blob + engine round-trip witness

**Files:**
- Create: `packages/client-react/tests/ui/visual/react/stackedFxBlob.ts` (and the solid twin under `packages/client-solid/tests/ui/visual/solid/`) — a hand-written, fully commented version-2 blob: the fx seed's 3-group shape with `fx-rates`+`fx-analytics` stacked (rates active), integer models.
- Test: `packages/layout-dockview/src/createDockEngine.test.ts` — the same JSON inline: loading it yields `groupCount() === 3` and a 2-panel group; serialize round-trips with `rtcBlobVersion: 2` intact.

**Interfaces:**
- Produces: `export const STACKED_FX_BLOB: string` (a `JSON.stringify`'d literal) — consumed by Task 4's wrapper store seed.

- [ ] **Step 1: Failing engine test** (inline copy of the fixture; assert 3 groups, one holding both panels, active = fx-rates).
- [ ] **Step 2: Verify it fails only if the fixture is malformed** — this test is the fixture's shape witness; write fixture until green.
- [ ] **Step 3: Commit** `test(layout-dockview): stacked version-2 blob round-trip witness + visual fixture`.

### Task 4: `shell/layout-dockview-stacked` scenario (both clients) + goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (new entry after `shell/layout-dockview`, with the single-engine justification comment)
- Modify: `packages/client-react/tests/ui/visual/react/DockviewEngine.visual.tsx` (+ export `DockviewEngineStackedVisual` whose `InMemoryDockLayoutStore` is pre-seeded `store.save("fx", STACKED_FX_BLOB)` before first render) and `registry.tsx`; solid twins.
- Goldens: regen arm64 `react-local/darwin-arm64` with `-g "layout-dockview-stacked"` (pattern EQUAL to the x86 workflow dispatch input).

- [ ] Steps: scenario entry → registry wiring (both clients) → react capture shows the stacked bar (eyeball the PNG once) → arm64 regen → solid assert `-g "layout-dockview-stacked"` green.
- [ ] **Commit** `test(visual): shell/layout-dockview-stacked — the stacked tab bar's 10-skin pixel witness (first single-engine scenario)`.

### Task 5: Docs

- `packages/layout-dockview/README.md`: extend the Phase 1 "Drag-and-drop policy" section with the stacked-chrome paragraph (inactive chip, seam, active seat; collapse-un-stacks reminder).
- `docs/STATUS.md`: Dockview-native entry → "Phase 2 (tab stacks) in acceptance", bump Last updated.
- `pnpm check:doc-links`.
- **Commit** `docs: dockview stacked-tab chrome recorded`.

### Task 6: Measurement + acceptance strip (orchestrator gate)

- Full react visual assert (every pre-existing cell passes — single-tab invariance proof) and full solid assert; the ONLY new cells are `layout-dockview-stacked`.
- Fast-tier gauntlet 19 gates.
- Acceptance strip: stacked-bar close-ups in classic-dark, classic-light, holo-dark, holo3d-dark, terminal-light, terminal3d-light → session scratchpad, for the user's eyeball. **Merge holds until accepted.**

## Self-review

- Spec coverage: Phase 2's scope (chrome + tests + golden/acceptance loop) is Tasks 1–6; stacking mechanics and eject semantics shipped in Phase 1 (its tests still stand).
- Placeholder scan: all steps carry real code; Task 3's fixture is written against the engine witness rather than pasted here (it is data, pinned by the test in the same task).
- Type consistency: `STACKED_FX_BLOB: string` consumed as written; `data-panel-title` spelled identically in Task 1 JSX, Task 2 CSS, and the pins.
