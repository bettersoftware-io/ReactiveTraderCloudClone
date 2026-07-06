# v2 Parity A — Dock Behaviour + FX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make panel drag-resize/maximize/collapse behave and look like the v2
prototype on every screen, and close the FX chrome deltas (trade confirmation,
panel heads, blotter chrome, PnL chart).

**Architecture:** All dock geometry stays in `@rtc/client-core`
(`LayoutMachine`, `defaultLayoutPort`) rendered by the one framework-coupled
component `InhouseLayoutEngine`. Styling ports from
`packages/client-prototype` (in-repo faithful React port — cite its files for
pixel values instead of guessing). Data changes (trader name) go in
`@rtc/domain`. No rxjs/fetch/localStorage in `src/ui`; CSS Modules only;
state via `data-*` attributes.

**Tech Stack:** React 19, CSS Modules, vitest + RTL contract tier, Playwright
visual goldens (dual set), pnpm + turborepo.

## Global Constraints

- Worktree: `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/v2-fidelity-parity`, branch `worktree-v2-fidelity-parity`. **Every Bash command MUST be prefixed `cd <that absolute path> && `** (cwd resets per call). Assert `git branch --show-current` = `worktree-v2-fidelity-parity` before any commit.
- Per touched file before commit: `pnpm exec biome check <file>` clean AND repo `pnpm lint:eslint` (scoped is fine: `pnpm exec eslint <file>`) clean. CI also runs `lint:eslint:types` + `lint:css` — run them at task end.
- No eslint-disable / biome-ignore additions. No inline `style={{…}}` in src/ui (runtime `--var` custom-property values via the existing exempt pattern only).
- Pixel source of truth: `packages/client-prototype/src/**` (port CSS values verbatim where they exist) and `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` for anything the port lacks.
- Visual goldens: do NOT regenerate wholesale. Local set: per-runner `:update` narrowly (`-g`), only scenarios whose component changed. x86 `react/` set: `update-visual-goldens` workflow at PR time, then copy ONLY changed files (byte-compare).
- New mono/display-font text in visual-tested components needs a pinned px `line-height` (x86 dimension-flake rule).

---

### Task 1: Engine handle rendering fix (sibling handles, correct cursors)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.module.css`
- Test: `packages/client-react/tests/ui/contract/specs/shell/layout/LayoutEngine.contract.spec.ts`

**Interfaces:**
- Produces: handles render as direct children of `.split` between cells
  (`<hr data-testid="handle-<pathKey>-<i>">` unchanged), `data-orientation`
  semantics unchanged (`vertical` for row splits, `horizontal` for column
  splits).

Problem being fixed: the `<hr>` handle currently renders **inside** `.cell`
(which is `display:flex` row), so in a column split the divider paints as a
vertical right-edge bar with the wrong cursor. The prototype renders handles
as siblings between panes (`SplitHandle.tsx`).

- [ ] **Step 1: Write/extend the failing contract test** — in a column split
  the handle must be a *sibling following the cell*, not a descendant:

```ts
it("renders split handles as siblings between cells, not inside them", () => {
  renderEngine(); // existing helper with FX default state
  const handle = screen.getByTestId("handle--0"); // root column split, index 0
  expect(handle.parentElement).toHaveAttribute("data-dir", "column");
  expect(handle.previousElementSibling).toHaveAttribute("data-testid", expect.stringContaining("cell"));
});
```

(Adapt selector names to the existing spec's helpers; cells may need a
`data-testid="cell-<pathKey>-<i>"` added.)

- [ ] **Step 2: Run to verify it fails** — `cd <worktree> && pnpm --filter @rtc/client-react test:ui:contract -- -t "siblings"`.
- [ ] **Step 3: Implement** — in `SplitNode`, move the `<hr>` out of the cell
  `<div>`: emit `[cell, handle?]` pairs directly under `.split` (use a
  Fragment keyed by `childKey`), keep `showHandle` logic. CSS: `.handle`
  becomes `flex: 0 0 7px; align-self: stretch;` with orientation-specific
  cursor (`[data-orientation="vertical"] { cursor: col-resize; }`,
  `[data-orientation="horizontal"] { cursor: row-resize; }`) and an inner
  hover accent matching `packages/client-prototype/src/layout/SplitHandle.module.css`
  (port its colors/hover/active styles verbatim).
