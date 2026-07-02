# `@rtc/client-prototype` P3 — Credit

**Date:** 2026-07-02
**Status:** Design — approved (scope + shared-layout extraction settled with @nasantsogt)
**Author:** Claude
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md` (§6 build order)
**Prior phases:** P2 FX core — `2026-07-01-client-prototype-p2-fx.md` (merged, PR #72 `988d949c`);
P2.5 FX aside — `2026-07-01-client-prototype-p2_5-fx-aside.md` (merged, PR #80 `dda0863d`)

## 1. Purpose

P3 delivers the **Credit trading surface** of the readable prototype port: the
**New RFQ form**, the **RFQs panel** with live streaming dealer quotes
(accept / cancel / expire, FLIP glide), and the static **Credit Blotter** with
CSV export — all inside a Credit dock that mirrors the FX dock (drag-resize
splits, per-panel maximize, collapse-to-strip).

It replaces the `credit` tab's `PlaceholderPanel` (wired in `AppShell.tsx`) with a
live `CreditScreen`. The other placeholder tabs (equities / admin) are untouched.

P3 is also the moment P2 deferred: the shared split / maximize / panel mechanics,
built hand-wired in `fx/layout/` for P2, are **extracted to a shared `src/layout/`**
so both FX and Credit consume one implementation (the clean-architecture reuse the
showcase is meant to demonstrate).

Source of truth: the prototype `<section data-screen-label="Credit">` (markup lines
~531–597) and the `class Component` Credit logic (`sendRfq` / `acceptQuote` /
`cancelRfq` / `removeRfq` / `_checkExpiries` / `_seedRfq`, the credit view-model
builders `rfqForm` / `rfqCards` / `creditFilter` / `creditTrades`, and the
`instruments` / `dealers` seed) in
`docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`.

## 2. Scope

### In scope (single phase P3)

- **Shared-layout extraction.** Move the generic dock primitives out of `fx/layout/`
  into a top-level `src/layout/`, consumed by both FX and Credit:
  - `useSplit` (pointer-drag resize) — moved verbatim (already generic).
  - `SplitHandle` — moved verbatim.
  - `Panel` — moved and made **panel-id-generic** (`id: string` instead of FX's
    `PanelId` union), keeping the P2.5 `headAccessory` slot.
  - `useMaxPanel` — **new** generic maximize toggle + persist, lifted out of FX's
    `useDockState`.
  - `csvExport` (`toCsv` / `downloadCsv`) — moved from `fx/csvExport.ts` to
    `src/csvExport.ts` (Credit reuses it).
  FX keeps `fx/layout/useDockState.ts` (its aside-collapse stays FX-local) but now
  builds `maxPanel` on the shared `useMaxPanel` and updates all imports. The move is
  **behavior-identical** — verified by the existing FX smoke suite + typecheck
  staying green (this package has no visual goldens, so a pure move carries no
  golden-drift risk). `motion/useFlip` is already shared and is imported as-is.

- **Credit dock**, hand-wired for Credit: left column (**New RFQ** form panel) `│`
  V-split `│` right column (**RFQs** panel `/` H-split `/` **Credit Blotter** panel).
  Faithful pointer-drag resize on both splits, per-panel maximize on RFQs and Credit
  Blotter, and the left form's collapse-to-strip (see §3 for the faithful collapse
  model).

- **New RFQ form** — You-Buy / You-Sell direction toggle; instrument dropdown over
  the 8 seeded bonds (ticker + CUSIP + name rows); Qty (000) text input; a static
  **"2 Min"** duration display; a counterparties checklist ("All Dealers" + the 9
  seeded dealers); CLEAR and SEND RFQ. SEND is enabled only when an instrument is
  selected **and** parsed qty > 0 **and** at least one dealer is checked.

- **RFQs panel** — head with LIVE / CLOSED / ALL filter pills (LIVE shows a live
  count) and a maximize glyph; an empty-state card when no RFQs match; a responsive
  grid (`repeat(auto-fill, minmax(300px, 1fr))`) of **RFQ cards**. Each card:
  header (direction chip, instrument ticker, CUSIP · QTY, state label); a list of
  per-dealer **quote rows** (best-price ★, dealer name, price / `…` pending /
  `Passed`, ACCEPT button when priced); and a footer that is one of — a live
  countdown (secs + progress bar + CANCEL), an accepted confirmation
  ("✓ You traded with <dealer>"), or a terminated remove row ("🗑 <state> · remove").

- **Live streaming quotes engine** (`useCreditRfqs`) — the one genuinely new
  behavior vs FX (see §4.2).

- **Credit Blotter** — a **display-only** 10-column grid (ID, Status, Date, Dir,
  Counterparty, CUSIP, Security, Qty, Type, Price) with a sticky header, a trade
  count in the head, a maximize glyph, and a CSV export button. New rows (from an
  accepted RFQ) flash in (`rowIn` + `rowFlashA/B`, `--rowAcc`).

- **Motion** — reuse `motion/useFlip` (native WAAPI) to glide RFQ cards on
  reorder / filter change (`[data-rfq-id]`), matching the FX Live-Rates glide. Card
  enter / exit / flash animations use the CSS keyframes already present in
  `global.css` from P0 (`cardIn A/B`, `cardOut`, `cardFlash`, `acceptIn`,
  `acceptPulse`, `rowIn`, `rowFlashA/B`).

### Explicitly out of scope

- **Credit Blotter is display-only.** Unlike the FX blotter it has **no** sort, no
  filter, and no query in the prototype — do not add them. CSV export only.
- **Event log (`logEvt`).** No Credit panel renders an activity feed, and cross-tab
  activity wiring was already out of scope in P2. Credit actions do **not** push
  entries to FX's Activity feed. Omit `logEvt` entirely.
- **RFQ persistence.** The prototype does not persist RFQs; only the split ratios
  and `maxPanel` persist (through the shared layout). RFQ / form / trade state is
  in-memory and resets on reload.
- **StatusBar P&L** stays as-is; Credit does not touch it.
- **No audio** (P1 precedent — no audio in-package).
- **Display fonts** fall back to system stacks (loaded in P6 parity).

## 3. Fidelity notes (do not "fix" these — they match the prototype)

- **Left form collapses only via maximize.** The New RFQ panel has **no** maximize
  button of its own (only the ⊕ `headAccessory`). Maximizing RFQs or Credit Blotter
  collapses the left form to a vertical **"⛶  NEW RFQ" strip**; clicking the strip
  restores by clearing `maxPanel`. There is no independent collapse toggle for the
  form (this differs from the FX aside, which the P2 port gave an explicit toggle).
  So `useCreditDock` is just `maxPanel` + `toggleMax` + a derived `leftCollapsed`
  (`maxPanel === "rfqs" || maxPanel === "cblot"`). Maximize is available on RFQs and
  Credit Blotter only.
- **House-dealer bias.** Dealer id `1` "Adaptive Bank" is always tinted `--accent`
  in both the form checklist and the quote rows, and is quoted ~0.18 better than the
  reference price (in the RFQ's favour). Faithful — keep it.
- **Dealer pass rate is 12%** (`Math.random() < 0.12`) per quote; a passed dealer
  shows "Passed" at 0.5 opacity and cannot be accepted.
- **Quote arrival delay is `700 + rng·3200` ms** per dealer; **RFQ expiry is 120 s**
  (`expirySecs: 120`); the countdown bar and expiry sweep both derive from a `now`
  value ticking every **400 ms**.
- **Best price** among priced quotes is the **min** for a Buy RFQ, **max** for a Sell
  RFQ; only a live, priced, best quote shows the ★ and the pulsing ACCEPT.
- **Qty is thousands.** The form's Qty (000) multiplies by 1000 for the stored RFQ
  quantity; it is formatted with thousands separators in the card and blotter.
- **Duration is a static "2 Min"** label — not wired to anything.
- **Seed state:** two seeded RFQs — `#238` Closed (Buy, MSFT, accepted at 99.80) and
  `#237` Cancelled (Sell, Morgan Stanley) — and two seeded credit trades (`#238`,
  `#235`). RFQ id sequence starts at `700`.

