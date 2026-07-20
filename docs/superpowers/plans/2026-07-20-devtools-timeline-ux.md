# DevTools Timeline-First UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inspector's four-tab layout with a Redux-DevTools-style timeline-first UI: one unified event timeline where clicking any row pins the whole inspector to that moment, with Event / State / Diff context sub-tabs, powered by an always-on rolling `LiveHistory` time-travel buffer.

**Architecture:** Panel-side only — the protocol, `DevtoolsHub`, decorators, and dormancy contract are untouched. New pure classes (`LiveHistory`, `diffSerialized`) land in `@rtc/devtools-core`; the UI rework lands in `@rtc/devtools-app`. Spec: `docs/superpowers/specs/2026-07-20-devtools-timeline-ux-design.md`.

**Tech Stack:** TypeScript, React 19, CSS Modules, vitest + @testing-library/react, Playwright (existing `devtools.spec.ts` suite).

**One deliberate deviation from the spec (§3.1):** the spec says "`ReplayController` becomes a thin wrapper over `LiveHistory`". After the UI rework nothing consumes a frame-indexed controller (imports go straight to `LiveHistory.fromRecording`, and the frame-index scrubber is gone), and the repo's knip gate forbids dead exports — so Task 10 **deletes** `ReplayController` instead, after Task 3 ports its fold-equivalence property test into `LiveHistory`'s tests. The spec's real requirement — one fold engine serving live and recorded history — is preserved.

## Global Constraints

- **No new dependencies.** `@rtc/devtools-core` stays `rxjs`-only at runtime; `@rtc/devtools-app` stays `devtools-core` + `react` + `react-dom`. Timeline "virtualization" is slice-windowing (≤500 rendered rows), not react-window.
- **No protocol/hub/decorator changes.** `PROTOCOL_VERSION` stays 2; `RECORDING_VERSION` stays 1 (export format unchanged, old recordings must import).
- **Purity in `devtools-core`:** no `Date.now()` in core classes — timestamps are injected by callers (existing convention; `Recorder.start` takes `startedAt`).
- **Imports:** `#/` subpath alias inside `devtools-app` (`#/timeline/...`); plain relative (`./...`) inside `devtools-core`. Never ≥2-up relative imports.
- **Lint gates:** Biome (mandatory braces on all control statements, no inline `style={{…}}`), custom ESLint rules (newspaper-order: exported component/class first, helpers below; named interfaces for props — no inline object types in signatures). Run `npx biome ci .` and `pnpm lint` before every push, not just `biome lint`.
- **Test placement:** core tests in `packages/devtools-core/src/__tests__/*.test.ts`; app tests in `packages/devtools-app/src/__tests__/*.test.tsx`. Mirror existing files' import style (`import { describe, expect, it } from "vitest"` in core; `test`/`expect` + `@testing-library/react` + `afterEach(cleanup)` in app).
- **Keep existing `data-testid`s working where the concept survives:** `connection-badge`, `devtools-stream-row`, `devtools-machine-row`, `record-toggle`, `export`, `import`, `import-label`. New ones introduced here: `timeline-row`, `pinned-bar`, `lens-timeline`, `lens-machines`, `lens-wire`, `context-tab-event`, `context-tab-state`, `context-tab-diff`, `export-buffer`, `recording-banner`.
- **Commands** (run from the worktree root): `pnpm --filter @rtc/devtools-core test`, `pnpm --filter @rtc/devtools-app test`, `pnpm typecheck`, `pnpm build`. Full e2e: `pnpm test:e2e` (10 parallel suites, slow — only in Task 12).

---

### Task 1: `InspectorStore` `trackLog` option

Checkpoint clones only ever serve the State sub-tab (streams + machines), so they must not pay for the 5000-row log — currently the heaviest thing `clone()` copies.

**Files:**
- Modify: `packages/devtools-core/src/InspectorStore.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorStoreTrackLog.test.ts`

**Interfaces:**
- Produces: `InspectorStoreOptions.trackLog?: boolean` (default `true`). When `false`: `state.log` is always `[]`, `appendLog` is a no-op, and `clone()` propagates the flag and skips log copying. Streams/machines folding is byte-identical either way.

- [ ] **Step 1: Write the failing test**

```ts
// packages/devtools-core/src/__tests__/inspectorStoreTrackLog.test.ts
import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type { AppToInspector } from "../protocol";

describe("InspectorStore trackLog option", () => {
  it("keeps streams and machines identical but the log empty when trackLog is false", () => {
    const logged = new InspectorStore({ coalesce: false });
    const unlogged = new InspectorStore({ coalesce: false, trackLog: false });

    for (const msg of messages()) {
      logged.apply(msg);
      unlogged.apply(msg);
    }

    expect(unlogged.getSnapshot().streams).toEqual(logged.getSnapshot().streams);
    expect(unlogged.getSnapshot().machines).toEqual(
      logged.getSnapshot().machines,
    );
    expect(logged.getSnapshot().log.length).toBeGreaterThan(0);
    expect(unlogged.getSnapshot().log).toEqual([]);
  });

  it("clone() propagates trackLog: false", () => {
    const unlogged = new InspectorStore({ coalesce: false, trackLog: false });

    for (const msg of messages()) {
      unlogged.apply(msg);
    }

    const copy = unlogged.clone();
    copy.apply(batch(9, "fx.price$", 42));

    expect(copy.getSnapshot().log).toEqual([]);
    expect(copy.getSnapshot().streams.length).toBeGreaterThan(0);
  });
});

function batch(seq: number, streamId: string, value: number): AppToInspector {
  return {
    kind: "batch",
    events: [
      { kind: "stream:emission", seq, ts: 1000 + seq, streamId, value, coalesced: 1 },
    ],
  };
}

function messages(): AppToInspector[] {
  return [
    { kind: "welcome", v: 2, appId: "test-app" },
    { kind: "snapshot", streams: [], machines: [] },
    batch(1, "fx.price$", 1),
    batch(2, "fx.price$", 2),
    {
      kind: "batch",
      events: [
        {
          kind: "machine:created",
          seq: 3,
          ts: 1003,
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
        },
        { kind: "machine:state", seq: 4, ts: 1004, machineId: "m1", state: "idle", coalesced: 1 },
      ],
    },
  ];
}
```

