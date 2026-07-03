# Phase 7 — RN Credit RFQ — design

**Date:** 2026-07-03
**Package:** `@rtc/client-react-native`
**Roadmap:** `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md` §4 — "credit RFQ → equities"

## Goal

Bring the web client's **credit RFQ desk** to the React Native / Expo app as a
new **Credit** tab, at full parity with the three web sub-views: **RFQ Tiles**
(buy-side), **New RFQ** (create form), and **Sell Side** (dealer). Like Phases
3–6 this is a **Pure View** phase — RN leaves + one route/tab + wiring only.
Equities is deferred to Phase 8.

## Why this is a Pure View phase

The entire credit state brain already exists in `@rtc/client-core` and is bound
in `@rtc/react-bindings`, and the native composition already reaches it:

- **Presenters/machines** — `RfqsPresenter` (owns `rfqs$` / `quotesForRfq$` /
  `allQuotes$` plus the per-mount `createSubmission()` and
  `createTicketSubmission()` machines), the `InstrumentSimulator`/`DealerSimulator`
  presenters, and `RfqCountdownMachine` — all live in `client-core`, pure TS +
  RxJS, no React/DOM. *(`RfqTileMachine`/`RfqQuotePresenter` power the separate
  FX spot-tile RFQ mode and are **not** used by the credit desk.)*
- **ViewModel hooks** used by Phase 7, already bound in `createViewModel.ts`:
  `useRfqs`, `useQuotesForRfq(rfqId)`, `useInstruments`, `useDealers`,
  `useAcceptQuote`, `useRfqSubmission`, `useTicketSubmission`,
  `useRfqCountdown(creationTimestamp, totalMs)`.
- **Ports already wired:** `buildNativePorts` spreads the full port bag
  (`...createWsRealPorts(...)` / `...createSimulatorPorts(...)`), which already
  includes `workflow` (credit), `instruments`, and `dealers`. Nothing in the
  composition changes.

Therefore Phase 7 adds **zero** code under `domain` / `client-core` /
`react-bindings` / the web client, and **no new dependencies** (RN primitives
only — RFQ state is shown with plain themed `<View>`/`<Text>`, no
`react-native-svg`). Every leaf consumes the bound hooks and the Phase 5 theme
store (`useTheme()` / `useThemedStyles(makeStyles)`).

## Navigation

A **5th bottom tab, "Credit"** joins the existing tabs:

```
Rates | Blotter | Analytics | Credit | Appearance
```

The tab route is `app/credit.tsx`, mirroring the existing `app/blotter.tsx` /
`app/analytics.tsx` route files (each renders one screen inside the shared
composition established in `app/_layout.tsx`). No change to the shell/toolbar or
the `AppRoot`/`ThemeProvider` wrapping — a new `<Tabs.Screen name="credit" />`
entry plus the route file.

Inside the tab, a **`CreditScreen`** owns the sub-view state exactly as the web
`CreditWorkspace` does:

