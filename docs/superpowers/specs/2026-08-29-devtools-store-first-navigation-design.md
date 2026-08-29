# RTC DevTools — Store-First Navigation (v3)

**Date:** 2026-08-29
**Status:** Design approved, plan to follow
**Scope decisions (locked):** one navigation tree replaces the filter rail and
the three lenses · presenter = store, streams = slices, tree expandable to
leaves · actions list = the selected node's own emissions/transitions, with a
per-row "wire ±100 ms" probe · Clear = a global watermark (Redux "Commit"),
never a buffer reset · Approach A (scope compiles to the existing
`TimelineFilter`) · panel-side only, protocol/hub/dormancy untouched · two
STATUS items folded in (pinned-row log-cap eviction, scroll-anchored follow)

## 1. Why

The v2 inspector (spec:
[2026-07-20-devtools-timeline-ux-design.md](2026-07-20-devtools-timeline-ux-design.md),
architecture: [§20.11](../../architecture/20-devtools.md)) fixed the
*indexing* problem — the moment (a pinned event) is the unit of navigation,
with Event/State/Diff reconstructed for it. Live use since then says the tool
is still nowhere near Redux DevTools in intuitiveness: **you cannot figure
out how to use it.** The remaining gap is *scope*, not indexing:

1. **One firehose.** A live FX workspace registers ~58 streams (31 presenter
   props + 27 parameterized `priceStream.price$[…]` / `priceHistory.history$[…]`
   / `animationDirector.intentsFor[…]`), a dozen machines and ~330 wire
   messages/s. The unified timeline interleaves all of it. Redux never shows
   you "everything"; it shows you **one store**, and the action list is that
   store's inputs.
2. **Stream selection is backwards.** The only way to scope the timeline to a
   stream is to click the *source button on a timeline row* — you have to
   find the needle to filter for the needle. The stream list that exists
   (`StateTreePanel`, grouped by presenter) is not clickable.
3. **Three navigation models.** Family checkboxes + source pills + free text
   (the rail), lenses (Timeline / Machines / Wire), and context tabs — all
   orthogonal, none of them "pick the thing you care about."
4. **No way to start over.** The log only ever grows (capped at 5000 rows);
   there is no "clear, then watch what happens next" — Redux's Commit, the
   single most-used button when reproducing a bug.

Two shipped-then-found defects sit in the same code and block daily use:
the **pinned row is evicted** from the 5000-row log within minutes under
live traffic (Event/Diff silently fall back to State), and **follow mode
snaps the scroll to the tail on every ~15 Hz flush**, so a human cannot
scroll up to read, and clicking a row is a moving-target race. Both are fixed
here because the rework touches the exact lines.

## 2. Mental model

