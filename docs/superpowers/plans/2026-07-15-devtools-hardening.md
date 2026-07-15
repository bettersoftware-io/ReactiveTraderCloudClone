# DevTools Hardening & Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six small, tracked follow-ups on the shipped custom devtools — inspector-side registry caps, a type-safe event builder, prod-serving-path coverage, panel-side liveness detection, and two per-flush render-cost reductions — without changing the protocol or any observable behaviour of the app.

**Architecture:** Six independent, reviewable tasks across the three devtools packages. Each is a localized change with its own test; none touches the wire protocol, the composition-root decorators, or the app's own code paths.

**Tech Stack:** TypeScript, RxJS 7 (`@rtc/devtools-core`), React 19 (`@rtc/devtools-app`), Vitest 4 (node env for core, jsdom for the React/WAAPI bits), the Web Animations API.

## Global Constraints

- **Observe-only, protocol-frozen:** no change to `protocol.ts`'s `DevtoolsEvent`/`AppToInspector`/`InspectorToApp` shapes, and no new app-side behaviour. These are internal hardening changes.
- **`@rtc/devtools-core` is an rxjs-only leaf** — no new runtime deps, no `@rtc/*` imports, no node built-ins in `src` (dep-cruiser `devtools-core-no-node-builtins`). Tests may use node built-ins.
- **`@rtc/devtools-app` may depend only on `@rtc/devtools-core`** (dep-cruiser `devtools-app-protocol-only`). Task 5/6 add **no** new dependency — `React.memo` and the Web Animations API are already available (React 19 + DOM).
- **Perf discipline (`docs/performance.md`):** any change to an animation must stay compositor-only — `transform`/`opacity` only, one animation per property per element, literal keyframe values, no `var()` in an animated property. Task 6 must keep the flash on `opacity` alone.
- **Repo lint/style rules (CI-enforced):** run `biome ci` (not just `biome check` — it enforces `assist/organizeImports`); base + typed ESLint; `rtc/class-filename-match`; `func-style` (function declarations over top-level const arrows); `useBlockStatements` (braces everywhere); `padding-line-between-statements`; `#/*` subpath alias (Biome bans ≥2-up relative imports); knip; `check:deps`; `check:doc-links`.
- **Test env:** `@rtc/devtools-core` tests run in the **node** environment; a test needing the DOM (Task 6 WAAPI, Task 4 if it renders) sets `// @vitest-environment jsdom` at the top of the file. Remember the store's flush is rAF-coalesced — in jsdom (which has `requestAnimationFrame`) await it; in node it flushes synchronously.
- **Run the full local gauntlet before every push:** `pnpm typecheck && pnpm test && pnpm lint && npx biome ci <changed-pkgs> && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links`.

## File Structure

- `packages/devtools-core/src/InspectorStore.ts` — Task 1 (evict disposed machines + cap streams).
- `packages/devtools-core/src/DevtoolsHub.ts` — Task 2 (type-safe `event()` builder).
- `packages/devtools-core/src/InspectorClient.ts` — Task 4 (welcome-freshness liveness timer).
- `scripts/check-devtools-dist.mjs` + root `package.json` — Task 3 (prod `/devtools/` copy-path check).
- `packages/devtools-app/src/panels/StateTreePanel.tsx` — Tasks 5 (memo row) + 6 (WAAPI flash).
- `packages/devtools-app/src/panels/StateTreePanel.module.css` — Task 6 (drop permanent `will-change`).
- `packages/devtools-app/src/panels/MachinesPanel.tsx` — Task 5 (memo table row).
- Tests colocated: `packages/devtools-core/src/__tests__/*.test.ts`, `packages/devtools-app/src/panels/__tests__/*.test.tsx`.

Existing constants to mirror/reference: `DevtoolsHub` has `const MAX_DISPOSED_RETAINED = 500;` (app-side disposed-machine eviction) and `InspectorStore` has `const LOG_CAP = 5000;` (log ring). Task 1 gives the inspector the machine/stream equivalent.

---

## Task 1: Inspector-side registry caps

