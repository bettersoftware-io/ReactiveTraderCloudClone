# Spec-Driven Reimplementation: A Fidelity Experiment

> **Status:** Retrospective / research note. Written for a talk on how faithfully an
> LLM can reconstruct an application's *behaviour* from generated specifications.
> Date: 2026-06-23.

## TL;DR

We ran a three-stage experiment: (1) generate behavioural specs *from* the original
[ReactiveTraderCloud][rtc] codebase, (2) drop those specs into a blank repo, (3) ask an
LLM to build the app from the specs alone — deliberately using a **different
architecture** (clean-architecture, RxJS-in-domain, framework-swappable UI) than the
original.

The result was **close but not exact**. Auditing the clone against the original
surfaced ~14 behavioural divergences. Tracing each one back through the pipeline
(original → spec → clone) produced the key finding:

- **~70% of the misses were implementation-fidelity losses** — the spec captured the
  original *correctly*, but the build pass shipped a cheaper approximation. These
  cluster on *effortful* behaviours (physics animation, real number formatting, grid
  reuse) and *single invertible details* (sort direction).
- **~30% were spec-fidelity losses** — the spec itself lost or distorted the truth.
  These cluster in exactly one place: **the invisible backend.** The original is a
  *client* talking to a real gateway and OpenFin/FDC3 platform code; behaviour that
  lived server-side or platform-side was flattened, guessed, or had its delivery seam
  dropped.
- **A methodological flaw amplified both:** the clone's contract/visual tests were
  generated *from the implementation*, so they **ratified every wrong choice**. Green
  tests, false confidence. Tests-as-portability-contract verify *framework parity*,
  never *spec conformance*.

The headline lesson: **a more capable implementing model would meaningfully reduce the
70% bucket, but cannot touch the 30% — that ceiling is set by spec quality and by
whether anything ever checks the build against ground truth.**

[rtc]: https://github.com/AdaptiveConsulting/ReactiveTraderCloud

---

## 1. The experiment

### Setup

| Stage | Input | Output | Notes |
|---|---|---|---|
| **A. Spec generation** | Original RTC codebase | `./specs/` (Gherkin features, domain markdown, service YAML, mock-backend markdown) | Specs are stack-agnostic — they describe *what*, not *how*. |
| **B. Reimplementation** | `./specs/` only (blank repo) | This repo (`@rtc/*` monorepo) | Deliberately **different architecture**: pnpm+Turborepo, clean architecture, RxJS confined to `domain`, framework-swappable UI. |
| **C. Evaluation** | Clone + original + specs | This document | Three-way reconciliation per behaviour. |

### Hypothesis

