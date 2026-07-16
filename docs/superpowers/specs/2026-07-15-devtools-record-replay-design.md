# RTC DevTools — Record, Replay & Time-Scrubbing

**Date:** 2026-07-15
**Status:** Design approved (scope: panel-only + JSON export/import; time-scrub folded in), implementation plan to follow
**Depends on:** [2026-07-11-custom-devtools-design.md](2026-07-11-custom-devtools-design.md) (v1 shipped) — realises future-extensions §9.2 (record & replay) + §9.5 (time-scrubbing), combined
**Scope decisions (locked):**
- **Panel-only replay** — a recording is fed back into the *panel's own store*; the app is never involved and never re-driven. (Full app replay — recorded port inputs into a fresh composition root — is explicitly out of scope; it needs seeded time/timers and is a separate, larger workstream.)
- **JSON export/import** — a recording can be downloaded as a `.json` file and re-loaded later, so a captured session can be shared as a repro.
- **Time-scrubbing is folded in** — the scrub slider is a UI over the recorded buffer, sharing its data model with replay. No separate spec.
- **Observe-only** — recording and replay never send anything to the app. Zero protocol change, zero app-side change.

## 1. Why

The v1 protocol is already event-sourced: the app streams a `snapshot` followed by a sequence of `batch`es of `DevtoolsEvent`s, and `InspectorStore` folds them into `InspectorState`. That means a "flight recorder" is nearly free — capture the initial snapshot plus every subsequent event, and you can reconstruct any past `InspectorState` by re-folding a prefix. Three capabilities fall out of one buffer:

- **Record** — capture a session's snapshot + event stream.
- **Replay** — re-fold a recording into the panel to review it later (or after the app is gone).
- **Time-scrub** — a slider that re-folds the buffer up to an arbitrary index, reconstructing the state tree *at that moment*.

The honest framing (carried from spec §9.5): this is **viewing recorded history**, not rewinding the live app. Live RxJS streams over a socket cannot be un-emitted the way Redux replays pure reducers. The app keeps running; the panel shows a frozen past view.

## 2. Approach

All panel-side, in `@rtc/devtools-core` (recording model + a replay store) and `@rtc/devtools-app` (controls + scrubber). No hub, protocol, or app change.

### 2.1 The recording model

A `Recording` is the minimal event-sourced capture:

```ts
export interface Recording {
  version: number;            // recording format version (independent of PROTOCOL_VERSION)
  appId: string;
  startedAt: number;          // ts of the first captured message (passed in; not Date.now here)
  frames: readonly AppToInspector[]; // the snapshot + batches, in arrival order
}
```

