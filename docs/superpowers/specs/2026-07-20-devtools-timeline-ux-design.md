# RTC DevTools — Timeline-First UX Redesign

**Date:** 2026-07-20
**Status:** Design approved, plan to follow
**Scope decisions (locked):** daily-driver debugging tool first (utilitarian density over showcase visuals) · Approach A (timeline-first) chosen; Approaches B and C documented below as fallbacks · panel-side implementation, protocol/hub untouched · dormancy contract inviolable

## 1. Why

The v1 inspector (spec: [2026-07-11-custom-devtools-design.md](2026-07-11-custom-devtools-design.md),
architecture: [§20](../../architecture/20-devtools.md)) shipped solid
infrastructure — dormancy contract, three transports, versioned protocol,
record-and-replay — but its UX is nowhere near Redux DevTools in usability
and intuitiveness. Diagnosed gaps, confirmed against real usage:

1. **No event→state time travel.** You cannot click a log event and see the
   whole app state as it was at that moment — Redux's core loop.
2. **No diffs.** Each emission/transition shows only the latest value, never
   *what changed*.
3. **Fragmented tabs.** State/Machines/Log/Wire are silos; following "this
   wire message caused this stream emission caused this machine transition"
   means tab-hopping with no cross-linking.
4. **Raw information design.** Dense unstyled rows, weak tree inspection, no
   search-across-state.

Root cause: Redux DevTools' usability comes from one design decision — **the
action is the unit of navigation**; everything (state, diff, trace) is indexed
by "which action am I looking at." Our inspector indexes by *category*
(streams vs machines vs wire) instead of by *moment*, which makes it four
dashboards rather than one debugger.

All four debugging workflows must get faster: *why does the UI show this*
(trace a rendered value back), *what just happened* (rewind and step), *is
the wire healthy* (rates/traffic), *why is this machine stuck* (transition +
intent history).

## 2. Interaction model & layout (Approach A)

The four tabs are replaced by a single timeline-first screen:

```
┌───────────┬──────────────────────────────┬───────────────────────────┐
│ rail      │  TIMELINE (left pane)        │  CONTEXT (right pane)     │
│           │                              │                           │
│ ● rtc-web │  ▸ 14:02:11.030 wire:in      │  [Event] [State] [Diff]   │
│           │    priceUpdate EURUSD…       │                           │
│ filters   │  ▸ 14:02:11.031 stream       │  (content of selected     │
│ ☑ stream  │    fx.price$[EURUSD] 1.0834  │   sub-tab for the         │
│ ☑ machine │  ▸ 14:02:11.210 machine      │   selected event)         │
│ ☑ wire    │    tile#3 → executing        │                           │
│ sources…  │  ▸ … (live tail)             │                           │
└───────────┴──────────────────────────────┴───────────────────────────┘
```

- **Timeline** (left): one chronological, virtualized list of all event
  families — stream emissions, machine created/state/intent/disposed, wire
  in/out, devtools errors — color-coded by family, newest at the bottom.
- **Follow vs pinned — selection implies pause.** With nothing selected the
  timeline follows the live tail. **Clicking a row pins the inspector to that
  moment**: the row highlights, the tail keeps accumulating below (dimmed),
  and a persistent "⏸ pinned at «ts» — Resume" bar appears. `Esc` or Resume
  snaps back to live. This single gesture replaces both the Log tab's Pause
  button and the Recording toolbar's Live|Replay mode split.