Note: the `welcome` message shape must match `protocol.ts` exactly — check whether `welcome` carries a `dev` field in v2 and include it if the type requires it (`{ kind: "welcome", v: 2, appId: "test-app", dev: true }`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test -- inspectorStoreTrackLog`
Expected: FAIL — `trackLog` is not a known option (TS error) or log is not empty.

- [ ] **Step 3: Implement**

In `packages/devtools-core/src/InspectorStore.ts`:

1. Extend the options interface:

```ts
export interface InspectorStoreOptions {
  /** When false, every apply() flushes synchronously (rebuild + notify)
   * instead of coalescing onto the rAF chain. The live panel uses the default
   * (true); the replay store uses false so getSnapshot() is fresh the moment a
   * frame is folded, even in a browser where requestAnimationFrame exists. */
  coalesce?: boolean;
  /** When false, appendLog is a no-op and state.log stays [] forever. Used by
   * LiveHistory's fold/checkpoint stores, which only ever serve the State
   * sub-tab (streams + machines) — skipping the 5000-row log makes clone()
   * cheap enough to run per checkpoint. */
  trackLog?: boolean;
}
```

2. Add the field + constructor line (next to `coalesce`):

```ts
  private readonly trackLog: boolean;

  constructor(options?: InspectorStoreOptions) {
    this.coalesce = options?.coalesce ?? true;
    this.trackLog = options?.trackLog ?? true;
  }
```

3. Guard `appendLog` (first line of the method):

```ts
  private appendLog(event: DevtoolsEvent): void {
    if (!this.trackLog) {
      return;
    }
    // ...existing body unchanged
```

4. In `clone()`, replace `new InspectorStore({ coalesce: false })` with:

```ts
    const copy = new InspectorStore({ coalesce: false, trackLog: this.trackLog });
```

and wrap the `logAll` copy loop:

```ts
    if (this.trackLog) {
      for (const row of this.logAll) {
        copy.logAll.push(structuredClone(row));
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-core test`
Expected: new file PASS, all existing core tests still PASS (default `trackLog: true` changes nothing).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-core/src/InspectorStore.ts packages/devtools-core/src/__tests__/inspectorStoreTrackLog.test.ts
git commit -m "feat(devtools-core): InspectorStore trackLog option for cheap checkpoint clones"
```

---

### Task 2: `diffSerialized` — the diff engine

**Files:**
- Create: `packages/devtools-core/src/diff.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `SerializedValue` from `./serialize`.
- Produces:

```ts
export type DiffKind = "added" | "removed" | "changed";
export interface DiffEntry {
  path: readonly (string | number)[]; // object keys + array indices, root = []
  kind: DiffKind;
  before: SerializedValue | null; // null for "added"
  after: SerializedValue | null; // null for "removed"
}
export function diffSerialized(
  prev: SerializedValue,
  next: SerializedValue,
): readonly DiffEntry[];
```

Semantics: recurse into plain records (objects without a `$t` string tag) and arrays; everything else — primitives, tagged nodes (`{$t: "map"}`, `{$t: "truncated"}`, …) — is a leaf compared by JSON equality. Result capped at 200 entries (values are serializer-capped already, so this is a formality). Equal inputs → `[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/devtools-core/src/__tests__/diff.test.ts
import { describe, expect, it } from "vitest";

import { diffSerialized } from "../diff";
import type { SerializedValue } from "../serialize";

describe("diffSerialized", () => {
  it("returns [] for equal values", () => {
    const v: SerializedValue = { a: 1, b: [true, "x"] };

    expect(diffSerialized(v, structuredClone(v))).toEqual([]);
  });

  it("reports a changed nested leaf with its path", () => {
    expect(
      diffSerialized({ fx: { bid: 1.08, ask: 1.09 } }, { fx: { bid: 1.07, ask: 1.09 } }),
    ).toEqual([{ path: ["fx", "bid"], kind: "changed", before: 1.08, after: 1.07 }]);
  });

  it("reports added and removed keys", () => {
    const entries = diffSerialized({ a: 1, gone: 2 }, { a: 1, fresh: 3 });

    expect(entries).toContainEqual({ path: ["gone"], kind: "removed", before: 2, after: null });
    expect(entries).toContainEqual({ path: ["fresh"], kind: "added", before: null, after: 3 });
    expect(entries).toHaveLength(2);
  });

  it("recurses arrays by index, including length changes", () => {
    const entries = diffSerialized([1, 2], [1, 5, 9]);

    expect(entries).toContainEqual({ path: [1], kind: "changed", before: 2, after: 5 });
    expect(entries).toContainEqual({ path: [2], kind: "added", before: null, after: 9 });
  });

  it("treats tagged nodes as leaves", () => {
    const prev: SerializedValue = { m: { $t: "map", entries: [["k", 1]] } };
    const next: SerializedValue = { m: { $t: "map", entries: [["k", 2]] } };

    expect(diffSerialized(prev, next)).toEqual([
      {
        path: ["m"],
        kind: "changed",
        before: { $t: "map", entries: [["k", 1]] },
        after: { $t: "map", entries: [["k", 2]] },
      },
    ]);
  });

  it("treats a type change as one changed leaf", () => {
    expect(diffSerialized({ a: [1] }, { a: "one" })).toEqual([
      { path: ["a"], kind: "changed", before: [1], after: "one" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test -- diff`
Expected: FAIL — module `../diff` not found.

- [ ] **Step 3: Implement**

```ts
// packages/devtools-core/src/diff.ts
import type { SerializedValue } from "./serialize";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
  /** Object keys and array indices from the root to the changed node; [] = root. */
  path: readonly (string | number)[];
  kind: DiffKind;
  /** null for "added". */
  before: SerializedValue | null;
  /** null for "removed". */
  after: SerializedValue | null;
}

const MAX_DIFF_ENTRIES = 200;

/** Structural diff over two serializer outputs. Plain records and arrays
 * recurse; primitives and tagged nodes ({$t: ...}) are leaves compared by JSON
 * equality. Inputs are already depth/size-capped by serializeValue, so the
 * walk is bounded; MAX_DIFF_ENTRIES is a formality against pathological
 * fan-out. */
export function diffSerialized(
  prev: SerializedValue,
  next: SerializedValue,
): readonly DiffEntry[] {
  const out: DiffEntry[] = [];
  walkDiff(prev, next, [], out);

  return out;
}

type SerializedRecord = Record<string, SerializedValue>;

function walkDiff(
  prev: SerializedValue,
  next: SerializedValue,
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  if (out.length >= MAX_DIFF_ENTRIES) {
    return;
  }

  if (jsonEqual(prev, next)) {
    return;
  }

  if (isPlainRecord(prev) && isPlainRecord(next)) {
    walkRecords(prev, next, path, out);

    return;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    walkArrays(prev, next, path, out);

    return;
  }

  out.push({ path, kind: "changed", before: prev, after: next });
}

function walkRecords(
  prev: SerializedRecord,
  next: SerializedRecord,
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  for (const key of Object.keys(prev)) {
    if (key in next) {
      walkDiff(prev[key] ?? null, next[key] ?? null, [...path, key], out);
    } else {
      out.push({
        path: [...path, key],
        kind: "removed",
        before: prev[key] ?? null,
        after: null,
      });
    }
  }

  for (const key of Object.keys(next)) {
    if (!(key in prev)) {
      out.push({
        path: [...path, key],
        kind: "added",
        before: null,
        after: next[key] ?? null,
      });
    }
  }
}

function walkArrays(
  prev: readonly SerializedValue[],
  next: readonly SerializedValue[],
  path: readonly (string | number)[],
  out: DiffEntry[],
): void {
  const max = Math.max(prev.length, next.length);

  for (let i = 0; i < max; i += 1) {
    if (i >= prev.length) {
      out.push({ path: [...path, i], kind: "added", before: null, after: next[i] ?? null });
    } else if (i >= next.length) {
      out.push({ path: [...path, i], kind: "removed", before: prev[i] ?? null, after: null });
    } else {
      walkDiff(prev[i] ?? null, next[i] ?? null, [...path, i], out);
    }
  }
}

function isPlainRecord(value: SerializedValue): value is SerializedRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as SerializedRecord).$t !== "string"
  );
}

function jsonEqual(a: SerializedValue, b: SerializedValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
```

Add to `packages/devtools-core/src/index.ts` (alphabetical position, near the top):

```ts
export { type DiffEntry, type DiffKind, diffSerialized } from "./diff";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-core test -- diff`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-core/src/diff.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/diff.test.ts
git commit -m "feat(devtools-core): diffSerialized structural diff over SerializedValue trees"
```

---

### Task 3: `LiveHistory` — the rolling time-travel buffer

**Files:**
- Create: `packages/devtools-core/src/LiveHistory.ts`
- Create: `packages/devtools-core/src/projectSnapshot.ts` (extracted from `Recorder.ts`)
- Modify: `packages/devtools-core/src/Recorder.ts` (import the extracted helper)
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/liveHistory.test.ts`

**Interfaces:**
- Consumes: `InspectorStore` (+ Task 1's `trackLog: false`), `AppToInspector`, `Recording`/`RECORDING_VERSION`.
- Produces:

```ts
export interface LiveHistoryOptions {
  maxEvents?: number; // default 20_000; Infinity for fromRecording
  checkpointInterval?: number; // frames between checkpoints, default 500
}
export class LiveHistory {
  static fromRecording(recording: Recording, options?: LiveHistoryOptions): LiveHistory;
  record(msg: AppToInspector): void; // callers tee store.tap() into this
  get oldestSeq(): number; // events with seq <= this are folded into the base; 0 before any trim
  get latestSeq(): number;
  get eventCount(): number; // events currently in the window (excl. base)
  get firstTs(): number | null; // ts of the earliest retained event, null before any batch
  stateAt(seq: number): InspectorState; // reconstructed state; log always [] (trackLog: false)
  toRecording(appId: string, startedAt: number): Recording; // seed snapshot + retained frames
}
```

Reconstruction invariant (the design's core property): `stateAt(seq)` ≡ folding, from empty, every retained-or-trimmed event with `event.seq <= seq` — checkpoints and trims are pure optimizations that must not change the answer. `stateAt` clamps out-of-range seqs; callers check `oldestSeq` first to show the aged-out banner instead.

- [ ] **Step 1: Write the failing test**

```ts
// packages/devtools-core/src/__tests__/liveHistory.test.ts
import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import { LiveHistory } from "../LiveHistory";
import type { AppToInspector } from "../protocol";

describe("LiveHistory", () => {
  it("stateAt(seq) equals a naive filtered fold, independent of checkpoints", () => {
    const history = new LiveHistory({ checkpointInterval: 5 });
    const frames = priceFrames(30);

    for (const frame of frames) {
      history.record(frame);
    }

    for (const seq of [1, 4, 5, 17, 30]) {
      expect(history.stateAt(seq).streams).toEqual(naiveFoldTo(frames, seq).streams);
      expect(history.stateAt(seq).machines).toEqual(naiveFoldTo(frames, seq).machines);
    }
  });

  it("clamps out-of-range seqs", () => {
    const history = new LiveHistory();
    const frames = priceFrames(5);

    for (const frame of frames) {
      history.record(frame);
    }

    expect(history.stateAt(999).streams).toEqual(naiveFoldTo(frames, 5).streams);
    // Negative seqs clamp to oldestSeq (0 before any trim) — an empty-window fold.
    expect(history.stateAt(-1).streams).toEqual(naiveFoldTo(frames, 0).streams);
  });

  it("trims oldest frames past maxEvents, advancing oldestSeq, without changing stateAt for retained seqs", () => {
    const history = new LiveHistory({ maxEvents: 10, checkpointInterval: 3 });
    const frames = priceFrames(30);

    for (const frame of frames) {
      history.record(frame);
    }

    expect(history.oldestSeq).toBeGreaterThan(0);
    expect(history.eventCount).toBeLessThanOrEqual(10);
    expect(history.latestSeq).toBe(30);
    expect(history.stateAt(30).streams).toEqual(naiveFoldTo(frames, 30).streams);
    expect(history.stateAt(history.oldestSeq + 1).streams).toEqual(
      naiveFoldTo(frames, history.oldestSeq + 1).streams,
    );
  });

  it("round-trips through toRecording/fromRecording", () => {
    const history = new LiveHistory({ maxEvents: 10 });

    for (const frame of priceFrames(30)) {
      history.record(frame);
    }

    const imported = LiveHistory.fromRecording(history.toRecording("app", 1000));

    expect(imported.stateAt(30).streams).toEqual(history.stateAt(30).streams);
    expect(imported.stateAt(imported.latestSeq).machines).toEqual(
      history.stateAt(history.latestSeq).machines,
    );
  });

  it("tracks firstTs from the earliest retained batch event", () => {
    const history = new LiveHistory();

    expect(history.firstTs).toBeNull();

    for (const frame of priceFrames(3)) {
      history.record(frame);
    }

    expect(history.firstTs).toBe(1001);
  });
});

function priceFrames(count: number): AppToInspector[] {
  const frames: AppToInspector[] = [
    { kind: "welcome", v: 2, appId: "app" },
    { kind: "snapshot", streams: [], machines: [] },
  ];

  for (let seq = 1; seq <= count; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq,
          ts: 1000 + seq,
          streamId: `fx.price$[[${seq % 3}]]`,
          value: seq,
          coalesced: 1,
        },
      ],
    });
  }

  return frames;
}

function naiveFoldTo(frames: readonly AppToInspector[], seq: number) {
  const store = new InspectorStore({ coalesce: false, trackLog: false });

  for (const frame of frames) {
    if (frame.kind !== "batch") {
      store.apply(frame);
    } else {
      store.apply({ kind: "batch", events: frame.events.filter((e) => e.seq <= seq) });
    }
  }

  return store.getSnapshot();
}
```

(As in Task 1, adjust the `welcome` literal to the exact `AppToInspector` type — include `dev` if required.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test -- liveHistory`
Expected: FAIL — module `../LiveHistory` not found.

- [ ] **Step 3: Extract `projectSnapshot` from `Recorder.ts`**

Create `packages/devtools-core/src/projectSnapshot.ts` by MOVING the existing `seedSnapshot` function out of `Recorder.ts` (keep its doc comment):

```ts
// packages/devtools-core/src/projectSnapshot.ts
import type { InspectorState } from "./InspectorStore";
import type { AppToInspector, SnapshotMachine, SnapshotStream } from "./protocol";

/** Project an InspectorState back into a snapshot AppToInspector so a
 * recording always begins from a complete state. Emission counters/intents are
 * intentionally reset (a recording starts a fresh session view at record time,
 * not mid-stream) — snapshot has no place for them and the reducer rebuilds
 * them from the captured batches that follow. */
export function projectSnapshot(state: InspectorState): AppToInspector {
  const streams: SnapshotStream[] = state.streams.map((s) => {
    return { streamId: s.streamId, value: s.lastValue };
  });

  const machines: SnapshotMachine[] = state.machines.map((m) => {
    return {
      machineId: m.machineId,
      machineKind: m.machineKind,
      args: m.args,
      state: m.state,
      disposed: m.disposed,
      createdAt: m.createdAt,
    };
  });

  return { kind: "snapshot", streams, machines };
}
```

In `Recorder.ts`: delete the local `seedSnapshot` (and its now-unused `SnapshotMachine`/`SnapshotStream` imports), add `import { projectSnapshot } from "./projectSnapshot";`, and change the `start()` call site to `this.framesBuf.push(projectSnapshot(seedState));`.

- [ ] **Step 4: Implement `LiveHistory`**

```ts
// packages/devtools-core/src/LiveHistory.ts
import type { InspectorState } from "./InspectorStore";
import { InspectorStore } from "./InspectorStore";
import { projectSnapshot } from "./projectSnapshot";
import type { AppToInspector } from "./protocol";
import { RECORDING_VERSION, type Recording } from "./recording";

const DEFAULT_MAX_EVENTS = 20_000;
const DEFAULT_CHECKPOINT_INTERVAL = 500;

export interface LiveHistoryOptions {
  /** Rolling window cap, counted in DevtoolsEvents (not frames). Oldest
   * frames fold into the base and trim off past this. Infinity = never trim
   * (used for imported recordings). */
  maxEvents?: number;
  /** Frames between checkpoint clones. */
  checkpointInterval?: number;
}

interface FrameEntry {
  msg: AppToInspector;
  /** Highest event seq folded up to and including this frame. Batches advance
   * it; welcome/snapshot/bye frames inherit the running value — seq order is
   * the time axis, and a non-batch frame "happens at" the last seen seq. */
  maxSeq: number;
  eventCount: number;
}

interface HistoryCheckpoint {
  maxSeq: number;
  /** Absolute count of frames (since construction) folded into `store`. */
  foldedFrames: number;
  store: InspectorStore;
}

/** Always-on rolling time-travel buffer. Tees off InspectorStore.tap() (the
 * same point Recorder tees), keeps a bounded frame window plus periodic
 * checkpoint clones, and reconstructs the InspectorState as of any retained
 * seq. The fold engine is the real InspectorStore (trackLog: false — the
 * reconstructed state serves streams+machines only), so stateAt(seq) is
 * identical to a live fold of the same events by construction. */
export class LiveHistory {
  private readonly base = newFoldStore();

  private readonly cursor = newFoldStore();

  private readonly frames: FrameEntry[] = [];

  private readonly checkpoints: HistoryCheckpoint[] = [];

  private readonly maxEvents: number;

  private readonly checkpointInterval: number;

  private baseMaxSeq = 0;

  private totalEvents = 0;

  private trimmedFrames = 0;

  private recordedFrames = 0;

  private framesSinceCheckpoint = 0;

  private firstTsValue: number | null = null;

  constructor(options?: LiveHistoryOptions) {
    this.maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.checkpointInterval = Math.max(
      1,
      options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
    );
  }

  static fromRecording(
    recording: Recording,
    options?: LiveHistoryOptions,
  ): LiveHistory {
    const history = new LiveHistory({
      maxEvents: Number.POSITIVE_INFINITY,
      checkpointInterval: options?.checkpointInterval,
    });

    for (const frame of recording.frames) {
      history.record(frame);
    }

    return history;
  }

  get oldestSeq(): number {
    return this.baseMaxSeq;
  }

  get latestSeq(): number {
    return this.frames.at(-1)?.maxSeq ?? this.baseMaxSeq;
  }

  get eventCount(): number {
    return this.totalEvents;
  }

  get firstTs(): number | null {
    return this.firstTsValue;
  }

  record(msg: AppToInspector): void {
    const events = msg.kind === "batch" ? msg.events : [];
    let maxSeq = this.latestSeq;

    for (const event of events) {
      if (event.seq > maxSeq) {
        maxSeq = event.seq;
      }

      if (this.firstTsValue === null) {
        this.firstTsValue = event.ts;
      }
    }

    this.frames.push({ msg, maxSeq, eventCount: events.length });
    this.recordedFrames += 1;
    this.totalEvents += events.length;
    this.cursor.apply(msg);
    this.framesSinceCheckpoint += 1;

    if (this.framesSinceCheckpoint >= this.checkpointInterval) {
      this.checkpoints.push({
        maxSeq,
        foldedFrames: this.recordedFrames,
        store: this.cursor.clone(),
      });
      this.framesSinceCheckpoint = 0;
    }

    this.trim();
  }

  stateAt(seq: number): InspectorState {
    const target = Math.max(this.oldestSeq, Math.min(seq, this.latestSeq));
    const start = this.nearestStart(target);
    const working = start.store.clone();

    for (let i = start.foldedFrames - this.trimmedFrames; i < this.frames.length; i += 1) {
      const frame = this.frames[i];

      if (frame === undefined) {
        continue;
      }

      if (frame.maxSeq <= target) {
        working.apply(frame.msg);
        continue;
      }

      if (frame.msg.kind === "batch") {
        working.apply({
          kind: "batch",
          events: frame.msg.events.filter((e) => {
            return e.seq <= target;
          }),
        });
      }

      break;
    }

    return working.getSnapshot();
  }

  toRecording(appId: string, startedAt: number): Recording {
    return {
      version: RECORDING_VERSION,
      appId,
      startedAt,
      frames: [
        projectSnapshot(this.base.getSnapshot()),
        ...this.frames.map((f) => {
          return f.msg;
        }),
      ],
    };
  }

  private nearestStart(target: number): HistoryCheckpoint {
    let best: HistoryCheckpoint = {
      maxSeq: this.baseMaxSeq,
      foldedFrames: this.trimmedFrames,
      store: this.base,
    };

    for (const cp of this.checkpoints) {
      if (cp.maxSeq <= target && cp.foldedFrames >= best.foldedFrames) {
        best = cp;
      }
    }

    return best;
  }

  private trim(): void {
    while (this.totalEvents > this.maxEvents && this.frames.length > 1) {
      const oldest = this.frames.shift();

      if (oldest === undefined) {
        break;
      }

      this.base.apply(oldest.msg);
      this.baseMaxSeq = oldest.maxSeq;
      this.totalEvents -= oldest.eventCount;
      this.trimmedFrames += 1;
    }

    // Checkpoints whose folded prefix now lies inside the base are useless
    // (no reachable seq needs them) — drop so memory stays flat.
    while (this.checkpoints.length > 0) {
      const head = this.checkpoints[0];

      if (head !== undefined && head.foldedFrames <= this.trimmedFrames) {
        this.checkpoints.shift();
      } else {
        break;
      }
    }
  }
}

function newFoldStore(): InspectorStore {
  return new InspectorStore({ coalesce: false, trackLog: false });
}
```

Add to `packages/devtools-core/src/index.ts`:

```ts
export { LiveHistory, type LiveHistoryOptions } from "./LiveHistory";
export { projectSnapshot } from "./projectSnapshot";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-core test`
Expected: `liveHistory` PASS (5 tests), `recorder` tests still PASS (behavior unchanged, helper only moved).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/LiveHistory.ts packages/devtools-core/src/projectSnapshot.ts packages/devtools-core/src/Recorder.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/liveHistory.test.ts
git commit -m "feat(devtools-core): LiveHistory rolling time-travel buffer with checkpointed stateAt(seq)"
```

---

### Task 4: Timeline pure model (filters, source pills, predecessor lookup)

**Files:**
- Create: `packages/devtools-app/src/timeline/timelineModel.ts`
- Test: `packages/devtools-app/src/__tests__/timelineModel.test.ts`

**Interfaces:**
- Consumes: `LogRow`, `DevtoolsEvent`, `SerializedValue` from `@rtc/devtools-core`.
- Produces (all pure functions; the seam Tasks 5–9 build on):

```ts
export interface FamilyFilterState { stream: boolean; machine: boolean; wire: boolean; devtools: boolean; }
export type TimelineFamily = keyof FamilyFilterState;
export type SourcePillType = "stream" | "machine" | "msgType";
export interface SourcePill { type: SourcePillType; id: string; }
export interface RadiusFilter { centerTs: number; windowMs: number; }
export interface TimelineFilter {
  families: FamilyFilterState;
  pills: readonly SourcePill[];
  text: string;
  radius: RadiusFilter | null;
}
export const ALL_FAMILIES_ON: FamilyFilterState;
export const EMPTY_TIMELINE_FILTER: TimelineFilter;
export const RADIUS_WINDOW_MS = 100;
export function familyOf(kind: DevtoolsEvent["kind"]): TimelineFamily;
export function sourceOfEvent(event: DevtoolsEvent): SourcePill | null;
export function pillKey(pill: SourcePill): string; // "stream:fx.price$" — display + dedup key
export function filterLog(log: readonly LogRow[], filter: TimelineFilter): readonly LogRow[];
export function findPredecessorRow(log: readonly LogRow[], row: LogRow): LogRow | null;
export function diffableValueOf(event: DevtoolsEvent): SerializedValue | null;
export function seqOfMachineIntent(log: readonly LogRow[], machineId: string, name: string, ts: number): number | null;
```

`findPredecessorRow` implements the spec §3.3 comparability table: same `streamId` for emissions, same `machineId` for `machine:state`, same `msgType` AND direction for wire events, `null` otherwise. `diffableValueOf`: emission → `value`, machine:state → `state`, wire → `payload`, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/devtools-app/src/__tests__/timelineModel.test.ts
import type { DevtoolsEvent, LogRow } from "@rtc/devtools-core";
import { expect, test } from "vitest";

import {
  ALL_FAMILIES_ON,
  diffableValueOf,
  filterLog,
  findPredecessorRow,
  pillKey,
  seqOfMachineIntent,
  sourceOfEvent,
} from "#/timeline/timelineModel";

test("sourceOfEvent maps each family to its pill", () => {
  expect(sourceOfEvent(emission(1, "fx.price$", 1))).toEqual({ type: "stream", id: "fx.price$" });
  expect(sourceOfEvent(machineState(2, "m1", "idle"))).toEqual({ type: "machine", id: "m1" });
  expect(sourceOfEvent(wireIn(3, "priceUpdate"))).toEqual({ type: "msgType", id: "priceUpdate" });
  expect(pillKey({ type: "stream", id: "fx.price$" })).toBe("stream:fx.price$");
});

test("filterLog composes families AND pills AND text AND radius", () => {
  const log = [
    row(emission(1, "fx.price$", 1)),
    row(emission(2, "blotter.trades$", 2)),
    row(wireIn(3, "priceUpdate")),
  ];

  expect(
    filterLog(log, {
      families: { ...ALL_FAMILIES_ON, wire: false },
      pills: [],
      text: "",
      radius: null,
    }).map((r) => r.seq),
  ).toEqual([1, 2]);

  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [{ type: "stream", id: "fx.price$" }],
      text: "",
      radius: null,
    }).map((r) => r.seq),
  ).toEqual([1]);

  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [],
      text: "trades",
      radius: null,
    }).map((r) => r.seq),
  ).toEqual([2]);

  // windowMs 1 around ts 1001 keeps rows at 1001/1002 (delta ≤ 1), drops 1003.
  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [],
      text: "",
      radius: { centerTs: 1001, windowMs: 1 },
    }).map((r) => r.seq),
  ).toEqual([1, 2]);
});

test("findPredecessorRow finds the last comparable event before the row", () => {
  const log = [
    row(emission(1, "fx.price$", 1)),
    row(emission(2, "blotter.trades$", 9)),
    row(emission(3, "fx.price$", 2)),
  ];
  const pred = findPredecessorRow(log, log[2] as LogRow);

  expect(pred?.seq).toBe(1);
  expect(findPredecessorRow(log, log[0] as LogRow)).toBeNull();
});

test("wire predecessors match msgType AND direction", () => {
  const log = [
    row(wireIn(1, "priceUpdate")),
    row({ kind: "wire:out", seq: 2, ts: 1002, msgType: "priceUpdate", payload: null }),
    row(wireIn(3, "priceUpdate")),
  ];

  expect(findPredecessorRow(log, log[2] as LogRow)?.seq).toBe(1);
});

test("diffableValueOf extracts the comparable payload", () => {
  expect(diffableValueOf(emission(1, "fx.price$", 42))).toBe(42);
  expect(diffableValueOf(machineState(2, "m1", "busy"))).toBe("busy");
  expect(diffableValueOf({ kind: "machine:disposed", seq: 3, ts: 1, machineId: "m1" })).toBeNull();
});

test("seqOfMachineIntent locates the log row for an intent", () => {
  const log = [
    row({ kind: "machine:intent", seq: 7, ts: 1007, machineId: "m1", name: "execute", args: [] }),
  ];

  expect(seqOfMachineIntent(log, "m1", "execute", 1007)).toBe(7);
  expect(seqOfMachineIntent(log, "m1", "cancel", 1007)).toBeNull();
});

function emission(seq: number, streamId: string, value: number): DevtoolsEvent {
  return { kind: "stream:emission", seq, ts: 1000 + seq, streamId, value, coalesced: 1 };
}

function machineState(seq: number, machineId: string, state: string): DevtoolsEvent {
  return { kind: "machine:state", seq, ts: 1000 + seq, machineId, state, coalesced: 1 };
}

function wireIn(seq: number, msgType: string): DevtoolsEvent {
  return { kind: "wire:in", seq, ts: 1000 + seq, msgType, payload: null };
}

function row(event: DevtoolsEvent): LogRow {
  return { seq: event.seq, ts: event.ts, kind: event.kind, summary: summaryOf(event), event };
}

function summaryOf(event: DevtoolsEvent): string {
  if (event.kind === "stream:emission") {
    return `${event.streamId} ${JSON.stringify(event.value)}`;
  }

  return event.kind;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- timelineModel`
Expected: FAIL — module `#/timeline/timelineModel` not found.

- [ ] **Step 3: Implement**

```ts
// packages/devtools-app/src/timeline/timelineModel.ts
import type { DevtoolsEvent, LogRow, SerializedValue } from "@rtc/devtools-core";

export interface FamilyFilterState {
  stream: boolean;
  machine: boolean;
  wire: boolean;
  devtools: boolean;
}

export type TimelineFamily = keyof FamilyFilterState;

export type SourcePillType = "stream" | "machine" | "msgType";

export interface SourcePill {
  type: SourcePillType;
  id: string;
}

export interface RadiusFilter {
  centerTs: number;
  windowMs: number;
}

export interface TimelineFilter {
  families: FamilyFilterState;
  pills: readonly SourcePill[];
  text: string;
  radius: RadiusFilter | null;
}

export const ALL_FAMILIES_ON: FamilyFilterState = {
  stream: true,
  machine: true,
  wire: true,
  devtools: true,
};

export const EMPTY_TIMELINE_FILTER: TimelineFilter = {
  families: ALL_FAMILIES_ON,
  pills: [],
  text: "",
  radius: null,
};

/** The causality heuristic's half-window (spec §4): "everything within
 * ±100 ms of this event". */
export const RADIUS_WINDOW_MS = 100;

export function familyOf(kind: DevtoolsEvent["kind"]): TimelineFamily {
  if (kind.startsWith("stream:")) {
    return "stream";
  }

  if (kind.startsWith("machine:")) {
    return "machine";
  }

  if (kind.startsWith("wire:")) {
    return "wire";
  }

  return "devtools";
}

export function sourceOfEvent(event: DevtoolsEvent): SourcePill | null {
  if (event.kind === "stream:registered" || event.kind === "stream:emission") {
    return { type: "stream", id: event.streamId };
  }

  if (
    event.kind === "machine:created" ||
    event.kind === "machine:state" ||
    event.kind === "machine:intent" ||
    event.kind === "machine:disposed"
  ) {
    return { type: "machine", id: event.machineId };
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return { type: "msgType", id: event.msgType };
  }

  return null;
}

export function pillKey(pill: SourcePill): string {
  return `${pill.type}:${pill.id}`;
}

export function filterLog(
  log: readonly LogRow[],
  filter: TimelineFilter,
): readonly LogRow[] {
  const needle = filter.text.trim().toLowerCase();

  return log.filter((row) => {
    if (!filter.families[familyOf(row.kind)]) {
      return false;
    }

    if (filter.pills.length > 0 && !rowMatchesPills(row, filter.pills)) {
      return false;
    }

    if (needle !== "" && !row.summary.toLowerCase().includes(needle)) {
      return false;
    }

    if (filter.radius !== null) {
      const delta = Math.abs(row.ts - filter.radius.centerTs);

      if (delta > filter.radius.windowMs) {
        return false;
      }
    }

    return true;
  });
}

/** Spec §3.3 comparability: the last event before `row` with the same source
 * identity — streamId for emissions, machineId for machine:state, msgType AND
 * direction for wire traffic. Null for kinds with no meaningful predecessor. */
export function findPredecessorRow(
  log: readonly LogRow[],
  row: LogRow,
): LogRow | null {
  const key = comparabilityKey(row.event);

  if (key === null) {
    return null;
  }

  for (let i = indexOfSeq(log, row.seq) - 1; i >= 0; i -= 1) {
    const candidate = log[i];

    if (candidate !== undefined && comparabilityKey(candidate.event) === key) {
      return candidate;
    }
  }

  return null;
}

export function diffableValueOf(event: DevtoolsEvent): SerializedValue | null {
  if (event.kind === "stream:emission") {
    return event.value;
  }

  if (event.kind === "machine:state") {
    return event.state;
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return event.payload;
  }

  return null;
}

/** Locate the log seq of a machine intent by identity (used by the Machines
 * lens to pin the timeline from an intent-history row). */
export function seqOfMachineIntent(
  log: readonly LogRow[],
  machineId: string,
  name: string,
  ts: number,
): number | null {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const row = log[i];

    if (
      row !== undefined &&
      row.event.kind === "machine:intent" &&
      row.event.machineId === machineId &&
      row.event.name === name &&
      row.ts === ts
    ) {
      return row.seq;
    }
  }

  return null;
}

function rowMatchesPills(row: LogRow, pills: readonly SourcePill[]): boolean {
  const source = sourceOfEvent(row.event);

  if (source === null) {
    return false;
  }

  return pills.some((pill) => {
    return pill.type === source.type && pill.id === source.id;
  });
}

function comparabilityKey(event: DevtoolsEvent): string | null {
  if (event.kind === "stream:emission") {
    return `stream:${event.streamId}`;
  }

  if (event.kind === "machine:state") {
    return `machine:${event.machineId}`;
  }

  if (event.kind === "wire:in" || event.kind === "wire:out") {
    return `${event.kind}:${event.msgType}`;
  }

  return null;
}

/** log is seq-sorted; binary search the row's position. */
function indexOfSeq(log: readonly LogRow[], seq: number): number {
  let lo = 0;
  let hi = log.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midSeq = log[mid]?.seq ?? 0;

    if (midSeq === seq) {
      return mid;
    }

    if (midSeq < seq) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test -- timelineModel`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/timeline/timelineModel.ts packages/devtools-app/src/__tests__/timelineModel.test.ts
git commit -m "feat(devtools-app): pure timeline model — filters, source pills, predecessor lookup"
```

---

### Task 5: `useTimeline` hook — selection, pin/resume, reconstruction

**Files:**
- Create: `packages/devtools-app/src/timeline/useTimeline.ts`
- Test: `packages/devtools-app/src/__tests__/useTimeline.test.tsx`

**Interfaces:**
- Consumes: `LiveHistory.stateAt/oldestSeq` (Task 3), `filterLog`/`EMPTY_TIMELINE_FILTER`/`SourcePill`/`RADIUS_WINDOW_MS` (Task 4).
- Produces:

```ts
export type TimelineSelection = { mode: "follow" } | { mode: "pinned"; seq: number };
export interface TimelineModel {
  selection: TimelineSelection;
  filter: TimelineFilter;
  rows: readonly LogRow[]; // filtered, always live
  selectedRow: LogRow | null;
  pinnedState: InspectorState | null; // null when following, aged out, or on error
  agedOut: boolean;
  reconstructError: string | null;
  pin: (seq: number) => void;
  resume: () => void;
  selectPrev: () => void; // ↑ — pins the last row when following
  selectNext: () => void; // ↓
  toggleFamily: (family: TimelineFamily) => void;
  addPill: (pill: SourcePill) => void;
  removePill: (pill: SourcePill) => void;
  setText: (text: string) => void;
  setRadiusAround: (row: LogRow) => void;
  clearRadius: () => void;
}
export function useTimeline(log: readonly LogRow[], history: LiveHistory): TimelineModel;
```

Note the hook takes `log` (not the store) — the caller passes the live log OR an imported recording's log, and the matching `LiveHistory`; datasource switching (Task 10) is invisible here.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/devtools-app/src/__tests__/useTimeline.test.tsx
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import type { AppToInspector, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { useTimeline } from "#/timeline/useTimeline";

test("pin reconstructs state at that seq; resume returns to follow", () => {
  const { history, log } = seeded();
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();

  act(() => {
    result.current.pin(1);
  });

  expect(result.current.selection).toEqual({ mode: "pinned", seq: 1 });
  expect(result.current.selectedRow?.seq).toBe(1);
  const pinnedRow = result.current.pinnedState?.streams.find((s) => {
    return s.streamId === "fx.price$";
  });
  expect(pinnedRow?.lastValue).toBe(1);

  act(() => {
    result.current.resume();
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();
});

test("selectPrev from follow pins the last row; selectNext walks forward", () => {
  const { history, log } = seeded();
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 3 });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 2 });

  act(() => {
    result.current.selectNext();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 3 });
});

test("flags agedOut when the pinned seq precedes the retained window", () => {
  const history = new LiveHistory({ maxEvents: 2 });
  const frames = priceFrames(10);
  const store = new InspectorStore({ coalesce: false });

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  const log = store.getSnapshot().log;
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  act(() => {
    result.current.pin(1);
  });

  expect(result.current.agedOut).toBe(true);
  expect(result.current.pinnedState).toBeNull();
});

function priceFrames(count: number): AppToInspector[] {
  const frames: AppToInspector[] = [{ kind: "snapshot", streams: [], machines: [] }];

  for (let seq = 1; seq <= count; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
      ],
    });
  }

  return frames;
}

function seeded(): { history: LiveHistory; log: readonly LogRow[] } {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(3)) {
    history.record(frame);
    store.apply(frame);
  }

  return { history, log: store.getSnapshot().log };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- useTimeline`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/devtools-app/src/timeline/useTimeline.ts
import { useCallback, useMemo, useState } from "react";

import type { InspectorState, LiveHistory, LogRow } from "@rtc/devtools-core";

import type {
  SourcePill,
  TimelineFamily,
  TimelineFilter,
} from "#/timeline/timelineModel";
import {
  EMPTY_TIMELINE_FILTER,
  filterLog,
  pillKey,
  RADIUS_WINDOW_MS,
} from "#/timeline/timelineModel";

export type TimelineSelection =
  | { mode: "follow" }
  | { mode: "pinned"; seq: number };

export interface TimelineModel {
  selection: TimelineSelection;
  filter: TimelineFilter;
  rows: readonly LogRow[];
  selectedRow: LogRow | null;
  pinnedState: InspectorState | null;
  agedOut: boolean;
  reconstructError: string | null;
  pin: (seq: number) => void;
  resume: () => void;
  selectPrev: () => void;
  selectNext: () => void;
  toggleFamily: (family: TimelineFamily) => void;
  addPill: (pill: SourcePill) => void;
  removePill: (pill: SourcePill) => void;
  setText: (text: string) => void;
  setRadiusAround: (row: LogRow) => void;
  clearRadius: () => void;
}

/** Owns the timeline's selection + filter state and the pinned-moment
 * reconstruction. Selection implies pause: "pinned" freezes the context pane
 * at that seq while the rows keep tailing live underneath; "follow" (nothing
 * selected) tracks the tail. Reconstruction failures are caught here and
 * surfaced as reconstructError — the pane renders an error card, never a
 * blank panel. */
export function useTimeline(
  log: readonly LogRow[],
  history: LiveHistory,
): TimelineModel {
  const [selection, setSelection] = useState<TimelineSelection>({
    mode: "follow",
  });
  const [filter, setFilter] = useState<TimelineFilter>(EMPTY_TIMELINE_FILTER);

  const rows = useMemo(() => {
    return filterLog(log, filter);
  }, [log, filter]);

  const selectedRow = useMemo(() => {
    if (selection.mode !== "pinned") {
      return null;
    }

    const seq = selection.seq;

    return (
      log.find((row) => {
        return row.seq === seq;
      }) ?? null
    );
  }, [log, selection]);

  const agedOut =
    selection.mode === "pinned" &&
    history.oldestSeq > 0 &&
    selection.seq <= history.oldestSeq;

  const reconstruction = useMemo((): {
    state: InspectorState | null;
    error: string | null;
  } => {
    if (selection.mode !== "pinned" || agedOut) {
      return { state: null, error: null };
    }

    try {
      return { state: history.stateAt(selection.seq), error: null };
    } catch (error) {
      return { state: null, error: String(error) };
    }
  }, [selection, agedOut, history]);

  const pin = useCallback((seq: number): void => {
    setSelection({ mode: "pinned", seq });
  }, []);

  const resume = useCallback((): void => {
    setSelection({ mode: "follow" });
  }, []);

  const selectPrev = useCallback((): void => {
    setSelection((current) => {
      return stepped(rows, current, -1);
    });
  }, [rows]);

  const selectNext = useCallback((): void => {
    setSelection((current) => {
      return stepped(rows, current, 1);
    });
  }, [rows]);

  const toggleFamily = useCallback((family: TimelineFamily): void => {
    setFilter((prev) => {
      return {
        ...prev,
        families: { ...prev.families, [family]: !prev.families[family] },
      };
    });
  }, []);

  const addPill = useCallback((pill: SourcePill): void => {
    setFilter((prev) => {
      const exists = prev.pills.some((p) => {
        return pillKey(p) === pillKey(pill);
      });

      return exists ? prev : { ...prev, pills: [...prev.pills, pill] };
    });
  }, []);

  const removePill = useCallback((pill: SourcePill): void => {
    setFilter((prev) => {
      return {
        ...prev,
        pills: prev.pills.filter((p) => {
          return pillKey(p) !== pillKey(pill);
        }),
      };
    });
  }, []);

  const setText = useCallback((text: string): void => {
    setFilter((prev) => {
      return { ...prev, text };
    });
  }, []);

  const setRadiusAround = useCallback((row: LogRow): void => {
    setFilter((prev) => {
      return {
        ...prev,
        radius: { centerTs: row.ts, windowMs: RADIUS_WINDOW_MS },
      };
    });
  }, []);

  const clearRadius = useCallback((): void => {
    setFilter((prev) => {
      return { ...prev, radius: null };
    });
  }, []);

  return {
    selection,
    filter,
    rows,
    selectedRow,
    pinnedState: reconstruction.state,
    agedOut,
    reconstructError: reconstruction.error,
    pin,
    resume,
    selectPrev,
    selectNext,
    toggleFamily,
    addPill,
    removePill,
    setText,
    setRadiusAround,
    clearRadius,
  };
}

function stepped(
  rows: readonly LogRow[],
  current: TimelineSelection,
  delta: 1 | -1,
): TimelineSelection {
  if (rows.length === 0) {
    return current;
  }

  if (current.mode === "follow") {
    const last = rows[rows.length - 1];

    return last === undefined ? current : { mode: "pinned", seq: last.seq };
  }

  const seq = current.seq;
  const index = rows.findIndex((row) => {
    return row.seq === seq;
  });

  if (index === -1) {
    const last = rows[rows.length - 1];

    return last === undefined ? current : { mode: "pinned", seq: last.seq };
  }

  const next = rows[Math.max(0, Math.min(index + delta, rows.length - 1))];

  return next === undefined ? current : { mode: "pinned", seq: next.seq };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test -- useTimeline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/timeline/useTimeline.ts packages/devtools-app/src/__tests__/useTimeline.test.tsx
git commit -m "feat(devtools-app): useTimeline hook — pin/follow selection with stateAt reconstruction"
```

---

### Task 6: `TimelinePane` + `FilterControls` components

**Files:**
- Create: `packages/devtools-app/src/timeline/TimelinePane.tsx`
- Create: `packages/devtools-app/src/timeline/TimelinePane.module.css`
- Create: `packages/devtools-app/src/timeline/FilterControls.tsx`
- Create: `packages/devtools-app/src/timeline/FilterControls.module.css`
- Test: `packages/devtools-app/src/__tests__/TimelinePane.test.tsx`

**Interfaces:**
- Consumes: `TimelineModel` (Task 5), `familyOf`/`sourceOfEvent`/`pillKey` (Task 4), `formatLogTime` (existing, `#/panels/formatLogTime`).
- Produces: `TimelinePane({ model }: TimelinePaneProps)` — the left pane: pinned/aged-out bar, windowed rows (≤500: last 500 when following; 250 either side of the pin when pinned), auto-scroll-to-bottom in follow mode. Each row: `data-testid="timeline-row"`, `data-seq={row.seq}`, `data-family` attribute for color coding, time / kind chip / summary, a source button that calls `model.addPill` (stopPropagation), and a `±100ms` radius button calling `model.setRadiusAround`. Rows with `seq > pinnedSeq` get a `dimmed` class. `FilterControls({ model, textInputRef }: FilterControlsProps)` — family checkboxes, pill chips with ✕, free-text input (ref-exposed so the app can focus it on `/`), radius pill with ✕ when active.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/devtools-app/src/__tests__/TimelinePane.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import type { AppToInspector, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { TimelinePane } from "#/timeline/TimelinePane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
}

function Harness(): ReactElement {
  const [{ history, log }] = useState(seed);
  const model = useTimeline(log, history);

  return <TimelinePane model={model} />;
}

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  render(<Harness />);

  const rows = screen.getAllByTestId("timeline-row");
  expect(rows.length).toBe(3);

  fireEvent.click(rows[0] as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  fireEvent.click(screen.getByText("Resume"));
  expect(screen.queryByTestId("pinned-bar")).toBeNull();
});

test("clicking a row's source adds a pill without pinning", () => {
  render(<Harness />);

  const sourceButtons = screen.getAllByTitle("Filter to this source");
  fireEvent.click(sourceButtons[0] as HTMLElement);

  expect(screen.queryByTestId("pinned-bar")).toBeNull();
  expect(screen.getAllByTestId("timeline-row").length).toBe(3); // same source on all rows
});

function seed(): SeedResult {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [{ kind: "snapshot", streams: [], machines: [] }];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
      ],
    });
  }

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  return { history, log: store.getSnapshot().log };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- TimelinePane`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimelinePane`**

```tsx
// packages/devtools-app/src/timeline/TimelinePane.tsx
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import type { LogRow } from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import styles from "#/timeline/TimelinePane.module.css";
import type { TimelineModel } from "#/timeline/useTimeline";
import { familyOf, sourceOfEvent } from "#/timeline/timelineModel";

const MAX_RENDERED_ROWS = 500;
const HALF_WINDOW = 250;

/** The left pane: one chronological, color-coded list of every event family.
 * Selection implies pause — clicking a row pins the inspector at that moment
 * (the tail keeps accumulating below, dimmed); Resume/Esc snaps back to live.
 * Windowed to ≤500 rendered rows (slice, not a virtualization dep): the last
 * 500 while following, 250 either side of the pin while pinned. */
export function TimelinePane({ model }: TimelinePaneProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = model.selection.mode === "follow";
  const pinnedSeq = model.selection.mode === "pinned" ? model.selection.seq : null;
  const visible = windowedRows(model.rows, pinnedSeq);

  useEffect((): void => {
    if (following && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [following, visible]);

  return (
    <div className={styles.pane}>
      {pinnedSeq !== null ? (
        <PinnedBar model={model} pinnedSeq={pinnedSeq} />
      ) : null}
      <div ref={scrollRef} className={styles.rows}>
        {visible.map((row) => {
          return (
            <TimelineRowView
              key={row.seq}
              row={row}
              model={model}
              pinnedSeq={pinnedSeq}
            />
          );
        })}
      </div>
    </div>
  );
}

export interface TimelinePaneProps {
  model: TimelineModel;
}

interface PinnedBarProps {
  model: TimelineModel;
  pinnedSeq: number;
}

function PinnedBar({ model, pinnedSeq }: PinnedBarProps): ReactElement {
  const label = model.agedOut
    ? "this moment left the buffer"
    : `pinned at ${model.selectedRow ? formatLogTime(model.selectedRow.ts) : `#${pinnedSeq}`}`;

  return (
    <div className={styles.pinnedBar} data-testid="pinned-bar">
      <span className={styles.pinnedLabel}>{`⏸ ${label}`}</span>
      <button type="button" className={styles.resume} onClick={model.resume}>
        Resume
      </button>
    </div>
  );
}

interface TimelineRowViewProps {
  row: LogRow;
  model: TimelineModel;
  pinnedSeq: number | null;
}

function TimelineRowView({
  row,
  model,
  pinnedSeq,
}: TimelineRowViewProps): ReactElement {
  const source = sourceOfEvent(row.event);
  const isSelected = pinnedSeq === row.seq;
  const isDimmed = pinnedSeq !== null && row.seq > pinnedSeq;

  const rowClassName = isSelected
    ? `${styles.row} ${styles.rowSelected}`
    : isDimmed
      ? `${styles.row} ${styles.rowDimmed}`
      : styles.row;

  return (
    <button
      type="button"
      data-testid="timeline-row"
      data-seq={row.seq}
      data-family={familyOf(row.kind)}
      className={rowClassName}
      onClick={() => {
        model.pin(row.seq);
      }}
    >
      <span className={styles.time}>{formatLogTime(row.ts)}</span>
      <span className={styles.kindChip}>{row.kind}</span>
      {source !== null ? (
        <span
          role="button"
          tabIndex={-1}
          title="Filter to this source"
          className={styles.source}
          onClick={(e) => {
            e.stopPropagation();
            model.addPill(source);
          }}
          onKeyDown={() => {}}
        >
          {source.id}
        </span>
      ) : null}
      <span className={styles.summary}>{row.summary}</span>
      <span
        role="button"
        tabIndex={-1}
        title="Show events within ±100 ms"
        className={styles.radius}
        onClick={(e) => {
          e.stopPropagation();
          model.setRadiusAround(row);
        }}
        onKeyDown={() => {}}
      >
        ±100ms
      </span>
    </button>
  );
}

function windowedRows(
  rows: readonly LogRow[],
  pinnedSeq: number | null,
): readonly LogRow[] {
  if (pinnedSeq === null) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  const index = rows.findIndex((row) => {
    return row.seq >= pinnedSeq;
  });

  if (index === -1) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  return rows.slice(Math.max(0, index - HALF_WINDOW), index + HALF_WINDOW);
}
```

Nested-button caveat: a `<span role="button">` inside the row `<button>` is used because nested `<button>` elements are invalid HTML that React will warn on. If the linter rejects the `role="button"` + empty `onKeyDown` pattern, make the outer row a `<div role="button" tabIndex={0}>` with an Enter/Space `onKeyDown` handler and keep the inner controls as real `<button>`s — either shape is acceptable; keep the testids.

```css
/* packages/devtools-app/src/timeline/TimelinePane.module.css */
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.pinnedBar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--accent, #d29922) 18%, transparent);
  border-bottom: 1px solid var(--border, #30363d);
  font-size: 12px;
}

.pinnedLabel {
  flex: 1;
}

.resume {
  font: inherit;
  cursor: pointer;
}

.rows {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.row {
  display: flex;
  gap: 6px;
  align-items: baseline;
  width: 100%;
  text-align: left;
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.row[data-family="stream"] {
  border-left-color: #58a6ff;
}

.row[data-family="machine"] {
  border-left-color: #d2a8ff;
}

.row[data-family="wire"] {
  border-left-color: #3fb950;
}

.row[data-family="devtools"] {
  border-left-color: #f85149;
}

.rowSelected {
  background: color-mix(in srgb, #58a6ff 22%, transparent);
}

.rowDimmed {
  opacity: 0.45;
}

.time {
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.kindChip {
  opacity: 0.8;
  white-space: nowrap;
}

.source {
  color: #58a6ff;
  cursor: pointer;
  white-space: nowrap;
}

.summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radius {
  opacity: 0;
  cursor: pointer;
  white-space: nowrap;
}

.row:hover .radius {
  opacity: 0.7;
}
```

(Match the existing panels' CSS custom properties — open `EventLogPanel.module.css` first and reuse its color variables/values instead of the placeholders above if they differ.)

- [ ] **Step 4: Implement `FilterControls`**

```tsx
// packages/devtools-app/src/timeline/FilterControls.tsx
import type { ChangeEvent, ReactElement, RefObject } from "react";

import styles from "#/timeline/FilterControls.module.css";
import type { TimelineModel } from "#/timeline/useTimeline";
import type { TimelineFamily } from "#/timeline/timelineModel";
import { pillKey } from "#/timeline/timelineModel";

const FAMILIES: readonly TimelineFamily[] = [
  "stream",
  "machine",
  "wire",
  "devtools",
];

/** Rail-mounted filter stack: family toggles, active source pills (click a
 * source anywhere to add one), free text, and the ±100ms radius pill. Pills
 * OR within a layer; layers AND together (timelineModel.filterLog). */
export function FilterControls({
  model,
  textInputRef,
}: FilterControlsProps): ReactElement {
  function handleText(e: ChangeEvent<HTMLInputElement>): void {
    model.setText(e.target.value);
  }

  return (
    <div className={styles.controls}>
      <input
        ref={textInputRef}
        type="text"
        className={styles.text}
        placeholder="Filter… ( / )"
        value={model.filter.text}
        onChange={handleText}
      />
      <div className={styles.families}>
        {FAMILIES.map((family) => {
          return (
            <label key={family} className={styles.family}>
              <input
                type="checkbox"
                checked={model.filter.families[family]}
                onChange={() => {
                  model.toggleFamily(family);
                }}
              />
              {family}
            </label>
          );
        })}
      </div>
      {model.filter.pills.length > 0 ? (
        <div className={styles.pills}>
          {model.filter.pills.map((pill) => {
            return (
              <button
                key={pillKey(pill)}
                type="button"
                className={styles.pill}
                title="Remove filter"
                onClick={() => {
                  model.removePill(pill);
                }}
              >
                {`${pill.id} ✕`}
              </button>
            );
          })}
        </div>
      ) : null}
      {model.filter.radius !== null ? (
        <button
          type="button"
          className={styles.pill}
          title="Clear radius filter"
          onClick={model.clearRadius}
        >
          {`±${model.filter.radius.windowMs}ms ✕`}
        </button>
      ) : null}
    </div>
  );
}

export interface FilterControlsProps {
  model: TimelineModel;
  textInputRef: RefObject<HTMLInputElement | null>;
}
```

```css
/* packages/devtools-app/src/timeline/FilterControls.module.css */
.controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border, #30363d);
}

.text {
  width: 100%;
  font: inherit;
  font-size: 12px;
}

.families {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.family {
  display: flex;
  gap: 4px;
  align-items: center;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pill {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  border-radius: 10px;
  padding: 1px 8px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test -- TimelinePane`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-app/src/timeline/ packages/devtools-app/src/__tests__/TimelinePane.test.tsx
git commit -m "feat(devtools-app): TimelinePane + FilterControls — pin/follow timeline UI"
```

---

### Task 7: `DiffView` component

**Files:**
- Create: `packages/devtools-app/src/timeline/DiffView.tsx`
- Create: `packages/devtools-app/src/timeline/DiffView.module.css`
- Test: `packages/devtools-app/src/__tests__/DiffView.test.tsx`

**Interfaces:**
- Consumes: `DiffEntry` (Task 2), `ValueView` (existing).
- Produces: `DiffView({ entries, noPrior }: DiffViewProps)` — `noPrior: true` renders "No prior value to diff against."; empty `entries` renders "No changes vs previous value."; otherwise one row per entry: dotted path (or `(root)`), kind badge, `before → after` rendered through `ValueView`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/devtools-app/src/__tests__/DiffView.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { DiffEntry } from "@rtc/devtools-core";

import { DiffView } from "#/timeline/DiffView";

afterEach(cleanup);

test("renders one row per entry with path, kind, and both values", () => {
  const entries: DiffEntry[] = [
    { path: ["fx", "bid"], kind: "changed", before: 1.08, after: 1.07 },
    { path: ["fresh"], kind: "added", before: null, after: 3 },
  ];

  render(<DiffView entries={entries} noPrior={false} />);

  expect(screen.getByText("fx.bid")).toBeTruthy();
  expect(screen.getByText("changed")).toBeTruthy();
  expect(screen.getByText("1.08")).toBeTruthy();
  expect(screen.getByText("1.07")).toBeTruthy();
  expect(screen.getByText("added")).toBeTruthy();
});

test("renders the empty and no-prior states", () => {
  const { rerender } = render(<DiffView entries={[]} noPrior={false} />);
  expect(screen.getByText("No changes vs previous value.")).toBeTruthy();

  rerender(<DiffView entries={[]} noPrior={true} />);
  expect(screen.getByText("No prior value to diff against.")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- DiffView`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// packages/devtools-app/src/timeline/DiffView.tsx
import type { ReactElement } from "react";

import type { DiffEntry } from "@rtc/devtools-core";

import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/DiffView.module.css";

/** Renders diffSerialized output: one row per changed leaf — dotted path,
 * kind badge, before → after through the shared ValueView. */
export function DiffView({ entries, noPrior }: DiffViewProps): ReactElement {
  if (noPrior) {
    return <p className={styles.empty}>No prior value to diff against.</p>;
  }

  if (entries.length === 0) {
    return <p className={styles.empty}>No changes vs previous value.</p>;
  }

  return (
    <div className={styles.list}>
      {entries.map((entry) => {
        return <DiffRow key={pathLabel(entry)} entry={entry} />;
      })}
    </div>
  );
}

export interface DiffViewProps {
  entries: readonly DiffEntry[];
  noPrior: boolean;
}

interface DiffRowProps {
  entry: DiffEntry;
}

function DiffRow({ entry }: DiffRowProps): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.path}>{pathLabel(entry)}</span>
      <span className={`${styles.kind} ${kindClass(entry.kind)}`}>
        {entry.kind}
      </span>
      {entry.kind !== "added" ? (
        <span className={styles.value}>
          <ValueView value={entry.before} depth={1} />
        </span>
      ) : null}
      {entry.kind === "changed" ? <span className={styles.arrow}>→</span> : null}
      {entry.kind !== "removed" ? (
        <span className={styles.value}>
          <ValueView value={entry.after} depth={1} />
        </span>
      ) : null}
    </div>
  );
}

