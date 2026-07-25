# RN mobile-v1 rehaul — Phase 5 (Credit + Equities + Analytics) design

**Status:** design agreed, plans not yet written.
**Parent spec:** [2026-07-16-rn-mobile-v1-rehaul-design.md](2026-07-16-rn-mobile-v1-rehaul-design.md) §5 "Phase 5".
**Prototype (fidelity source of truth):** `docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader Mobile.dc.html`.

## 1. Goal

Rebuild the last three `@rtc/client-react-native` modules — **Credit**, **Equities**, **Analytics** — to mobile-v1 prototype fidelity, over an unchanged data seam, following the pattern Phases 4a (Rates) and 4b (Blotter) established.

Unlike 4a/4b, these three modules are **not** thin pre-rehaul components. All three already exist, are functionally complete, and are decomposed roughly into their eventual file shapes. What they lack is prototype fidelity, motion, and — in two cases — the right information architecture. So this phase is closer to *reshape and animate* than to *restyle in place*, and it is correspondingly larger.

## 2. Decomposition

The parent spec frames Phase 5 as one unit. Measured against the prototype it is not: Credit alone is comparable to Rates (4a), and Equities is larger. Phase 5 therefore splits into three independently-gated sub-phases, mirroring the 4a/4b and 6a/6b precedent:

| Sub-phase | Module | Size vs. prior phases | Further split? |
|---|---|---|---|
| **5a** | Credit | ≈ Rates (4a), higher design risk | Yes — RFQ tiles + ring / New-RFQ form / sell-side |
| **5b** | Equities | ≈ 1.3–1.6× Rates (4a) | Yes — movers board / Skia candles / ticket + blotters |
| **5c** | Analytics | ≈ Blotter (4b), 6–9 tasks | No |

**The three sub-phases are mutually disjoint** — separate directories under `src/ui/`, separate routes, no shared new components — so they may be built **in parallel** in separate worktrees. Their on-device sign-offs cannot be parallel: one booted simulator, one Metro port, one dev client. Every sub-phase therefore ends with a sign-off task that queues into a single serial native tail.