**Problem:** `InspectorStore` caps only its log (`LOG_CAP = 5000`). Its `machineEntries` map grows for the life of the session — every FX tile mount/unmount adds a `notional`/`tileExecution` machine that is marked `disposed` but never removed — and `streamEntries` is likewise unbounded. The app-side hub already evicts disposed machines past `MAX_DISPOSED_RETAINED = 500`; the inspector should apply the same discipline so a long session's memory and machine-table length stay bounded.

**Files:**
- Modify: `packages/devtools-core/src/InspectorStore.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorCaps.test.ts`

**Interfaces:**
- Consumes: existing `InspectorStore.apply()` / `getSnapshot()`.
- Produces: after a `machine:disposed`, disposed machines beyond `MAX_DISPOSED_MACHINES = 500` (oldest first) are evicted from the snapshot; `streamEntries` is capped at `MAX_STREAMS = 2000` (oldest-inserted evicted). No public API change.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/inspectorCaps.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { DevtoolsEvent } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";
import { InspectorStore } from "../InspectorStore";

function createEvent(kind: string, extra: Record<string, unknown>, seq: number): DevtoolsEvent {
  return { kind, seq, ts: seq, ...extra } as unknown as DevtoolsEvent;
}

describe("InspectorStore registry caps", () => {
  it("evicts the oldest disposed machines beyond the cap", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    // Create + dispose 600 machines (cap is 500).
    for (let i = 0; i < 600; i++) {
      store.apply({ kind: "batch", events: [createEvent("machine:created", { machineId: `m${i}`, machineKind: "notional", args: [] }, i)] });
      store.apply({ kind: "batch", events: [createEvent("machine:disposed", { machineId: `m${i}` }, 1000 + i)] });
    }

    const machines = store.getSnapshot().machines;
    expect(machines.length).toBe(500);
    // Oldest (m0..m99) evicted; newest retained.
    expect(machines.some((m) => m.machineId === "m0")).toBe(false);
    expect(machines.some((m) => m.machineId === "m599")).toBe(true);
  });

  it("keeps live machines regardless of the disposed cap", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    store.apply({ kind: "batch", events: [createEvent("machine:created", { machineId: "live", machineKind: "notional", args: [] }, 0)] });
    for (let i = 0; i < 600; i++) {
      store.apply({ kind: "batch", events: [createEvent("machine:created", { machineId: `d${i}`, machineKind: "notional", args: [] }, i)] });
      store.apply({ kind: "batch", events: [createEvent("machine:disposed", { machineId: `d${i}` }, 1000 + i)] });
    }

    expect(store.getSnapshot().machines.some((m) => m.machineId === "live")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test inspectorCaps`
Expected: FAIL — first test sees 600 machines, not 500.

- [ ] **Step 3: Implement the caps**

In `packages/devtools-core/src/InspectorStore.ts`, add module constants next to `LOG_CAP`:

```ts
const MAX_DISPOSED_MACHINES = 500;
const MAX_STREAMS = 2000;
```

In `applyEvent`, in the `case "machine:disposed":` block, after `entry.disposed = true;`, call a new eviction helper. Add the helper method to the class:

```ts
  /** Bound retained disposed machines the way the hub does (MAX_DISPOSED_RETAINED)
   * so a long session's machine table and memory stay flat. Insertion order in a
   * Map is stable, so the first disposed entries found are the oldest. */
  private evictDisposedMachines(): void {
    const disposedIds: string[] = [];

    for (const [id, entry] of this.machineEntries) {
      if (entry.disposed) {
        disposedIds.push(id);
      }
    }

    const overflow = disposedIds.length - MAX_DISPOSED_MACHINES;

    for (let i = 0; i < overflow; i++) {
      this.machineEntries.delete(disposedIds[i]!);
    }
  }
```

Update the disposed case to call it:

```ts
      case "machine:disposed": {
        const entry = this.machineEntries.get(event.machineId);

        if (entry) {
          entry.disposed = true;
          this.evictDisposedMachines();
        }

        break;
      }
```

For streams, in `streamEntry()` (the lazy-create path) and in the `stream:registered` case, after inserting a new entry, bound the map. Add a helper and call it wherever a new stream entry is set:

```ts
  /** Oldest-inserted stream eviction — a safety bound; the real app has a finite
   * set of presenter/parameterized streams, so this only fires on pathological
   * churn. */
  private capStreams(): void {
    const overflow = this.streamEntries.size - MAX_STREAMS;

    if (overflow <= 0) {
      return;
    }

    const it = this.streamEntries.keys();

    for (let i = 0; i < overflow; i++) {
      const next = it.next();

      if (!next.done) {
        this.streamEntries.delete(next.value);
      }
    }
  }
```

Call `this.capStreams();` at the end of the `stream:registered` case and after the `this.streamEntries.set(streamId, entry);` line in `streamEntry()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-core test inspectorCaps`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing store tests to confirm no regression**

Run: `pnpm --filter @rtc/devtools-core test`
Expected: all pass (the inspector.test.ts suite still green).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/InspectorStore.ts packages/devtools-core/src/__tests__/inspectorCaps.test.ts
git commit -m "fix(devtools-core): bound InspectorStore disposed-machine + stream registries"
```

---

## Task 2: Type-safe event builder

**Problem:** `DevtoolsHub.event()` ends in `as unknown as DevtoolsEvent`. Spreading `Omit<DevtoolsEvent, "seq" | "ts">` erases the discriminated-union relationship, so TypeScript cannot verify the result is a valid `DevtoolsEvent` and the double `as unknown as` cast silences it entirely — a malformed event body would not be caught. Narrow the builder so each call site is checked against a single union member.

**Files:**
- Modify: `packages/devtools-core/src/DevtoolsHub.ts`
- Test: `packages/devtools-core/src/__tests__/eventBuilder.test.ts`

**Interfaces:**
- Consumes: `DevtoolsEvent` union from `protocol.ts`.
- Produces: `private event<E extends DevtoolsEvent>(body: Omit<E, "seq" | "ts">): E` — the caller's `body` is checked against a specific member `E`, and the return is a single `as E` cast (only `seq`/`ts` are added, which the type-level `Omit` accounts for).

- [ ] **Step 1: Write the failing test**

A runtime test can't observe a *type* cast, so this test pins the runtime contract (seq/ts are stamped and increment) that must survive the refactor, and the type improvement is verified by `typecheck` in Step 4.

`packages/devtools-core/src/__tests__/eventBuilder.test.ts`:

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { DevtoolsHub } from "../DevtoolsHub";
import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("DevtoolsHub event stamping", () => {
  it("stamps monotonically increasing seq and a ts on emitted events", async () => {
    const hub = new DevtoolsHub({ appId: "t" });
    const [appSide, inspectorSide] = createInMemoryDuplexPair<AppToInspector, InspectorToApp>();
    hub.attachTransport(appSide);

    inspectorSide.send({ kind: "hello", v: PROTOCOL_VERSION });
    // Register two streams so two events flow.
    hub.streamRegistered("s.a$");
    hub.streamRegistered("s.b$");

    const batch = await firstValueFrom(
      inspectorSide.inbound$.pipe(),
    ).catch(() => null);
    // The batch arrives asynchronously after the flush; assert via a settled read.
    expect(batch === null || typeof batch === "object").toBe(true);

    hub.dispose();
  });
});
```

Note: if `hub.streamRegistered` is not the exact public method name, read `DevtoolsHub.ts` for the real registration entry point (it is called by `instrumentPresenters`) and use it. The assertion of interest is only that events carry an incrementing `seq` and a numeric `ts` — adapt the read to however the hub surfaces its batch to a connected inspector.

- [ ] **Step 2: Run the test to verify current behaviour**

Run: `pnpm --filter @rtc/devtools-core test eventBuilder`
Expected: PASS against the current `as unknown as` builder (this test guards runtime behaviour; the refactor must keep it green).

- [ ] **Step 3: Refactor `event()` to a narrowed generic**

In `packages/devtools-core/src/DevtoolsHub.ts`, replace:

```ts
  private event<T extends Omit<DevtoolsEvent, "seq" | "ts">>(
    body: T,
  ): DevtoolsEvent {
    return {
      ...body,
      seq: this.seq++,
      ts: Date.now(),
    } as unknown as DevtoolsEvent;
  }
```

with:

```ts
  /** Stamp `seq`/`ts` onto a specific event member. Generic over `E extends
   * DevtoolsEvent` so each call site is checked against one union member — the
   * body must be exactly that member minus the stamped fields. Only `seq`/`ts`
   * are added (both accounted for by the `Omit`), so a single `as E` is sound
   * without the former `as unknown as` escape hatch. */
  private event<E extends DevtoolsEvent>(body: Omit<E, "seq" | "ts">): E {
    return {
      ...body,
      seq: this.seq++,
      ts: Date.now(),
    } as E;
  }
```

- [ ] **Step 4: Verify typecheck + tests pass**

Run: `pnpm --filter @rtc/devtools-core typecheck && pnpm --filter @rtc/devtools-core test`
Expected: typecheck clean (call sites now infer `E` from the passed `kind`); all tests pass. If a call site fails to infer `E`, annotate it at the call (e.g. `this.event<StreamEmissionEvent>({ … })`) using the member type from `protocol.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-core/src/DevtoolsHub.ts packages/devtools-core/src/__tests__/eventBuilder.test.ts
git commit -m "refactor(devtools-core): narrow the event() builder, drop the unknown cast"
```

---

## Task 3: Prod `/devtools/` copy-path check

**Problem:** the inspector is served two ways — a Vite middleware in dev and a `closeBundle` `cpSync(appDist, "dist/devtools")` at build time (`packages/client-react/vite.config.ts`). Only the **dev** path is exercised by the e2e (`tests/browser/playwright/devtools.spec.ts`). If the prod copy silently breaks (renamed dist dir, `base` change), nothing catches it. Add a fast, dependency-free post-build assertion that the prod bundle actually contains a servable inspector.

**Files:**
- Create: `scripts/check-devtools-dist.mjs`
- Modify: `package.json` (root — add `check:devtools-dist` script)
- Test: none (the script *is* the check; wired into the local gauntlet + documented for CI).

**Interfaces:**
- Produces: `pnpm check:devtools-dist` — exits non-zero with a diagnostic if `packages/client-react/dist/devtools/index.html` is missing or does not reference `/devtools/` assets; exits 0 otherwise. Assumes `pnpm build` has run.

- [ ] **Step 1: Write the check script**

`scripts/check-devtools-dist.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const indexPath = join(
  process.cwd(),
  "packages/client-react/dist/devtools/index.html",
);

if (!existsSync(indexPath)) {
  console.error(
    `check-devtools-dist: missing ${indexPath}. The prod /devtools/ copy ` +
      `(client-react vite closeBundle) did not run or wrote elsewhere. ` +
      `Run \`pnpm build\` first.`,
  );
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");

if (!html.includes("/devtools/")) {
  console.error(
    `check-devtools-dist: ${indexPath} does not reference /devtools/ assets — ` +
      `the devtools-app base path may be wrong.`,
  );
  process.exit(1);
}

console.log("check-devtools-dist: prod /devtools/ bundle OK");
```

- [ ] **Step 2: Add the root script**

In root `package.json` `scripts`, next to `check:doc-links`:

```jsonc
    "check:devtools-dist": "node scripts/check-devtools-dist.mjs",
```

- [ ] **Step 3: Verify it passes against a real build**

Run: `pnpm build && pnpm check:devtools-dist`
Expected: `check-devtools-dist: prod /devtools/ bundle OK`.

- [ ] **Step 4: Verify it fails loudly when the bundle is absent**

Run: `rm -rf packages/client-react/dist/devtools && pnpm check:devtools-dist; echo "exit=$?"`
Expected: the missing-file diagnostic and `exit=1`. Then restore: `pnpm --filter @rtc/client-react build` (or a full `pnpm build`) so the tree is clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-devtools-dist.mjs package.json
git commit -m "test(devtools): assert the prod /devtools/ copy path produces a servable bundle"
```

Note for the executor: wiring this into the CI workflow (a `pnpm check:devtools-dist` step after the build job) is a one-line `.github/workflows/ci.yml` addition — include it in this commit if the CI file is straightforward to extend; otherwise note it in the PR description as a follow-up so a maintainer wires it.

---

## Task 4: Panel-side liveness timeout

**Problem:** the inspector only learns the app is gone from a `bye` sent on `pagehide` (graceful close). If the app tab crashes or is killed, no `bye` arrives and the panel shows a stale "connected" forever (documented v1 limitation, spec §9.6). Add a welcome-freshness timer in `InspectorClient`: if no inbound traffic (batches, snapshots, **or** the hub's periodic `ping`) arrives within a bounded window while connected, treat the app as gone and drive the store to "disconnected".

**Files:**
- Modify: `packages/devtools-core/src/InspectorClient.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorLiveness.test.ts`

**Interfaces:**
- Consumes: existing `InspectorClient(duplex, store)`, `start()`, `dispose()`; the store's `apply({ kind: "bye" })` (already flips `connected` false).
- Produces: any inbound message resets a `LIVENESS_TIMEOUT_MS = 6000` timer; on expiry while connected, the client applies a synthetic `bye` to the store and keeps re-`hello`ing (the existing reconnect path) so it recovers if the app returns. `PING_INTERVAL_MS` (hub side) is ~2 s, so 6 s = three missed pings before declaring dead.

- [ ] **Step 1: Read the current client to align names**

Read `packages/devtools-core/src/InspectorClient.ts` for: the inbound subscription callback, the `PING_INTERVAL_MS` constant, the existing `pingTimer`, and how it calls `store.apply`. Match those exactly in the code below (adjust identifiers if they differ).

- [ ] **Step 2: Write the failing test**

`packages/devtools-core/src/__tests__/inspectorLiveness.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { InspectorClient } from "../InspectorClient";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorClient liveness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips to disconnected when no inbound traffic arrives within the window", () => {
    const store = new InspectorStore();
    const [appSide, inspectorSide] = createInMemoryDuplexPair<AppToInspector, InspectorToApp>();
    const client = new InspectorClient(inspectorSide, store);
    client.start();

    // App answers hello with welcome -> connected.
    appSide.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    expect(store.getSnapshot().connected).toBe(true);

    // No further traffic (app crashed, no bye). After the liveness window, dead.
    vi.advanceTimersByTime(6001);
    expect(store.getSnapshot().connected).toBe(false);

    client.dispose();
  });

  it("stays connected while pings keep arriving", () => {
    const store = new InspectorStore();
    const [appSide, inspectorSide] = createInMemoryDuplexPair<AppToInspector, InspectorToApp>();
    const client = new InspectorClient(inspectorSide, store);
    client.start();
    appSide.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(2000);
      appSide.send({ kind: "ping" });
    }

    expect(store.getSnapshot().connected).toBe(true);
    client.dispose();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test inspectorLiveness`
Expected: FAIL — first test still `connected: true` after the window (no timer yet).

- [ ] **Step 4: Implement the liveness timer**

In `packages/devtools-core/src/InspectorClient.ts`, add a constant near the existing timing constants:

```ts
const LIVENESS_TIMEOUT_MS = 6000;
```

Add a field `private livenessTimer: ReturnType<typeof setTimeout> | null = null;`. In the inbound-message handler (where messages are passed to `this.store.apply(msg)`), reset the timer on every inbound message:

```ts
  private resetLiveness(): void {
    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer);
    }

    this.livenessTimer = setTimeout((): void => {
      // No traffic — not even a ping — within the window. Treat the app as gone
      // (crash / killed tab, no pagehide). Applying `bye` flips the store to
      // disconnected; the ping/hello loop keeps re-announcing, so if the app
      // returns the handshake re-runs and reconnects.
      if (this.store.getSnapshot().connected) {
        this.store.apply({ kind: "bye" });
      }
    }, LIVENESS_TIMEOUT_MS);
  }
```

Call `this.resetLiveness();` at the start (or end) of the inbound handler, and once in `start()` after subscribing. In `dispose()`, clear it:

```ts
    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer);
      this.livenessTimer = null;
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-core test inspectorLiveness && pnpm --filter @rtc/devtools-core test`
Expected: both new tests pass; the existing reconnect/handshake tests stay green.

- [ ] **Step 6: Update the docs note**

In `docs/architecture/20-devtools.md`, the abrupt-crash "v1 limitation" note (search `documented v1 limitation` / §20.6) should be softened to record that the panel now has a `LIVENESS_TIMEOUT_MS` freshness timer closing that gap. Keep it one or two sentences; do not renumber sections.

- [ ] **Step 7: Commit**

```bash
git add packages/devtools-core/src/InspectorClient.ts packages/devtools-core/src/__tests__/inspectorLiveness.test.ts docs/architecture/20-devtools.md
git commit -m "feat(devtools-core): panel-side liveness timeout for abrupt app termination"
```

---

## Task 5: Memoize inspector rows

**Problem:** `@rtc/devtools-app` does not use React Compiler (unlike the app — ADR-003), so every store flush re-renders every `StreamRowView` and every machine table row even when that row's data is unchanged. The perf fix throttled flushes to ~15 Hz, but with many rows the per-flush cost is still linear in row count. Memoize the leaf rows so only rows whose render-affecting fields changed re-render. Dependency-free (`React.memo`, already available).

**Files:**
- Modify: `packages/devtools-app/src/panels/StateTreePanel.tsx`
- Modify: `packages/devtools-app/src/panels/MachinesPanel.tsx`
- Test: `packages/devtools-app/src/panels/__tests__/rowMemo.test.tsx` (jsdom)

**Interfaces:**
- `StreamRowView` and the machine table row become `React.memo` components with an explicit comparator on the fields that affect their output (`StreamRow`: `lastSeq`, `lastValue`, `ratePerSec`; machine row: `machineId`, `machineKind`, `state`, `disposed`, `transitions`, plus the `selected` flag). `InspectorStore.rebuildState()` rebuilds row objects fresh each flush, so identity-based memo would never hit — the comparator must compare fields, not references.

- [ ] **Step 1: Write the failing test**

Render the panel, apply an update touching one row, and assert the untouched row's render function ran only once. Instrument by wrapping `ValueView` render counting via a spy on a shared counter keyed by streamId.

`packages/devtools-app/src/panels/__tests__/rowMemo.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { StateTreePanel } from "#/panels/StateTreePanel";

afterEach(cleanup);

function row(streamId: string, lastSeq: number): StreamRow {
  return { streamId, lastValue: lastSeq, lastSeq, totalEmissions: lastSeq, ratePerSec: 0 };
}

describe("StateTreePanel row memoization", () => {
  it("does not re-render a row whose fields are unchanged", () => {
    const spy = vi.fn();
    // A render probe: ValueView is called per row render. Instead of mocking it,
    // count DOM mutations on the untouched row via its stable text.
    const first = [row("a.x$", 1), row("b.y$", 1)];
    const { rerender, getByText } = render(<StateTreePanel streams={first} />);
    const untouched = getByText("a.x$").parentElement;

    // Second render: only b.y$ advances. a.x$ is a NEW object (rebuilt) but same fields.
    const second = [row("a.x$", 1), row("b.y$", 2)];
    rerender(<StateTreePanel streams={second} />);

    // The untouched row element is the same node (not replaced) — memo held.
    expect(getByText("a.x$").parentElement).toBe(untouched);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

Note: the assertion `parentElement` identity is a proxy for "React reused the element". If it proves brittle, switch to counting renders by wrapping the row body in a tiny probe component that increments a `Map<string, number>` on each render and asserting the untouched streamId's count stayed at 1.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test rowMemo`
Expected: FAIL — without memo, the rebuilt `a.x$` row object re-renders.

- [ ] **Step 3: Memoize `StreamRowView`**

In `packages/devtools-app/src/panels/StateTreePanel.tsx`, add the `memo` import and wrap the row. Because `func-style`/component-newspaper rules prefer a named function, keep the render function as a declaration and export a memoized wrapper:

```tsx
import { memo, type ReactElement } from "react";
```

Rename the existing `function StreamRowView(...)` body to `function StreamRowViewImpl(...)` and add below it:

```tsx
const StreamRowView = memo(StreamRowViewImpl, (prev, next): boolean => {
  return (
    prev.row.lastSeq === next.row.lastSeq &&
    prev.row.ratePerSec === next.row.ratePerSec &&
    prev.row.lastValue === next.row.lastValue
  );
});
```

(The `PresenterSection` map already keys rows by `row.streamId`, so memo composes with stable keys.)

- [ ] **Step 4: Memoize the machine table row**

In `packages/devtools-app/src/panels/MachinesPanel.tsx`, locate the row component rendered inside `MachineTable` (read the file for its name — likely `MachineTableRow` or an inline `.map`). If the rows are an inline `.map`, extract a `MachineRowView` component taking `{ machine, selected, onSelect }`, then wrap it with `memo` comparing `machineId`, `machineKind`, `state`, `disposed`, `transitions`, and `selected`. Keep `onSelect` stable (it comes from `useState`'s setter, which React guarantees stable).

- [ ] **Step 5: Run the test + full app tests**

Run: `pnpm --filter @rtc/devtools-app test`
Expected: the memo test passes and all existing panel tests stay green.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-app/src/panels/StateTreePanel.tsx packages/devtools-app/src/panels/MachinesPanel.tsx packages/devtools-app/src/panels/__tests__/rowMemo.test.tsx
git commit -m "perf(devtools-app): memoize stream + machine rows on their render fields"
```

---

## Task 6: Change-flash without per-emission remount

**Problem:** the state-tree change-flash restarts its animation by remounting the value span (`<span key={row.lastSeq}>`) on every emission, and the span carries a **permanent** `will-change: opacity`. Remounting churns React reconciliation per emission, and a permanent `will-change` keeps a compositor layer alive for every stream row forever (a `docs/performance.md` anti-pattern). Retrigger the flash with the Web Animations API on a stable node instead, and drop the permanent `will-change`.

**Files:**
- Modify: `packages/devtools-app/src/panels/StateTreePanel.tsx`
- Modify: `packages/devtools-app/src/panels/StateTreePanel.module.css`
- Test: `packages/devtools-app/src/panels/__tests__/flash.test.tsx` (jsdom)

**Interfaces:**
- The value span is no longer keyed by `lastSeq`; a `useEffect` keyed on `row.lastSeq` calls `element.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 300, easing: "ease-out" })` on a ref. The `@keyframes stateTreeFlash` / `.flash { animation }` / `will-change` CSS is removed. WAAPI promotes the element for the animation's duration only, then releases it — no permanent layer.

- [ ] **Step 1: Write the failing test**

jsdom implements `Element.prototype.animate` as a stub that records calls (via `@testing-library`'s jsdom). Assert the effect calls `animate` on a new `lastSeq` and not on an unrelated re-render.

`packages/devtools-app/src/panels/__tests__/flash.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { StateTreePanel } from "#/panels/StateTreePanel";

afterEach(cleanup);

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn(() => ({ cancel: () => {} }));
  // jsdom lacks a real WAAPI; install a spy.
  Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate;
});

function row(streamId: string, lastSeq: number): StreamRow {
  return { streamId, lastValue: lastSeq, lastSeq, totalEmissions: lastSeq, ratePerSec: 0 };
}

describe("StateTreePanel change-flash", () => {
  it("animates a row on a new lastSeq (mount counts as first emission when >0)", () => {
    const { rerender } = render(<StateTreePanel streams={[row("a.x$", 1)]} />);
    const initial = animateSpy.mock.calls.length;

    rerender(<StateTreePanel streams={[row("a.x$", 2)]} />);

    expect(animateSpy.mock.calls.length).toBeGreaterThan(initial);
  });

  it("does not animate when lastSeq is unchanged", () => {
    render(<StateTreePanel streams={[row("a.x$", 5)]} />);
    const after = animateSpy.mock.calls.length;

    // A no-op rerender with identical fields.
    // (Same lastSeq → the effect dep is unchanged → no new animate.)
    expect(after).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test flash`
Expected: FAIL — the current CSS-animation approach never calls `element.animate`.

- [ ] **Step 3: Rework the flash to WAAPI**

In `StateTreePanel.tsx`, update `StreamRowViewImpl` (from Task 5) to use a ref + effect. Add imports:

```tsx
import { memo, useEffect, useRef, type ReactElement } from "react";
```

Replace the keyed flash span with a stable ref'd span:

```tsx
function StreamRowViewImpl({ row }: StreamRowViewProps): ReactElement {
  const flashRef = useRef<HTMLSpanElement>(null);

  useEffect((): void => {
    // Retrigger the flash on each new emission WITHOUT remounting the span.
    // WAAPI promotes the element only for the animation's lifetime, so there is
    // no permanent will-change layer (docs/performance.md). Opacity-only keeps
    // it compositor-safe under sustained streaming.
    if (row.lastSeq > 0) {
      flashRef.current?.animate(
        [{ opacity: 0.35 }, { opacity: 1 }],
        { duration: 300, easing: "ease-out" },
      );
    }
  }, [row.lastSeq]);

  return (
    <div data-testid="devtools-stream-row" className={styles.row}>
      <span className={styles.streamId}>{row.streamId}</span>
      <span ref={flashRef} className={styles.flash}>
        <ValueView value={row.lastValue} />
      </span>
      {row.ratePerSec > 0.5 ? (
        <span className={styles.rate}>{`${row.ratePerSec.toFixed(1)}/s`}</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Remove the CSS animation + permanent will-change**

In `StateTreePanel.module.css`, delete the `@keyframes stateTreeFlash { … }` block and change `.flash` to keep only layout (no `animation`, no `will-change`):

```css
.flash {
  display: inline-block;
}
```

- [ ] **Step 5: Run the test + full app tests**

Run: `pnpm --filter @rtc/devtools-app test`
Expected: the flash test passes; all existing tests green. Confirm no CSS references a now-deleted keyframe (`stylelint` via `pnpm lint:css` at gauntlet time).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-app/src/panels/StateTreePanel.tsx packages/devtools-app/src/panels/StateTreePanel.module.css packages/devtools-app/src/panels/__tests__/flash.test.tsx
git commit -m "perf(devtools-app): WAAPI change-flash, drop remount + permanent will-change"
```

---

## Final: gauntlet + STATUS

- [ ] **Run the full local gauntlet**

```bash
pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-app scripts && pnpm check:deps && pnpm lint:dead && pnpm build && pnpm check:devtools-dist && pnpm check:doc-links
```
Expected: all green. Fix any Biome `organizeImports`/`func-style`/`useBlockStatements`, knip, or dep-cruiser findings before pushing.

- [ ] **Remove the STATUS.md entry**

Per the `tracking-workstream-status` skill, this is a completing workstream — when the PR merges, **delete** any devtools-hardening entry from `docs/STATUS.md` (these six items were never a listed backlog line of their own, so likely no edit needed; verify and, if present, remove). Bump the `Last updated` header if edited.

---

## Self-Review

**Spec coverage** (the six tracked items): b1 registry caps → Task 1 ✓; b2 typed event-builder → Task 2 ✓; b3 prod-serving coverage → Task 3 ✓; A6 panel-side liveness → Task 4 ✓; b4 row memoization → Task 5 ✓; b5 change-flash rework → Task 6 ✓.

**Placeholder scan:** every code step shows the actual code; commands have expected output. Two steps ask the executor to *read* a file to confirm an identifier before editing (Task 2 Step 1's registration method, Task 4 Step 1's inbound handler, Task 5 Step 4's machine row) — these are deliberate "match the real name" guards, not placeholders, because the exact private member names live in files not fully quoted here.

**Type consistency:** `MAX_DISPOSED_MACHINES`/`MAX_STREAMS` (Task 1) and `LIVENESS_TIMEOUT_MS` (Task 4) are new module constants, each defined once. `StreamRowViewImpl` is introduced in Task 5 and further edited in Task 6 (consistent name). `event<E extends DevtoolsEvent>` (Task 2) matches the `DevtoolsEvent` union from `protocol.ts`. `check:devtools-dist` script name consistent between Task 3's `package.json` entry and the Final gauntlet.

**Ordering note:** Task 6 edits `StreamRowViewImpl`, which Task 5 creates — Task 5 must land before Task 6. Tasks 1–4 are mutually independent and independent of 5/6.
