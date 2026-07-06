# v2 Parity C — Credit Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Credit screen to the prototype's three-panel dock — left **New RFQ** form panel, center **RFQs** dealer-quote cards with LIVE/CLOSED/ALL filter pills, bottom **Credit Blotter** — replacing the current single tabbed `CreditWorkspace` (spec G2, `docs/superpowers/specs/2026-07-06-v2-fidelity-parity-design.md`).

**Architecture:** Port markup/CSS from `packages/client-prototype/src/credit/*` onto the real data seams: `useViewModel()` hooks backed by `RfqsPresenter` (`packages/client-core/src/presenters/RfqsPresenter.ts`) and `CreditRfqSimulator`. Layout via `defaultLayoutPort.ts` tree + `appPanelRegistry`/`appHeadRegistry` (the FX pattern). Sell Side is kept as a **registered panel outside the default layout** (`credit-sell-side` in `PANEL_SPECS`, not in `CREDIT_ROOT`) — same precedent as the Equities depth-ladder decision in the spec.

**Tech Stack:** React 19, CSS Modules, @rtc/client-core presenters, vitest contract tier, dual golden sets, Playwright e2e.

## Global Constraints

Same as plans A/B: EVERY Bash command prefixed `cd <absolute worktree path> && ` (literal path, no $vars); assert branch before every commit; per-file biome + BOTH eslint configs on touched files; NO lint-disables; no inline `style={{}}` (CSS custom-property pattern only); pinned px line-heights on mono/display-font text; literal glyphs in JSX (never `\uXXXX`); UI contract coverage ≥95%; golden force-regens are FULL-SUITE delete-first; x86 goldens only via the `update-visual-goldens` workflow; `pnpm exec knip` before push; `test:e2e` in the final gauntlet.

## Key seam facts (for all tasks)

