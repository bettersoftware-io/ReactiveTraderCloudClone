# DevTools — Record, Replay & Time-Scrubbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a panel-side flight recorder to the custom devtools — capture the `AppToInspector` frame stream a connected inspector already receives, re-fold any prefix of it into a reconstructed `InspectorState` (replay + time-scrub), and export/import a recording as JSON so a captured session can be shared as a repro. Realises spec §9.2 (record & replay) + §9.5 (time-scrubbing) of the v1 custom-devtools design, combined. Zero protocol change, zero app change, observe-only.

**Architecture:** Everything is panel-side. `@rtc/devtools-core` gains three new units — a `Recording` model (+ JSON serialize/parse), a `Recorder` that tees the store's applied-message stream into a bounded frame buffer, and a `ReplayController` that re-folds `frames[0..k]` into an `InspectorState` using periodic checkpoints so backward scrubbing never re-folds from 0. The fold engine is the *existing* `InspectorStore` (reused so replay is byte-for-byte identical to a live fold); to make that reuse work off the live 60 Hz render loop, `InspectorStore` gains a synchronous (non-coalescing) mode and a `clone()`. `@rtc/devtools-app` gains a recording toolbar (Record/Stop, Live|Replay toggle, scrubber, Export/Import) and a `useRecording` hook; the seam to the four existing panels is a single lifted `InspectorState` value — in Replay mode the panels receive `replay.stateAt(frameIndex)` instead of the live snapshot, which is free because the panels are already pure functions of `InspectorState`.

**Tech Stack:** TypeScript, RxJS 7 (`@rtc/devtools-core`), React 19 + `useSyncExternalStore` (`@rtc/devtools-app`), Vitest 4 (node env for core, jsdom for the React bits), the browser `structuredClone`/`Blob`/`URL.createObjectURL` globals (no new deps in either package).

## Global Constraints

- **Observe-only, protocol-frozen:** no change to `protocol.ts` (`AppToInspector`/`InspectorToApp`/`DevtoolsEvent`), no new `InspectorToApp` sends, no app-side or hub-side change. Recording is a passive tee off the messages `InspectorStore.apply()` already receives; replay is a second fold of captured messages. Nothing is ever sent to the app.
- **`@rtc/devtools-core` is an rxjs-only leaf** — no new runtime deps, no `@rtc/*` imports, and no node built-in **imports** in `src` (dep-cruiser `devtools-core-no-node-builtins`). `structuredClone` is a JS *global* (Node ≥17, all browsers), not a `node:` import, so it is allowed. Tests may use node built-ins.
- **`@rtc/devtools-app` may depend only on `@rtc/devtools-core`** for its *source* (dep-cruiser `devtools-app-protocol-only`). The DOM download uses the native `Blob` + anchor + `URL.createObjectURL` path — no new dependency.
- **Injected timestamps:** `@rtc/devtools-core` never calls `Date.now()`/`performance.now()`. `Recording.startedAt` is **passed into** `Recorder.start()` by the UI caller (the app-side toolbar reads `Date.now()` at the UI edge). This keeps the core pure and the recorder/replay unit tests deterministic.
- **Reuse the fold, don't re-implement it:** `ReplayController` folds frames through a real `InspectorStore` so `stateAt(k)` is *by construction* identical to a fresh live fold of the same frames (the property test pins this). The only new fold logic is the checkpoint cache.
- **Repo lint/style rules (CI-enforced):** run `biome ci` (not just `biome check` — it enforces `assist/organizeImports`); base + typed ESLint; `rtc/class-filename-match` (a file exporting `class Foo` must be `Foo.ts`; interface/function-only modules use lowercase names); `func-style` (function declarations over top-level const arrows — `useCallback`/`useEffect` arrow *arguments* are fine); `useBlockStatements` (braces on every `if`/`for`/`while`); `padding-line-between-statements`; `#/*` subpath alias inside a package (Biome bans ≥2-up relative imports; single `./`/`../` is fine); no inline `style={{}}` (CSS Modules only); the JSX-unicode rule (use literal glyphs, never `\uXXXX`, as JSX text); knip; `check:deps`; `check:doc-links`.
- **Test env:** `@rtc/devtools-core` tests run in **node** (its `vitest.config.ts` sets no environment; the store flushes synchronously there because there is no `requestAnimationFrame`). `@rtc/devtools-app` tests run in **jsdom** (its config sets `environment: "jsdom"`; jsdom HAS `requestAnimationFrame`, so the *live* store's snapshot lands a few frames after `apply()` — await it with `@testing-library`'s `waitFor`). The **replay** store is constructed with `{ coalesce: false }`, so `replay.stateAt()` reads are synchronous even in jsdom and never need `waitFor`.
- **Run the full local gauntlet before every push:** `pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-app && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links`.

## File Structure

New in `@rtc/devtools-core` (`packages/devtools-core/src/`):
- `recording.ts` — `Recording` interface, `RECORDING_VERSION`, `serializeRecording`, `parseRecording` (no class → lowercase filename). — Task 2
- `Recorder.ts` — `Recorder` class + `RecorderOptions` (exports `class Recorder` → `Recorder.ts`). — Task 3
- `ReplayController.ts` — `ReplayController` class + `ReplayControllerOptions` (exports `class ReplayController` → `ReplayController.ts`). — Task 4
- `__tests__/inspectorStoreExtensions.test.ts`, `__tests__/recording.test.ts`, `__tests__/recorder.test.ts`, `__tests__/replayController.test.ts`.

Modified in `@rtc/devtools-core`:
- `InspectorStore.ts` — `{ coalesce }` constructor option (synchronous flush), `clone()`, message `tap()`. — Task 1
- `index.ts` — barrel exports for the new symbols. — Tasks 1–4.

New in `@rtc/devtools-app` (`packages/devtools-app/src/`):
- `recording/downloadRecording.ts` — Blob + anchor JSON download helper. — Task 5
- `recording/useRecording.ts` — the recorder/replay React hook (`RecordingModel`). — Task 5
- `recording/RecordingToolbar.tsx` — the toolbar component. — Task 5
- `recording/RecordingToolbar.module.css` — toolbar styles (no inline styles). — Task 5
- `__tests__/downloadRecording.test.ts`, `__tests__/RecordingToolbar.test.tsx`.

Modified in `@rtc/devtools-app`:
- `InspectorApp.tsx` — compute the panel `state` from Live vs Replay mode; render the toolbar. — Task 5

**Recommended order:** 1 → 2 → 3 → 4 → 5. Task 1 is the foundation `clone()`/synchronous store that Task 4 folds through and Task 5 taps; Tasks 2–4 build the core recording units bottom-up; Task 5 wires the UI over all of them.

---

## Task 1: InspectorStore — synchronous mode, `clone()`, and a message tap

**Problem:** `InspectorStore` is the fold `ReplayController` wants to reuse, but two things block reuse. (1) Its flush is rAF-coalesced: after `apply()`, `getSnapshot()` stays stale until the next animation frame — fine for the live panel, fatal for a replay store that must return a reconstructed state *synchronously* when the scrubber moves (the browser has `requestAnimationFrame`, so the snapshot would never be fresh in time). (2) Checkpointing needs an independent copy of a folded store to advance without corrupting the checkpoint — there is no `clone()`. Separately, the recorder needs to observe every `AppToInspector` the store applies, without an app-side change: `apply()` already sees every frame, so the store is the natural tee point.

