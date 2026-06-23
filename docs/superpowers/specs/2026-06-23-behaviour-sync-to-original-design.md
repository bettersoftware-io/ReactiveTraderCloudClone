# Behaviour Sync to the Original — Design Spec

> **Status:** Approved design (brainstorming output). Next step: implementation plan via
> the writing-plans skill.
> **Date:** 2026-06-23.
> **Companion docs:** `docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md`
> (the fidelity retrospective this work resolves).

## 1. Goal

Bring this clone's **observable behaviour** into exact agreement with the **original
ReactiveTraderCloud web/PWA build** — the build the `./specs/` were generated from —
correcting all three layers (`./specs/`, tests, implementation) so they finally agree
with each other and with ground truth.

The original codebase is the **source of truth**, pinned at archived commit `4a31f01`
(`packages/client/src/...`). Where this spec cites the original, it cites that commit.

## 2. Hard invariants (must survive untouched)

This is a *behaviour* change, never an *architecture* change. The following are
non-negotiable and any task that would break them is wrong:

- **Clean architecture / dependency rule:** `domain` depends only on `rxjs` at runtime;
  the app layer stays framework-free; `client` / `server` / `mobile` never import each
  other. Enforced by dependency-cruiser.
- **Framework-swap test structure:** the framework-neutral `shared/` core plus the
  per-framework swap-trio (`react/`) is preserved. Corrected assertions live in the
  neutral layer, so the planned SolidJS client inherits the *corrected* contract for
  free.
- **Existing dev gates:** Biome, ESLint (incl. React Compiler rules), Stylelint,
  dependency-cruiser, knip, manypkg all stay green.
- **`#/` subpath-alias imports** and **CSS Modules** conventions unchanged.

## 3. Decisions taken during brainstorming

| # | Decision | Choice |
|---|---|---|
| D1 | Definition of "exactly as the original" for backend/platform-entangled behaviours | **Observable behaviour of the standard web/PWA build.** Simulators reproduce server-driven effects (auto-reject, expiry). CreditExceeded stays unreachable (the web build no-ops the limit check), so it is explicitly *out of scope*. |
| D2 | Treatment of the generated `./specs/` | **Correct them** to match the original, so specs ↔ tests ↔ code all agree. |
| D3 | Verification rigor | **Golden fixtures** lifted from the original's pure functions for deterministic value/logic; **provenance-cited assertions** (original `file:line`) elsewhere. |
| D4 | Per-behaviour loop | **Red-first TDD:** correct spec + test to the original's value (fails against current code), then fix the implementation (green). |
| D5 | Sequencing | **Grouped by domain, High→Low within domain.** |
| D6 | Stale-tile fidelity | Adopt "price buttons unreachable when stale" via **disabling** (the faithful observable equivalent), not reproducing the original's full tile-*suspend*, since our architecture surfaces staleness via `StaleFlagMachine`. |

## 4. Scope — the behaviour list

Ground truth citations are to the original repo (`packages/client/src/`, commit `4a31f01`).
"Clone now" describes the current (incorrect) behaviour to be replaced.

### Tier 1 — deterministic value/logic (golden-fixture verified)

**T1.1 — Blotter sort direction.**
Original: `descDefaultFields = {tradeDate, valueDate, tradeId}` sort DESC on first click;
**all other columns including Notional and Rate sort ASC first**
(`App/Trades/TradesState/sortState.ts:32,66-69`). Clone now: Notional/Rate desc-first.
Fix: clone's `columnSort` desc-first set must be exactly `{tradeId, tradeDate, valueDate}`.

**T1.2 — Latest P&L value format.**
Original: `formatAsWholeNumber` (`Intl.NumberFormat`, 0 fraction digits → comma grouping)
with a literal `"USD"` prefix and a leading `"+"` for non-negatives
(`App/Analytics/ProfitAndLoss/LastPosition.tsx:11,16,23`; `utils/formatNumber.ts:95-99,136`).
Clone now: abbreviated `+12.3k`, no USD. Fix: clone `PnlValue` renders `USD {+}{n with commas}`.

**T1.3 — PnL-per-pair bar format + hover.**
Original: default label `formatWithScale` (k/m, whole-number mantissa); on hover swap to
`precisionNumberFormatter(2)` — full value, comma grouping, 2 dp
(`App/Analytics/PnL/PNLBar.tsx:29,42-50,81`). Clone now: static abbreviated, `m` branch,
no hover. Fix: match the scale formatter AND add hover→precise.

**T1.4 — Position bubbles.**
Original (`App/Analytics/Positions/data.ts`, `BubbleChart.tsx`):
- **one bubble per currency**, aggregating `baseTradedAmount`→base and
  `counterTradedAmount`→terms across pairs, zero-net currencies filtered (`data.ts:46-64`);