## 4. Architecture

Self-contained, matching the package's standing decisions: **no** `@rtc/domain` /
`@rtc/shared`, **no** RxJS / machines, **no** ViewModel seam, **no** React Compiler;
full CSS Modules (static class / semantic `data-*` / `--custom-property` geometry);
native WAAPI + Canvas; smoke-only Vitest. Per-feature folder = dumb components +
co-located mock hooks + seed data.

### 4.1 Directory layout

**Extracted shared (new top-level `src/layout/` + `src/csvExport.ts`):**

```
packages/client-prototype/src/
  layout/
    useSplit.ts                  # moved verbatim from fx/layout/useSplit.ts
    SplitHandle.tsx  + .module.css
    Panel.tsx        + .module.css   # id: string (generic); keeps headAccessory
    useMaxPanel.ts               # NEW generic maximize toggle + persist
  csvExport.ts                   # moved from fx/csvExport.ts
```

**FX (edited — imports repointed, useDockState slimmed):**

```
  fx/
    layout/useDockState.ts       # keeps asideCollapsed; maxPanel now via useMaxPanel
    FxScreen.tsx, LiveRates/*, Blotter/*, useFxBlotter.ts …  # import Panel/SplitHandle/
                                 #   useSplit from #/layout, csv from #/csvExport
```