- Local `useState<CreditView>` where `CreditView = "tiles" | "new-rfq" | "sell-side"`.
- A **segmented control** (`CreditNav`, plain themed Pressables) swaps the three
  sub-views. Ported 1:1 from the web `credit-nav` (labels "RFQ Tiles" / "New
  RFQ" / "Sell Side").
- New-RFQ success calls `onCreated` → `setView("tiles")`, matching the web
  redirect-back behaviour.

*Tab-bar note:* five tabs now; Equities (Phase 8) makes six, still within RN's
comfortable bottom-bar range. Flagged, not a blocker; no pre-emptive nav
restructure (YAGNI).

## Components (~12 RN leaves)

Directory: `packages/client-react-native/src/ui/credit/`, sub-foldered like the
web (`rfqTiles/`, `newRfq/`, `sellSide/`) for parity and focused files.

### Buy-side — RFQ Tiles (`rfqTiles/`)

| Leaf | Responsibility | Hooks / inputs |
|---|---|---|
| `RfqFilterTabs` | Segmented filter: All / Live / Done / Expired / Cancelled | `selected`, `onChange` props |
| `RfqTilesPanel` | Owns `filter` + `dismissed` local state; filters + sorts RFQs (newest first); renders rows or an empty state | `useRfqs`, `useInstruments`, `useDealers`, `useAcceptQuote` |
| `RfqTileRow` | Per-RFQ subscription seam (isolates `useQuotesForRfq(id)` so the panel doesn't fan out hooks) | `useQuotesForRfq(rfq.id)` |
| `RfqCard` | RFQ header (instrument, direction, quantity, state badge), **countdown bar**, dealer-quote list, dismiss control | `rfq`, `quotes`, `instrument`, `dealers`, `onAccept`, `onDismiss` props; `useRfqCountdown` |
| `QuoteCard` | One dealer quote: dealer name, price, **Accept** | `quote`, `dealer`, `onAccept` props |

### New RFQ — create form (`newRfq/`)

| Leaf | Responsibility | Hooks / inputs |
|---|---|---|
| `NewRfqForm` | Owns draft state (`instrument`, `direction`, `quantity`, `dealerOverride`) + `useRfqSubmission`; renders the confirmed card on success; `canSubmit` gate ported verbatim | `useInstruments`, `useDealers`, `useRfqSubmission` |
| `InstrumentSearch` | RN typeahead: `TextInput` query + filtered results list; select sets the instrument | `instruments`, `selected`, `onSelect` props |
| `QuantityInput` | Numeric `TextInput` (keyboardType `numeric`) | `value`, `onChange` props |
| `DealerSelection` | Multi-select dealer checklist (default all-selected; empty override falls back to all — ported verbatim) | `dealers`, `selectedIds`, `onChange` props |

The Buy/Sell **Direction toggle** is inline in `NewRfqForm` (two themed
Pressables), matching the web.

### Sell Side — dealer (`sellSide/`)

| Leaf | Responsibility | Hooks / inputs |
|---|---|---|
| `SellSidePanel` | Adaptive Bank's incoming RFQs (`ADAPTIVE_BANK_NAME` dealer lookup); empty state when none | `useRfqs`, `useInstruments`, `useDealers` |
| `SellSideRfqRow` | Per-RFQ seam; finds the Adaptive-Bank quote via `useQuotesForRfq`; renders nothing if absent | `useQuotesForRfq(rfq.id)` |
| `TradeTicket` | Respond to a quote-request: numeric price input → **Submit price**, or **Pass**; `submitted` reflected from the machine | `rfq`, `quote`, `instrument` props; `useTicketSubmission` |

### Screen shell

| Leaf | Responsibility |
|---|---|
| `CreditScreen` | Owns `CreditView` state; renders `CreditNav` + the active sub-view |
| `CreditNav` | Segmented control across the three sub-views |

## Data flow & animation

- All hooks are already bound and drive off the shared composition, so Credit
  works in **both** modes: simulator (`CreditRfqSimulator` streams dealer quotes
  and drives expiry) and live (server `WorkflowPort`). No new adapter.
- **Countdown is a plain re-render, not `Animated`.** `useRfqCountdown` ticks a
  remaining-ms number every 100 ms (cosmetic; the authoritative expiry is
  server-driven). `RfqCard` renders it as a themed progress bar
  (`width = remaining / total`). This deliberately avoids RN `Animated` and its
  jest-testing complexity from Phase 6.
- Intents (`acceptQuote`, `submitPrice`, `pass`, `submit`) are the same
  Promise-returning / fire-and-forget calls the web uses; `await` them in
  handlers per the typed-eslint `no-floating-promises` rule.

## Pure util extraction

The web `RfqTilesPanel` filter+sort is inline (`filterMatches` switch + sort by
`creationTimestamp` desc). Extract this into a pure, framework-free
`src/ui/credit/rfqTiles/rfqTileFilter.ts` (`filterRfqs(rfqs, filter, dismissed)`
returning the filtered+sorted list) with a **vitest node test** — mirrors the
Phase 4 `colours.ts` / `bubbleLayout.ts` precedent, keeping the load-bearing
filter/sort logic unit-tested and RN-free (so it stays vitest-parseable — see
the Phase 5 cross-task regression lesson: no `react-native` import in a
vitest-covered file).

## Testing

- **jest-expo island** (`.test.tsx`, RNTL 14): a focused test per data-bearing
  leaf. `render`/`fireEvent.press` return Promises → **`await`** them (typed
  eslint). `testTimeout: 30_000` is already set in the RN `jest.config.js`
  (Phase 4 hotfix), covering slow first mounts on x86 CI.
- Coverage targets: filter tab switching, accept-quote intent firing, the
  New-RFQ `canSubmit` gate + confirmed-card transition, dealer multi-select
  default/override, and sell-side submit-price / pass intents. Assert on themed
  `<View>`/`<Text>` (plain style colours keep raw string values under jest — no
  `react-native-svg` `processColor` trap here).
- **vitest node**: `rfqTileFilter.test.ts` (pure, RN-free).
- The RN `test` script runs **both** vitest and jest; run the full script each
  task (Phase 5 lesson: a stray `react-native` import breaks vitest silently).

## Non-goals

- **No equities** — Phase 8.
- **No Maestro/gherkin e2e, no RN visual baselines** — still deferred to their
  own dedicated phase.
- **No new dependencies**, no `react-native-svg` (plain Views suffice).
- **No neutral-layer changes** — nothing under `domain` / `client-core` /
  `react-bindings` / the web client.
- **No `Animated`** — the countdown is a numeric re-render.
- No RFQ cancel-from-buy-side control unless the web exposes one in the tiles
  view (it does not surface a cancel button in `RfqCard`; `cancelRfq` exists on
  the presenter but is unused by the web tiles UI — parity = omit it).

## Risks & mitigations

- **Slow first mount on x86 CI** — already mitigated by `testTimeout: 30_000`.
- **RN Modal-via-press segfault (x86)** — avoided: Credit uses no `Modal`; all
  sub-views are inline segmented-control swaps (the web `TradeTicket` is an
  inline panel, not a modal).
- **Typed-eslint `no-floating-promises`** on RNTL calls and intent handlers —
  `await` them; run `lint:eslint:types` per task (Phase 5 lesson).
- **`no-restricted-syntax`** bans inline object param/return types → named
  `XxxProps` interfaces; `makeStyles` must be a `function` declaration with a
  named return-type interface (Phase 5 lesson).
- **Tab-bar crowding** at six tabs (post-Phase-8) — noted; no action now.
```