- [ ] **Step 4: Contract suite green** — same command, all specs.
- [ ] **Step 5: Commit** `fix(layout): render split handles between cells with correct resize cursors`.

### Task 2: Resizable everywhere — unpin blotters, un-fix the FX rail, drag persistence

**Files:**
- Modify: `packages/client-core/src/layout/defaultLayoutPort.ts`
- Modify (if needed): `packages/client-core/src/presenters/LayoutMachine.ts`
- Test: `packages/client-core/src/layout/__tests__/defaultLayoutPort.test.ts`, machine tests

**Interfaces:**
- Produces: FX tree = column [ row [ rates | column [analytics, positions] ] , blotter ]
  with **no `fixedPx`**, sizes `[0.78, 0.22]` root and `[0.74, 0.26]` row
  (0.26 ≈ 360px at 1400px viewport — prototype default); `pinned` removed
  from `fx-blotter` + `credit-blotter` specs (flag machinery stays for
  future use).

- [ ] **Step 1: Failing tests** — default FX layout has no `fixedPx`; no spec is `pinned`; every adjacent pair in every split yields a handle (assert via a tree-walk helper mirroring `showHandle`).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — edit `PANEL_SPECS` + `FX_ROOT`; delete the credit `pinned`. Check `LayoutMachine` resize intent already persists ratios (it should — find its persistence port; if resize is not persisted, wire it the same way maximize/collapse are). Grep for `data-pinned` / `pinned` consumers (engine CSS `.cell[data-pinned-cell]`, contract specs, e2e) and update them.
- [ ] **Step 4: Green** — client-core unit tests + client-react contract suite + `RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e` (layout e2e exists).
- [ ] **Step 5: Commit** `feat(layout): resizable splits everywhere — drop fixedPx rail and pinned blotters`.

### Task 3: Maximize transition + collapse-to-strip parity

**Files:**
- Modify: `InhouseLayoutEngine.tsx` + `.module.css` (same dir as Task 1)
- Test: contract spec (strip semantics), visual check vs prototype

**Interfaces:**
- Consumes: `data-strip`, `data-collapsed`, `data-maximized` attrs (exist).
- Produces: strip renders `⛶ <TITLE>` uppercase restore bar (click = expand/
  restore); `.cell`/`.panel` animate flex changes ≈ 0.34s ease (prototype
  `useMaxPanel.ts` + its screen CSS — port timings verbatim; respect
  `prefers-reduced-motion: reduce` by disabling the transition).

- [ ] **Step 1: Failing contract test** — collapsed panel renders a restore control labelled with the panel title and NO panel body; clicking it calls expand.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — strip markup in `renderPanel` (replace header+null body with a single button-styled bar, vertical writing-mode when the strip sits in a row split — prototype `stripBar`); CSS transition on the geometry property the engine actually changes (flex-grow) gated by `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4: Green** contract + eyeball vs http://localhost:8899 (collapse Analytics → strip bars in the rail).
- [ ] **Step 5: Commit** `feat(layout): prototype-parity collapse strips and 0.34s maximize glide`.

### Task 4: Panel-head chrome uniformity (icon tabs + glyph controls)

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/appHeadRegistry.tsx` (add fx-analytics, fx-positions entries)
- Create: `packages/client-react/src/ui/fx/analytics/AnalyticsHead.tsx` (+ module.css), `packages/client-react/src/ui/fx/positions/PositionsHead.tsx` (+ module.css)
- Modify: `InhouseLayoutEngine.module.css` (`.panelTitle`, `.panelControl`) + `renderPanel` control glyphs
- Test: contract specs for the two new heads; existing head specs updated

**Interfaces:**
- Consumes: `PanelHeadTabs` component/styles from #105 (`PanelHeadTabs.module.css`).
- Produces: heads read `◉ Analytics` / `◎ Positions` in the prototype's
  active-tab style (accent text + 2px underline, 11px display font, 0.14em
  tracking — port from prototype `panelHeadStyle`/`tabActiveStyle` in
  `packages/client-prototype/src/layout/Panel.module.css`); engine controls
  become `—` (collapse) and `⛶`/`❐` (maximize/restore) chip-styled glyphs
  per prototype `mxBtn`.