| Redux DevTools | RTC v3 |
|---|---|
| the store | a **presenter** (`blotter`, `priceStream`, …) — selectable node |
| a state slice | a **stream** of that presenter (`blotter.trades$`) — expandable leaf |
| the action list | the selected node's **emissions / transitions**, newest last |
| click an action → State / Diff | pin a row → **State** (the node's slices at that seq) / **Diff** (vs the previous emission of the same source) |
| Commit | **Clear** — hide everything before now, keep the current state as baseline |
| "Jump to state" / time travel | unchanged: `LiveHistory.stateAt(seq)` |

Machines are stores too (`tileExecution` kind → `m3`, `m4`, … instances), and
the wire is a store whose slices are message types. The inspector therefore
has **one tree with four roots** and a single selection — the *scope*.

## 3. Layout

```
┌ rail 220px ────────┬ actions (scoped) ───────────┬ context ──────────────┐
│ ● rtc-web          │ [Clear]  [🔍 search scope ] │ Event | State | Diff  │
│ ─────────────────  │ ─────────────────────────── │                       │
│ ▸ All          412 │ 12:03:41.120 trades$  +1    │  (Event/State/Diff    │
│ ▾ Presenters       │ 12:03:41.187 trades$  +1    │   for the pinned row; │
│   ▾ blotter      3 │ 12:03:41.201 activity$      │   State = the         │
│       trades$      │ …                           │   selected node's     │
│       newTradeIds$ │                             │   slices only)        │
│       activity$    │ ▲ pinned #4112 12:03:41.187 │                       │
│   ▸ priceStream  9 │   [Resume]  [wire ±100ms]   │ ── Machine (if m*) ── │
│   ▸ rfqs         2 │                             │  state / transitions  │
│ ▾ Machines         │                             │  intents / inject     │
│   ▾ tileExecution 9│                             │                       │
│       m3  EURUSD   │                             │                       │
│   ▸ incident     1 │                             │                       │
│ ▾ Wire             │                             │                       │
│     PRICE      118 │                             │                       │
│     TRADE:reply  2 │                             │                       │
└────────────────────┴─────────────────────────────┴───────────────────────┘
```

Three columns as today; the **rail changes meaning** from a filter stack to
the navigator. The rail keeps the connection dot + `connection-badge` and the
protocol-mismatch line. Everything else in it — the four counters, the
family checkboxes, the source pills, the `LensStrip` above the main column —
is replaced by the tree.

### 3.1 The tree (`NavTree`)

Four fixed roots, built by a pure `buildNavTree(state, visibleLog)`:

- **All** — no scope; the unified timeline exactly as v2. Selected by
  default on connect and after import.
- **Presenters → presenter → stream.** From `InspectorState.streams`, grouped
  by `parseStreamId(streamId).presenter`. Sorted by presenter, then stream.
  Streams are never unregistered app-side, so leaves only ever appear (until
  `MAX_STREAMS` evicts the oldest).
- **Machines → kind → instance.** From `InspectorState.machines`, grouped by
  `machineKind`; instance label = `machineId` + a short arg summary (the
  existing `SUMMARY_VALUE_MAX` truncation). Disposed instances render dimmed
  and stay until the 500-cap evicts them.
- **Wire → msgType.** From the set of `msgType`s seen in the visible log (the
  set `WirePanel` computes today). Direction is a chip on the row, not a
  separate node. The **Wire root row** carries the health stat line that the
  Wire lens header had (in/s · out/s · reconnects). The spec'd-but-unshipped
  "last-message age" metric is dropped for good.

Every node carries a **count badge** = rows in the *visible* log (after the
Clear watermark, §5) that match its scope, so the tree is also the activity
overview the rail's counters were. A node whose scope received rows in the
last flush gets the existing opacity-only WAAPI flash (`panels/flash.ts`),
so a hot stream is visible without reading the list.

Expand/collapse is local UI state keyed by node id and independent of
selection (a presenter can be selected *and* expanded). Keyboard, when the
tree has focus: `↑/↓` move selection, `←/→` collapse/expand, `Enter` selects.
The timeline shortcuts (`↑/↓` step, `Esc` resume, `/` search, `c` clear) act
when focus is anywhere else, which retires the STATUS item "↑/↓ act on the
timeline even from the Machines/Wire lens" — there are no lenses.

`Esc` precedence, first match wins: (1) a wire-probe is active → restore the
previous scope and clear the radius; (2) pinned → resume (which also
re-attaches the scroll); (3) scroll detached → re-attach; (4) otherwise a
no-op. It never unclears (§5).

### 3.2 Scope

```ts
type Scope =
  | { kind: "all" }
  | { kind: "presenter"; presenter: string }
  | { kind: "stream"; streamId: string }
  | { kind: "machineKind"; machineKind: string }
  | { kind: "machine"; machineId: string }
  | { kind: "wire" }
  | { kind: "msgType"; msgType: string };
```

One selection, held by `useNavigation` together with a **one-deep previous
scope** used only by the wire-radius probe (§4.2). The scope is not persisted
across reloads.

`parseStreamId(streamId) → { presenter, prop, argsKey? }` splits on the
first `.` and on the first `[` (the `instrumentPresenters` id convention:
`key.prop` or `key.prop[JSON-args]`). It lives in the app, not
`devtools-core` — the id format is written by the instrumenter and read by
nobody in core; a future protocol v3 with first-class identity would delete
this one helper. `shortLabel(streamId, scope)` renders a stream relative to
the scope: full id under `all`, `prop[args]` under its presenter, and the
args tuple only (`EURUSD`; for object args, the first string-valued field)
under the stream itself. The full id is always the `title`.

## 4. The actions list and the context pane

### 4.1 Scope compiles to the existing filter

`useTimeline` takes `scope` and a pure `compileScope(scope, state)` in
`timelineModel.ts` produces the `TimelineFilter` the hook already
understands. `families` and `pills` stop being user-facing state and become
the compiled output; free text and the radius remain user-facing.

| scope | families | pills |
|---|---|---|
| `all` | all on | none |
| `presenter:P` | `stream` | one `stream` pill per stream with `parseStreamId().presenter === P` (recomputed as parameterized streams register) |
| `stream:S` | `stream` | `stream:S` |
| `machineKind:K` | `machine` | one `machine` pill per instance of kind `K` |
| `machine:M` | `machine` | `machine:M` |
| `wire` | `wire` | none |
| `msgType:T` | `wire` | `msgType:T` |

`devtools:error` rows show only under `all` (today's `rowMatchesPills`
behaviour, now deliberate).

### 4.2 Rows

The row is v2's row with the source label rendered by `shortLabel`; under a
single-stream scope the source column collapses entirely, leaving
time · summary · coalesced count — the Redux action row. Under `all` the
`.source` cell gets `min-width` + ellipsis (the STATUS cosmetic fix).

Per-row actions shrink to two:

- **Pin** — clicking anywhere on the row (rows hold still now, §6).
- **wire ±100 ms** — switches scope to `all` with the existing radius filter
  centred on the row's `ts`, the row still pinned. `Esc` from that state
  restores the previous scope *and* clears the radius (one-deep history, no
  more); a second `Esc` resumes as usual.

### 4.3 Context pane

Event / State / Diff stay. Changes:

- **State is the selected node's slices.** `presenter:` → that presenter's
  streams via `StateTreePanel` (already grouped, already flashes);
  `stream:` → that single row, value expanded by default; `machine:` → the
  machine's state + args; `machineKind:` → its instances' states; `wire` /
  `msgType` → the tab is disabled with an inline reason ("wire messages carry
  no state"); `all` → whole `InspectorState` as today. The `Search state…`
  box shows only under `all` and `presenter:`. Following vs pinned is
  unchanged: pinned reads `LiveHistory.stateAt(seq)`, following reads live.
- **`≠ live` marks and state search cover machines** (STATUS gap): the marks
  compare `pinnedState.machines[i].state` to live exactly as streams do.
- **Diff** is mechanically unchanged (`findPredecessorRow` → `diffSerialized`);
  under `stream:` the predecessor is by construction the previous visible
  row, so it reads as "this action vs the last one".
- **Machine tab** — a fourth tab, present when the scope is `machine:` or the
  pinned row belongs to a machine. It holds what `MachinesPanel`'s detail
  column holds today: current state, transition count, intent history, and
  the dev-only intent injector with its confirm step (same testids:
  `intent-injector`, `intent-invoke-button`, `intent-confirm`,
  `intent-confirm-yes`, `intent-error`).
- **Pinned across scopes.** A pin is a global `seq`; switching scope keeps it.
  If the pinned row is not visible in the new scope, the pinned bar says so
  and offers "show in All".

## 5. Clear (Redux "Commit")

One **Clear** button in the actions header; keyboard `c`. It sets
`clearedBeforeSeq = latestSeq` in the timeline filter; `filterLog` drops rows
with `seq <= clearedBeforeSeq`. Deliberate consequences:

- Every scope's list empties (global watermark) and every tree badge resets
  to 0 — badges count visible rows.
- **Nothing in the store changes.** `InspectorStore.log` and `LiveHistory`
  are untouched; State, the tree, and `≠ live` keep working; a moment pinned
  *before* the clear still reconstructs, and its pinned bar says
  "before clear".
- Clear while pinned also resumes follow (nothing is left to be pinned in).
- **Unclear** (header affordance, no shortcut) sets `clearedBeforeSeq = 0`
  while the rows are still in the store. Redux has no undo-commit; ours is one
  line and the only recovery from a mis-keyed `c`. `Esc` never unclears.
- Import mode (viewing a recording) gets the same watermark for free — it's
  filter-side.

A hard reset that drops the buffers is explicitly **out**.

## 6. Folded fixes

### 6.1 Scroll-anchored follow (STATUS: "scroll-detached follow mode")

`TimelinePane` replaces "snap `scrollTop` to `scrollHeight` on every flush"
with the log-viewer rule: track `atBottom` (`scrollHeight − scrollTop −
clientHeight < 8`) on scroll and auto-scroll after a flush only when
`atBottom` was true before it. Scrolling up detaches silently; a **⤓ live**
chip appears at the bottom of the list while detached; clicking it, Resume,
or `Esc` re-attaches. Detaching does **not** pin — following and reading
history are independent, as in a terminal.

The 500-row render window stays, but while detached it anchors to the scroll
position (the 500 rows around the first visible row) instead of the tail, so
rows do not remount under the cursor. That is what makes whole-row click-to-pin
safe; the e2e's ArrowUp pin path keeps working unchanged.

### 6.2 Pinned-row log-cap eviction (STATUS: "highest-value fix")

`pin(seq)` captures the row: `{ mode: "pinned"; seq; row: LogRow }`.
`selectedRow` reads `selection.row` instead of `log.find(...)`, so Event,
Diff and the pinned bar survive the row leaving the 5000-row log. When it has
left, the pinned bar shows "evicted from log" beside the timestamp (mirroring
`LiveHistory`'s aged-out card); Diff's predecessor search runs against the
captured row plus whatever the log still holds and reports `noPrior` honestly
when the predecessor is gone too. The ArrowUp-from-follow path captures the
same way.

## 7. Components

New, all under `packages/devtools-app/src/`:

| file | responsibility |
|---|---|
| `nav/scope.ts` | `Scope`, `parseStreamId`, `compileScope`, `shortLabel`. Pure. |
| `nav/buildNavTree.ts` | `buildNavTree(state, visibleLog) → NavNode[]` — four roots, counts, disposed flag, wire stats. Pure. |
| `nav/NavTree.tsx` | Rail tree: expand/collapse, selection, badges, flash, keyboard. Presentational over `NavNode[]` + `scope` + an `onSelect` slot. |
| `nav/useNavigation.ts` | Owns `scope` and the one-deep previous scope. |
| `timeline/MachineTab.tsx` | `MachinesPanel`'s detail column, relocated. |

Changed: `timeline/timelineModel.ts` (`clearedBeforeSeq` in `filterLog`;
`families`/`pills` become compiled), `timeline/useTimeline.ts` (scope in;
`clear`/`unclear`; captured pinned row), `timeline/TimelinePane.tsx` (scroll
anchoring; anchored window; whole-row click; scope-relative labels; header
with Clear/Unclear + scoped search), `timeline/ContextPane.tsx`
(scope-narrowed State; Machine tab; machine `≠ live`), `InspectorApp.tsx`
(rail = `NavTree`; lens state and `FilterControls` gone; one `keydown`
listener bound once via a ref and routed by focus).

Deleted: `timeline/FilterControls.tsx`, `panels/MachinesPanel.tsx`,
`panels/WirePanel.tsx`, the `LensStrip`, and their tests — assertions move
(intent injector → `MachineTab.test.tsx`; wire msgType set / counts →
`buildNavTree.test.ts`).

`devtools-core`, both clients' hubs and manifests, the relay and the Chrome
extension are **untouched** — they only host `InspectorApp`.

## 8. Testing

- **Unit (vitest/jsdom):** `scope.test.ts` (every `Scope` variant compiles
  to the expected filter; `parseStreamId` on the three id shapes including
  JSON-object args; `shortLabel` per scope), `buildNavTree.test.ts` (roots,
  grouping, badge counts honour the watermark, disposed instances retained,
  wire stats), `NavTree.test.tsx` (select / expand / keyboard),
  `useTimeline.test.tsx` (clear + unclear; pin survives log eviction; scope
  switch keeps the pin; wire-probe `Esc` restores scope), `TimelinePane.test.tsx`
  (detached scroll does not snap; ⤓ live re-attaches; window anchors to
  scroll), `ContextPane.test.tsx` (State narrowed per scope; wire scope
  disables State; Machine tab; machine `≠ live`), `MachineTab.test.tsx`.
  **Per-file** coverage is checked, not the aggregate.
- **E2E (`tests/browser/playwright/devtools.spec.ts`):** the journey gains
  three steps — select `blotter` in the tree and assert only `blotter.*` rows
  are listed; Clear, assert the list is empty, then assert it refills; the
  `tileExecution` step selects the machine node instead of clicking a lens.
  `TESTIDS.devtools` replaces `lensMachines` with `navNode` and adds
  `clearLog`. The ArrowUp pin step stays as is.
- **Motion:** the tree flash is `flash.ts` (opacity only, compositor-safe);
  the inspector page is outside `/rtc:perf-audit`, so freeze is a manual
  eyeball as before.

## 9. Docs and status

- `docs/architecture/20-devtools.md` gains **§20.12 "Store-first navigation
  (v3)"**: the tree/scope model, Clear semantics, and the deviation that the
  Machines and Wire lenses were retired into tree branches.
- `docs/STATUS.md`: remove the folded items from the timeline polish entry
  (pinned-row eviction, scroll-detached follow, keyboard listener / ↑↓-from-
  any-lens, wire "last-message age", machines not covered by `≠ live` /
  state search, long-source cosmetic); keep the rest.

## 10. Non-goals

No protocol, hub or dormancy change · no hard reset · no causality beyond the
±100 ms radius heuristic · no per-node clear · no persisted scope · no
presenter-level injection or full replay (still the v2-extensions entry in
STATUS). Protocol v3 with first-class stream identity (`presenter` / `prop` /
`args`, later `causeId`) is the named follow-up; `parseStreamId` is the one
thing it would delete.