- **Context pane** (right) shows the selected event in three sub-tabs
  (Redux's trio):
  - **Event** — the payload (`ValueView`) plus source metadata (streamId /
    machineId / msgType, coalesced count, seq, ts).
  - **State** — the *entire* reconstructed `InspectorState` at that seq —
    state tree and machines rendered by the existing panels-as-pure-functions.
    Values that differ from the live present are subtly marked so "what was
    different back then" is scannable.
  - **Diff** — what this event changed vs. the previous value of the same
    source, as an inline JSON tree diff (added/removed/changed leaves
    colored). See §3.3.
- **Keyboard**: `↑`/`↓` move selection (auto-pinning), `Esc` resumes live,
  `/` focuses the filter. Selection + arrows *is* the time scrubber — no
  separate frame-index slider in the main flow.
- The rail keeps connection status and counts, and gains the family toggles
  and source-filter pills (§4).
- When following (nothing selected), the context pane shows the **live**
  state tree — so the current "glance at live state" use stays one glance
  away even though the State top-level tab disappears.

All three transports (same-origin `/devtools/`, Chrome MV3 extension, RN
relay) inherit the redesign automatically — they mount the same
`InspectorApp`.

## 3. Store & time-travel architecture

All new logic lands in `@rtc/devtools-core` as pure, unit-testable classes;
`@rtc/devtools-app` stays a dumb renderer. Nothing app-side changes: the
protocol, hub, decorators, and dormancy contract (§20.3/§20.7) are untouched,
so the shipped perf story needs no re-verification.

### 3.1 `LiveHistory` — the rolling time-travel buffer

A new class teeing off `InspectorStore.tap()` (the same tee point `Recorder`
uses) that maintains:

- a bounded rolling buffer of `AppToInspector` frames (cap ~20k events'
  worth; oldest trimmed);
- periodic **checkpoints** — every ~500 frames, a `structuredClone`d
  synchronous `InspectorStore` — with the base checkpoint **rebased forward**
  as old frames trim off;
- `stateAt(seq)`: binary-search the frame containing that seq, clone the
  nearest checkpoint at-or-before it, fold forward.

This generalizes `ReplayController`'s proven checkpoint-fold algorithm from
"immutable recording" to "append + trim". `ReplayController` becomes a thin
wrapper over `LiveHistory` for imported recordings, so one fold engine serves
both live time travel and recording replay.

**Checkpoint weight fix:** `InspectorStore` gains a `{ trackLog: false }`
option that skips log accumulation. The State sub-tab renders streams +
machines only, so checkpoint clones never need the 5000-row log — currently
the heaviest thing `clone()` copies. Checkpoints drop to just the entry maps
(dozens of streams, a few hundred machines).

### 3.2 Selection model

The timeline renders from the existing `log` (rows already carry seq + the
full event). Pinning row `seq` calls `history.stateAt(seq)` — a click-time
cost of one checkpoint clone + ≤500 frame folds, the same user-paced cost
profile replay scrubbing has today; never per-frame work.

**Trim edge case:** if a pinned moment ages out of the rolling buffer, the
pin bar shows "this moment left the buffer" with Resume as the only action —
no silent jumps.

### 3.3 `diffSerialized(prev, next)` — the diff engine

A pure function over two `SerializedValue` trees returning a leaf-level
change list (`added` / `removed` / `changed(before, after)`). "Previous" is
found by scanning the log backward from the selected row for the last
comparable event:

| Selected event | Comparable predecessor |
|---|---|
| `stream:emission` | previous emission of the same `streamId` |
| `machine:state` | previous `machine:state` of the same `machineId` |
| `wire:in` / `wire:out` | previous message of the same `msgType` + direction |
| others | none — "no prior value" |

Wire diffs against the same `msgType` are genuinely useful — consecutive
`priceUpdate EURUSD` frames diff to just the moved fields. Diffing is bounded
by construction: `SerializedValue` is already capped (depth ≤ 6, arrays ≤ 50,
strings ≤ 500 chars).

### 3.4 Honest-framing caveat (carried over from record-and-replay)

Hub coalescing (~33 ms flush) means intermediate values within a flush window
never crossed the wire. Time travel and diffs operate on flushed values; the
`coalesced` count is shown so folded ticks are visible. Same caveat the
recording feature already documents; no protocol change needed or wanted.

## 4. Filtering & search

Three composable layers plus two special affordances, all client-side over
the log:

- **Family toggles** — the existing four checkboxes (stream / machine / wire /
  devtools), relocated to the rail.
- **Source pills** — click any streamId / machineId / msgType (in the
  timeline or context pane) to add it as a filter pill. Pills OR within a
  layer, AND across layers. This is the "follow one thing" workflow: pin
  `fx.price$[EURUSD]` + `wire:priceUpdate` and the timeline becomes that
  story only.
- **Free text** — the existing summary substring match; `/` focuses it.
- **Radius filter** — the causality heuristic: a "±100 ms around this event"
  one-click action on any row, rendered as a special pill
  (`~14:02:11.031 ±100ms`). Cheap and honest — and the seam where Approach
  C's real `causeId` would slot in later.
- **Search-across-state** (adopted from Approach B): the State sub-tab gets a
  text box filtering the reconstructed tree to matching paths/values — pure
  render-time filtering.

## 5. Lenses, not tabs

Two secondary views remain, reframed as lenses over the same selection model:

- **Machines lens** — the current table + detail pane, kept (it answers "why
  is this machine stuck" better than a timeline). Cross-linked both ways:
  selecting a machine adds its pill to the timeline; clicking a transition
  row in the detail pane pins the timeline at that seq. Intent injection
  stays here, unchanged (dev-gated + confirm-gated).
- **Wire lens** — the current wire list plus a small always-visible health
  header: msg/s in and out, last-message age, reconnect count (derived from
  `welcome` re-arrivals and `stream:registered` re-registrations). Same
  cross-linking.
- The **State tree as a top-level tab disappears** — it lives in the context
  pane (live when following, historical when pinned).

## 6. Recording integration

The Live|Replay mode split dissolves:

- **Export** captures the `LiveHistory` buffer — same JSON `Recording` format,
  unchanged, so existing recordings stay importable. Because the rolling
  buffer is always on, "export the last N minutes" works **retroactively** —
  the thing actually wanted when a bug just happened.
- **Import** swaps the timeline's datasource from the live history to a
  static one and shows a "viewing recording — Back to live" banner. Scrubbing
  an import is the normal pin/arrow interaction — no separate scrubber UI.
- `Recorder`'s explicit start/stop capture stays for bounded repros.

## 7. Error handling

Reconstruction failures (`stateAt` throwing on a corrupt frame, diff on
malformed values) are caught at the controller boundary and rendered as an
inline error card in the context pane — never a blank panel, never a crash of
the timeline. Store/transport layers already isolate their own failures as
`devtools:error` events, which surface as ordinary timeline rows.

## 8. Testing

Same tiers the panels use today:

- **`devtools-core` vitest**: `LiveHistory` append/trim/rebase invariants and
  the equivalence property `stateAt(k)` ≡ full fold from empty (the property
  the replay tests already assert, extended across trims); `diffSerialized`
  property tests (applying the diff to `prev` reproduces `next` within
  serializer caps); `trackLog:false` behavioral parity for streams/machines.
- **`devtools-app` RTL**: pin/resume, keyboard nav, pills, diff rendering,
  trim-while-pinned banner, import banner.
- **Playwright**: extend the existing `tests/browser/playwright/devtools.spec.ts`
  with one pin-and-inspect journey (pin a row → assert State@seq differs from
  live → Resume).
- Extension and RN relay: smoke only — they mount the same `InspectorApp`.

## 9. Alternatives considered — documented as fallbacks

Approach A above was chosen. B and C are documented for the record and as
fallback paths if A underdelivers in practice.

### Approach B — keep the four tabs, add cross-cutting powers

Diff expanders in the Log tab, click-a-log-row-to-jump-the-replay-scrubber,
cross-links between tabs, search-across-state. Cheapest option; decorates the
fragmented structure rather than fixing it — tab-hopping to follow a story
remains. **Fallback trigger:** the unified timeline proves too noisy for
daily debugging even with source pills and family filters — in that case the
per-tab powers (diffs, jump-to-seq, cross-links) are all still individually
buildable on the v1 layout, and §3's `LiveHistory`/`diffSerialized` machinery
carries over unchanged.

### Approach C — instrumented causality debugger

App-side causal tagging: decorators propagate a correlation id from wire
message → stream emission → machine transition; the panel renders true
cause→effect chains. Strictly the most powerful, but RxJS async boundaries
make context propagation genuinely hard (every `mergeMap`/timer hop loses
sync context), it touches all three decorators plus the perf story, and the
±100 ms radius heuristic gets ~80% of the value for ~5% of the cost.
**Fallback trigger:** the radius heuristic misattributes causality often
enough to mislead debugging. The protocol seam is ready — an optional
`causeId` field on `DevtoolsEvent` would slot into the timeline model
without UI rework.

## 10. Non-goals

- No protocol or hub changes (v3 bump, new inbound messages) — everything is
  panel-side.
- No app-side decorator changes; the dormancy contract and §20.7 perf story
  are untouched.
- No showcase-driven visual styling — utilitarian density first; the app's
  HUD design language is not a goal for this pass.
- No full app replay (recorded port inputs into a fresh composition root) —
  unchanged from v1's deferral.
- Presenter-level intent injection and an intent-name catalogue — unchanged
  future work.