- radius `d3.scaleLinear(abs(baseTradedAmount)) → [15,60]`px; colour by sign of
  **traded amount** (`data.ts:65-90`);
- **draggable** via `d3.drag`; `d3.forceSimulation` + `forceX/forceY` (strength 0.1) +
  `forceCollide`; drag-end sets `fx/fy=null` so bubbles drift back (`BubbleChart.tsx:85-130`);
- hover **tooltip** `"{currency} {formatAsWholeNumber(amount)}"` (`BubbleChart.tsx:72,131-138`).
Clone now: per-pair, sized by PnL, no drag, no tooltip. Fix: all four points.
*(d3 is a UI-layer concern; the per-currency aggregation + magnitudes belong in the
domain/presenter as pure, fixture-tested logic; the force/drag rendering is UI.)*

**T1.5 — New-RFQ max quantity = cap, not block.**
Original: `applyMaximum = Math.min(value, MAX_INPUT_VALUE)`, `MAX_INPUT_VALUE = 100_000_000`
(`App/Credit/NewRfq/state.ts:69-74`; `utils/formatNumber.ts:232-235`). Clone now: blocks
submission with an error. Fix: clamp the input; remove the block.

**T1.6 — FX RFQ response delay = 500–999 ms.**
Original: `delay(500 + Math.floor(Math.random()*500))` (`services/rfqs/rfqs.ts:13`). Clone
now: 500–2000 ms. Fix: clone's `PricingSimulator` RFQ delay to `500 + floor(rand*500)`.

**T1.7 — New-row highlight = 1s ease-in-out ×3 flash.**
Original: `animation: backgroundFlash 1s ease-in-out 3` over a keyframe ramp
(bg → brand → bg), held `HIGHLIGHT_ROW_FLASH_TIME = 3000`ms
(`App/Trades/GridRegion/styled.ts:36-38`; `utils/styling/backgroundFlash.ts:3-13`;
`constants.ts:54`). Clone now: single 3s fade. Fix: CSS `@keyframes` flash, iteration 3;
keep the 3000ms highlight window from `RowHighlightMachine`.

### Tier 2 — behavioural wiring (provenance-cited)

**T2.1 — Stale tile disables trading.**
Original: stale → tile suspends (price buttons unmount); disabled buttons are truly
disabled (`pointer-events:none`) (`App/LiveRates/Tile/Tile.tsx:50-58`;
`PriceButton/PriceButton.styles.tsx:106-110`). Per D6, clone fix: include `stale` in the
Buy/Sell `disabled` predicate so a trade cannot be fired against a stale price.

**T2.2 — Idle disconnect tears down the connection (15 min).**
Original: after 15 min idle, `idleDisconnect$` calls `dispose()` on the gateway
connection, then marks `IDLE_DISCONNECTED`; reconnect is user-initiated
(`services/connection.ts:71,74-96`). Clone now: only emits an `idleTimeout` event; nothing
closes the transport. Fix: wire the idle event to actually close the (simulated/real)
connection at the adapter/composition layer.

**T2.3 — Credit blotter gets sort / filter / CSV.**
Original: the credit blotter reuses the shared grid (`GridRegion`) with full sort, the
three column-filter types, quick filter, applied-filter chips, and CSV export
(`App/Credit/...CoreCreditTrades.tsx:23-31`; shared `TradesState`/`GridRegion`/`ExcelButton`).
Clone now: a static table. Fix: drive the credit blotter through the same column/sort/filter/
export machinery the FX blotter already uses.

**T2.4 — Footer status label = "Disconnected"; idle/offline wording in the modal.**
Original: footer maps both idle and offline to `DISCONNECTED`, showing only
"Connecting"/"Connected"/"Disconnected" (`App/Footer/StatusButton/StatusButton.tsx:8-19`);
the idle-specific and offline-specific sentences live in the `DisconnectionOverlay` modal
(`components/DisconnectionOverlay.tsx:29-42`). Clone now: footer shows "Idle"/"Offline".
Fix: footer label collapses to "Disconnected"; move the distinct wording into the
disconnection overlay.

### Tier 3 — simulator plays the server role (per D1)

**T3.1 — Competing-quote auto-reject, surfaced live.**
Original: on buyer acceptance the server emits `QUOTE_ACCEPTED_RFQ_UPDATE`; the client
reducer flips the other pending quotes to the rejected states via `getQuoteStateOnAccept`
(`services/credit/creditRfqs.ts:173-216`). Clone now: the simulator computes the rejection
internally but emits no event, so losing quotes never update live. Fix: add an
accepted-event to the clone's workflow port event union + simulator so the reducer flips
sibling quotes — reproducing the live UI effect. *(This adds the missing delivery seam the
spec-gen dropped; it must respect the port/event architecture.)*