> If specs faithfully capture an app's behaviour, an LLM can reconstruct that behaviour
> in a *clean* architecture — proving the specs (not the original's code structure) are
> the portable asset.

### Provenance

- Original cloned shallow at archived `HEAD 4a31f01` ("README.md updated to show repo is
  archived"). The original is a client (`packages/client`) that talks to an Adaptive
  *Hydra/TradingGateway* backend (`generated/TradingGateway.ts`) plus OpenFin/FDC3
  platform integrations. **No server source ships in the original repo** — a fact that
  turns out to explain most of the spec-fidelity losses.
- The clone has no backend; it re-hosts the mock backend client-side as RxJS simulators
  in `@rtc/domain`.

---

## 2. How we evaluated: three-way reconciliation

The trick that made the findings actionable was refusing to stop at "the clone differs
from the original." For every divergence we asked **three** questions:

1. What does the **original** actually do? (ground truth, read from original source)
2. What does the **spec** say? (was the requirement captured?)
3. What did the **clone** build?

This separates *implementation* failures (spec was right, build was wrong) from *spec*
failures (the requirement never survived generation) — which need completely different
fixes.

---

## 3. The reconciliation table

Legend for "Where it broke": **impl** = spec faithful, build diverged · **spec** = spec
lost/distorted the truth.

| Behaviour | Original (ground truth) | Spec said | Clone built | Broke at |
|---|---|---|---|---|
| Blotter sort, Notional 1st click | **ASC** (only `tradeDate`/`valueDate`/`tradeId` are desc-first) | ASC ✓ | DESC | **impl** |
| Latest P&L format | `USD` + whole number w/ commas (`Intl.NumberFormat`) | USD + commas ✓ | `+12.3k` (abbreviated) | **impl** |
| Position bubbles | per **currency**, sized by **traded amount**, **draggable** (d3-force drift-back), hover tooltip | per currency, traded-amount, draggable, tooltip ✓ | per **pair**, sized by **PnL**, no drag, no tooltip | **impl** |
| PnL-per-pair bar hover | hover → precise 2-dp | hover → precise ✓ | static label | **impl** |
| New-row highlight | `backgroundFlash 1s ease-in-out ×3` (3 flashes) | "1s ease-in-out, repeats 3×" ✓ | single 3s fade | **impl** |
| New-RFQ max quantity | **capped** (`Math.min`, 100,000,000) | "capped at 100M" ✓ | blocks submission w/ error | **impl** |
| FX RFQ response delay | 500–999 ms | "500–1000 ms" ✓ | 500–2000 ms | **impl** |
| Idle disconnect | actually `dispose()`s the connection (15 min) | "client closes the connection" ✓ | only emits an event | **impl** |
| Stale tile | tile **suspends** (price buttons unmount) + truly disabled | "buttons disabled" ✓ (weaker) | greyed overlay, still clickable | **impl** |
| Credit blotter | full sort / filter / CSV (reuses the FX grid) | sort/filter/export ✓ | static table | **impl** |
| Footer status label | only **"Disconnected"** (idle/offline collapse to it; distinct text lives in the modal) | "Idle Disconnected" / "Offline Disconnected" ✗ | "Idle" / "Offline" | **spec** |
| RFQ expiry driver | **server**-driven (frontend timer is cosmetic) | "frontend transitions to Expired" ✗ | neither (no countdown, no expiry) | **spec** (+ impl) |
| Competing-quote auto-reject | **server event** mirrored live in client reducer | "auto-rejected" ✓ but **seam (the wire event) not captured** | computed in simulator, **never emitted** → never shows live | **spec** (lost the seam) |
| CreditExceeded | **no-op in the web build** (real only in OpenFin/FDC3) → effectively unreachable; overlay text exists | described as a real reachable path ✗ | overlay exists, never fires | **spec** (over-specified) — clone actually *matches* the web original here |

**Score:** 10 of 14 broke at **impl** (spec was faithful); 4 broke at **spec**. The spec
generation was *good*; the dominant failure mode was the build cutting corners.

---

## 4. Root-cause taxonomy

### Cause A — Implementation-fidelity loss (≈70%)

The spec was correct; the build satisficed. The pattern is unmistakable — every member
of this bucket is one of:

- **Effortful to build:** d3-force physics bubbles, a repeating CSS animation, real
  `Intl` formatting, reusing the grid engine for a second blotter. Given a correct but
  *terse* spec line ("draggable bubbles that drift back"), the implementing pass chose
  the cheaper approximation. **The model read "draggable" and shipped static.**
- **A single invertible detail:** "Notional sorts ascending on first click" is one
  token. Easy to capture, easy to flip, and nothing re-checked it.

This bucket is largely a function of **stamina and resistance to satisficing** — which
is exactly what model capability buys.

### Cause B — Spec-fidelity loss (≈30%), concentrated at the invisible backend

The original is a *client*. Behaviour that lived elsewhere did not survive spec
generation:

- **Server-authoritative logic was flattened or guessed.** RFQ *expiry* is server-driven
  in the original (the frontend countdown is cosmetic); the spec guessed
  "frontend-driven." For a backend-less clone, frontend-driven is actually the *right
  adaptation* — but the spec asserted it as original behaviour, which it isn't.
- **Delivery seams were dropped.** Competing-quote auto-reject works in the original
  because the server emits a `QUOTE_ACCEPTED_RFQ_UPDATE` event that the client reducer
  mirrors. The spec captured *that it happens* but not *how it is delivered*. The clone
  therefore computed the rejection inside the simulator with **no event channel to
  surface it** — so losing quotes never update in the live UI. The seam was the
  requirement.
- **Platform-only paths were over-specified.** The credit-limit check is a **no-op in
  the original's web build** (real only under OpenFin/FDC3). The spec described it as a
  reachable state. Ironically the clone's "display-only, never fires" behaviour *matches
  the web original* — the spec was wrong, not the clone.

**No implementing model can recover behaviour that isn't in its input.** Garbage-in
bounds fidelity. The fix for B is *upstream* (better spec generation) or a *closed loop*
with the original — never a better builder.

### Amplifier — Tests ratified the implementation, not the spec

The clone's contract and visual tests were written *against the clone's own
components*. So a test asserts `PnlValue` renders `+12.3k` and passes forever; it can
never report that the spec said `USD 12,345`. **Tests-as-portability-contract verify
framework parity, never spec conformance.** This is why every impl-bucket miss slipped
through with a green suite — and it is a *process* flaw, independent of model capability.

---

## 5. What we could do to get better results

In rough order of leverage:

1. **Make tests assert the spec, not the implementation.** The `.feature` files are
   executable Gherkin — wire step definitions to assert the spec's literal numbers,
   strings, and directions. This single change catches the entire impl bucket: sort
   direction, P&L format, max-qty cap, RFQ delay, the 3× flash all go red instead of
   frozen green.

2. **Add a "diff against the original" critic loop.** Exactly the evaluation in §2, but
   built in: after implementing, give a fresh agent the original + the clone and have it
   report behavioural diffs, then feed them back as repair tasks.
   *Generate → critique-vs-truth → repair.* This is the **only** mechanism that catches
   spec-fidelity losses, because it reintroduces the ground truth the spec dropped.

3. **Teach spec generation to capture *seams*, not just behaviours.** Especially the
   client/server boundary. Service contracts should encode server-authoritative *events*
   as first-class (a `QuoteAccepted` event that flips sibling quotes; explicit ownership
   of expiry). Then the clone's simulator is *forced* to reproduce the event channel, and
   live auto-reject works instead of computing into the void.

4. **Pin the effortful behaviours with exact acceptance criteria.** The model satisfices
   on vague verbs. "Draggable" → "d3-force simulation, `forceX`/`forceY` strength 0.1,
   `forceCollide`, drag release sets `fx`/`fy` to null." "Highlighted" →
   "`animation: 1s ease-in-out; iteration-count: 3`." Specificity removes the room to cut
   corners.

5. **Capture golden behavioural fixtures from the original** — actual formatted strings,
   a sample sorted order, a sample CSV — and assert the clone reproduces them. Data beats
   prose.

6. **Spend more capability on the *spec-generation* step, not just implementation.** That
   is where the lossy compression happened, and it sets the ceiling for every downstream
   pass.

---

## 6. Would a more capable model (e.g. Fable) replicate more faithfully?

Split answer, because the two root causes respond differently to capability:

- **Cause A (≈70%): yes, plausibly a real improvement.** These misses are about stamina
  and resistance to satisficing — fully building the physics, the animation, the
  formatters; getting the one-token sort direction right. A more capable model with
  stronger instruction-following and longer follow-through, given the *same* specs, would
  likely ship more of these faithfully. This is exactly the kind of gap a better model
  narrows.

- **Cause B (≈30%): no — a better *implementing* model cannot fix it.** That information
  was never in the specs (it lived in the invisible backend). The lever is upstream: a
  stronger model on the *spec-generation* step would help, and the diff-against-original
  loop helps regardless.

- **The test-oracle flaw: model-independent.** No model fixes a process that points the
  tests at the wrong oracle.

**Realistic expectation:** swapping a stronger model into the *implementation* step lifts
faithfulness on the majority bucket — a noticeable win — but the ceiling stays capped by
spec quality and verification. The compounding result is *stronger model on spec-gen AND
impl, plus spec-conformance tests, plus a critic loop against the original.* Of those,
the model swap is the easy 70%-mover; the process changes unlock the last 30% and stop
the tests from lying to you.

---

## 7. The positive result (don't bury it)

It is easy to read §3 as a list of failures. It is better read as: **a spec →
reimplement-in-a-different-architecture pipeline reproduced the bulk of a non-trivial
real-time trading app's behaviour faithfully**, and the misses are *explainable,
categorised, and mostly fixable with process changes.* The spec captured even subtle
behaviours correctly (draggable physics bubbles, a 3×-iteration flash, server-driven
auto-reject). That is a strong outcome for "generate specs from app A, rebuild as app B
with clean architecture" — and it is precisely why this clone is a viable base for the
planned multi-framework (React → SolidJS) work: the *specs*, not the React code, are the
portable asset.

---

## Appendix: selected ground-truth citations from the original

All paths under `packages/client/src/` of the original repo (archived `HEAD 4a31f01`).

- **Sort direction:** `descDefaultFields = {tradeDate, valueDate, tradeId}`;
  everything else (incl. Notional, Rate) defaults ASC —
  `client/App/Trades/TradesState/sortState.ts:32,66-69`.
- **New-row flash:** `animation: backgroundFlash 1s ease-in-out 3` —
  `client/App/Trades/GridRegion/styled.ts:36-38`; held `HIGHLIGHT_ROW_FLASH_TIME = 3000`
  — `client/constants.ts:54`.
- **Latest P&L:** `formatAsWholeNumber` (`Intl`, 0 fraction digits) + literal `"USD"`
  prefix — `client/App/Analytics/ProfitAndLoss/LastPosition.tsx:11,16,23`;
  `client/utils/formatNumber.ts:95-99,136`.
- **Position bubbles:** per-currency aggregation + zero-filter —
  `client/App/Analytics/Positions/data.ts:46-64`; radius `d3.scaleLinear` over
  `abs(baseTradedAmount)` → `[15,60]`, colour by sign — `data.ts:65-90`; d3-force
  simulation + drag drift-back — `BubbleChart.tsx:85-130`; tooltip `"{id} {amount}"` —
  `BubbleChart.tsx:72,131-138`.
- **PnL bar hover:** default `formatWithScale` (k/m), hover → `precisionNumberFormatter(2)`
  — `client/App/Analytics/PnL/PNLBar.tsx:29,42-50,81`.
- **Credit RFQ timer:** `setInterval(…,1000)` countdown + CSS keyframe bar;
  `CREDIT_RFQ_EXPIRY_SECONDS = 120` — `client/App/Credit/common/CreditRfqTimer.tsx:71-120`,
  `client/constants.ts:51`.
- **Expiry server-driven:** `RfqState.Expired` only ever *received* over the wire —
  `services/credit/creditRfqs.ts:102-112`; `generated/TradingGateway.ts:138-141`.
- **Auto-reject via event:** `getQuoteStateOnAccept` applied on
  `QUOTE_ACCEPTED_RFQ_UPDATE` — `services/credit/creditRfqs.ts:173-216`.
- **New-RFQ cap:** `applyMaximum = Math.min(value, MAX_INPUT_VALUE)`,
  `MAX_INPUT_VALUE = 100_000_000` — `App/Credit/NewRfq/state.ts:69-74`,
  `utils/formatNumber.ts:232-235`.
- **CreditExceeded no-op in web:** `checkLimit$` returns `of(true)` —
  `services/limitChecker/limitChecker.ts:5-9`; real check only in
  `limitChecker.openfin.ts:23-71`; overlay text "Credit limit exceeded" —
  `App/LiveRates/Tile/ExecutionResponse/overlays/FailureOverlay.tsx:36-38`.
- **Stale tile suspends:** `useIsSymbolDataStale()` → `SUSPENSE` suspends the tile —
  `App/LiveRates/Tile/Tile.tsx:50-58`; disabled buttons truly disabled
  (`pointer-events: none`) — `PriceButton/PriceButton.styles.tsx:106-110`.
- **RFQ delay:** `delay(500 + random*500)` = 500–999 ms — `services/rfqs/rfqs.ts:13`.
- **Footer label:** idle/offline both map to `DISCONNECTED` → only
  "Connecting/Connected/Disconnected" shown — `App/Footer/StatusButton/StatusButton.tsx:8-19`;
  distinct idle/offline wording in the modal — `components/DisconnectionOverlay.tsx:29-42`.
- **Idle disconnect tears down:** `IDLE_TIMEOUT_MINUTES = 15`; `idleDisconnect$` calls
  `dispose()` — `services/connection.ts:71,74-96`.

---

## Resolution (2026-06-24)

The divergences catalogued above were subsequently driven to ground truth in a
dedicated **behaviour-sync workstream** that used the original codebase
(`rtc-original@4a31f01`) — not the generated specs — as the source of truth, and
corrected all three layers (`./specs/`, the test suites, and the implementation)
so they finally agree. The clean architecture was preserved throughout (the
dependency rule stayed machine-enforced; the domain stayed rxjs-only).

- **Design:** [`docs/superpowers/specs/2026-06-23-behaviour-sync-to-original-design.md`](../superpowers/specs/2026-06-23-behaviour-sync-to-original-design.md)
- **Plan:** [`docs/superpowers/plans/2026-06-23-behaviour-sync-to-original.md`](../superpowers/plans/2026-06-23-behaviour-sync-to-original.md)

**13 in-scope behaviours synced**, each red-first and verified either by a
**golden fixture lifted from the original's pure functions** (deterministic
value/logic) or by an assertion **provenance-cited to the original `file:line`**
(behavioural wiring):

- Blotter sort direction (Notional/Rate ASC-first; desc-first set
  `{tradeId, tradeDate, valueDate}`) and new-row 3× flash.
- Analytics: latest-P&L `USD +12,345` format, scaled-vs-precise PnL-bar label
  (`12m` / `12,345,678.00`), per-currency position bubbles (d3 force layout —
  the only new dependency, client-side only).
- Credit: New-RFQ quantity **cap** at 100,000,000 (not block), credit blotter
  sort/filter/CSV via FX-grid reuse, competing-quote auto-reject surfaced live,
  RFQ expiry → `Expired` at +120 s with a live (cosmetic) countdown.
- FX/Tile: RFQ response delay 500–999 ms, stale tile disables Buy/Sell.
- Shared: footer collapses idle/offline → "Disconnected" with verbatim overlay
  copy, and idle now tears down the websocket (non-terminal `closeForIdle`/`reopen`).

Where the original's behaviour was **server-driven** (auto-reject, expiry), the
clone's RxJS simulators legitimately play the server's role — the faithful
observable equivalent for a back-endless web build.

**Deliberate non-fix:** `CreditExceeded` stays unreachable, matching the
original's standard web build (`limitChecker.ts` returns `of(true)`; the real
check exists only in the OpenFin build). This is the one intentional divergence.

**Newly observed (out of scope, for a follow-up):** the original's
idle-`DisconnectionOverlay` renders a "Reconnect" button that the clone omits.
This pre-existing structural gap was surfaced during the sync but was not part of
the 13-behaviour scope, so it was deliberately left for a future task rather than
expanded into mid-stream.

The corrected specs and tests are the durable artefact: the spec-conformance
tier would now catch two generated-spec bugs this exercise exposed — the
profit-and-loss feature's `"12,346k"` (the original yields `"12m"`) and the
8-vs-9-currency-pair analytics contradiction.