**Credit (new `src/credit/`):**

```
  credit/
    CreditScreen.tsx  + .module.css   # composes the dock; owns form/rfqs/dock hooks
    types.ts                          # Instrument, Dealer, Quote, Rfq, CreditTrade, unions
    creditData.ts                     # INSTRUMENTS(8), DEALERS(9), seed RFQs/trades, seq starts, helpers
    useCreditForm.ts                  # form state + validity + clear
    useCreditRfqs.ts                  # streaming engine (see §4.2)
    useCreditDock.ts                  # maxPanel (via useMaxPanel) + derived leftCollapsed
    NewRfq/
      NewRfqPanel.tsx     + .module.css   # panel head (✚ New RFQ, ⊕) + form body
      InstrumentSelect.tsx + .module.css  # dropdown (label + open list)
      DealerChecklist.tsx  + .module.css  # All Dealers + 9 dealer rows
    Rfqs/
      RfqsPanel.tsx       + .module.css   # head (◳ RFQs, maximize, LIVE/CLOSED/ALL) + body
      RfqCard.tsx         + .module.css   # one card (header + quote rows + footer)
      QuoteRow.tsx        + .module.css   # one dealer quote row
      EmptyRfqs.tsx       + .module.css   # "No RFQs to show" empty state
    Blotter/
      CreditBlotterPanel.tsx + .module.css # head + static grid + CSV
```

`credit/` is **hand-wired for Credit** (its dock shape differs from FX); only the
generic primitives live in `src/layout/`.

### 4.2 `useCreditRfqs` — the streaming engine

Mirrors `useFxRates`'s discipline: an injectable `rng: () => number` (default
`mulberry32(seed)`) and timer options for deterministic smokes; the RNG lives in a
`useRef`; **persistence and RNG never run inside a `setState` updater** (StrictMode
may invoke updaters twice — the P2 lesson).

State: `rfqs: Rfq[]`, `creditTab: "live" | "closed" | "all"`,
`creditTrades: CreditTrade[]`, plus animation bookkeeping — `newRfqId`,
`newCreditId`, `exitingRfqs: number[]`, `tabAt`, `tabSeq`, and `now`.

- **`now` tick** — every 400 ms, updates `now` and runs the **expiry sweep**: any
  `Open` RFQ past `createdAt + 120_000` becomes `Expired` (its still-`pending`
  quotes become `passed`).