A `Recorder` subscribes alongside the live `InspectorStore`: while recording, every inbound `AppToInspector` message the `InspectorClient` applies is *also* pushed into `frames`. Recording starts from a fresh `snapshot` request (so a recording always begins with a complete state, not mid-stream) and stops on user command. The recorder holds a bounded buffer (default cap mirrors the hub's ring, e.g. 10 000 frames) and `log()`s if it drops the oldest on overflow — no silent truncation.

### 2.2 Replay + scrub via a projection store

Replay does not touch the live store. Instead a **`ReplayStore`** — the same `InspectorStore` fold, but driven from a `Recording` instead of a live transport — reconstructs state at any `frameIndex`:

```ts
export class ReplayController {
  constructor(recording: Recording);
  get length(): number;                 // frames.length
  stateAt(frameIndex: number): InspectorState; // fold frames[0..frameIndex] into a fresh store
  // memoised: folding is incremental forward; scrubbing backward rebuilds from the nearest kept checkpoint
}
```

- **Replay** = drive `frameIndex` from 0 → length (optionally timed by the captured `ts` deltas, or step-by-step).
- **Scrub** = the slider sets `frameIndex` directly; `stateAt` returns the reconstructed `InspectorState` for the panels to render.

Folding is cheap (map/array reducers), but naive backward scrubbing re-folds from 0 each time. To keep scrubbing smooth, `ReplayController` keeps periodic **checkpoints** (a cached `InspectorState` every N frames) and folds forward from the nearest checkpoint ≤ `frameIndex`. This is an internal optimization, not new protocol.

### 2.3 Export / import

- **Export** — serialise the `Recording` to JSON and trigger a browser download (`recording-<appId>-<startedAt>.json`). The frames are already plain serialized values (the v1 serializer capped depth/entries), so JSON round-trips safely.
- **Import** — read a `.json` file (file input), validate the `version`/shape, and hand it to a `ReplayController`. An imported recording replays exactly like a just-captured one — the app need not be running at all, which is the "share a repro" payoff.

### 2.4 UI (in `@rtc/devtools-app`)

A recording toolbar above the existing panels:
- **● Record / ■ Stop** — toggles capture; a frame counter while recording.
- **Mode toggle: Live / Replay** — Live shows the current `InspectorStore` (v1 behaviour, unchanged); Replay shows the `ReplayController`'s reconstructed state.
- **Scrubber** — in Replay mode, a slider over `[0, length]` plus ◀▮▶ step/play controls and a readout of the captured `ts` at the current frame.
- **Export / Import** — download the current recording; load one from disk (auto-switches to Replay mode).

The four panels (state tree, machines, log, wire) are **unchanged** — they already take an `InspectorState`; in Replay mode they simply receive `replay.stateAt(frameIndex)` instead of the live snapshot. This is the payoff of the panels being pure functions of state.

## 3. What changes / what doesn't

**Adds (all new, panel-side):**
- `@rtc/devtools-core`: `Recorder`, `Recording`, `ReplayController` (+ the checkpointed fold). Pure, rxjs-only, no new deps.
- `@rtc/devtools-app`: the recording toolbar + scrubber; a `Live | Replay` mode switch feeding the existing panels either the live store or the replay projection.

**Does NOT change:** the protocol, the hub, the app, or the four panels' internals. Recording is a passive tee off the inbound message stream the `InspectorClient` already receives; replay is a second fold of captured messages. Nothing is ever sent to the app.

## 4. Dormancy & safety

Recording only observes messages already flowing to a connected panel — it cannot wake a dormant hub or add app-side load (the hub streams the same batches whether or not the panel is recording them). Replay/scrub run entirely on captured data with the app uninvolved. The observe-only and "tap never hurts the app" invariants are untouched.

## 5. Testing

1. **Recorder (unit, node):** feed a fake message sequence; assert `frames` captures snapshot + batches in order, starts from a snapshot, and bounds/`log()`s on overflow.
2. **ReplayController (unit, node):** build a `Recording`, assert `stateAt(k)` equals folding `frames[0..k]` into a fresh `InspectorStore`; assert checkpointing yields identical results to naive folding (property: `stateAt(k)` is checkpoint-independent).
3. **Export/import round-trip (unit, node):** `Recording → JSON → Recording` is identity; a malformed JSON is rejected with a clear error.
4. **Panel (jsdom):** toggling Live/Replay swaps the rendered source; scrubbing the slider re-renders the panels at the reconstructed state; Import switches to Replay.
5. **Scrub perf (unit):** scrubbing backward N times over a large recording folds from checkpoints, not from 0 each time (assert bounded fold count).

## 6. Non-goals / future

- **Full app replay** (recorded port inputs into a fresh composition root) — needs seeded clocks/timers and deterministic ports; separate future workstream.
- **Persisted recordings across sessions** (IndexedDB) — v1 keeps recordings in memory + explicit file export.
- **Diff view between two recordings** — possible later on the same buffer model.

## 7. Success criteria

1. A developer can Record a live session, Stop, and scrub the slider to see the state tree / machines / log as they were at any captured moment.
2. Replay works with the app closed (import a `.json`, review it) — the "share a repro" story.
3. Export → import round-trips a recording faithfully.
4. Scrubbing a large recording stays responsive (checkpointed fold).
5. Zero protocol/app change; observe-only and dormancy preserved; all gates green; recorder/replay/round-trip unit-tested per §5.