**T3.2 — RFQ expiry drives the lifecycle + countdown.**
Original: expiry is server-driven; the frontend countdown is cosmetic; RFQs reach
`Expired` from a server update (`services/credit/creditRfqs.ts:102-112`;
`App/Credit/common/CreditRfqTimer.tsx`). `CREDIT_RFQ_EXPIRY_SECONDS = 120`. Clone now: no
countdown, `Expired` unreachable. Fix (D1: simulator is our server): the simulator emits
an expiry transition at +120s so an open RFQ reaches `Expired`; the UI shows a live
countdown driving toward it.

### Out of scope (deliberate non-fix)

**CreditExceeded.** The original's standard web build no-ops the limit check
(`services/limitChecker/limitChecker.ts:5-9` returns `of(true)`); a web user never sees
the state. The clone already matches (overlay exists, never fires). Per D1 this is left as
is and **documented** as a deliberate web-build-faithful non-fix in both the spec and the
retrospective's resolution note.

## 5. The golden-fixture mechanism

The scratchpad clone of the original is **ephemeral**. Therefore the plan's **first task**
captures ground truth into the repo so nothing depends on the original at run time:

- For each Tier-1 item, take the original's pure function (e.g. the `formatNumber`
  formatters, the `sortState` comparator, the bubble-aggregation/`scaleLinear` geometry,
  the spread/pip math) and generate a committed `input → expected-output` fixture, e.g.
  `packages/client-react/tests/ui/.../__golden__/<name>.original.json`.
- Each fixture file is header-commented with the source commit (`4a31f01`) and the
  original `file:line` it was derived from.
- The clone's reimplementation asserts exact equality against the fixture.
- Where lifting the function is impractical, hand-author the fixture from a documented
  original `file:line` (still provenance-cited).

This converts the test oracle from "a number I typed" into "the original's actual output."

## 6. Per-behaviour unit of work (red-first)

Each behaviour above is one right-sized task carrying its own test cycle:

1. Correct the `./specs/` text to the original's truth (cite original `file:line`).
2. **Tier 1:** add the golden fixture + assertion (fails red against current code).
   **Tier 2/3:** correct the framework-neutral contract/e2e assertion to the original's
   value (fails red).
3. Fix the implementation (green).
4. Run the touched domain's gate(s); commit.

## 7. Artifact map

- `./specs/**` — corrected feature/domain/service/mock-backend files (D2).
- `packages/client-react/tests/ui/contract/specs/**`, `.../visual/**` — neutral assertions
  corrected; swap-trio structure untouched; visual goldens regenerated where appearance
  changes (P&L text, bubbles, flash) — **both committed golden sets** (CI `react/` x86 +
  local `react-local/<arch>`) per existing process.
- `tests/specs/*.feature` — corrected where they assert divergent values (sort, labels).
- `packages/domain/src/**` — formatters, comparators, simulators, ports, machines.
- `packages/client-react/src/ui/**` — component wiring (bubbles d3, flash CSS, footer,
  credit blotter, tile disable).
- `docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md` — append a
  "Resolution" note linking to this work.

## 8. Sequencing

Grouped by domain, High→Low within each; Tier-3 items land last in their domain (they
touch the port/event seam):

1. **Blotter** — T1.1 (sort), T1.7 (flash).
2. **Analytics** — T1.2 (P&L format), T1.4 (bubbles), T1.3 (bar hover).
3. **Credit** — T1.5 (max-qty cap), T2.3 (blotter grid), T3.1 (auto-reject), T3.2 (expiry).
4. **FX / Tile** — T1.6 (RFQ delay), T2.1 (stale disable).
5. **Shared** — T2.2 (idle teardown), T2.4 (footer label + modal).

Task 0 (cross-cutting): capture golden fixtures from the original (§5). Each domain is
independently shippable.

## 9. Verification

- **Per task:** the new golden/contract assertion goes green; the touched domain's unit
  gate passes.
- **Per domain:** full `pnpm test` for the affected packages + the relevant e2e suite;
  regenerate visual goldens where appearance changed.
- **Final:** `pnpm test`, `pnpm typecheck`, full e2e, and all dev gates green; then re-run
  the audit checklist confirming each of the 13 in-scope items (T1.1–T3.2) now matches the
  original, and CreditExceeded is documented as the sole deliberate exception.

## 10. Success criteria

1. All 13 in-scope behaviours match the original web build, each backed by a golden
   fixture (Tier 1) or a provenance-cited assertion (Tier 2/3).
2. `./specs/`, tests, and implementation agree with one another and with the original.
3. No test asserts a value that diverges from the original without a cited reason.
4. All hard invariants (§2) intact; all gates green.
5. The retrospective carries a resolution note; CreditExceeded's non-fix is documented.