- [ ] Steps: failing contract test (head text + `data-active` underline attr) → implement (default title span also adopts the tab style so Credit/Equities/Admin/Blotter titles match before their own restructures) → green → commit `feat(fx): prototype panel-head chrome on all panels`.

### Task 5: Trade confirmation overlay + "You" trader

**Files:**
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TileConfirmation.tsx` + its module.css (exact filenames per dir listing)
- Modify: `packages/domain/src/simulators/TradeStoreSimulator.ts` (executed-trade `tradeName: "You"`)
- Test: domain unit test (executed trade carries `tradeName === "You"`), tile contract spec, tile visual goldens (narrow regen)

**Interfaces:**
- Consumes: existing execution flow (`ExecutionSimulator`/trade store), tile `data-*` state hooks.
- Produces: confirmation markup = ✓ glyph, `You Sold`/`You Bought` line,
  dealt amount line, RATE / SPT / ID column row, `DISMISS` chip button —
  copy structure + CSS from `packages/client-prototype/src/fx/LiveRates`
  confirmation component verbatim; keep existing testids and the semantic
  `data-*` state attribute names.

- [ ] Steps: failing domain test (`tradeName "You"`) → fix simulator → failing/updated tile contract expectations → port markup+CSS → contract + unit green → narrow golden regen for tile scenarios (all 3 runners, local set) → commit `feat(fx): prototype trade confirmation overlay; own trades read "You"`.

### Task 6: Blotter chrome parity

**Files:**
- Modify: `packages/client-react/src/ui/fx/blotter/*` (header sort glyphs, rejected-row styling; exact files: the column-header component + FxBlotter.module.css)
- Test: fx blotter contract spec, narrow goldens

**Interfaces:**
- Produces: sort glyph rendered ONLY on the actively-sorted column (`ID ▼`
  default); other headers plain uppercase; sorting still available on click
  (functionality unchanged). Rejected rows: red `data-status="rejected"` text
  color on the status cell + muted row, **no** `text-decoration: line-through`
  anywhere. Match `packages/client-prototype/src/fx/Blotter/*` CSS.

- [ ] Steps: failing contract test (only one header carries a sort glyph; rejected row has no line-through) → implement → green → narrow goldens → commit `fix(fx): blotter header + rejected-row chrome parity`.

### Task 7: Analytics PnL chart glow-area parity

**Files:**
- Modify: `packages/client-react/src/ui/fx/analytics/PnlChart.tsx` + module.css
- Test: existing PnlChart contract/visual scenarios (narrow regen)

**Interfaces:**
- Consumes: existing pnl history stream via ViewModel (do not change data).
- Produces: smoothed area path (monotone/Catmull-Rom smoothing over the same
  points), gradient fill fading to transparent, stroke + drop-shadow glow
  keyed off existing `data-sign`; port geometry approach from
  `packages/client-prototype/src/fx/Analytics/` chart component.

- [ ] Steps: snapshot current SVG path in a contract test asserting a single smooth `path` with `fill="url(#…)"` (not a polyline) → implement → green → narrow goldens → commit `feat(fx): smooth glow-area PnL chart per prototype`.

### Task 8: Final gauntlet + PR + CI loop + x86 goldens

- [ ] `cd <worktree> && pnpm typecheck && pnpm exec biome ci . && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm test`
- [ ] `pnpm --filter @rtc/client-react test:ui:contract:coverage` — ≥95%.
- [ ] Local visual tiers: run full suites (no regen) — only intended diffs; regen those narrowly.
- [ ] `RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e`
- [ ] Side-by-side eyeball: worktree dev server (own port) vs :8899 — drag every splitter, maximize, collapse, execute a trade, on all 4 screens + a light-mode + terminal-skin pass.
- [ ] Push, `gh pr create`, dispatch `update-visual-goldens` workflow on the branch, copy ONLY changed x86 goldens, commit, then CI loop per shipping-repo-changes (`gh run list`, match headSha), catch up main if needed, merge `--merge`.

## Self-review notes
- Task 2 may reveal resize-persistence is missing in LayoutMachine — that's in
  scope for Task 2 (wire through the same port maximize uses), not a new task.
- Strip-in-row-split vertical writing mode (Task 3) is the prototype's
  `stripWrap`/`stripBar` — verify against Credit aside collapse too.
- Tasks 5–7 regenerate an overlapping golden set — regen once at Task 8 if churn
  repeats.