**Files:**
- Modify: `packages/devtools-core/src/InspectorStore.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorStoreExtensions.test.ts`

**Interfaces:**
- `new InspectorStore(options?: { coalesce?: boolean })` — `coalesce` defaults `true` (unchanged live behaviour). When `false`, every `apply()` flushes synchronously (rebuild + notify) regardless of `requestAnimationFrame`, so `getSnapshot()` is always fresh.
- `clone(): InspectorStore` — an independent copy (`coalesce: false`) whose snapshot deep-equals this store's; mutating either leaves the other untouched. Deep-copies internal entries/log via `structuredClone`.
- `tap(listener: (msg: AppToInspector) => void): () => void` — fires the listener synchronously inside `apply()` for every message (all kinds), returns an unsubscribe. Independent of `subscribe()` (which fires on flush).

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/inspectorStoreExtensions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { InspectorStore } from "../InspectorStore";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore synchronous mode", () => {
  it("coalesce:false flushes synchronously even when rAF never fires", () => {
    const rafs: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      rafs.push(cb);

      return rafs.length;
    });

    try {
      const sync = new InspectorStore({ coalesce: false });
      sync.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
      // No rAF has fired, but the non-coalescing store is already fresh.
      expect(sync.getSnapshot().connected).toBe(true);

      const live = new InspectorStore();
      live.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
      // The default (coalescing) store waits for the rAF chain — still stale.
      expect(live.getSnapshot().connected).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("InspectorStore clone", () => {
  it("clone() is an independent copy with an equal snapshot", () => {
    const store = new InspectorStore({ coalesce: false });
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 1 }],
      machines: [],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 2,
          coalesced: 1,
          seq: 1,
          ts: 10,
        },
      ],
    });

    const copy = store.clone();
    expect(copy.getSnapshot()).toEqual(store.getSnapshot());

    // Advancing the copy does not touch the original, and vice versa.
    copy.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 3,
          coalesced: 1,
          seq: 2,
          ts: 20,
        },
      ],
    });
    expect(copy.getSnapshot().streams[0]?.lastValue).toBe(3);
    expect(store.getSnapshot().streams[0]?.lastValue).toBe(2);
  });
});