function pathLabel(entry: DiffEntry): string {
  return entry.path.length === 0 ? "(root)" : entry.path.join(".");
}

function kindClass(kind: DiffEntry["kind"]): string {
  if (kind === "added") {
    return styles.added;
  }

  if (kind === "removed") {
    return styles.removed;
  }

  return styles.changed;
}
```

Note `depth={1}` on `ValueView`: leaf values render collapsed-inline rather than auto-expanding (only `depth === 0` opens by default in `ValueView`).

```css
/* packages/devtools-app/src/timeline/DiffView.module.css */
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 1px 0;
}

.path {
  font-family: inherit;
  opacity: 0.85;
  min-width: 120px;
}

.kind {
  font-size: 11px;
  border-radius: 8px;
  padding: 0 6px;
}

.added {
  background: color-mix(in srgb, #3fb950 25%, transparent);
}

.removed {
  background: color-mix(in srgb, #f85149 25%, transparent);
}

.changed {
  background: color-mix(in srgb, #d29922 25%, transparent);
}

.arrow {
  opacity: 0.6;
}

.value {
  display: inline-flex;
}

.empty {
  opacity: 0.6;
  font-size: 12px;
  padding: 8px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test -- DiffView`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/timeline/DiffView.tsx packages/devtools-app/src/timeline/DiffView.module.css packages/devtools-app/src/__tests__/DiffView.test.tsx
git commit -m "feat(devtools-app): DiffView — colored leaf-level diff rendering"
```

---

### Task 8: `ContextPane` (Event / State / Diff) + `StateTreePanel` changed-marking

**Files:**
- Create: `packages/devtools-app/src/timeline/ContextPane.tsx`
- Create: `packages/devtools-app/src/timeline/ContextPane.module.css`
- Modify: `packages/devtools-app/src/panels/StateTreePanel.tsx` (optional `changedIds` prop)
- Modify: `packages/devtools-app/src/panels/StateTreePanel.module.css` (`.changedMark` class)
- Test: `packages/devtools-app/src/__tests__/ContextPane.test.tsx`

**Interfaces:**
- Consumes: `TimelineModel` (Task 5), `findPredecessorRow`/`diffableValueOf` (Task 4), `diffSerialized` (Task 2), `DiffView` (Task 7), `StateTreePanel`, `ValueView`, `serializeValue`, `formatLogTime`.
- Produces:

```ts
export interface ContextPaneProps {
  model: TimelineModel;
  log: readonly LogRow[]; // full active log, for predecessor scans
  presentState: InspectorState; // "now": live state, or an import's final fold
}
```

Behavior: **follow mode** → shows the live state tree (no sub-tabs needed beyond State; render the tab strip anyway with State active and Event/Diff disabled). **Pinned** → three sub-tabs (`data-testid="context-tab-event|state|diff"`): Event = metadata rows (kind, seq, time, coalesced when present) + `ValueView(serializeValue(row.event))`; State = search box + `StateTreePanel` fed the reconstructed streams with `changedIds` = streamIds whose pinned value differs (by JSON) from `presentState`, + a compact machines list (id / kind / one-line state); Diff = predecessor scan + `diffSerialized` + `DiffView`, wrapped in try/catch → inline error card. `agedOut`/`reconstructError` → error card instead of State/Diff content.

`StateTreePanel` change (backward-compatible): add optional `changedIds?: ReadonlySet<string>` to `StateTreePanelProps`; in `StreamRowView`, when `changedIds?.has(row.streamId)`, append `<span className={styles.changedMark} title="differs from live">≠ live</span>` after the value span. CSS: `.changedMark { color: #d29922; font-size: 11px; margin-left: 6px; }`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/devtools-app/src/__tests__/ContextPane.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { AppToInspector } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { ContextPane } from "#/timeline/ContextPane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

beforeEach(() => {
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

let pinFn: ((seq: number) => void) | null = null;

function Harness(): ReactElement {
  const [{ history, log, present }] = useState(seed);
  const model = useTimeline(log, history);
  pinFn = model.pin;

  return <ContextPane model={model} log={log} presentState={present} />;
}

test("follow mode shows the live state tree", () => {
  render(<Harness />);

  expect(screen.getByText("fx.price$")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy(); // latest value
});

test("pinned mode reconstructs State and marks values that differ from live", () => {
  render(<Harness />);

  act(() => {
    pinFn?.(1);
  });

  fireEvent.click(screen.getByTestId("context-tab-state"));
  expect(screen.getByText("1")).toBeTruthy(); // historical value
  expect(screen.getByText("≠ live")).toBeTruthy();
});

test("diff tab shows leaf changes vs the predecessor", () => {
  render(<Harness />);

  act(() => {
    pinFn?.(2);
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(screen.getByText("changed")).toBeTruthy();
});

function seed(): {
  history: LiveHistory;
  log: ReturnType<InspectorStore["getSnapshot"]>["log"];
  present: ReturnType<InspectorStore["getSnapshot"]>;
} {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [{ kind: "snapshot", streams: [], machines: [] }];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
      ],
    });
  }

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  const snapshot = store.getSnapshot();

  return { history, log: snapshot.log, present: snapshot };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- ContextPane`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

First the `StateTreePanel` addition (two small edits described in Interfaces above). Then:

```tsx
// packages/devtools-app/src/timeline/ContextPane.tsx
import type { ChangeEvent, ReactElement } from "react";
import { useMemo, useState } from "react";

import type {
  InspectorState,
  LogRow,
  MachineRow,
  StreamRow,
} from "@rtc/devtools-core";
import { diffSerialized, serializeValue } from "@rtc/devtools-core";

import { formatLogTime } from "#/panels/formatLogTime";
import { StateTreePanel } from "#/panels/StateTreePanel";
import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/ContextPane.module.css";
import { DiffView } from "#/timeline/DiffView";
import type { TimelineModel } from "#/timeline/useTimeline";
import {
  diffableValueOf,
  findPredecessorRow,
} from "#/timeline/timelineModel";

type ContextTab = "event" | "state" | "diff";

/** The right pane. Following: the live state tree (the old State tab, one
 * glance away). Pinned: Redux's trio for the selected event — Event payload,
 * the whole reconstructed State at that seq (with ≠-live marks), and the Diff
 * vs the previous value of the same source. Reconstruction/diff failures
 * render an inline error card, never a blank pane. */
export function ContextPane({
  model,
  log,
  presentState,
}: ContextPaneProps): ReactElement {
  const [tab, setTab] = useState<ContextTab>("state");
  const pinned = model.selection.mode === "pinned";
  const row = model.selectedRow;

  return (
    <div className={styles.pane}>
      <nav className={styles.tabs}>
        <TabButton id="event" active={tab} disabled={!pinned} onSelect={setTab} />
        <TabButton id="state" active={tab} disabled={false} onSelect={setTab} />
        <TabButton id="diff" active={tab} disabled={!pinned} onSelect={setTab} />
      </nav>
      <div className={styles.body}>
        <ContextBody
          tab={pinned ? tab : "state"}
          model={model}
          row={row}
          log={log}
          presentState={presentState}
        />
      </div>
    </div>
  );
}

export interface ContextPaneProps {
  model: TimelineModel;
  log: readonly LogRow[];
  presentState: InspectorState;
}

interface TabButtonProps {
  id: ContextTab;
  active: ContextTab;
  disabled: boolean;
  onSelect: (tab: ContextTab) => void;
}

const TAB_LABELS: Record<ContextTab, string> = {
  event: "Event",
  state: "State",
  diff: "Diff",
};

function TabButton({ id, active, disabled, onSelect }: TabButtonProps): ReactElement {
  return (
    <button
      type="button"
      data-testid={`context-tab-${id}`}
      disabled={disabled}
      className={id === active ? styles.tabActive : styles.tab}
      onClick={() => {
        onSelect(id);
      }}
    >
      {TAB_LABELS[id]}
    </button>
  );
}

interface ContextBodyProps {
  tab: ContextTab;
  model: TimelineModel;
  row: LogRow | null;
  log: readonly LogRow[];
  presentState: InspectorState;
}

function ContextBody({
  tab,
  model,
  row,
  log,
  presentState,
}: ContextBodyProps): ReactElement {
  if (model.agedOut) {
    return <ErrorCard message="This moment left the rolling buffer — Resume to return to live." />;
  }

  if (model.reconstructError !== null) {
    return <ErrorCard message={`State reconstruction failed: ${model.reconstructError}`} />;
  }

  if (tab === "event" && row !== null) {
    return <EventTab row={row} />;
  }

  if (tab === "diff" && row !== null) {
    return <DiffTab row={row} log={log} />;
  }

  const state =
    model.selection.mode === "pinned" && model.pinnedState !== null
      ? model.pinnedState
      : presentState;

  return (
    <StateTab
      state={state}
      presentState={presentState}
      marked={model.selection.mode === "pinned"}
    />
  );
}

interface EventTabProps {
  row: LogRow;
}

function EventTab({ row }: EventTabProps): ReactElement {
  return (
    <div className={styles.eventTab}>
      <dl className={styles.meta}>
        <dt>kind</dt>
        <dd>{row.kind}</dd>
        <dt>seq</dt>
        <dd>{row.seq}</dd>
        <dt>time</dt>
        <dd>{formatLogTime(row.ts)}</dd>
        {"coalesced" in row.event ? (
          <>
            <dt>coalesced</dt>
            <dd>{`×${row.event.coalesced}`}</dd>
          </>
        ) : null}
      </dl>
      <ValueView value={serializeValue(row.event)} />
    </div>
  );
}

interface DiffTabProps {
  row: LogRow;
  log: readonly LogRow[];
}

function DiffTab({ row, log }: DiffTabProps): ReactElement {
  const current = diffableValueOf(row.event);

  if (current === null) {
    return <DiffView entries={[]} noPrior={true} />;
  }

  try {
    const predecessor = findPredecessorRow(log, row);
    const previous = predecessor === null ? null : diffableValueOf(predecessor.event);

    if (previous === null) {
      return <DiffView entries={[]} noPrior={true} />;
    }

    return <DiffView entries={diffSerialized(previous, current)} noPrior={false} />;
  } catch (error) {
    return <ErrorCard message={`Diff failed: ${String(error)}`} />;
  }
}

interface StateTabProps {
  state: InspectorState;
  presentState: InspectorState;
  marked: boolean;
}

function StateTab({ state, presentState, marked }: StateTabProps): ReactElement {
  const [query, setQuery] = useState("");

  const changedIds = useMemo((): ReadonlySet<string> => {
    if (!marked) {
      return new Set();
    }

    return changedStreamIds(state.streams, presentState.streams);
  }, [marked, state, presentState]);

  const visibleStreams = useMemo(() => {
    return filterStreams(state.streams, query);
  }, [state, query]);

  function handleQuery(e: ChangeEvent<HTMLInputElement>): void {
    setQuery(e.target.value);
  }

  return (
    <div className={styles.stateTab}>
      <input
        type="text"
        className={styles.search}
        placeholder="Search state…"
        value={query}
        onChange={handleQuery}
      />
      <StateTreePanel streams={visibleStreams} changedIds={changedIds} />
      <h3 className={styles.machinesTitle}>Machines</h3>
      <div className={styles.machines}>
        {state.machines.map((machine) => {
          return <MachineLine key={machine.machineId} machine={machine} />;
        })}
      </div>
    </div>
  );
}

interface MachineLineProps {
  machine: MachineRow;
}

function MachineLine({ machine }: MachineLineProps): ReactElement {
  const stateJson = JSON.stringify(machine.state) ?? "null";
  const compact = stateJson.length > 60 ? `${stateJson.slice(0, 60)}…` : stateJson;

  return (
    <div className={styles.machineLine}>
      <span className={styles.machineId}>{machine.machineId}</span>
      <span className={styles.machineKind}>{machine.machineKind}</span>
      <span className={styles.machineState}>{compact}</span>
    </div>
  );
}

interface ErrorCardProps {
  message: string;
}

function ErrorCard({ message }: ErrorCardProps): ReactElement {
  return <div className={styles.errorCard}>{`⚠ ${message}`}</div>;
}

function changedStreamIds(
  pinned: readonly StreamRow[],
  live: readonly StreamRow[],
): ReadonlySet<string> {
  const liveById = new Map(
    live.map((row) => {
      return [row.streamId, row] as const;
    }),
  );
  const changed = new Set<string>();

  for (const row of pinned) {
    const liveRow = liveById.get(row.streamId);

    if (
      liveRow === undefined ||
      JSON.stringify(liveRow.lastValue) !== JSON.stringify(row.lastValue)
    ) {
      changed.add(row.streamId);
    }
  }

  return changed;
}

function filterStreams(
  streams: readonly StreamRow[],
  query: string,
): readonly StreamRow[] {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return streams;
  }

  return streams.filter((row) => {
    if (row.streamId.toLowerCase().includes(needle)) {
      return true;
    }

    return (JSON.stringify(row.lastValue) ?? "").toLowerCase().includes(needle);
  });
}
```

```css
/* packages/devtools-app/src/timeline/ContextPane.module.css */
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border-left: 1px solid var(--border, #30363d);
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border, #30363d);
}

.tab,
.tabActive {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 2px 10px;
  border-radius: 4px;
}

.tabActive {
  background: color-mix(in srgb, #58a6ff 22%, transparent);
}

.body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 8px;
}

.eventTab {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: 12px;
  margin: 0;
}

.meta dt {
  opacity: 0.6;
}

.meta dd {
  margin: 0;
}

.stateTab {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search {
  font: inherit;
  font-size: 12px;
}

.machinesTitle {
  font-size: 12px;
  margin: 8px 0 0;
  opacity: 0.7;
}

.machines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.machineLine {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.machineId {
  opacity: 0.85;
}

.machineKind {
  opacity: 0.6;
}

.machineState {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.errorCard {
  border: 1px solid color-mix(in srgb, #f85149 50%, transparent);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test`
Expected: `ContextPane` PASS (3 tests); `StateTreePanel` existing tests still PASS (prop optional).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/timeline/ContextPane.tsx packages/devtools-app/src/timeline/ContextPane.module.css packages/devtools-app/src/panels/StateTreePanel.tsx packages/devtools-app/src/panels/StateTreePanel.module.css packages/devtools-app/src/__tests__/ContextPane.test.tsx
git commit -m "feat(devtools-app): ContextPane — Event/State/Diff sub-tabs with ≠-live marking and state search"
```

---

### Task 9: Lens cross-links — Wire health header, Machines→timeline hooks

**Files:**
- Modify: `packages/devtools-app/src/panels/WirePanel.tsx`
- Modify: `packages/devtools-app/src/panels/WirePanel.module.css`
- Modify: `packages/devtools-app/src/panels/MachinesPanel.tsx`
- Test: `packages/devtools-app/src/__tests__/WirePanel.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `SourcePill` (Task 4).
- Produces:
  - `WirePanelProps` gains `onMsgTypePill?: (msgType: string) => void` — the existing `CountStrip` chips become buttons that call it. New `HealthHeader` above the strip showing: `in/s` and `out/s` over the trailing 10 s (computed from wire rows' `ts` vs the newest log `ts` — no `Date.now()`, so it's pure and replay-correct), and `reconnects` = count of `stream:registered` rows beyond the first per streamId (a re-registration implies a hub re-attach).
  - `MachinesPanelProps` gains `onFocusInTimeline?: (machineId: string) => void` (a "⏱ timeline" button in the detail pane header) and `onPinIntent?: (machineId: string, name: string, ts: number) => void` (each intent-history row becomes clickable). Both optional — existing tests unaffected.

- [ ] **Step 1: Write the failing test** (append to the existing `WirePanel.test.tsx`; mirror its existing helpers for building `LogRow`s)

```tsx
test("health header shows rates and reconnects; msgType chips add pills", () => {
  const log = [
    wireRow(1, "wire:in", "priceUpdate", 1000),
    wireRow(2, "wire:in", "priceUpdate", 6000),
    wireRow(3, "wire:out", "executeTrade", 9000),
    registeredRow(4, "fx.price$", 9500),
    registeredRow(5, "fx.price$", 9900), // re-registration => 1 reconnect
  ];
  const pills: string[] = [];

  render(
    <WirePanel
      log={log}
      onMsgTypePill={(msgType) => {
        pills.push(msgType);
      }}
    />,
  );

  expect(screen.getByText(/reconnects: 1/)).toBeTruthy();
  expect(screen.getByText(/in\/s/)).toBeTruthy();

  fireEvent.click(screen.getByText("priceUpdate: 2"));
  expect(pills).toEqual(["priceUpdate"]);
});
```

(`wireRow(seq, kind, msgType, ts)` and `registeredRow(seq, streamId, ts)` are LogRow builders — write them alongside the file's existing row helpers, constructing the full `{seq, ts, kind, summary, event}` shape.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test -- WirePanel`
Expected: FAIL — `onMsgTypePill` not a prop / header text missing.

- [ ] **Step 3: Implement**

In `WirePanel.tsx`: add the optional prop; add above `CountStrip`:

```tsx
const RATE_WINDOW_MS = 10_000;

interface WireHealth {
  inPerSec: number;
  outPerSec: number;
  reconnects: number;
}

function healthOf(log: readonly LogRow[], wireRows: readonly WireRow[]): WireHealth {
  const latestTs = log.at(-1)?.ts ?? 0;
  const windowStart = latestTs - RATE_WINDOW_MS;
  let inCount = 0;
  let outCount = 0;

  for (const row of wireRows) {
    if (row.ts >= windowStart) {
      if (row.event.kind === "wire:in") {
        inCount += 1;
      } else {
        outCount += 1;
      }
    }
  }

  const seenStreamIds = new Set<string>();
  let reconnects = 0;

  for (const row of log) {
    if (row.event.kind === "stream:registered") {
      if (seenStreamIds.has(row.event.streamId)) {
        reconnects += 1;
      } else {
        seenStreamIds.add(row.event.streamId);
      }
    }
  }

  const seconds = RATE_WINDOW_MS / 1000;

  return { inPerSec: inCount / seconds, outPerSec: outCount / seconds, reconnects };
}
```

Render as `<div className={styles.health}>{`▼ ${h.inPerSec.toFixed(1)} in/s · ▲ ${h.outPerSec.toFixed(1)} out/s · reconnects: ${h.reconnects}`}</div>`; convert `CountStrip` chips from `<span>` to `<button type="button" onClick={() => onMsgTypePill?.(msgType)}>`. Add `.health { font-size: 12px; opacity: 0.8; padding: 2px 8px; }` and button styling reuse for `.countChip` in the module CSS.

In `MachinesPanel.tsx`: add the two optional props, thread them to `MachineDetail`; in the detail header render `{onFocusInTimeline ? <button type="button" onClick={() => onFocusInTimeline(machine.machineId)}>⏱ timeline</button> : null}`; wrap each intent-history row in a `<button type="button" className={styles.intentRow} onClick={() => onPinIntent?.(machine.machineId, intent.name, intent.ts)}>` (read the current `MachineDetail` intent-list JSX at `MachinesPanel.tsx:200-390` and preserve its content/ordering — only the wrapper element changes).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-app test`
Expected: all PASS (existing MachinesPanel tests unaffected — new props optional).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/panels/WirePanel.tsx packages/devtools-app/src/panels/WirePanel.module.css packages/devtools-app/src/panels/MachinesPanel.tsx packages/devtools-app/src/panels/MachinesPanel.module.css packages/devtools-app/src/__tests__/WirePanel.test.tsx
git commit -m "feat(devtools-app): wire health header + machines-to-timeline cross-links"
```

---

### Task 10: Recording integration v2 — retroactive export, import-as-datasource, retire `ReplayController`

**Files:**
- Modify: `packages/devtools-app/src/recording/useRecording.ts` (rewrite)
- Modify: `packages/devtools-app/src/recording/RecordingToolbar.tsx` (rewrite)
- Modify: `packages/devtools-app/src/__tests__/RecordingToolbar.test.tsx` (rewrite)
- Delete: `packages/devtools-core/src/ReplayController.ts`, `packages/devtools-core/src/__tests__/replayController.test.ts`
- Modify: `packages/devtools-core/src/index.ts` (drop the `ReplayController` export)

**Interfaces:**
- Consumes: `LiveHistory` (Task 3), `Recorder`/`parseRecording`/`downloadRecording` (existing).
- Produces:

```ts
export interface ImportedRecording {
  history: LiveHistory;
  state: InspectorState; // full fold incl. log — timeline rows + "present" for the import
  appId: string;
}
export interface RecordingModel {
  isRecording: boolean;
  frameCount: number;
  recording: Recording | null; // last bounded capture (Record/Stop path)
  imported: ImportedRecording | null;
  importError: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  exportRecording: () => void; // bounded capture export (unchanged behavior)
  exportBuffer: () => void; // NEW: retroactive LiveHistory export
  importRecording: (file: File) => Promise<void>;
  backToLive: () => void; // clears `imported`
}
export function useRecording(store: InspectorStore, history: LiveHistory, appId: string | null): RecordingModel;
```

Implementation notes: keep the existing recorder-tee effect, `startRecording`/`stopRecording` (minus the ReplayController lines), and `exportRecording`. `exportBuffer` = `downloadRecording(history.toRecording(appId ?? "unknown", history.firstTs ?? Date.now()))` (`Date.now()` is fine in app code). `importRecording` = `parseRecording` → `LiveHistory.fromRecording(rec)` + fold `rec.frames` through `new InspectorStore({ coalesce: false })` to get `state`; parse failure sets `importError` (shown in the toolbar) instead of `console.error`. Delete `mode`/`replay`/`frameIndex`/`isPlaying`/`setMode`/`stepBack`/`stepForward`/`togglePlay`/`setFrameIndex` — the pin/arrow timeline interaction replaced the scrubber. New toolbar: `[● Record | ■ Stop] [frames] · [Export capture] [Export last buffer (data-testid="export-buffer")] [Import] · banner when imported: "viewing recording <appId> — Back to live" (data-testid="recording-banner")`.

- [ ] **Step 1: Rewrite the toolbar test** — cover: record→stop enables Export capture; `exportBuffer` always enabled once history has frames; import failure shows `importError`; imported state shows the banner and Back to live calls `backToLive`. Build on the existing test file's mocking of `downloadRecording` (check how `downloadRecording.test.ts` stubs the DOM download; reuse).

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/devtools-app test -- RecordingToolbar`

- [ ] **Step 3: Implement** the `useRecording` rewrite + toolbar rewrite per the interface block above.

- [ ] **Step 4: Delete `ReplayController`** (file, test file, index export). Its fold-equivalence property already lives in `liveHistory.test.ts` (Task 3).

- [ ] **Step 5: Run the full gauntlet for both packages**

Run: `pnpm --filter @rtc/devtools-core test && pnpm --filter @rtc/devtools-app test && pnpm typecheck`
Expected: PASS; typecheck will catch any survivor imports of `ReplayController` (fix by removing them).

- [ ] **Step 6: Commit**

```bash
git add -A packages/devtools-core packages/devtools-app
git commit -m "feat(devtools-app): recording v2 — retroactive buffer export, import as timeline datasource; retire ReplayController"
```

---

### Task 11: `InspectorApp` rewire — lens switcher, keyboard, datasource switch

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (rewrite)
- Modify: `packages/devtools-app/src/InspectorApp.module.css`
- Modify: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx` (rewrite)

**Interfaces:**
- Consumes: everything above. `InspectorAppProps` unchanged (`store`, `onInvokeIntent?`) — `main.tsx`, the extension, and the relay session files need **no** changes.
- Produces: the composed app. Layout: rail (connection badge + counts + `FilterControls`) | main column (RecordingToolbar v2 + lens switcher + active view). Lens switcher: three buttons `data-testid="lens-timeline" | "lens-machines" | "lens-wire"`. Timeline lens = `TimelinePane` + `ContextPane` side by side. Machines lens = `MachinesPanel` with `onFocusInTimeline` (adds machine pill + switches to timeline) and `onPinIntent` (looks up `seqOfMachineIntent`, pins, switches to timeline). Wire lens = `WirePanel` with `onMsgTypePill` (adds pill + switches to timeline).

Key wiring (the heart of the task):

```tsx
type InspectorLens = "timeline" | "machines" | "wire";

export function InspectorApp({ store, onInvokeIntent }: InspectorAppProps): ReactElement {
  const liveState = useInspectorState(store);
  const liveHistory = useMemo(() => {
    return new LiveHistory();
  }, []);

  useEffect(() => {
    return store.tap((msg) => {
      liveHistory.record(msg);
    });
  }, [store, liveHistory]);

  const recording = useRecording(store, liveHistory, liveState.appId);

  // Datasource switch (spec §6): an import swaps BOTH the row source and the
  // history the timeline travels through; "present" becomes the import's
  // final fold so ≠-live marks compare against the recording's own end state.
  const activeLog = recording.imported?.state.log ?? liveState.log;
  const activeHistory = recording.imported?.history ?? liveHistory;
  const presentState = recording.imported?.state ?? liveState;

  const timeline = useTimeline(activeLog, activeHistory);
  const [lens, setLens] = useState<InspectorLens>("timeline");
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  // ... keyboard effect + render (below)
}
```

Keyboard effect (window-level; skip when the event target is an input/textarea):

```tsx
useEffect(() => {
  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;

    if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      if (e.key === "Escape") {
        target.blur();
      }

      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      timeline.selectPrev();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      timeline.selectNext();
    } else if (e.key === "Escape") {
      timeline.resume();
    } else if (e.key === "/") {
      e.preventDefault();
      filterInputRef.current?.focus();
    }
  }

  window.addEventListener("keydown", onKeyDown);

  return (): void => {
    window.removeEventListener("keydown", onKeyDown);
  };
}, [timeline]);
```

Machines lens wiring:

```tsx
<MachinesPanel
  machines={presentState.machines}
  dev={presentState.dev}
  onInvokeIntent={onInvokeIntent}
  onFocusInTimeline={(machineId) => {
    timeline.addPill({ type: "machine", id: machineId });
    setLens("timeline");
  }}
  onPinIntent={(machineId, name, ts) => {
    const seq = seqOfMachineIntent(activeLog, machineId, name, ts);

    if (seq !== null) {
      timeline.pin(seq);
      setLens("timeline");
    }
  }}
/>
```

The `ConnectionRail` keeps `connection-badge` and the counts `dl` verbatim from the current file, adds `<FilterControls model={timeline} textInputRef={filterInputRef} />` below the counts. `EventLogPanel` and its module CSS become unused — **delete** `packages/devtools-app/src/panels/EventLogPanel.tsx`, its CSS, and `EventLogPanel.test.tsx` + `panels/__tests__/flash.test.tsx`'s EventLog references if any (check imports; `StateTreePanel`'s flash test stays). The timeline replaces it.

The grid CSS for the new layout (replace `.main`/`.panel` in `InspectorApp.module.css`):

```css
.main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.lensStrip {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border, #30363d);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  flex: 1;
  min-height: 0;
}

.panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

- [ ] **Step 1: Rewrite `InspectorApp.test.tsx`** — integration journey with `new InspectorStore({ coalesce: false })` (check the current file's store construction first and keep its conventions): apply welcome + snapshot + 3 emission batches → expect timeline rows; click row 1 → `pinned-bar` visible, State context shows the historical value; press Escape on `window` (`fireEvent.keyDown(window, { key: "Escape" })`) → bar gone; click `lens-machines` → machines table renders; click `lens-wire` → wire empty-state renders.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/devtools-app test -- InspectorApp`

- [ ] **Step 3: Implement the rewrite** per the wiring above (full render tree: rail | main[toolbar, lensStrip, split(TimelinePane, ContextPane) or lens panel]). Show `recording-banner` between toolbar and lens strip when `recording.imported !== null`.

- [ ] **Step 4: Run the whole app suite** — `pnpm --filter @rtc/devtools-app test`
Expected: all PASS (including reworked toolbar/app tests; deleted EventLogPanel tests gone).

- [ ] **Step 5: Build + typecheck + lint everything**

Run: `pnpm build && pnpm typecheck && pnpm lint && npx biome ci .`
Expected: clean. The extension package (`@rtc/devtools-extension`) compiles `InspectorApp` from source — the unchanged props interface keeps it green.

- [ ] **Step 6: Commit**

```bash
git add -A packages/devtools-app
git commit -m "feat(devtools-app): timeline-first InspectorApp — lens switcher, keyboard nav, import datasource"
```

---

### Task 12: E2E journey, docs sync, STATUS entry

**Files:**
- Modify: `tests/scenarios/devtools.ts` (+ its page object — locate via the imports at the top of `tests/browser/playwright/devtools.spec.ts`)
- Modify: `tests/browser/playwright/devtools.spec.ts`
- Modify: `docs/architecture/20-devtools.md`
- Modify: `CLAUDE.md` (devtools-app line: "four panels" → timeline-first description)
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Update the e2e scenario/page objects.** Read `tests/scenarios/devtools.ts` and the inspector page object it uses (these are grep-gated contracts — follow their existing driver-free structure exactly). Changes:
  - `openMachinesTab` → rename to `openMachinesLens`, selector switches to `[data-testid="lens-machines"]`.
  - `expectStreamRow` stays — `devtools-stream-row` now renders inside the ContextPane's follow-mode state tree; assert the same testid.
  - Add `pinFirstTimelineRow(ctx)` (click the first `[data-testid="timeline-row"]`), `expectPinnedBar(ctx)` / `expectNoPinnedBar(ctx)` (`[data-testid="pinned-bar"]`), and `resumeViaEscape(ctx)` (keyboard press on the inspector page).

- [ ] **Step 2: Extend `devtools.spec.ts`** — inside the existing test after `expectStreamRow` (keep the machines/close steps):

```ts
    // Timeline pin-and-inspect journey: pin an early row, confirm the
    // inspector freezes at that moment, and Esc resumes the live tail.
    await devtools.pinFirstTimelineRow(ctx);
    await devtools.expectPinnedBar(ctx);
    await devtools.resumeViaEscape(ctx);
    await devtools.expectNoPinnedBar(ctx);
```

Also update the comment that references "State tab (default)" to describe the follow-mode context pane, and `openMachinesTab` call sites to `openMachinesLens`.

- [ ] **Step 3: Run the devtools e2e suite.** Preferred targeted run — check how `tests/run-all.ts` names suites and run just the devtools one if it supports filtering; otherwise the full `pnpm test:e2e`. Expected: PASS for both clients' runs if the orchestration covers Solid (the Solid client mounts the same inspector bundle).

- [ ] **Step 4: Docs.**
  - `docs/architecture/20-devtools.md`: rewrite the §20.2 sentence describing "four panels" and add a new **§20.11 Timeline-first UX (v2)** (~30 lines): the pin/follow selection model, `LiveHistory` (rolling window, checkpoints, `trackLog:false` clones), `diffSerialized`, lenses, recording-integration change (retroactive buffer export, import-as-datasource, `ReplayController` retired — note the spec deviation and why), and a link to `docs/superpowers/specs/2026-07-20-devtools-timeline-ux-design.md`. Update §20.8's item 5 (time-scrubbing) with a pointer to §20.11 (the scrubber UI was replaced by timeline pinning).
  - `CLAUDE.md`: update the `devtools-app` package-structure line ("Inspector SPA (four panels: …)" → "Inspector SPA (timeline-first: unified event timeline + Event/State/Diff context pane + machines/wire lenses)").
  - `docs/STATUS.md`: per the tracking-workstream-status convention, mark this workstream shipped / remove its pending entry.
  - Run: `pnpm check:doc-links` — expected: all links OK.

- [ ] **Step 5: Commit**

```bash
git add tests/ docs/ CLAUDE.md
git commit -m "test(e2e)+docs: devtools timeline journey; §20.11 timeline-first UX"
```

---

## Final verification (before PR)

- [ ] `pnpm build && pnpm typecheck && pnpm test` — all packages green.
- [ ] `pnpm lint && npx biome ci .` — zero findings (repo policy: no disables).
- [ ] `pnpm test:e2e` — full suite (devtools spec runs against React; confirm whether the orchestration also runs it against Solid and that both pass).
- [ ] Manual smoke: `pnpm dev` → open `http://localhost:5173/devtools/` in a second tab → sign in to the app (demo roster) → timeline fills; pin a row; check Event/State/Diff; export the buffer; re-import it; check the banner + Back to live.
- [ ] Then ship per the `shipping-repo-changes` skill (PR → CI green → merge commit → cleanup).
