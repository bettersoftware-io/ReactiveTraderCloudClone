# v2 Parity B — FX Watchlist + Activity Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FX "WATCHLIST VIEW — COMING ONLINE" and "ACTIVITY FEED —
COMING ONLINE" placeholders with the prototype's functional views, and pin the
visual harness clock (pre-existing tile date flake).

**Architecture:** Port `packages/client-prototype/src/fx/LiveRates/WatchlistView.tsx`
and `.../Blotter/ActivityView.tsx` into `client-react`, sourcing data through the
existing `useViewModel()`/`useFxView` seams (rates stream already feeds the tiles;
activity derives from the trades stream — newest first, timestamped). CSS Modules
only; tokens; no rxjs in src/ui. Stacked on branch `worktree-v2-fidelity-parity`
(PR #114); base branch for the PR is that branch until #114 merges.

**Tech Stack:** React 19, CSS Modules, vitest contract tier, dual golden sets.

## Global Constraints

Same as plan A (`2026-07-06-v2-parity-a-dock-fx.md`): literal-path `cd` prefix on
every Bash command, branch assertion before commits (branch: `worktree-v2-parity-b`),
per-file biome+eslint, no lint-disables, no inline style props, pinned px
line-heights on mono/display text, literal glyphs, coverage ≥95%, force-regens
full-suite delete-first, x86 goldens via workflow at PR time.

---

### Task 1: Watchlist view (PAIR / MID / MOVE / SPREAD / TREND table)

**Files:**
- Modify: `packages/client-react/src/ui/fx/liveRates/LiveRatesPanel.tsx` (replace placeholder branch)
- Create: `packages/client-react/src/ui/fx/liveRates/WatchlistView.tsx` + `.module.css`
- Test: contract spec `tests/ui/contract/specs/fx/` + visual registry scenario

**Interfaces:** consumes the same rates data the tile grid uses (via `useFxView`);
respects the existing currency-filter chips (chips filter both views — verify how
the view-mode preference + filter compose in `LiveRatesPanel`). Columns per
prototype: PAIR (bold), MID (red/green by last tick), MOVE (▲/▼ n pip, colored),
SPREAD (dim), TREND (inline SVG sparkline from recent mid history, stroke by
direction). Port markup/CSS/formatting from the prototype file verbatim where
possible; data adapters minimal.

- [ ] Failing contract test (rows per filtered pair; MID colored via data-sign;
      placeholder text gone) → implement → green → visual scenario + local
      goldens (full-suite update) → commit `feat(fx): functional watchlist view`.

### Task 2: Activity feed

**Files:**
- Modify: `packages/client-react/src/ui/fx/blotter/FxBlotter.tsx` (replace placeholder branch)
- Create: `packages/client-react/src/ui/fx/blotter/ActivityView.tsx` + `.module.css`
- Test: contract spec + visual scenario

**Interfaces:** derives from the trades stream (same source as blotter rows):
one line per trade, newest first — `HH:MM:SS · TRADE · Sell EURUSD 1,000,000 @
1.09205` with TRADE badge chip; empty state exactly "No activity yet — execute a
trade to populate the feed". Executed-trade entries appear live (the blotter
data already updates — reuse it, no new port). Port from prototype ActivityView.

- [ ] Failing contract test (empty state text; a trade row renders time + badge +
      description; newest first) → implement → green → goldens → commit
      `feat(fx): live activity feed`.

### Task 3: Pin visual-harness clock (pre-existing flake)

**Files:**
- Modify: `packages/client-react/tests/ui/visual/react/VisualScenario.tsx` (or each tier's setup — find the single choke point)
- Possibly: tier configs (fake timers/system time)

**Interfaces:** `Tile.tsx:118` renders `formatSpotDate(new Date(), 2)` — goldens
bake the render date (CI reddens across date boundaries + a related 7px jitter
was observed). Pin system time to a fixed instant (e.g. 2026-07-02T09:00:00Z,
matching existing goldens' "SPT 04 Jul") in ALL THREE tiers' scenario mounts so
tile footers are date-stable. Do NOT change app code. If a tier cannot fake time
cleanly (playwright-ct), use its documented clock API (`page.clock`) or an
init-script Date shim — same instant everywhere.

- [ ] Verify current goldens' baked dates → pin the clock → run all three tiers:
      expect zero golden churn if the pinned instant matches the baked dates
      (else regen the mismatched ones once, full-suite) → commit
      `test: pin visual-harness clock — tile SPT footer was date-dependent`.

### Task 4: Gauntlet + stacked PR

- [ ] Full gauntlet (typecheck, biome ci, eslint×2, stylelint, unit, contract+coverage ≥95%, visual tiers, e2e no-cypress).
- [ ] Live check vs prototype (:8899 FX Watchlist + Activity tabs) on the worktree dev server.
- [ ] Push branch `worktree-v2-parity-b`; `gh pr create --base worktree-v2-fidelity-parity` (retarget to main after #114 merges); x86 golden workflow on this branch; sync changed goldens; CI loop.