- `useViewModel()` (from `@rtc/react-bindings`) credit hooks: `useRfqs(): readonly Rfq[]`, `useQuotesForRfq(rfqId)`, `useInstruments()`, `useDealers()`, `useAcceptQuote()`, `useRfqSubmission()`, `useRfqCountdown(creationTimestamp, totalMs)`, `useAnimationIntents(target)`.
- `RfqsPresenter` also has `cancelRfq(rfqId): Observable<void>` — NOT yet exposed on the ViewModel; Task 1 adds `useCancelRfq`.
- Domain: `RfqState { Open, Expired, Cancelled, Closed }`; `QuoteState` union `pendingWithoutPrice|pendingWithPrice{price}|passed|accepted{price}|rejectedWithPrice|rejectedWithoutPrice`; house dealer name const `ADAPTIVE_BANK_NAME` (`packages/domain/src/credit/dealer.ts`); `CREDIT_QUANTITY_MULTIPLIER=1000`, `CREDIT_RFQ_EXPIRY_SECONDS=120`.
- Head↔panel shared state pattern: inspect how `LiveRatesHead` ↔ `LiveRatesPanel` share the view-mode (the `useViewModePreference` seam added in PR #105) and reuse that mechanism for the credit filter (`live|closed|all`).
- Prototype state mapping: Open→`LIVE`, Closed→`ACCEPTED`, Cancelled→`CANCELLED`, Expired→`EXPIRED`; card `data-state` live/accepted/terminated.
- Best quote ★: min price among priced quotes for Buy, max for Sell. Priced = `pendingWithPrice`.

---

### Task 1: RFQs panel port (dealer-quote cards)

**Files:**
- Create: `packages/client-react/src/ui/credit/rfqs/RfqsPanel.tsx` + `.module.css`, `RfqCard.tsx` + `.module.css`, `QuoteRow.tsx` + `.module.css`, `EmptyRfqs.tsx` + `.module.css`, `rfqCardVm.ts`
- Modify: `packages/react-bindings/src/createViewModel.ts` (add `useCancelRfq`), its test
- Port source (verbatim visuals): `packages/client-prototype/src/credit/Rfqs/*`, `packages/client-prototype/src/credit/rfqCardVm.ts`
- Test: `packages/client-react/tests/ui/contract/specs/credit/rfqs/*` (new specs + page objects; old rfqTiles specs retired in Task 4)

**Interfaces:** `RfqsPanel()` reads `useRfqs`/`useQuotesForRfq`/`useInstruments`/`useDealers`/`useAcceptQuote`/`useCancelRfq` + the shared filter preference (`live|closed|all`, key `"credit-rfqs-filter"`). Produces `rfqCardVm(rfq, quotes, instruments, dealers, nowMs)` → card VM with `stateLabel`, `data-state`, quote rows (★ best, `data-house` for Adaptive Bank, ACCEPT button on `pendingWithPrice`), footer: live → countdown secs + progress bar (`--bar-pct` via `useRfqCountdown`) + CANCEL; accepted → `✓ You traded with {dealer}`; terminated → `🗑 {stateLabel} · remove` (client-side dismissed set, keep existing pattern). FLIP grid via the existing `useFlipGrid`. Empty state `◇ No RFQs to show`.

- [ ] Failing contract tests (filter mapping incl. Cancelled+Expired under CLOSED? — NO: prototype `closed` shows non-Open RFQs, `live` shows Open, `all` shows all; card states; accept/cancel intents; house/best markers) → implement → green → commit `feat(credit): prototype dealer-quote RFQ cards`.

### Task 2: New RFQ form port

**Files:**
- Create: `packages/client-react/src/ui/credit/newRfq/NewRfqPanel.tsx` + `.module.css`, `InstrumentSelect.tsx` + `.module.css`, `DealerChecklist.tsx` + `.module.css`
- Retire (Task 4 deletes): `NewRfqForm.tsx`, `InstrumentSearch.tsx`, `QuantityInput.tsx`, `DealerSelection.tsx`
- Port source: `packages/client-prototype/src/credit/NewRfq/*`, `useCreditForm.ts`
- Test: contract specs `.../specs/credit/newRfq/`

**Interfaces:** form visuals from prototype — `You Buy`/`You Sell` segmented `DirButton`s (`data-dir`, `data-active`), `InstrumentSelect` dropdown (▾ button, rows `ticker` / `cusip · name`), Qty(000) input, static Duration `2 Min` (= `CREDIT_RFQ_EXPIRY_SECONDS`), `DealerChecklist` with "All Dealers" toggle + ✓ checkboxes (`data-house` on Adaptive Bank), `CLEAR` + `SEND RFQ` (`data-enabled`, disabled unless instrument + qty>0 + ≥1 dealer). Submission through the existing `useRfqSubmission()` machine (editing/submitting/confirmed states — render confirmed as a brief inline confirmation, machine auto-redirects after 1500ms → reset form). Quantity semantics unchanged (input ×`CREDIT_QUANTITY_MULTIPLIER`).

- [ ] Failing contract tests (validation gates SEND RFQ; All Dealers toggles; submit calls machine with instrument/qty/dealers/direction; CLEAR resets) → implement → green → commit `feat(credit): prototype New RFQ form panel`.

### Task 3: Credit blotter chrome

**Files:**
- Modify: `packages/client-react/src/ui/credit/blotter/CreditBlotter.tsx` + `.module.css`
- Port source: `packages/client-prototype/src/credit/Blotter/CreditBlotterPanel.*`
- Test: update `.../specs/credit/blotter/CreditBlotter.contract.spec.ts`

**Interfaces:** keep the Phase-A `BlotterHeader` infra (sort glyph on active column only, aria-sort) and CSV export; adopt prototype controls row (`{n} trades` count + `⤓ CSV` chip), row accent `--row-acc` by direction, `data-new` flash on newly booked trades (via `useAnimationIntents` or last-id diff — match FX blotter's existing mechanism).

- [ ] Failing contract test (count text; CSV chip; direction accent attr) → implement → green → commit `feat(credit): prototype blotter chrome`.

### Task 4: Layout flip, heads, workspace retirement

**Files:**
- Modify: `packages/client-core/src/layout/defaultLayoutPort.ts` (+ its fixture test), `packages/client-react/src/ui/shell/layout/engine/appPanelRegistry.tsx`, `appHeadRegistry.tsx`
- Create: `packages/client-react/src/ui/credit/rfqs/RfqsHead.tsx` (◳ RFQs + `RfqFilterPills` LIVE {count}/CLOSED/ALL, `data-active`), `newRfq/NewRfqHead.tsx` (✚ New RFQ), `blotter/CreditBlotterHead.tsx` (▤ Credit Blotter)
- Delete: `CreditWorkspace.tsx` + `.module.css`, `rfqTiles/*`, old newRfq components (per Task 2), their contract specs/page objects/visual registry entries
- Test: layout fixture test + contract specs for heads

**Interfaces:**
```ts
const CREDIT_ROOT: LayoutNode = {
  kind: "split", dir: "row", sizes: [0.25, 0.75],
  children: [
    { kind: "panel", panelId: "credit-new-rfq" },
    { kind: "split", dir: "column", sizes: [0.62, 0.38], children: [
      { kind: "panel", panelId: "credit-rfqs" },
      { kind: "panel", panelId: "credit-blotter" },
    ]},
  ],
};
```
`PANEL_SPECS`: add `credit-new-rfq` (title "New RFQ"), `credit-sell-side` (title "Sell Side", registered but NOT in `CREDIT_ROOT`); retitle `credit-rfqs` → "RFQs". Registry: `credit-new-rfq`→`<NewRfqPanel/>`, `credit-rfqs`→`<RfqsPanel/>`, `credit-sell-side`→`<SellSidePanel/>` (unchanged component). Heads registered for all three default credit panels. Filter pills in `RfqsHead` share state with `RfqsPanel` via the same preference seam (LIVE count from `useRfqs`).

- [ ] Failing layout fixture test → flip → all unit/contract suites green (old workspace specs deleted, new head specs added) → commit `feat(credit): three-panel dock layout + heads`.

### Task 5: e2e migration

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (credit section), `tests/browser/page-objects/{cypress,playwright}/CreditRfqForm.ts`, `CreditRfqPanel.ts`, `tests/specs/creditRfq.feature` + steps if they reference credit nav tabs
- Test: `RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e`

**Interfaces:** credit nav tabs (`credit-nav`, `credit-tab-*`) no longer exist — the form and RFQs panels are simultaneously visible. Update page objects to address panels directly; keep scenario semantics (create RFQ → quotes arrive → accept → blotter row). Grep both `tests/` and `packages/client-react` for `credit-tab`/`credit-nav` leftovers.

- [ ] Update page objects/feature steps → e2e green (Playwright oracle; Cypress skipped per repo policy) → commit `test(e2e): credit dock page objects`.

### Task 6: Visual scenarios, goldens, gauntlet, PR

- [ ] Update `tests/ui/visual/shared/scenarios.ts` + `react/registry.tsx`: replace `credit/rfq-tiles*`, `credit/new-rfq`, `credit/sell-side*` scenarios with new-component equivalents (keep sell-side scenarios — the component still exists); `app/credit` reflects the dock. Local goldens FULL-SUITE delete-first regen for changed components.
- [ ] Full gauntlet: typecheck, biome ci, eslint×2, stylelint, unit, contract+coverage ≥95%, visual tiers, `RTC_E2E_SKIP_CYPRESS=1 test:e2e`, `pnpm exec knip`.
- [ ] Live side-by-side vs prototype (:8899 Credit) on the worktree dev server; real drag/maximize checks on the new tree.
- [ ] Push, PR (base main), x86 golden workflow on the branch, sync changed goldens, CI loop per shipping-repo-changes.