Recommended build order if run sequentially instead: **5c → 5a → 5b** (smallest first, and 5c establishes the Skia data-driven charting pattern that 5b's candle chart then reuses).

## 3. Decisions locked before planning

Three questions where the prototype and the real data seam genuinely disagreed. Each is settled here so no plan re-litigates it.

### 3.1 Credit sell-side — prototype visuals, real list structure

The prototype models sell-side as **one rotating incoming-RFQ ticket** plus a client-local WON/LOST history, driven by mock timers and `Math.random`. The real seam models it as **many simultaneously-open RFQs**, each optionally carrying an Adaptive Bank quote. A literal port would either hide every open RFQ but one, or invent history state no stream backs.

**Decision:** apply the prototype's *visual language* — price stepper (±0.05, 44×44 controls), countdown ring, card chrome, status pills — to **each real open ticket in a list**. Prototype look, real information architecture.

**Consequence:** the prototype's "resolves WON/LOST after 2600 ms" is dropped. Won/lost is derived from real `QuoteState` (`accepted` → won, `rejectedWithPrice` → lost), which is more correct and needs no timer.

### 3.2 Equities rank-move glide — match the shipped web client

The prototype specifies 320 ms glide / 950 ms rank glow. `@rtc/motion-core`'s already-shipped `rankGlide` constants — driving the **web** equities watchlist today — are 560 ms / 820 ms.

**Decision:** RN uses the **motion-core constants (560/820)**, not the prototype's literal numbers. One source of truth for the same visual concept across clients beats per-client fidelity to a static mock. Record the deviation in the plan's constraints so it reads as deliberate, not drift.

**Note:** this governs *durations only*. The direction semantics are the prototype's and are not negotiable: a row moving **up** the screen glows **green**, down glows **red**.

### 3.3 Analytics exposure bubbles — keep the existing shelf-packing

Three layouts exist: the prototype's fixed 7-slot constellation, the web's force-directed sim, and RN's deterministic shelf-packing (already built and tested as the RN replacement for the force sim).

**Decision:** **keep shelf-packing.** It scales past 7 currencies (the fixed-slot table silently drops the rest), it is deterministic — which matters for a pinned visual golden — and it is already covered by tests. The sub-phase's budget goes to the Skia port and the breathing motion instead.

## 4. Frozen data seam

No sub-phase changes `@rtc/domain`, `@rtc/client-core`, `@rtc/react-bindings`, or the wire protocol. Data reaches the UI only through `useViewModel()`. The relevant hooks per module are enumerated in each sub-phase's plan, verbatim.

Two seam-alignment observations, both optional and neither blocking:

- RN's Credit filter is a local 5-way `useState` (`Live/All/Done/Expired/Cancelled`). Both the prototype (`LIVE/DONE/ALL`) and the domain (`CreditRfqFilter = "live" | "closed" | "all"`) are 3-way, and the shared `useCreditRfqFilterPreference()` seam exists but is unused on RN. Adopting it aligns RN with web and the prototype at once.
- RN's `EquitiesScreen` holds selection in local `useState`; `useEqWorkspace()` is a composition-root singleton the web client uses for cross-panel sync. Switching is parity-positive but not required.

## 5. Per-module scope

Exact prototype values (fonts, spacing, radii, easings, colour tokens) belong in each plan's "Prototype reference" table, not here. This section fixes *what gets built*.

### 5a — Credit

**Ceremonies to build:**

- **Countdown rings.** 32×32 SVG ring, `r=13`. `@rtc/motion-core`'s `ringCircumference`/`ringDashOffset` already implement this geometry exactly and are already `"worklet"`-marked; `HoldToUnlockRing.tsx` is the idiom to mirror. Unlike the lock ring, the driver here is `useRfqCountdown()` — a plain JS number arriving every 100 ms — so it needs a `withTiming(…, {duration: 1000, easing: Easing.linear})` bridge to reproduce the prototype's smooth 1 s glide instead of ten visible steps a second. Colour flips accent→negative under 10 s via `interpolateColor`.
- **Streaming dealer quotes.** Best-quote row tint; a looping opacity pulse on `AWAITING…` while a quote has no price.
- **Pulsing best-quote ACCEPT.** The prototype pulses a `box-shadow` ring, which RN cannot animate. Reproduce as a looping `scale`+`opacity` ripple overlay — transform/opacity only, per the perf doctrine. "Best" = min price for Buy / max for Sell among priced pending quotes; the web's `findBestQuoteId` is pure and portable.
- **Accept ceremony.** Stamp → linger → fade + list glide. The stamp reuses Phase 4a's `ExecutionCeremony` spring. **The 1250 ms linger must not be a UI-side timer** — `src/ui` may not use them, and the gate greps prose. Encode it as an `exiting` animation duration or drive it from observed seam state, following the web's `rfqCardAnim` precedent.
- **New-RFQ cascade.** `LinearTransition` / `FadeInDown` / `FadeOut` on the RFQ list — the Blotter (4b) idiom, and the prototype's entrance timings (300 ms / 60 ms delay) already match Blotter's.
- **New-RFQ form reshape.** Replace the search box with a chip grid over real `useInstruments()` data (scrollable, so a count ≠ 6 still works), replace free-text quantity with fixed chips, and **delete the visible dealer-selection list** — the seam still needs a non-empty `dealerIds`, satisfied by the existing "default to all dealers" fallback.

### 5b — Equities

**Starting from zero motion** — this module currently imports no Reanimated at all, which makes it a larger jump than Rates or Blotter, both of which had some animation to rebuild around.

- **Movers board.** A ranked list with `% CHG / PRICE / A–Z` sort chips wired to `useEqWatchlistSort()`, native `LinearTransition`/`entering`/`exiting` for the glide, plus a direction-tinted rank-move overlay (§3.2).
- **Sparklines.** Derived from `useCandles(symbol)` closes — there is **no equities tick-history stream** equivalent to FX's `usePriceHistory`. Colour-transition only; no per-frame animation.
- **Instrument header.** New component: big tick-flashing price reusing Rates' `useTickFlash` + `@rtc/motion-core`'s `nextTickFlash`.
- **Skia candle chart.** Replaces the current `react-native-svg` full-tree re-render. The prototype animates the growing last candle's `top`/`height` — **do not port that literally**; those are layout properties. Only the last bar updates live.
- **Order ticket + fill toast.** The ceremony adapts Phase 4a's `ExecutionCeremony` from `TileExecutionState` to `OrderTicketState`'s six-way union, with `expo-haptics` on filled/rejected. The toast is genuinely new UI: web has no toast, only a glow-ring keyed off `useAnimationIntents`. Build the toast off real `OrderTicketState` phase transitions.
- **Blotter polish.** Row-insert flash reusing 4b's `useRowInsertFlash`; port web's `useNewestOrderId` (pure, currently unconsumed on RN); status pills.

Keep `DepthLadder`, `SectorHeatmap`, `DeskPnlGauge` and `PnlSparkline` — they have no prototype analogue and are RN/web extras, not fidelity gaps. Restyle to v5 tokens only.

### 5c — Analytics

- **Two formatter bugs, fixed first.** `@rtc/domain` already ships prototype-exact `formatPnlHeadline` / `formatPnlK` (used correctly by web); RN imports the older `formatPnlValue` / `formatWithScale`. Near-zero-risk, high-value opening task.
- **Skia P&L area chart.** Line + area fill + dashed zero baseline + last-point dot. Zero is always forced into the Y domain.
- **Pair P&L bars.** 800 ms `cubic-bezier(0.3, 0.9, 0.3, 1)` tween. Prefer `transform: scaleX` from a fixed-width track over animating `width`.
- **Exposure bubbles.** Skia port of the existing shelf-packed layout (§3.3), with a breathing size tween.
- **Card order** currently renders Exposure before Pair P&L; the prototype is P&L → Pair P&L → Exposure.

**The Skia crossing design, stated explicitly because it is easy to over-engineer:** the real `AnalyticsSimulator` appends a history point every **10 seconds** — this is not a per-frame surface. Build the `SkPath` in a plain `useMemo` on the JS thread during the ordinary re-render and pass it to a declarative `<Path>`. Do **not** reach for the `createPicture` + `useDerivedValue` recorder that `CoreScene` uses; that pattern exists for clock-driven geometry, and ~90 point operations every 10 s is nowhere near needing it. The one place a shared value genuinely earns its keep is the bar/bubble tweens.

Also worth stating so reviewers are not surprised: against live data these surfaces move *far* more slowly than the prototype's 1 s decorative mock suggests.

## 6. Cross-cutting constraints

Every sub-phase plan inherits these.

- **Worklet rule.** Any function reached from inside a Reanimated worklet must itself carry `"worklet"`, transitively, including `@rtc/motion-core` helpers. jest is structurally blind to this class — the simulator is the only witness. This repo has been bitten twice (PR #334, PR #340).
- **Banned literal tokens.** Never write `setTimeout`, `setInterval`, `localStorage`, `fetch`, or `rxjs` under `src/ui`, including in comments. Both the Credit accept-linger and the Equities toast are exactly the shape of thing that tempts a timer — neither may use one.
- **Motion gating.** Everything behind `useShellMotionEnabled()`; render the static end-state when off.
- **Perf doctrine** (`docs/performance.md`): transform/opacity only on RN views, plus the prototype-mandated colour flashes via animated style. Skia draw parameters (a circle's `r`, a path's geometry) are **not** RN layout properties and are legal to animate — state this in each plan so an implementer doesn't mistake one rule for the other.
- **Horizontal chip rows** need `flexGrow: 0` / `flexShrink: 0` plus `alignItems: "center"`, or they stretch into full-height bars on short content — the Phase 4a bug, which must not be reintroduced by any of the many new chip rows here.
- **Styling** through `useThemedStyles(makeStyles)`; all colours from theme tokens, no hardcoded hex.

## 7. Testing strategy

Unchanged from 4a/4b: covering unit tests per component and pure function (`*.test.ts` → vitest, `*.test.tsx` → jest-expo), a pinned visual scenario per module, and on-device sign-off as the primary net.

**One caveat that must reach every plan.** The simctl visual tier's captures have proven able to fail in a way that is *indistinguishable from a visual regression* — a failed deep link screenshots the Expo dev-client launcher and reports a large diff percentage. Until the readiness assertion lands, treat any visual failure above ~50% as "prove the capture succeeded" before treating it as a regression, and never regenerate a golden from an unverified capture.

## 8. Which gaps are RN-only, and which are shared

Worth stating plainly, because it changes who should fix what.

**Every mismatch in §8.1 below is shared.** M1–M7 all live in `@rtc/domain` or `@rtc/client-core` — below the UI layer and above both clients. `AnalyticsSimulator` is the same file feeding the in-browser simulator *and* the server, so the web analytics bars read the same frozen `STATIC_POSITIONS` constant RN does. Web simply hides it: it never animates those bars, so nothing visibly fails to move. The same holds for M1's absent submitted-quote history, M2's required `dealerIds`, and M5's binary fill intent — all are web gaps too, currently worked around or simply not exercised there.

That is the argument for fixing the model rather than the UI: one change, both clients.

**The rendering and tooling wrinkles are RN-only** and have no web analogue: the Reanimated worklet class (no browser equivalent — a browser has no UI-thread/JS-thread split to get wrong), the regular-weight-only Skia text, the unported `shadowBlur` bloom, the dev-client/simulator dependency, and the visual-golden tier. Note the asymmetry on that last one: the **web** visual tier runs post-merge in CI against committed goldens, while the **RN** tier is Mac-local by necessity (iOS pixels need a Mac) and gates nothing automatically.

### 8.0 Gaps against the reference implementation (not against the prototype)

A distinct category, and one this spec did not previously track. Everything else here compares us to the *mobile-v1 design prototype*. These compare us to **Adaptive's actual ReactiveTraderCloud**, the product this repo recreates.

| # | Gap | Where we stand | Notes |
|---|---|---|---|
| R1 | **Exposure bubbles are draggable in the reference implementation; ours are not — on either client.** Adaptive's analytics bubbles run a force-directed simulation with a drag behaviour: grab a bubble, the physics re-settles around it. | Verified absent in **both** clients: no pointer, mouse, or touch handler exists anywhere in `packages/client-react/src/ui/fx/positions/PositionsPanel.tsx` (nor the Solid equivalent), and RN's bubbles are a static shelf-packed layout. Our bubbles are inert everywhere. | Interaction, not decoration: dragging is how you pull a crowded bubble out to read it. Its value is highest exactly where our layouts are weakest — many currencies at once. Note the tension with §3.3: we chose deterministic shelf-packing partly *because* it is stable for pinned visual goldens, and a physics sim with drag is inherently non-deterministic. Adding drag likely means either a settled-then-frozen layout that drag perturbs, or accepting the bubbles cannot be a pixel-pinned golden surface. Decide that trade before implementing, not during. |

Whether R1 is worth building is an open product question — it is a genuine capability of the thing we are recreating, and it is currently missing from the whole repo, not just from mobile.

## 8.1 Prototype ↔ data-model mismatches

Every decision in §3 and §5 bends the **UI** to fit the existing seam, because §4 freezes the seam for this phase. That is the right default for a presentation rehaul — but it is not automatically the right *answer*. Several of these mismatches exist because the domain was built for the desktop product's information architecture, and the mobile prototype is asking for something the model genuinely cannot express. In those cases the better long-term fix is to **evolve the data model to serve the UX**, rather than permanently contort the UI around a gap.

This section is the ledger. Nothing here is in Phase 5's scope; each row is a candidate for a follow-up that would let a later pass simplify the UI.

| # | Mismatch | Phase 5 workaround (UI bends) | Candidate model change (model bends) |
|---|---|---|---|
| M1 | Sell-side: prototype shows a running **"YOUR QUOTES" history** with WON/LOST outcomes. The seam exposes only current quote state per RFQ — no notion of "quotes I have submitted". | Derive won/lost from live `QuoteState` on whatever RFQs happen to be open; history vanishes as RFQs close. | Add a **submitted-quote history projection** to the credit presenter — a durable list keyed by quote id with its terminal outcome. Makes the prototype's history list trivial and is genuinely useful product data. |
| M2 | New-RFQ: the prototype has **no dealer-selection step** ("STREAMS TO 5 DEALERS"), but `CreateRfqInput.dealerIds` is required and must be non-empty. | Hide the UI, silently default to all dealers. | Make `dealerIds` **optional**, with "all dealers" as the documented server-side default. The client then stops carrying a field the user never chooses. |
| M3 | RFQ window: prototype uses **45 s**, domain uses `CREDIT_RFQ_EXPIRY_SECONDS = 120`. | Use 120 s; the ring geometry is identical, only the fill rate differs. | Decide which is the product's intended window and set one value. A 120 s ring barely moves on a phone screen — 45 s reads far better on mobile. |
| M4 | Equities sparklines: there is **no equities tick-history stream**. FX has `usePriceHistory`; equities has only OHLC `useCandles`. | Derive the sparkline from candle closes — coarser and differently-shaped than the prototype's 24-point tick trace. | Add an **equities price-history stream** mirroring the FX one. The presenter-side retention pattern already exists (see the FX sparkline retention fix, PR #242). |
| M5 | Equities fill toast: the seam represents a fill as a **binary animation intent**, with no order-lifecycle event carrying qty/price//outcome. | Reconstruct toast content from `OrderTicketState` phase transitions in the view. | Emit a proper **order-lifecycle event** (accepted → working → filled, with fill qty and average price). The view then renders an event instead of inferring one from state diffing. |
| M6 | `AnalyticsSimulator` emits `currentPositions: STATIC_POSITIONS` — the **same frozen constant on every emission** (`AnalyticsSimulator.ts:107` and `:124`), initial and 10-second update alike. Only `history` grows. **Two of the Analytics screen's three widgets read `currentPositions`**: the pair P&L bars and the exposure bubbles. | Both the bars' 800 ms width tween and the bubbles' 900 ms breathing animate a *change in value* — so against a value that never changes, both fire once on mount and then never again. Correct code, permanently still output. Only the P&L chart (fed by `history`) actually moves. | Let positions **drift** in the simulator. One file, small change. Without it, two of the three widgets' motion is unobservable on real data and exists only inside a pinned visual golden. |
| M7 | Analytics cadence: history appends every **10 s**; the prototype's mock ticks every **1 s**. | Accept much slower motion than the prototype demonstrates. | Either raise the emit cadence, or interpolate between points client-side. Worth deciding deliberately — this is the difference between a live-feeling HUD and a chart that looks frozen. |

**M6 is the one to weigh first, and it is bigger than it first reads.** It is cheap and confined to a simulator, but it decides whether *most of 5c's motion work is worth doing at all*: two of that sub-phase's three animated widgets are wired to a constant. Three ways out — let positions drift (recommended; the only one where the work has a point), build the motion anyway and accept it moves only in a screenshot test, or drop it from 5c's scope and save the effort. Decide before planning 5c, not after.

## 9. Open items

- Credit's 3-way filter and Equities' `useEqWorkspace()` alignment (§4) — either may be folded into its sub-phase or deferred; neither blocks.
- No RN e2e coverage exists for Credit at all, so its testIDs are free to change. Equities and Analytics should be grep-checked before renaming testIDs.
- Equities' toast has no seam precedent on either client; if it proves awkward against real `OrderTicketState` transitions, falling back to web's glow-ring pattern is an acceptable de-scope, recorded rather than silently taken.