- **`sendRfq(form)`** — validates (instrument set, qty>0, ≥1 dealer); assigns the
  next id; builds an `Open` RFQ whose quotes start `pending`; prepends it; switches
  `creditTab` to `live`; bumps `tabAt/tabSeq`; sets `newRfqId` (cleared after 800 ms);
  resets the form. For **each** dealer it schedules `setTimeout(700 + rng()·3200)` to
  flip that quote to `priced` (price = `ref + (rng()-0.5)·0.9`, dealer 1 shifted
  ~0.18 in the RFQ's favour) or `passed` (12%). Best price recomputes on each arrival.
- **`acceptQuote(rfqId, dealerId)`** — RFQ → `Closed` (`acceptedDealerId`, accepted
  quote), and prepends a `CreditTrade` (`Done`, today's date, dealt price) to
  `creditTrades` (capped at 40); sets `newCreditId`.
- **`cancelRfq(rfqId)`** — `Open` → `Cancelled` (records `_exitAt`).
- **`removeRfq(rfqId)`** — adds the id to `exitingRfqs` (330 ms exit animation) then
  filters it out.
- **Derived view-model** (built in the hook or the panel): `shownRfqs` by tab (plus
  briefly-retained just-exited cards), `noRfqs`, per-card `secs` / `pct` countdown,
  best-quote id, per-quote display (`price` / `…` / `Passed`, colors, `canAccept`),
  `stateLabel` / `stateColor`, `liveCount`.

### 4.3 The Credit dock

Faithful defaults (prototype line 824): `creditW: 330` (left form width via the
V-split, min 260 / max 480), `creditStackR: 0.62` (RFQs vs Credit Blotter in the
right column). `maxPanel: PanelId | null` where `PanelId = "rfqs" | "cblot"`.

- The V-split adjusts the left form width; the H-split adjusts the right-column
  RFQs / Blotter ratio. Both use the shared `useSplit` (persisted to localStorage).
- Maximize (RFQs or Credit Blotter) sets `data-max` on that Panel; CSS makes it fill
  the right column (its sibling hidden) and the left form collapses to the strip.

### 4.4 Data & types (`types.ts` / `creditData.ts`)

- `Dir = "Buy" | "Sell"`; `QuoteState = "pending" | "priced" | "passed" | "accepted"`;
  `RfqState = "Open" | "Closed" | "Cancelled" | "Expired"`;
  `CreditTab = "live" | "closed" | "all"`.
- `Instrument { id; ticker; name; cusip; ref }` — 8 seeded bonds
  (AAPL/MSFT/AMZN/GOOGL/TSLA/UST/VZ/KO with the exact CUSIPs and ref prices from the
  prototype).
- `Dealer { id; name }` — 9 seeded (Adaptive Bank, Citi, JP Morgan, Goldman Sachs,
  Morgan Stanley, Barclays, RBC, HSBC, Deutsche Bank).
- `Quote { dealerId; state; price: number | null }`;
  `Rfq { id; state; dir; instrumentId; qty; dealerIds; quotes; acceptedDealerId; createdAt; expirySecs; _exitAt? }`.
- `CreditTrade { id; status; date; dir; cp; cusip; sec; qty; ot; price }`.
- Small formatters (`fmtNum` thousands, a `_fmtDate(offsetDays)` helper) are defined
  **locally in `creditData.ts`** — Credit stays self-contained. Do **not** import
  from `fx/`, do **not** refactor FX's `fxData`, and do **not** introduce a shared
  `format` module in P3 (YAGNI; extract only if a later phase genuinely shares it).

## 5. Testing — smoke-only Vitest (mirrors `fx-*.test`)

`@testing-library/react`, explicit `cleanup()` in `afterEach`, injected
`mulberry32` RNG + Vitest fake timers where timing matters.

- `credit-data.test.ts` — instruments/dealers/seed RFQs/trades shapes; seq starts.
- `credit-form.test.tsx` — direction toggle; instrument select updates label;
  dealer toggle + All Dealers; SEND disabled until valid; CLEAR resets.
- `credit-rfqs.test.ts` — **the engine, with injected rng + fake timers:** `sendRfq`
  creates a live RFQ (tab switches to live); quotes arrive `priced`/`passed` after
  their delays; best-price ★ picks min (Buy) / max (Sell); `acceptQuote` → `Closed`
  + a new credit trade; `cancelRfq` → `Cancelled`; the 400 ms sweep expires an RFQ
  past 120 s; `removeRfq` drops it after the exit delay.
- `credit-blotter.test.tsx` / `credit-csv.test.ts` — rows render from seed; the CSV
  string has the 10 headers + quoted fields.
- `credit-dock.test.ts` — maximizing RFQs sets `data-max` and collapses the left
  form to the strip; the strip restores (clears `maxPanel`).
- `credit-screen.test.tsx` — composes the three panels; a full send flow renders a
  new card in the RFQs grid.
- **Extraction regression guard:** the existing FX smoke suite (`fx-*.test`) and
  `typecheck` must stay green after Task 1's move (the `fx-split.test.ts` that
  exercises `useSplit` repoints to `#/layout/useSplit`).

## 6. Global constraints (bind every task)

- **Package self-containment:** no `@rtc/domain` / `@rtc/shared`, no RxJS, no
  machines, no ViewModel seam, no React Compiler. Feature folders do not import
  across each other (`credit/` must not import from `fx/`, and vice-versa); shared
  code lives in `src/layout/`, `src/motion/`, `src/mock/`, or a small top-level util.
- **CSS-Modules taxonomy:** static → class; semantic state → `data-*`; runtime
  geometry → a **named-const** `style={x}` object typed `as CSSProperties` that sets
  only a `--custom-property` (the sanctioned escape hatch — no `eslint-disable`,
  since the inline-style ban matches object literals only).
- **Lint/format rules that have bitten prior phases:** `arrow-body-style: always`
  (every arrow, including `.map`/`.find` callbacks and `rng: () => {...}`);
  `rtc/newspaper-order` (types/helpers/`vi.mock` below `describe`);
  `rtc/component-newspaper` (exported component is the lede, filename matches);
  `useUniqueElementIds` (any element/SVG `id` uses `useId()`, and logical panel ids
  in tests use a bottom `const` var); `useExplicitType` (consts with
  non-literal-inferrable initializers get an explicit annotation); module-level
  functions are `function` declarations.
- **The gate for every task is:** `pnpm --filter @rtc/client-prototype typecheck` ·
  `pnpm --filter @rtc/client-prototype test` · `pnpm exec eslint packages/client-prototype`
  · `pnpm exec stylelint "packages/client-prototype/src/**/*.css"` · **`pnpm exec
  biome ci packages/client-prototype`** (format + lint — the P2.5 lesson: eslint
  alone misses format diffs, `useUniqueElementIds`, and `useExplicitType`). CI also
  runs repo-wide `lint:dead` (knip), `check:deps`, `check:versions`, `test:rules` —
  keep exports consumed (drop `export` on structurally-only types) and paths clean.
- **Never `git add .`** — stage only exact named files (no `.superpowers/`, `.idea/`,
  `.env.local`, or scratch).

## 7. Suggested task decomposition (for the plan)

1. **Shared-layout extraction** — move `useSplit` / `SplitHandle` / `Panel` (id
   generic) / `csvExport` to `src/layout/` + `src/csvExport.ts`; add generic
   `useMaxPanel`; repoint FX imports and slim `useDockState`. Deliverable verified by
   the **existing** FX suite + typecheck green.
2. **Credit types + data** — `types.ts`, `creditData.ts` (+ `credit-data` test).
3. **`useCreditForm`** — form state, validity, clear (+ `credit-form` test seam).
4. **`useCreditRfqs`** — the streaming engine (+ `credit-rfqs` test, the meatiest).
5. **New RFQ panel** — `NewRfqPanel` + `InstrumentSelect` + `DealerChecklist`.
6. **RFQs panel** — `RfqsPanel` + `RfqCard` + `QuoteRow` + `EmptyRfqs` (+ FLIP glide).
7. **Credit Blotter panel** — static grid + CSV (+ `credit-blotter`/`credit-csv`).
8. **`useCreditDock`** + **`CreditScreen`** composition — dock, splits, maximize,
   left-strip; wire form → rfqs → blotter (+ `credit-dock`, `credit-screen` tests).
9. **Shell wiring** — `AppShell.tsx` renders `<CreditScreen />` for the `credit` tab.

(Right-sizing is the plan's job; steps 5–8 may split or merge per reviewer-gate
boundaries.)