describe("InspectorStore message tap", () => {
  it("tap() observes every applied message until unsubscribed", () => {
    const store = new InspectorStore({ coalesce: false });
    const seen: string[] = [];
    const untap = store.tap((msg) => {
      seen.push(msg.kind);
    });

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    store.apply({ kind: "bye" });
    untap();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    expect(seen).toEqual(["welcome", "bye"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test inspectorStoreExtensions`
Expected: FAIL — `new InspectorStore({ coalesce: false })` compiles but ignores the option (still coalesces), `clone` and `tap` do not exist (TS errors / runtime `TypeError`).

- [ ] **Step 3: Implement the option, `clone()`, and `tap()`**

In `packages/devtools-core/src/InspectorStore.ts`, add an options interface next to the existing `interface` declarations (after `InspectorState`):

```ts
export interface InspectorStoreOptions {
  /** When false, every apply() flushes synchronously (rebuild + notify)
   * instead of coalescing onto the rAF chain. The live panel uses the default
   * (true); the replay store uses false so getSnapshot() is fresh the moment a
   * frame is folded, even in a browser where requestAnimationFrame exists. */
  coalesce?: boolean;
}
```

Add the field + a constructor to the class (place the field with the other private fields, and the constructor just after them, before `getSnapshot`):

```ts
  private readonly coalesce: boolean;

  private readonly messageListeners = new Set<(msg: AppToInspector) => void>();

  constructor(options?: InspectorStoreOptions) {
    this.coalesce = options?.coalesce ?? true;
  }
```

Make `scheduleFlush` honour the flag — change its guard so a non-coalescing store always flushes synchronously:

```ts
  private scheduleFlush(): void {
    if (!this.coalesce || typeof requestAnimationFrame !== "function") {
      this.flush();

      return;
    }

    if (this.flushScheduled) {
      return;
    }

    this.flushScheduled = true;
    this.framesWaited = 0;

    const step = (): void => {
      this.framesWaited += 1;

      if (this.framesWaited < InspectorStore.FRAMES_PER_FLUSH) {
        requestAnimationFrame(step);

        return;
      }

      this.flushScheduled = false;
      this.flush();
    };

    requestAnimationFrame(step);
  }
```

Fire the message tap at the very top of `apply()` (so every message is observed, whatever its kind):

```ts
  apply(msg: AppToInspector): void {
    for (const listener of this.messageListeners) {
      listener(msg);
    }

    switch (msg.kind) {
```

(Leave the rest of `apply()` unchanged.)

Add the two public methods (place `tap` and `clone` just after `subscribe`):

```ts
  /** Observe every message passed to apply() — the recorder's tee point. Fires
   * synchronously inside apply(), independent of the flush; returns an
   * unsubscribe. */
  tap(listener: (msg: AppToInspector) => void): () => void {
    this.messageListeners.add(listener);

    return (): void => {
      this.messageListeners.delete(listener);
    };
  }

  /** An independent, synchronous copy of the current fold state. Used by the
   * replay checkpoint cache: a checkpoint is cloned and advanced forward
   * without corrupting the cached original. Deep-copies the internal entries
   * and log (all JSON-safe SerializedValue data) via structuredClone. */
  clone(): InspectorStore {
    const copy = new InspectorStore({ coalesce: false });

    for (const [id, entry] of this.streamEntries) {
      copy.streamEntries.set(id, structuredClone(entry));
    }

    for (const [id, entry] of this.machineEntries) {
      copy.machineEntries.set(id, structuredClone(entry));
    }

    for (const row of this.logAll) {
      copy.logAll.push(structuredClone(row));
    }

    copy.connected = this.connected;
    copy.appId = this.appId;
    copy.protocolMismatch = this.protocolMismatch;
    copy.rebuildState();

    return copy;
  }
```

- [ ] **Step 4: Export the options type**

In `packages/devtools-core/src/index.ts`, extend the `InspectorStore` export block so the type is public:

```ts
export type {
  InspectorState,
  InspectorStoreOptions,
  LogRow,
  MachineIntentRow,
  MachineRow,
  StreamRow,
} from "./InspectorStore";
export { InspectorStore } from "./InspectorStore";
```

- [ ] **Step 5: Run the new + existing store tests**

Run: `pnpm --filter @rtc/devtools-core test inspectorStoreExtensions && pnpm --filter @rtc/devtools-core test`
Expected: the three new tests pass; the existing `inspector.test.ts` suite stays green (the coalescing/burst test still asserts default behaviour, unchanged because `coalesce` defaults `true`).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/InspectorStore.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/inspectorStoreExtensions.test.ts
git commit -m "feat(devtools-core): InspectorStore synchronous mode + clone() + message tap"
```

---

## Task 2: Recording model + JSON serialize/parse

**Problem:** a recording is the minimal event-sourced capture — the appId, an injected start timestamp, and the ordered `AppToInspector` frames. It must round-trip through JSON exactly (the frames are already plain, capped `SerializedValue` data from the v1 serializer, so JSON is lossless), and a malformed/foreign file must be rejected with a clear error rather than crashing the panel.

**Files:**
- Create: `packages/devtools-core/src/recording.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/recording.test.ts`

**Interfaces:**
- `interface Recording { version: number; appId: string; startedAt: number; frames: readonly AppToInspector[] }`.
- `RECORDING_VERSION = 1` (recording format version, independent of `PROTOCOL_VERSION`).
- `serializeRecording(recording: Recording): string` — `JSON.stringify`.
- `parseRecording(json: string): Recording` — parses + validates `version`/`appId`/`startedAt`/`frames`; throws `Error` with a specific message on any mismatch.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/recording.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AppToInspector } from "../protocol";
import {
  parseRecording,
  RECORDING_VERSION,
  type Recording,
  serializeRecording,
} from "../recording";

function sampleRecording(): Recording {
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [{ streamId: "s.a$", value: 1 }], machines: [] },
    {
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 2,
          coalesced: 1,
          seq: 1,
          ts: 10,
        },
      ],
    },
  ];

  return { version: RECORDING_VERSION, appId: "a", startedAt: 42, frames };
}

describe("Recording serialize/parse", () => {
  it("round-trips serialize -> parse to an identical recording", () => {
    const rec = sampleRecording();
    expect(parseRecording(serializeRecording(rec))).toEqual(rec);
  });

  it("rejects non-JSON input with a clear error", () => {
    expect(() => parseRecording("not json")).toThrow(/Invalid recording JSON/);
  });

  it("rejects an unsupported recording version", () => {
    const json = JSON.stringify({
      version: 999,
      appId: "a",
      startedAt: 0,
      frames: [],
    });
    expect(() => parseRecording(json)).toThrow(/Unsupported recording version/);
  });

  it("rejects a malformed shape", () => {
    const json = JSON.stringify({ version: RECORDING_VERSION });
    expect(() => parseRecording(json)).toThrow(/appId must be a string/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test recording`
Expected: FAIL — `../recording` does not exist (module resolution error).

- [ ] **Step 3: Implement the recording model**

`packages/devtools-core/src/recording.ts`:

```ts
import type { AppToInspector } from "./protocol";

/** Recording format version — independent of PROTOCOL_VERSION. Bump when the
 * on-disk shape changes; parseRecording rejects any other version. */
export const RECORDING_VERSION = 1;

/** A flight recording: the appId, an injected start timestamp, and the ordered
 * AppToInspector frames (a seed snapshot followed by the captured batches). The
 * frames are already plain, capped SerializedValue data, so the whole thing is
 * JSON-safe. */
export interface Recording {
  version: number;
  appId: string;
  /** ts of the first captured message — passed in by the caller, never
   * Date.now() here (keeps the core pure and the tests deterministic). */
  startedAt: number;
  frames: readonly AppToInspector[];
}

export function serializeRecording(recording: Recording): string {
  return JSON.stringify(recording);
}

/** Parse + validate a recording from JSON. Throws an Error with a specific
 * message on malformed input so the panel can surface a clear failure rather
 * than crashing. */
export function parseRecording(json: string): Recording {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid recording JSON: ${String(error)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid recording: expected an object");
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.version !== RECORDING_VERSION) {
    throw new Error(
      `Unsupported recording version: ${String(candidate.version)} (expected ${RECORDING_VERSION})`,
    );
  }

  if (typeof candidate.appId !== "string") {
    throw new Error("Invalid recording: appId must be a string");
  }

  if (typeof candidate.startedAt !== "number") {
    throw new Error("Invalid recording: startedAt must be a number");
  }

  if (!Array.isArray(candidate.frames)) {
    throw new Error("Invalid recording: frames must be an array");
  }

  return {
    version: candidate.version,
    appId: candidate.appId,
    startedAt: candidate.startedAt,
    frames: candidate.frames as readonly AppToInspector[],
  };
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/devtools-core/src/index.ts`, add (keep alphabetical grouping — place before the `export { InspectorClient }` line, or wherever `assist/organizeImports` settles it; `biome ci` will fix ordering):

```ts
export {
  parseRecording,
  RECORDING_VERSION,
  type Recording,
  serializeRecording,
} from "./recording";
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @rtc/devtools-core test recording && pnpm --filter @rtc/devtools-core typecheck`
Expected: 4 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/recording.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/recording.test.ts
git commit -m "feat(devtools-core): Recording model with JSON serialize/parse + validation"
```

---

## Task 3: Recorder — tee the applied-message stream into a bounded buffer

**Problem:** while recording, every `AppToInspector` message the panel applies must also be captured, in order, so the buffer can be re-folded later. The buffer must be bounded (a long session can't grow memory without limit) and must `log()` — never silently truncate — when it drops the oldest frame on overflow. And a recording must begin from a *complete* state, not mid-stream, so `start()` seeds `frames[0]` with a synthetic `snapshot` built from the live store's current `InspectorState` (no app round-trip, still observe-only).

**Files:**
- Create: `packages/devtools-core/src/Recorder.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/recorder.test.ts`

**Interfaces:**
- `new Recorder(options?: { maxFrames?: number; log?: (message: string) => void })` — `maxFrames` defaults `10000`; `log` defaults to `console.warn`.
- `start(seedState: InspectorState, startedAt: number): void` — resets the buffer, records `appId` (`seedState.appId ?? "unknown"`) + the injected `startedAt`, seeds `frames[0]` with a synthetic `snapshot` derived from `seedState`, and begins capturing.
- `capture(msg: AppToInspector): void` — appends while recording (no-op when stopped); on overflow drops the oldest frame and `log()`s (cumulative dropped count in the message).
- `stop(): void` — stops capturing (buffer retained).
- `get recording(): boolean`, `get frameCount(): number`.
- `toRecording(): Recording` — snapshots the buffer into a `Recording` (throws if nothing was captured).
- **Caveat (documented):** under sustained overflow the drop-oldest policy can evict the seed snapshot frame, so an over-cap recording may begin mid-stream. This is the intended bounded-buffer trade-off; `maxFrames` is sized (10 000) so it only bites pathologically long sessions.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/recorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type { InspectorState } from "../InspectorStore";
import type { AppToInspector, DevtoolsEvent } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";
import { Recorder } from "../Recorder";
import { RECORDING_VERSION } from "../recording";

function emission(streamId: string, value: number, seq: number, ts: number): DevtoolsEvent {
  return { kind: "stream:emission", streamId, value, coalesced: 1, seq, ts };
}

function batch(seq: number): AppToInspector {
  return { kind: "batch", events: [emission("s.a$", seq, seq, seq * 10)] };
}

function seededState(): InspectorState {
  const store = new InspectorStore({ coalesce: false });
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc" });
  store.apply({
    kind: "snapshot",
    streams: [{ streamId: "s.a$", value: 1 }],
    machines: [],
  });

  return store.getSnapshot();
}

describe("Recorder", () => {
  it("seeds frame 0 with a snapshot from live state and appends frames in order", () => {
    const recorder = new Recorder();
    recorder.start(seededState(), 1000);
    expect(recorder.recording).toBe(true);

    recorder.capture(batch(1));
    recorder.capture(batch(2));
    recorder.stop();
    expect(recorder.recording).toBe(false);

    const rec = recorder.toRecording();
    expect(rec.version).toBe(RECORDING_VERSION);
    expect(rec.appId).toBe("rtc");
    expect(rec.startedAt).toBe(1000);
    expect(rec.frames).toHaveLength(3);
    expect(rec.frames[0]?.kind).toBe("snapshot");
    expect(rec.frames[1]?.kind).toBe("batch");
    expect(rec.frames[2]?.kind).toBe("batch");
  });

  it("carries the seed snapshot's streams into frame 0", () => {
    const recorder = new Recorder();
    recorder.start(seededState(), 0);
    const frame0 = recorder.toRecording().frames[0];

    expect(frame0).toEqual({
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 1 }],
      machines: [],
    });
  });

  it("bounds the buffer and logs each dropped frame (no silent truncation)", () => {
    const logs: string[] = [];
    const recorder = new Recorder({
      maxFrames: 2,
      log: (message) => {
        logs.push(message);
      },
    });

    recorder.start(seededState(), 0); // frame 0 = snapshot -> length 1
    recorder.capture(batch(1)); // length 2
    recorder.capture(batch(2)); // length 3 > 2 -> drop oldest -> 2
    recorder.capture(batch(3)); // length 3 > 2 -> drop oldest -> 2

    expect(recorder.frameCount).toBe(2);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(/dropped oldest frame/);
  });

  it("capture is a no-op when not recording; toRecording throws with nothing captured", () => {
    const recorder = new Recorder();
    recorder.capture(batch(1)); // ignored — never started
    expect(() => recorder.toRecording()).toThrow(/nothing recorded/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test recorder`
Expected: FAIL — `../Recorder` does not exist.

- [ ] **Step 3: Implement the recorder**

`packages/devtools-core/src/Recorder.ts`:

```ts
import type { InspectorState } from "./InspectorStore";
import type { AppToInspector, SnapshotMachine, SnapshotStream } from "./protocol";
import { RECORDING_VERSION, type Recording } from "./recording";

const DEFAULT_MAX_FRAMES = 10000;

export interface RecorderOptions {
  /** Ring cap; on overflow the oldest frame is dropped and logged. */
  maxFrames?: number;
  /** Overflow notifier — no silent truncation. Defaults to console.warn. */
  log?: (message: string) => void;
}

/** Panel-side flight recorder. `start()` seeds a self-contained snapshot from
 * the live store's current state, then `capture()` appends every subsequent
 * AppToInspector message (tee'd off InspectorStore.tap()). The buffer is
 * bounded; overflow drops the oldest frame and logs it. */
export class Recorder {
  private readonly framesBuf: AppToInspector[] = [];

  private readonly cap: number;

  private readonly logFn: (message: string) => void;

  private isRecording = false;

  private appIdValue = "unknown";

  private startedAtValue = 0;

  private droppedCount = 0;

  constructor(options?: RecorderOptions) {
    this.cap = options?.maxFrames ?? DEFAULT_MAX_FRAMES;
    this.logFn = options?.log ?? defaultLog;
  }

  get recording(): boolean {
    return this.isRecording;
  }

  get frameCount(): number {
    return this.framesBuf.length;
  }

  /** Begin capturing. Seeds frame 0 with a synthetic snapshot built from the
   * live state so the recording is complete from the first frame; startedAt is
   * injected by the caller (never Date.now() here). */
  start(seedState: InspectorState, startedAt: number): void {
    this.framesBuf.length = 0;
    this.droppedCount = 0;
    this.appIdValue = seedState.appId ?? "unknown";
    this.startedAtValue = startedAt;
    this.framesBuf.push(seedSnapshot(seedState));
    this.isRecording = true;
  }

  capture(msg: AppToInspector): void {
    if (!this.isRecording) {
      return;
    }

    this.framesBuf.push(msg);

    if (this.framesBuf.length > this.cap) {
      this.framesBuf.shift();
      this.droppedCount += 1;
      this.logFn(
        `Recorder: buffer at cap ${this.cap}, dropped oldest frame (total dropped ${this.droppedCount})`,
      );
    }
  }

  stop(): void {
    this.isRecording = false;
  }

  toRecording(): Recording {
    if (this.framesBuf.length === 0) {
      throw new Error("Recorder: nothing recorded");
    }

    return {
      version: RECORDING_VERSION,
      appId: this.appIdValue,
      startedAt: this.startedAtValue,
      frames: this.framesBuf.slice(),
    };
  }
}

/** Project the live InspectorState back into a snapshot AppToInspector so a
 * recording always begins from a complete state. Emission counters/intents are
 * intentionally reset (a recording starts a fresh session view at record time,
 * not mid-stream) — snapshot has no place for them and the reducer rebuilds
 * them from the captured batches that follow. */
function seedSnapshot(state: InspectorState): AppToInspector {
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

function defaultLog(message: string): void {
  console.warn(message);
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/devtools-core/src/index.ts`, add:

```ts
export { Recorder, type RecorderOptions } from "./Recorder";
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @rtc/devtools-core test recorder && pnpm --filter @rtc/devtools-core typecheck`
Expected: 4 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/Recorder.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/recorder.test.ts
git commit -m "feat(devtools-core): Recorder tees applied messages into a bounded, seeded buffer"
```

---

## Task 4: ReplayController — checkpointed re-fold for replay + scrub

**Problem:** replay and time-scrub both need `stateAt(frameIndex)` — the reconstructed `InspectorState` after folding `frames[0..frameIndex]`. Folding through a fresh `InspectorStore` guarantees fidelity with a live fold, but naive scrubbing re-folds from frame 0 every time the slider moves, which is O(index) per drag tick and janky on a large recording. `ReplayController` keeps periodic **checkpoints** (a cloned, folded store every N frames) and, for any query, clones the nearest checkpoint ≤ `frameIndex` and folds forward at most N frames. It also exposes `tsAt` (the captured timestamp at a frame, for the scrubber readout) and `lastFoldCount` (how many frames the last query folded — the perf invariant the test pins).

**Files:**
- Create: `packages/devtools-core/src/ReplayController.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/replayController.test.ts`

**Interfaces:**
- `new ReplayController(recording: Recording, options?: { checkpointInterval?: number })` — `checkpointInterval` defaults `500`.
- `get length(): number` — `frames.length`.
- `stateAt(frameIndex: number): InspectorState` — clamps to `[0, length-1]`, folds from the nearest checkpoint; identical to a naive fold of `frames[0..frameIndex]`.
- `tsAt(frameIndex: number): number` — the latest captured event `ts` at or before that frame (`startedAt` if none yet).
- `get lastFoldCount(): number` — frames folded by the most recent `stateAt` (≤ `checkpointInterval`), for the perf assertion.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/replayController.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { InspectorState } from "../InspectorStore";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, DevtoolsEvent } from "../protocol";
import type { Recording } from "../recording";
import { RECORDING_VERSION } from "../recording";
import { ReplayController } from "../ReplayController";

function emission(streamId: string, value: number, seq: number, ts: number): DevtoolsEvent {
  return { kind: "stream:emission", streamId, value, coalesced: 1, seq, ts };
}

/** A recording whose frame 0 is a seed snapshot and frames 1..n are one
 * emission each (value === seq === i, ts === i*10). */
function buildRecording(n: number): Recording {
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [{ streamId: "s.a$", value: 0 }], machines: [] },
  ];

  for (let i = 1; i <= n; i += 1) {
    frames.push({ kind: "batch", events: [emission("s.a$", i, i, i * 10)] });
  }

  return { version: RECORDING_VERSION, appId: "r", startedAt: 0, frames };
}

/** The reference: fold frames[0..k] through a fresh, plain InspectorStore. */
function naiveFold(frames: readonly AppToInspector[], k: number): InspectorState {
  const store = new InspectorStore();

  for (let i = 0; i <= k; i += 1) {
    store.apply(frames[i]!);
  }

  return store.getSnapshot();
}

describe("ReplayController", () => {
  it("length reflects the number of frames", () => {
    expect(new ReplayController(buildRecording(10)).length).toBe(11);
  });

  it("stateAt(k) equals a naive fold of frames[0..k], independent of checkpoints", () => {
    const rec = buildRecording(30);
    const replay = new ReplayController(rec, { checkpointInterval: 5 });

    for (const k of [0, 1, 7, 12, 23, 30]) {
      expect(replay.stateAt(k)).toEqual(naiveFold(rec.frames, k));
    }
  });

  it("clamps out-of-range indices", () => {
    const rec = buildRecording(4);
    const replay = new ReplayController(rec);

    expect(replay.stateAt(999)).toEqual(naiveFold(rec.frames, 4));
    expect(replay.stateAt(-5)).toEqual(naiveFold(rec.frames, 0));
  });

  it("folds at most checkpointInterval frames per query (checkpointed, not from 0)", () => {
    const rec = buildRecording(1000);
    const replay = new ReplayController(rec, { checkpointInterval: 50 });

    replay.stateAt(1000);
    replay.stateAt(998); // backward jump

    // A from-0 fold would be 998; from the nearest checkpoint it is <= 50.
    expect(replay.lastFoldCount).toBeLessThanOrEqual(50);
  });

  it("tsAt returns the latest captured event ts up to the frame", () => {
    const replay = new ReplayController(buildRecording(5));

    expect(replay.tsAt(0)).toBe(0); // seed snapshot only -> startedAt
    expect(replay.tsAt(3)).toBe(30); // frame 3 = emission ts 30
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test replayController`
Expected: FAIL — `../ReplayController` does not exist.

- [ ] **Step 3: Implement the replay controller**

`packages/devtools-core/src/ReplayController.ts`:

```ts
import type { InspectorState } from "./InspectorStore";
import { InspectorStore } from "./InspectorStore";
import type { AppToInspector } from "./protocol";
import type { Recording } from "./recording";

const DEFAULT_CHECKPOINT_INTERVAL = 500;

export interface ReplayControllerOptions {
  /** Cache a cloned, folded store every N frames so backward scrubbing folds
   * at most N frames instead of re-folding from 0. */
  checkpointInterval?: number;
}

interface Checkpoint {
  /** Last frame index folded into `store` (>= 0); -1 for the empty base. */
  index: number;
  store: InspectorStore;
}

/** Drives a Recording's frames back into a reconstructed InspectorState at any
 * index. The fold engine is a real (synchronous) InspectorStore, so stateAt(k)
 * is identical to a live fold of the same frames. Periodic checkpoints keep
 * scrubbing responsive. Never touches the live store or the app. */
export class ReplayController {
  private readonly frames: readonly AppToInspector[];

  private readonly startedAt: number;

  private readonly checkpointInterval: number;

  private readonly checkpoints: readonly Checkpoint[];

  private readonly frameTs: readonly number[];

  private lastFoldCountValue = 0;

  constructor(recording: Recording, options?: ReplayControllerOptions) {
    this.frames = recording.frames;
    this.startedAt = recording.startedAt;
    this.checkpointInterval = Math.max(
      1,
      options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
    );
    this.checkpoints = this.buildCheckpoints();
    this.frameTs = this.buildFrameTs();
  }

  get length(): number {
    return this.frames.length;
  }

  get lastFoldCount(): number {
    return this.lastFoldCountValue;
  }

  stateAt(frameIndex: number): InspectorState {
    const clamped = this.clampIndex(frameIndex);
    const base = this.nearestCheckpoint(clamped);
    const working = base.store.clone();
    let folded = 0;

    for (let i = base.index + 1; i <= clamped; i += 1) {
      working.apply(this.frames[i]!);
      folded += 1;
    }

    this.lastFoldCountValue = folded;

    return working.getSnapshot();
  }

  tsAt(frameIndex: number): number {
    const clamped = this.clampIndex(frameIndex);

    if (clamped < 0) {
      return this.startedAt;
    }

    return this.frameTs[clamped] ?? this.startedAt;
  }

  private clampIndex(frameIndex: number): number {
    if (this.frames.length === 0) {
      return -1;
    }

    return Math.max(0, Math.min(frameIndex, this.frames.length - 1));
  }

  private nearestCheckpoint(index: number): Checkpoint {
    let best = this.checkpoints[0]!; // the -1 empty base is always present

    for (const cp of this.checkpoints) {
      if (cp.index <= index && cp.index >= best.index) {
        best = cp;
      }
    }

    return best;
  }

  private buildCheckpoints(): Checkpoint[] {
    const working = new InspectorStore({ coalesce: false });
    // Base checkpoint: an empty store before any frame is folded.
    const checkpoints: Checkpoint[] = [{ index: -1, store: working.clone() }];

    for (let i = 0; i < this.frames.length; i += 1) {
      working.apply(this.frames[i]!);

      if ((i + 1) % this.checkpointInterval === 0) {
        checkpoints.push({ index: i, store: working.clone() });
      }
    }

    return checkpoints;
  }

  private buildFrameTs(): number[] {
    const out: number[] = [];
    let ts = this.startedAt;

    for (const frame of this.frames) {
      if (frame.kind === "batch") {
        for (const event of frame.events) {
          if (event.ts > ts) {
            ts = event.ts;
          }
        }
      }

      out.push(ts);
    }

    return out;
  }
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/devtools-core/src/index.ts`, add:

```ts
export {
  ReplayController,
  type ReplayControllerOptions,
} from "./ReplayController";
```

- [ ] **Step 5: Run the test + full core suite + typecheck**

Run: `pnpm --filter @rtc/devtools-core test replayController && pnpm --filter @rtc/devtools-core test && pnpm --filter @rtc/devtools-core typecheck`
Expected: the 5 new tests pass; all core tests green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/ReplayController.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/replayController.test.ts
git commit -m "feat(devtools-core): ReplayController — checkpointed re-fold for replay + scrub"
```

---

## Task 5: devtools-app — recording toolbar, useRecording hook, Live|Replay seam

**Problem:** the core recording units need a UI: a toolbar to Record/Stop, a Live|Replay toggle, a scrubber with step/play and a timestamp readout, and Export/Import. The four existing panels are already pure functions of `InspectorState`, so the clean seam is to compute one `state` value in `InspectorApp` — the live snapshot in Live mode, `replay.stateAt(frameIndex)` in Replay mode — and pass it to the existing `ConnectionRail`/`TabPanel`. No panel internals change. The recorder tees off the store via the `tap()` added in Task 1; export uses an anchor + Blob + object URL (no deps); import reads a file, `parseRecording`s it, and switches to Replay.

**Files:**
- Create: `packages/devtools-app/src/recording/downloadRecording.ts`
- Create: `packages/devtools-app/src/recording/useRecording.ts`
- Create: `packages/devtools-app/src/recording/RecordingToolbar.tsx`
- Create: `packages/devtools-app/src/recording/RecordingToolbar.module.css`
- Modify: `packages/devtools-app/src/InspectorApp.tsx`
- Test: `packages/devtools-app/src/__tests__/downloadRecording.test.ts`
- Test: `packages/devtools-app/src/__tests__/RecordingToolbar.test.tsx`

**Interfaces:**
- `downloadRecording(recording: Recording): void` — serialises to JSON, triggers a download named `recording-<appId>-<startedAt>.json`.
- `useRecording(store: InspectorStore): RecordingModel` — owns `mode`/`isRecording`/`frameCount`/`recording`/`replay`/`frameIndex`/`isPlaying`/`canReplay` and the handlers (`startRecording`/`stopRecording`/`setMode`/`setFrameIndex`/`stepBack`/`stepForward`/`togglePlay`/`exportRecording`/`importRecording`). While recording it `store.tap()`s messages into a `Recorder`.
- `RecordingToolbar({ model }: { model: RecordingModel })` — the presentational toolbar.
- `InspectorApp` computes `const state = model.mode === "replay" && model.replay ? model.replay.stateAt(model.frameIndex) : liveState;` and feeds the existing panels.

- [ ] **Step 1: Write the failing download test**

`packages/devtools-app/src/__tests__/downloadRecording.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import { RECORDING_VERSION } from "@rtc/devtools-core";

import { downloadRecording } from "#/recording/downloadRecording";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sample(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "rtc-web",
    startedAt: 1234,
    frames: [{ kind: "snapshot", streams: [], machines: [] }],
  };
}

describe("downloadRecording", () => {
  it("names the file recording-<appId>-<startedAt>.json and clicks an anchor", () => {
    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    const createUrl = vi.fn(() => "blob:fake");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });

    downloadRecording(sample());

    expect(anchor.download).toBe("recording-rtc-web-1234.json");
    expect(anchor.href).toContain("blob:fake");
    expect(createUrl).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test downloadRecording`
Expected: FAIL — `#/recording/downloadRecording` does not exist.

- [ ] **Step 3: Implement the download helper**

`packages/devtools-app/src/recording/downloadRecording.ts`:

```ts
import { type Recording, serializeRecording } from "@rtc/devtools-core";

/** Trigger a browser download of a recording as JSON, via an anchor + Blob +
 * object URL. No dependency — the DOM download path is native. */
export function downloadRecording(recording: Recording): void {
  const json = serializeRecording(recording);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `recording-${recording.appId}-${recording.startedAt}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the download test to verify it passes**

Run: `pnpm --filter @rtc/devtools-app test downloadRecording`
Expected: PASS (1 test).

- [ ] **Step 5: Implement the `useRecording` hook**

`packages/devtools-app/src/recording/useRecording.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type InspectorStore,
  parseRecording,
  Recorder,
  type Recording,
  ReplayController,
} from "@rtc/devtools-core";

import { downloadRecording } from "#/recording/downloadRecording";

const PLAY_STEP_MS = 200;

export type RecordingMode = "live" | "replay";

export interface RecordingModel {
  mode: RecordingMode;
  isRecording: boolean;
  frameCount: number;
  recording: Recording | null;
  replay: ReplayController | null;
  frameIndex: number;
  isPlaying: boolean;
  canReplay: boolean;
  setMode: (mode: RecordingMode) => void;
  startRecording: () => void;
  stopRecording: () => void;
  setFrameIndex: (index: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  togglePlay: () => void;
  exportRecording: () => void;
  importRecording: (file: File) => Promise<void>;
}

/** Owns record/replay state for the toolbar. Recording tees the store's applied
 * messages into a Recorder via store.tap(); replay reconstructs state through a
 * ReplayController. Nothing is ever sent to the app. */
export function useRecording(store: InspectorStore): RecordingModel {
  const recorderRef = useRef<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [replay, setReplay] = useState<ReplayController | null>(null);
  const [mode, setModeState] = useState<RecordingMode>("live");
  const [frameIndex, setFrameIndexState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // While recording, tee every applied message into the recorder and keep the
  // live frame counter fresh.
  useEffect((): undefined | (() => void) => {
    if (!isRecording) {
      return undefined;
    }

    const recorder = recorderRef.current;

    if (!recorder) {
      return undefined;
    }

    const untap = store.tap((msg) => {
      recorder.capture(msg);
      setFrameCount(recorder.frameCount);
    });

    return (): void => {
      untap();
    };
  }, [isRecording, store]);

  // Playback: advance the frame index on a fixed cadence until the end.
  useEffect((): undefined | (() => void) => {
    if (!isPlaying || mode !== "replay" || !replay) {
      return undefined;
    }

    const id = setInterval((): void => {
      setFrameIndexState((current) => {
        const next = current + 1;

        if (next >= replay.length) {
          setIsPlaying(false);

          return replay.length - 1;
        }

        return next;
      });
    }, PLAY_STEP_MS);

    return (): void => {
      clearInterval(id);
    };
  }, [isPlaying, mode, replay]);

  const startRecording = useCallback((): void => {
    const recorder = new Recorder();
    recorder.start(store.getSnapshot(), Date.now());
    recorderRef.current = recorder;
    setFrameCount(recorder.frameCount);
    setIsRecording(true);
  }, [store]);

  const stopRecording = useCallback((): void => {
    const recorder = recorderRef.current;

    if (!recorder) {
      return;
    }

    recorder.stop();
    const rec = recorder.toRecording();
    setRecording(rec);
    setReplay(new ReplayController(rec));
    setFrameIndexState(rec.frames.length - 1);
    setIsRecording(false);
  }, []);

  const setMode = useCallback(
    (next: RecordingMode): void => {
      if (next === "replay" && !replay) {
        return;
      }

      if (next === "live") {
        setIsPlaying(false);
      }

      setModeState(next);
    },
    [replay],
  );

  const setFrameIndex = useCallback(
    (index: number): void => {
      const max = replay ? replay.length - 1 : 0;
      setFrameIndexState(Math.max(0, Math.min(index, max)));
    },
    [replay],
  );

  const stepForward = useCallback((): void => {
    setFrameIndexState((current) => {
      const max = replay ? replay.length - 1 : 0;

      return Math.min(current + 1, max);
    });
  }, [replay]);

  const stepBack = useCallback((): void => {
    setFrameIndexState((current) => {
      return Math.max(current - 1, 0);
    });
  }, []);

  const togglePlay = useCallback((): void => {
    setIsPlaying((playing) => {
      return !playing;
    });
  }, []);

  const exportRecording = useCallback((): void => {
    if (recording) {
      downloadRecording(recording);
    }
  }, [recording]);

  const importRecording = useCallback(async (file: File): Promise<void> => {
    const text = await file.text();

    try {
      const rec = parseRecording(text);
      setRecording(rec);
      const controller = new ReplayController(rec);
      setReplay(controller);
      setFrameIndexState(Math.max(0, rec.frames.length - 1));
      setIsPlaying(false);
      setModeState("replay");
    } catch (error) {
      console.error(`Import failed: ${String(error)}`);
    }
  }, []);

  return {
    mode,
    isRecording,
    frameCount,
    recording,
    replay,
    frameIndex,
    isPlaying,
    canReplay: replay !== null,
    setMode,
    startRecording,
    stopRecording,
    setFrameIndex,
    stepBack,
    stepForward,
    togglePlay,
    exportRecording,
    importRecording,
  };
}
```

- [ ] **Step 6: Implement the toolbar styles**

`packages/devtools-app/src/recording/RecordingToolbar.module.css`:

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 0.8rem;
}

.btn {
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btnActive {
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(120, 200, 255, 0.8);
  border-radius: 3px;
  background: rgba(120, 200, 255, 0.18);
  color: inherit;
  cursor: pointer;
}

.counter {
  opacity: 0.75;
}

.scrubber {
  flex: 1 1 auto;
  min-width: 6rem;
}

.readout {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.spacer {
  flex: 1 1 auto;
}

.importLabel {
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  cursor: pointer;
}

.hiddenInput {
  display: none;
}
```

- [ ] **Step 7: Implement the toolbar component**

`packages/devtools-app/src/recording/RecordingToolbar.tsx`:

```tsx
import type { ChangeEvent, ReactElement } from "react";

import styles from "#/recording/RecordingToolbar.module.css";
import type { RecordingModel } from "#/recording/useRecording";

/** The recording toolbar: Record/Stop + frame counter, a Live|Replay mode
 * toggle, a scrubber with step/play and a ts readout (Replay only), and
 * Export/Import. Purely presentational — all state lives in `model`. */
export function RecordingToolbar({ model }: RecordingToolbarProps): ReactElement {
  const startedAt = model.recording?.startedAt ?? 0;
  const maxIndex = model.replay ? Math.max(0, model.replay.length - 1) : 0;

  function onScrub(event: ChangeEvent<HTMLInputElement>): void {
    model.setFrameIndex(Number(event.target.value));
  }

  function onImport(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];

    if (file) {
      void model.importRecording(file);
    }
  }

  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        data-testid="record-toggle"
        className={model.isRecording ? styles.btnActive : styles.btn}
        onClick={model.isRecording ? model.stopRecording : model.startRecording}
      >
        {model.isRecording ? "■ Stop" : "● Record"}
      </button>
      {model.isRecording ? (
        <span className={styles.counter} data-testid="frame-count">
          {`${model.frameCount} frames`}
        </span>
      ) : null}

      <span className={styles.spacer} />

      <button
        type="button"
        data-testid="mode-live"
        className={model.mode === "live" ? styles.btnActive : styles.btn}
        onClick={() => {
          model.setMode("live");
        }}
      >
        Live
      </button>
      <button
        type="button"
        data-testid="mode-replay"
        disabled={!model.canReplay}
        className={model.mode === "replay" ? styles.btnActive : styles.btn}
        onClick={() => {
          model.setMode("replay");
        }}
      >
        Replay
      </button>

      {model.mode === "replay" && model.replay ? (
        <>
          <button
            type="button"
            data-testid="step-back"
            className={styles.btn}
            onClick={model.stepBack}
          >
            ◀
          </button>
          <button
            type="button"
            data-testid="play-toggle"
            className={styles.btn}
            onClick={model.togglePlay}
          >
            {model.isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            data-testid="step-forward"
            className={styles.btn}
            onClick={model.stepForward}
          >
            ▶▮
          </button>
          <input
            type="range"
            data-testid="scrubber"
            className={styles.scrubber}
            min={0}
            max={maxIndex}
            value={model.frameIndex}
            onChange={onScrub}
          />
          <span className={styles.readout} data-testid="frame-readout">
            {`${model.frameIndex + 1}/${model.replay.length} ${formatOffset(
              model.replay.tsAt(model.frameIndex) - startedAt,
            )}`}
          </span>
        </>
      ) : null}

      <span className={styles.spacer} />

      <button
        type="button"
        data-testid="export"
        className={styles.btn}
        disabled={!model.recording}
        onClick={model.exportRecording}
      >
        Export
      </button>
      <label className={styles.importLabel} data-testid="import-label">
        Import
        <input
          type="file"
          accept="application/json"
          data-testid="import"
          className={styles.hiddenInput}
          onChange={onImport}
        />
      </label>
    </div>
  );
}

export interface RecordingToolbarProps {
  model: RecordingModel;
}

function formatOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(2)}s`;
}
```

- [ ] **Step 8: Wire the Live|Replay seam into `InspectorApp`**

In `packages/devtools-app/src/InspectorApp.tsx`, add imports (after the existing `#/` imports):

```tsx
import { RecordingToolbar } from "#/recording/RecordingToolbar";
import { useRecording } from "#/recording/useRecording";
```

Replace the `InspectorApp` function body so the panel `state` comes from Live or Replay mode and the toolbar renders above the tab strip:

```tsx
export function InspectorApp({ store }: InspectorAppProps): ReactElement {
  const liveState = useInspectorState(store);
  const recording = useRecording(store);
  const [tab, setTab] = useState<InspectorTab>("state");

  // The panels are pure functions of InspectorState: in Live mode they get the
  // store's live snapshot; in Replay mode, the state reconstructed from the
  // recording at the scrubbed frame. This is the whole seam.
  const state =
    recording.mode === "replay" && recording.replay
      ? recording.replay.stateAt(recording.frameIndex)
      : liveState;

  return (
    <div className={styles.app}>
      <ConnectionRail state={state} />
      <div className={styles.main}>
        <RecordingToolbar model={recording} />
        <TabStrip active={tab} onSelect={setTab} />
        <div className={styles.panel}>
          <TabPanel tab={tab} state={state} />
        </div>
      </div>
    </div>
  );
}
```

(Leave `ConnectionRail`, `TabStrip`, `TabPanel`, `RailCount`, and the types unchanged.)

- [ ] **Step 9: Write the failing toolbar/integration test**

`packages/devtools-app/src/__tests__/RecordingToolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import { InspectorStore, PROTOCOL_VERSION, RECORDING_VERSION, serializeRecording } from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

afterEach(cleanup);

beforeEach(() => {
  // jsdom does not implement object URLs; the export path may touch them.
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("record -> replay seam", () => {
  it("captures a live session and scrubs the panels to past state", async () => {
    const store = new InspectorStore();
    render(<InspectorApp store={store} />);

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "fx.EURUSD$", value: null }],
      machines: [],
    });
    await waitFor(() => {
      expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");
    });

    fireEvent.click(screen.getByTestId("record-toggle")); // start
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "fx.EURUSD$",
          value: 1.1,
          coalesced: 1,
          seq: 1,
          ts: 1000,
        },
      ],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "fx.EURUSD$",
          value: 1.2,
          coalesced: 1,
          seq: 2,
          ts: 2000,
        },
      ],
    });
    fireEvent.click(screen.getByTestId("record-toggle")); // stop

    // Replay is now available; switch to it.
    fireEvent.click(screen.getByTestId("mode-replay"));
    const scrubber = screen.getByTestId("scrubber") as HTMLInputElement;

    // Last frame -> the latest emission value.
    fireEvent.change(scrubber, { target: { value: scrubber.max } });
    await waitFor(() => {
      expect(screen.getByText("1.2")).toBeTruthy();
    });

    // Seed frame -> the stream exists but the latest value is gone.
    fireEvent.change(scrubber, { target: { value: "0" } });
    await waitFor(() => {
      expect(screen.getByText("fx.EURUSD$")).toBeTruthy();
    });
    expect(screen.queryByText("1.2")).toBeNull();
  });

  it("imports a recording file and switches to replay", async () => {
    const rec: Recording = {
      version: RECORDING_VERSION,
      appId: "imported",
      startedAt: 5000,
      frames: [
        { kind: "snapshot", streams: [{ streamId: "z.a$", value: 7 }], machines: [] },
      ],
    };
    const store = new InspectorStore();
    render(<InspectorApp store={store} />);

    const file = new File([serializeRecording(rec)], "r.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByTestId("import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("z.a$")).toBeTruthy();
    });
    expect(screen.getByTestId("scrubber")).toBeTruthy();
  });
});
```

- [ ] **Step 10: Run the app tests to verify red → green**

Run: `pnpm --filter @rtc/devtools-app test RecordingToolbar`
Expected: initially the integration test fails if any wiring is off; after Steps 5–8 it PASSES (2 tests). Then run the whole app suite: `pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-app typecheck` — all green, typecheck clean (including the `tsconfig.node.json` pass).

- [ ] **Step 11: Commit**

```bash
git add packages/devtools-app/src/recording packages/devtools-app/src/InspectorApp.tsx packages/devtools-app/src/__tests__/downloadRecording.test.ts packages/devtools-app/src/__tests__/RecordingToolbar.test.tsx
git commit -m "feat(devtools-app): recording toolbar + Live|Replay scrub seam over the panels"
```

---

## Final: gauntlet, docs, STATUS

- [ ] **Run the full local gauntlet**

```bash
pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-app && pnpm check:deps && pnpm lint:dead && pnpm build && pnpm check:doc-links
```
Expected: all green. Fix any Biome `organizeImports`/`func-style`/`useBlockStatements`/`padding-line-between-statements` findings, ESLint typed/newspaper-order/class-filename-match findings, `lint:css` (stylelint) findings on the new CSS module, knip unused-export findings (the new `index.ts` exports are consumed by `@rtc/devtools-app`, so they are live), or `check:deps` (dep-cruiser) findings before pushing. Confirm `pnpm build` compiles `@rtc/devtools-core` (`tsc --build` + `tsc-alias`) and `@rtc/devtools-app` (`vite build`) cleanly.

- [ ] **Document the feature in the architecture reference**

In `docs/architecture/20-devtools.md`, add a short subsection under the future-extensions / roadmap area recording that record-replay + time-scrubbing (spec §9.2/§9.5) is now implemented panel-side: `Recorder` tees `InspectorStore.tap()`, `ReplayController` re-folds captured frames through a synchronous `InspectorStore` clone with periodic checkpoints, and recordings export/import as JSON — observe-only, no protocol or app change. Keep it to a couple of sentences; do not renumber existing sections. Verify anchors with `pnpm check:doc-links`.

- [ ] **Update STATUS.md**

Per the `tracking-workstream-status` skill: this plan realises a spec, so ensure `docs/STATUS.md` reflects it — if a record-replay backlog line exists, mark it in-progress/done as appropriate when the PR merges; otherwise no edit is needed. Bump the `Last updated` header only if you edit the file.

- [ ] **Commit any docs/STATUS edits**

```bash
git add docs/architecture/20-devtools.md docs/STATUS.md
git commit -m "docs(devtools): record/replay + time-scrub realised panel-side (§20)"
```

---

## Self-Review

**Spec coverage** (§2 approach, §5 testing): recording model → Task 2 (`Recording` + `serializeRecording`/`parseRecording`) ✓; `Recorder` tee + bounded buffer + seeded snapshot → Task 3 ✓; `ReplayController` checkpointed `stateAt` → Task 4 ✓; export/import round-trip + malformed rejection → Task 2 (parse) + Task 5 (download/import UI) ✓; toolbar + Live|Replay + scrubber → Task 5 ✓. §5 test list: recorder unit ✓ (Task 3), replay unit + checkpoint-independence property + bounded-fold perf ✓ (Task 4), export/import round-trip ✓ (Task 2 + Task 5), panel jsdom Live/Replay swap + scrub + import ✓ (Task 5).

**Zero protocol/app change:** `protocol.ts` is untouched; `AppToInspector` is reused verbatim as the frame type. No new `InspectorToApp` send is added — the recorder taps `InspectorStore.apply()` (which already receives every frame) rather than requesting a snapshot from the app, so the observe-only and dormancy invariants hold. The seed snapshot is *derived* from the live `InspectorState`, not requested over the wire.

**Fold fidelity:** `ReplayController` folds through a real `InspectorStore`, so `stateAt(k)` equals a live fold by construction; the property test pins it against a naive `new InspectorStore()` fold across several indices and against a small `checkpointInterval` (forcing multiple checkpoints). The synchronous `{ coalesce: false }` mode (Task 1) is required because the panel runs in a browser with `requestAnimationFrame`, where a coalescing store's `getSnapshot()` would be stale when the scrubber reads it; `clone()` provides the independent checkpoint copies. Deep copy uses `structuredClone` (a global, not a `node:` import — dep-cruiser-safe) over JSON-safe `SerializedValue` data.

**Injected timestamps:** `@rtc/devtools-core` never calls `Date.now()`. `Recorder.start()` takes `startedAt`; the app-side `useRecording` passes `Date.now()` at the UI edge. Core tests build states/recordings with fixed timestamps, so they are deterministic.

**Type + name consistency:** new module constants each defined once — `RECORDING_VERSION` (recording.ts), `DEFAULT_MAX_FRAMES` (Recorder.ts), `DEFAULT_CHECKPOINT_INTERVAL` (ReplayController.ts), `PLAY_STEP_MS` (useRecording.ts). Class files match `rtc/class-filename-match`: `Recorder.ts`/`ReplayController.ts` export their class; `recording.ts` is interface+function-only (lowercase). `InspectorStoreOptions`/`RecorderOptions`/`ReplayControllerOptions`/`RecordingModel`/`RecordingMode` are the new public types, each exported once. The `useRecording` handler names match one-for-one between the hook's returned `RecordingModel` and the toolbar's `model.*` call sites and the test's `data-testid`s (`record-toggle`, `frame-count`, `mode-live`, `mode-replay`, `step-back`, `play-toggle`, `step-forward`, `scrubber`, `frame-readout`, `export`, `import`).

**Placeholder scan:** every step shows complete code (no `…`/TBD), every command has an expected outcome, and the two DOM-touching tests (`downloadRecording`, `RecordingToolbar`) stub `URL.createObjectURL`/`revokeObjectURL` and (for download) `document.createElement`/anchor `click`, since jsdom does not implement object URLs. JSX glyphs are literal characters (record/stop/step/play), per the repo's no-`\uXXXX`-in-JSX rule.

**Ordering / independence:** Task 1 is a prerequisite for Tasks 4 (`clone` + `{ coalesce: false }`) and 5 (`tap`). Tasks 2 → 3 → 4 are bottom-up within the core (Recorder + ReplayController both consume the `Recording` model). Task 5 consumes all of them. Each core task adds its own `index.ts` export line; `biome ci` reconciles export ordering. No two tasks edit the same file's same region: Task 1 edits `InspectorStore.ts` structurally; Tasks 2–4 create new files + append distinct export lines to `index.ts` (append-only, trivially mergeable); Task 5 is entirely in `@rtc/devtools-app`.
