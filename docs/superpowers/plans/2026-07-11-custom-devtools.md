# RTC DevTools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Observe-only custom devtools for the RxJS state layer: two new packages (`@rtc/devtools-core` instrumentation + `@rtc/devtools-app` inspector UI) wired to the web client via composition-root decorators, connected over BroadcastChannel, shipping dormant in production.

**Architecture:** Decorators at the `client-react` composition call site register presenter streams, machine lifecycles, and WS traffic with a `DevtoolsHub`. The hub is dormant (subscribed to nothing) until an inspector handshakes over a `DevtoolsTransport`; then it subscribes, coalesces at ~30 Hz, and streams a snapshot + ordered deltas. The inspector app renders four panels from an `InspectorStore` fed by the same protocol.

**Tech Stack:** TypeScript, RxJS, React 19, Vite, CSS Modules, Vitest, RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-11-custom-devtools-design.md` — read it first.

**Refinements vs the spec** (implementation-driven; Task 11 amends the spec file):

1. **Same-origin serving.** BroadcastChannel is same-origin, so the spec §3 "second Vite dev server" cannot connect. Instead the panel is served *through the app's origin*: a client-react Vite middleware serves the built panel at `/devtools` in dev, and the build copies it into `client-react/dist/devtools` for deploy. Panel-only UI iteration still uses the panel's own Vite server (disconnected mode).
2. **Dormancy = not subscribed** (stronger than spec §4's `if (!hub.live) return;`). Decorators *register* observables with the hub; the hub subscribes only while an inspector is attached. Dormant per-emission cost is literally zero — no extra subscriber exists. Registry writes (stream registered, machine created/disposed) still happen while dormant so the attach snapshot is complete; those are rare, O(1) map writes.
3. **Protocol trims:** `subscribe {filters}` dropped from v1 (panel filters client-side); protocol version rides `hello`/`welcome` only, not every event; transport port drops `status$` (the hub derives liveness from `hello`/`ping`/`bye` + a 10 s heartbeat timeout).

## Global Constraints

- Follow `.claude/skills/shipping-repo-changes` — worktree first, PR + CI green (read CI via `gh run list`, never `gh pr checks`), merge commit, cleanup.
- `@rtc/devtools-core` runtime deps: **rxjs only** (same constraint as domain/ws-effects). `@rtc/devtools-core` must not import any `@rtc/*` package — it decorates by structural shape. `@rtc/devtools-app` imports only `@rtc/devtools-core` (+ react); never `client-core`/`domain`.
- **The tap must never hurt the app:** every decorator/hub callback that touches app values wraps its body in try/catch → `hub.reportError(...)`; a wrapped intent/method always delegates even if logging throws.
- Serializer caps (exact): depth ≤ 6, arrays/object-keys ≤ 50 entries (`{$t:"truncated"}` marker), strings ≤ 500 chars. Flush cadence 33 ms. Ring buffer 10 000 events. Heartbeat: inspector pings every 2 000 ms; hub detaches after 10 000 ms silence. Disposed-machine retention cap: 500.
- BroadcastChannel name is exactly `rtc-devtools`. Panel route/base is exactly `/devtools/`. Panel dev port 5280.
- Biome zero findings, no suppressions; mandatory braces; no inline `style={{…}}` in React (CSS Modules; `--custom-property` writes are the only opt-out); no `≥2-up` relative imports (use each package's `#/*` alias).
- Gates on package ADD (both new packages): knip workspace entry, dep-cruiser rules, standard scripts (`build`/`typecheck`/`test`/`clean`/`clean:deep`) so `check:scripts` passes.
- Run the FULL gauntlet per task: `pnpm check && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm typecheck && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links`.
- Commit after every green step; frequent small commits.

---

### Task 1: `@rtc/devtools-core` package scaffold + protocol types + serializer

**Files:**
- Create: `packages/devtools-core/package.json`
- Create: `packages/devtools-core/tsconfig.json` (copy `packages/ws-effects/tsconfig.json` verbatim; adjust only if it names the package)
- Create: `packages/devtools-core/vitest.config.ts` if ws-effects has one (`ls packages/ws-effects` and mirror whatever config files exist there)
- Create: `packages/devtools-core/src/index.ts`
- Create: `packages/devtools-core/src/protocol.ts`
- Create: `packages/devtools-core/src/serialize.ts`
- Test: `packages/devtools-core/src/__tests__/serialize.test.ts`
- Modify: `knip.json` (add workspace entry)
- Modify: `.dependency-cruiser.cjs` (add purity rules)

**Interfaces (produced — later tasks rely on these exact names):**
- `PROTOCOL_VERSION = 1`
- `SerializedValue`, `serializeValue(value: unknown): SerializedValue`
- `DevtoolsEvent` (discriminated union on `kind`), `AppToInspector`, `InspectorToApp`
- `PresenterManifest`, `PresenterManifestEntry`

- [ ] **Step 1: Scaffold the package**

`packages/devtools-core/package.json`:

```json
{
  "name": "@rtc/devtools-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "tsc-alias": "1.9.0",
    "vitest": "^4"
  }
}
```

Copy `tsconfig.json` (and any vitest config) from `packages/ws-effects/`. Run `pnpm install` (workspace glob picks the package up automatically), then `pnpm check:scripts` — expect PASS.

- [ ] **Step 2: knip + dep-cruiser gates**

`knip.json`, inside `"workspaces"`:

```json
"packages/devtools-core": {
  "entry": "src/index.ts",
  "project": "src/**/*.ts"
}
```

`.dependency-cruiser.cjs`, append to `forbidden` (mirror the `domain-stays-pure` / `domain-no-node-builtins` shapes):

```js
{
  name: "devtools-core-stays-pure",
  severity: "error",
  comment:
    "@rtc/devtools-core decorates by structural shape — it must not import any @rtc package.",
  from: { path: "^packages/devtools-core/src" },
  to: { path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|server|ws-effects|devtools-app)/" },
},
{
  name: "devtools-core-no-node-builtins",
  severity: "error",
  comment: "@rtc/devtools-core must run in any JS environment.",
  from: {
    path: "^packages/devtools-core/src",
    pathNot: "(\\.test\\.ts$|/__tests__/)",
  },
  to: { dependencyTypes: ["core"] },
},
```

- [ ] **Step 3: Write the protocol types** (`src/protocol.ts`)

```ts
import type { SerializedValue } from "./serialize";

export const PROTOCOL_VERSION = 1;

interface EventBase {
  /** Monotonic per-hub sequence number. */
  seq: number;
  /** Epoch ms at capture. */
  ts: number;
}

export type DevtoolsEvent =
  | (EventBase & { kind: "stream:registered"; streamId: string })
  | (EventBase & {
      kind: "stream:emission";
      streamId: string;
      value: SerializedValue;
      /** Emissions coalesced into this event within the flush window (≥1). */
      coalesced: number;
    })
  | (EventBase & {
      kind: "machine:created";
      machineId: string;
      machineKind: string;
      args: SerializedValue;
    })
  | (EventBase & {
      kind: "machine:state";
      machineId: string;
      state: SerializedValue;
      coalesced: number;
    })
  | (EventBase & {
      kind: "machine:intent";
      machineId: string;
      name: string;
      args: SerializedValue;
    })
  | (EventBase & { kind: "machine:disposed"; machineId: string })
  | (EventBase & {
      kind: "wire:in" | "wire:out";
      msgType: string;
      payload: SerializedValue;
    })
  | (EventBase & { kind: "devtools:error"; context: string; message: string });

export interface SnapshotStream {
  streamId: string;
  value: SerializedValue | null;
}

export interface SnapshotMachine {
  machineId: string;
  machineKind: string;
  args: SerializedValue;
  state: SerializedValue | null;
  disposed: boolean;
  createdAt: number;
}

export type AppToInspector =
  | { kind: "welcome"; v: number; appId: string }
  | {
      kind: "snapshot";
      streams: readonly SnapshotStream[];
      machines: readonly SnapshotMachine[];
    }
  | { kind: "batch"; events: readonly DevtoolsEvent[] }
  | { kind: "bye" };

export type InspectorToApp =
  | { kind: "hello"; v: number }
  | { kind: "ping" }
  | { kind: "bye" };

/** Which members of a presenter the instrumentation should register.
 * `props` — observable-valued properties (e.g. blotter `trades$`).
 * `methods` — parameterized stream methods (e.g. priceStream `price$(pair)`);
 * each distinct arg tuple registers a child stream on first call.
 * `machine` — the entry is a shared Machine (state$ registered, intents logged). */
export interface PresenterManifestEntry {
  props?: readonly string[];
  methods?: readonly string[];
  machine?: boolean;
}

export type PresenterManifest = Record<string, PresenterManifestEntry>;
```

- [ ] **Step 4: Write the failing serializer tests** (`src/__tests__/serialize.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import { serializeValue } from "../serialize";

describe("serializeValue", () => {
  it("passes JSON primitives and plain shapes through", () => {
    expect(serializeValue(42)).toBe(42);
    expect(serializeValue("hi")).toBe("hi");
    expect(serializeValue(null)).toBe(null);
    expect(serializeValue({ a: [1, "x"] })).toEqual({ a: [1, "x"] });
  });

  it("tags non-JSON shapes", () => {
    expect(serializeValue(undefined)).toEqual({ $t: "undefined" });
    expect(serializeValue(() => {})).toMatchObject({ $t: "fn" });
    expect(serializeValue(Number.NaN)).toEqual({ $t: "num", v: "NaN" });
    expect(serializeValue(new Map([["k", 1]]))).toEqual({
      $t: "map",
      entries: [["k", 1]],
    });
    expect(serializeValue(new Set([1, 2]))).toEqual({
      $t: "set",
      values: [1, 2],
    });
  });

  it("caps depth at 6", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    const out = serializeValue(deep) as Record<string, never>;
    expect(JSON.stringify(out)).toContain('"$t":"depth"');
  });

  it("truncates arrays at 50 and strings at 500", () => {
    const arr = serializeValue(Array.from({ length: 60 }, (_, i) => i));
    expect(Array.isArray(arr) && arr.length).toBe(51); // 50 + truncation marker
    expect((arr as unknown[])[50]).toEqual({ $t: "truncated", count: 10 });
    const s = serializeValue("x".repeat(600)) as { $t: string; count: number };
    expect(s).toMatchObject({ $t: "truncated-string", count: 100 });
  });

  it("marks circular references instead of throwing", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(serializeValue(o)).toEqual({ self: { $t: "circular" } });
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-core test`
Expected: FAIL — `serialize` module not found.

- [ ] **Step 6: Implement the serializer** (`src/serialize.ts`)

```ts
const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;
const MAX_STRING = 500;

export type SerializedValue =
  | null
  | boolean
  | number
  | string
  | SerializedValue[]
  | { [key: string]: SerializedValue };

/** JSON-safe, size-capped projection of an arbitrary runtime value. Tagged
 * objects ({$t: ...}) encode the shapes JSON can't: undefined, functions,
 * Map/Set, NaN/Infinity, truncations, depth cuts, and circular references.
 * Never throws — the worst case is a {$t:"error"} node. */
export function serializeValue(value: unknown): SerializedValue {
  return walk(value, 0, new WeakSet());
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): SerializedValue {
  try {
    if (value === null) {
      return null;
    }
    if (value === undefined) {
      return { $t: "undefined" };
    }
    const t = typeof value;
    if (t === "boolean") {
      return value as boolean;
    }
    if (t === "number") {
      return Number.isFinite(value as number)
        ? (value as number)
        : { $t: "num", v: String(value) };
    }
    if (t === "bigint" || t === "symbol") {
      return { $t: t, v: String(value) };
    }
    if (t === "string") {
      const s = value as string;
      return s.length <= MAX_STRING
        ? s
        : { $t: "truncated-string", head: s.slice(0, MAX_STRING), count: s.length - MAX_STRING };
    }
    if (t === "function") {
      return { $t: "fn", name: (value as { name?: string }).name ?? "" };
    }
    // objects from here on
    const obj = value as object;
    if (seen.has(obj)) {
      return { $t: "circular" };
    }
    if (depth >= MAX_DEPTH) {
      return { $t: "depth" };
    }
    seen.add(obj);
    try {
      if (Array.isArray(obj)) {
        const out: SerializedValue[] = obj
          .slice(0, MAX_ENTRIES)
          .map((v) => walk(v, depth + 1, seen));
        if (obj.length > MAX_ENTRIES) {
          out.push({ $t: "truncated", count: obj.length - MAX_ENTRIES });
        }
        return out;
      }
      if (obj instanceof Map) {
        const entries: SerializedValue[] = [];
        let i = 0;
        for (const [k, v] of obj) {
          if (i >= MAX_ENTRIES) {
            entries.push({ $t: "truncated", count: obj.size - MAX_ENTRIES });
            break;
          }
          entries.push([walk(k, depth + 1, seen), walk(v, depth + 1, seen)]);
          i += 1;
        }
        return { $t: "map", entries };
      }
      if (obj instanceof Set) {
        const values: SerializedValue[] = [];
        let i = 0;
        for (const v of obj) {
          if (i >= MAX_ENTRIES) {
            values.push({ $t: "truncated", count: obj.size - MAX_ENTRIES });
            break;
          }
          values.push(walk(v, depth + 1, seen));
          i += 1;
        }
        return { $t: "set", values };
      }
      const out: { [key: string]: SerializedValue } = {};
      const keys = Object.keys(obj);
      for (const key of keys.slice(0, MAX_ENTRIES)) {
        out[key] = walk((obj as Record<string, unknown>)[key], depth + 1, seen);
      }
      if (keys.length > MAX_ENTRIES) {
        out.$truncatedKeys = { $t: "truncated", count: keys.length - MAX_ENTRIES };
      }
      return out;
    } finally {
      seen.delete(obj);
    }
  } catch (error) {
    return { $t: "error", message: String(error) };
  }
}
```

Note: the `truncated-string` test in Step 4 expects `{ $t, head, count }` — `toMatchObject` covers it.

- [ ] **Step 7: Barrel** (`src/index.ts`)

```ts
export * from "./protocol";
export { type SerializedValue, serializeValue } from "./serialize";
```

- [ ] **Step 8: Run tests + gauntlet, commit**

Run: `pnpm --filter @rtc/devtools-core test` → PASS; full gauntlet → green.

```bash
git add packages/devtools-core knip.json .dependency-cruiser.cjs pnpm-lock.yaml
git commit -m "feat(devtools-core): package scaffold, wire protocol, capped serializer"
```

---

### Task 2: DevtoolsHub — registry, dormancy, coalescing flush, snapshot, heartbeat

**Files:**
- Create: `packages/devtools-core/src/hub.ts`
- Create: `packages/devtools-core/src/transport.ts` (interface only in this task)
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/hub.test.ts`

**Interfaces:**
- Consumes: `serializeValue`, protocol types (Task 1).
- Produces: `DevtoolsTransport { send(msg: AppToInspector): void; inbound$: Observable<InspectorToApp>; dispose(): void }`; `DevtoolsHub` with `live: boolean` (getter), `attachTransport(t)`, `registerStream(streamId, source$)`, `machineCreated(kind, args, state$): string`, `machineIntent(id, name, args)`, `machineDisposed(id)`, `wireIn(msgType, payload)`, `wireOut(msgType, payload)`, `reportError(context, error)`, `dispose()`. Constructor: `new DevtoolsHub({ appId?: string, flushIntervalMs?: number, heartbeatTimeoutMs?: number, ringBufferSize?: number })`.

- [ ] **Step 1: Write the failing tests** (fake timers)

```ts
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../hub";
import type { AppToInspector, InspectorToApp } from "../protocol";

function harness() {
  const sent: AppToInspector[] = [];
  const inbound$ = new Subject<InspectorToApp>();
  const hub = new DevtoolsHub({ appId: "test-app" });
  hub.attachTransport({
    send: (m) => {
      sent.push(m);
    },
    inbound$,
    dispose: () => {},
  });
  return { hub, sent, inbound$ };
}

describe("DevtoolsHub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is dormant until hello: no subscription on registered sources", () => {
    const { hub, sent, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("a.b$", source$);
    expect(source$.observed).toBe(false);
    source$.next(1); // no inspector — must cost nothing, buffer nothing
    expect(sent).toEqual([]);
    inbound$.next({ kind: "hello", v: 1 });
    expect(source$.observed).toBe(true);
    expect(sent[0]).toMatchObject({ kind: "welcome", appId: "test-app" });
    expect(sent[1]).toMatchObject({ kind: "snapshot" });
  });

  it("coalesces per-stream within a flush window and counts emissions", () => {
    const { hub, sent, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("prices.EURUSD", source$);
    inbound$.next({ kind: "hello", v: 1 });
    source$.next(1);
    source$.next(2);
    source$.next(3);
    vi.advanceTimersByTime(40); // past one 33ms flush
    const batch = sent.findLast((m) => m.kind === "batch");
    expect(batch).toBeDefined();
    const ev = (batch as { events: readonly unknown[] }).events[0];
    expect(ev).toMatchObject({
      kind: "stream:emission",
      streamId: "prices.EURUSD",
      value: 3,
      coalesced: 3,
    });
  });

  it("snapshot includes machines created while dormant, with warm state", () => {
    const { hub, sent, inbound$ } = harness();
    const state$ = new Subject<string>();
    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);
    inbound$.next({ kind: "hello", v: 1 });
    const snap = sent.find((m) => m.kind === "snapshot") as {
      machines: readonly { machineId: string; machineKind: string }[];
    };
    expect(snap.machines[0]).toMatchObject({
      machineId: id,
      machineKind: "tileExecution",
      disposed: false,
    });
  });

  it("goes dormant on bye and on heartbeat timeout", () => {
    const { hub, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("s", source$);
    inbound$.next({ kind: "hello", v: 1 });
    expect(hub.live).toBe(true);
    inbound$.next({ kind: "bye" });
    expect(hub.live).toBe(false);
    expect(source$.observed).toBe(false);
    inbound$.next({ kind: "hello", v: 1 });
    vi.advanceTimersByTime(10_100); // no pings → timeout
    expect(hub.live).toBe(false);
  });

  it("intent and wire events are dropped while dormant, queued while live", () => {
    const { hub, sent, inbound$ } = harness();
    hub.wireOut("subscribe_prices", { symbol: "EURUSD" });
    expect(sent).toEqual([]);
    inbound$.next({ kind: "hello", v: 1 });
    hub.wireIn("price_tick", { mid: 1.1 });
    vi.advanceTimersByTime(40);
    const batch = sent.findLast((m) => m.kind === "batch");
    expect((batch as { events: readonly { kind: string }[] }).events[0]).toMatchObject({
      kind: "wire:in",
      msgType: "price_tick",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/devtools-core test` → FAIL (`hub` not found).

- [ ] **Step 3: Implement** `src/transport.ts`:

```ts
import type { Observable } from "rxjs";

import type { AppToInspector, InspectorToApp } from "./protocol";

/** App-side transport port. The hub derives liveness from hello/ping/bye —
 * no status$ needed. Adapters: BroadcastChannel (Task 3), WebSocket relay (future). */
export interface DevtoolsTransport {
  send(msg: AppToInspector): void;
  inbound$: Observable<InspectorToApp>;
  dispose(): void;
}
```

- [ ] **Step 4: Implement** `src/hub.ts`. Complete implementation:

```ts
import type { Observable, Subscription } from "rxjs";

import type {
  AppToInspector,
  DevtoolsEvent,
  SnapshotMachine,
  SnapshotStream,
} from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";
import { serializeValue } from "./serialize";
import type { DevtoolsTransport } from "./transport";

export interface DevtoolsHubOptions {
  appId?: string;
  flushIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  ringBufferSize?: number;
}

interface StreamEntry {
  source$: Observable<unknown>;
  sub: Subscription | null;
}

interface MachineEntry {
  machineKind: string;
  args: readonly unknown[];
  state$: Observable<unknown>;
  sub: Subscription | null;
  lastState: unknown;
  hasState: boolean;
  disposed: boolean;
  createdAt: number;
}

interface Pending {
  value: unknown;
  count: number;
}

const MAX_DISPOSED_RETAINED = 500;

/** Central collector. Dormant = subscribed to nothing; registries only.
 * Live (after an inspector hello) = subscribed to every registered stream and
 * live machine state$, coalescing into 33ms batches. All app-facing entry
 * points are exception-safe: a devtools failure must never reach the app. */
export class DevtoolsHub {
  private readonly appId: string;
  private readonly flushIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly ringBufferSize: number;

  private transport: DevtoolsTransport | null = null;
  private transportSub: Subscription | null = null;

  private readonly streams = new Map<string, StreamEntry>();
  private readonly machines = new Map<string, MachineEntry>();
  private disposedOrder: string[] = [];
  private nextMachineId = 1;

  private isLive = false;
  private seq = 0;
  private lastPingAt = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private pendingStreams = new Map<string, Pending>();
  private pendingMachineStates = new Map<string, Pending>();
  private pendingDiscrete: DevtoolsEvent[] = [];
  private readonly ring: DevtoolsEvent[] = [];

  constructor(options: DevtoolsHubOptions = {}) {
    this.appId = options.appId ?? "rtc";
    this.flushIntervalMs = options.flushIntervalMs ?? 33;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000;
    this.ringBufferSize = options.ringBufferSize ?? 10_000;
  }

  get live(): boolean {
    return this.isLive;
  }

  attachTransport(transport: DevtoolsTransport): void {
    this.transport = transport;
    this.transportSub = transport.inbound$.subscribe((msg) => {
      try {
        if (msg.kind === "hello") {
          this.goLive();
        } else if (msg.kind === "ping") {
          this.lastPingAt = Date.now();
        } else if (msg.kind === "bye") {
          this.goDormant();
        }
      } catch (error) {
        this.reportError("transport.inbound", error);
      }
    });
  }

  registerStream(streamId: string, source$: Observable<unknown>): void {
    if (this.streams.has(streamId)) {
      return;
    }
    const entry: StreamEntry = { source$, sub: null };
    this.streams.set(streamId, entry);
    if (this.isLive) {
      this.pendingDiscrete.push(this.event({ kind: "stream:registered", streamId }));
      this.subscribeStream(streamId, entry);
    }
  }

  machineCreated(
    machineKind: string,
    args: readonly unknown[],
    state$: Observable<unknown>,
  ): string {
    const machineId = `m${this.nextMachineId++}`;
    const entry: MachineEntry = {
      machineKind,
      args,
      state$,
      sub: null,
      lastState: undefined,
      hasState: false,
      disposed: false,
      createdAt: Date.now(),
    };
    this.machines.set(machineId, entry);
    if (this.isLive) {
      this.pendingDiscrete.push(
        this.event({
          kind: "machine:created",
          machineId,
          machineKind,
          args: serializeValue(args),
        }),
      );
      this.subscribeMachine(machineId, entry);
    }
    return machineId;
  }

  machineIntent(machineId: string, name: string, args: readonly unknown[]): void {
    if (!this.isLive) {
      return;
    }
    this.pendingDiscrete.push(
      this.event({ kind: "machine:intent", machineId, name, args: serializeValue(args) }),
    );
  }

  machineDisposed(machineId: string): void {
    const entry = this.machines.get(machineId);
    if (!entry || entry.disposed) {
      return;
    }
    entry.disposed = true;
    entry.sub?.unsubscribe();
    entry.sub = null;
    this.disposedOrder.push(machineId);
    if (this.disposedOrder.length > MAX_DISPOSED_RETAINED) {
      const evict = this.disposedOrder.shift();
      if (evict !== undefined) {
        this.machines.delete(evict);
      }
    }
    if (this.isLive) {
      this.pendingDiscrete.push(this.event({ kind: "machine:disposed", machineId }));
    }
  }

  wireIn(msgType: string, payload: unknown): void {
    this.wire("wire:in", msgType, payload);
  }

  wireOut(msgType: string, payload: unknown): void {
    this.wire("wire:out", msgType, payload);
  }

  reportError(context: string, error: unknown): void {
    if (!this.isLive) {
      return;
    }
    try {
      this.pendingDiscrete.push(
        this.event({ kind: "devtools:error", context, message: String(error) }),
      );
    } catch {
      // deliberately unreachable-in-practice; never rethrow toward the app
    }
  }

  dispose(): void {
    this.goDormant();
    this.transportSub?.unsubscribe();
    this.transport?.dispose();
    this.transport = null;
  }

  private wire(kind: "wire:in" | "wire:out", msgType: string, payload: unknown): void {
    if (!this.isLive) {
      return;
    }
    try {
      this.pendingDiscrete.push(
        this.event({ kind, msgType, payload: serializeValue(payload) }),
      );
    } catch (error) {
      this.reportError("wire", error);
    }
  }

  private event<T extends Omit<DevtoolsEvent, "seq" | "ts">>(body: T): DevtoolsEvent {
    return { ...body, seq: this.seq++, ts: Date.now() } as DevtoolsEvent;
  }

  private goLive(): void {
    if (this.isLive) {
      // re-hello from a reloaded panel: resend welcome + fresh snapshot
      this.sendWelcomeAndSnapshot();
      this.lastPingAt = Date.now();
      return;
    }
    this.isLive = true;
    this.lastPingAt = Date.now();
    // Subscribing state-backed sources emits synchronously → lands in pending,
    // which sendWelcomeAndSnapshot() drains into the snapshot message.
    for (const [id, entry] of this.streams) {
      this.subscribeStream(id, entry);
    }
    for (const [id, entry] of this.machines) {
      if (!entry.disposed) {
        this.subscribeMachine(id, entry);
      }
    }
    this.sendWelcomeAndSnapshot();
    this.flushTimer = setInterval(() => {
      this.flush();
      if (Date.now() - this.lastPingAt > this.heartbeatTimeoutMs) {
        this.goDormant();
      }
    }, this.flushIntervalMs);
  }

  private goDormant(): void {
    if (!this.isLive) {
      return;
    }
    this.isLive = false;
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    for (const entry of this.streams.values()) {
      entry.sub?.unsubscribe();
      entry.sub = null;
    }
    for (const entry of this.machines.values()) {
      entry.sub?.unsubscribe();
      entry.sub = null;
    }
    this.pendingStreams.clear();
    this.pendingMachineStates.clear();
    this.pendingDiscrete = [];
    this.ring.length = 0;
    try {
      this.transport?.send({ kind: "bye" });
    } catch {
      // panel already gone — nothing to tell
    }
  }

  private subscribeStream(streamId: string, entry: StreamEntry): void {
    entry.sub = entry.source$.subscribe({
      next: (value) => {
        const p = this.pendingStreams.get(streamId);
        if (p) {
          p.value = value;
          p.count += 1;
        } else {
          this.pendingStreams.set(streamId, { value, count: 1 });
        }
      },
      error: (error) => {
        this.reportError(`stream:${streamId}`, error);
      },
    });
  }

  private subscribeMachine(machineId: string, entry: MachineEntry): void {
    entry.sub = entry.state$.subscribe({
      next: (state) => {
        entry.lastState = state;
        entry.hasState = true;
        const p = this.pendingMachineStates.get(machineId);
        if (p) {
          p.value = state;
          p.count += 1;
        } else {
          this.pendingMachineStates.set(machineId, { value: state, count: 1 });
        }
      },
      error: (error) => {
        this.reportError(`machine:${machineId}`, error);
      },
    });
  }

  private sendWelcomeAndSnapshot(): void {
    const streams: SnapshotStream[] = [];
    for (const [streamId] of this.streams) {
      const p = this.pendingStreams.get(streamId);
      streams.push({
        streamId,
        value: p ? serializeValue(p.value) : null,
      });
    }
    const machines: SnapshotMachine[] = [];
    for (const [machineId, entry] of this.machines) {
      const p = this.pendingMachineStates.get(machineId);
      const state = p ? p.value : entry.hasState ? entry.lastState : undefined;
      machines.push({
        machineId,
        machineKind: entry.machineKind,
        args: serializeValue(entry.args),
        state: state === undefined ? null : serializeValue(state),
        disposed: entry.disposed,
        createdAt: entry.createdAt,
      });
    }
    // The synchronous first emissions became the snapshot — don't re-send them.
    this.pendingStreams.clear();
    this.pendingMachineStates.clear();
    this.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: this.appId });
    this.send({ kind: "snapshot", streams, machines });
  }

  private flush(): void {
    if (
      this.pendingStreams.size === 0 &&
      this.pendingMachineStates.size === 0 &&
      this.pendingDiscrete.length === 0
    ) {
      return;
    }
    const events: DevtoolsEvent[] = [...this.pendingDiscrete];
    this.pendingDiscrete = [];
    for (const [streamId, p] of this.pendingStreams) {
      events.push(
        this.event({
          kind: "stream:emission",
          streamId,
          value: serializeValue(p.value),
          coalesced: p.count,
        }),
      );
    }
    this.pendingStreams.clear();
    for (const [machineId, p] of this.pendingMachineStates) {
      events.push(
        this.event({
          kind: "machine:state",
          machineId,
          state: serializeValue(p.value),
          coalesced: p.count,
        }),
      );
    }
    this.pendingMachineStates.clear();
    for (const ev of events) {
      this.ring.push(ev);
    }
    if (this.ring.length > this.ringBufferSize) {
      this.ring.splice(0, this.ring.length - this.ringBufferSize);
    }
    this.send({ kind: "batch", events });
  }

  private send(msg: AppToInspector): void {
    try {
      this.transport?.send(msg);
    } catch (error) {
      // transport failure must never surface into the app; drop and continue
      void error;
    }
  }
}
```

- [ ] **Step 5: Export from the barrel**, run tests → PASS, gauntlet → green.

```ts
export { DevtoolsHub, type DevtoolsHubOptions } from "./hub";
export type { DevtoolsTransport } from "./transport";
```

- [ ] **Step 6: Commit** — `git commit -m "feat(devtools-core): DevtoolsHub with dormancy, coalescing flush, snapshot, heartbeat"`

---

### Task 3: BroadcastChannel duplex + in-memory test pair

**Files:**
- Create: `packages/devtools-core/src/channel.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/channel.test.ts`

**Interfaces:**
- Consumes: protocol types.
- Produces: `Duplex<TSend, TRecv> { send(msg: TSend): void; inbound$: Observable<TRecv>; dispose(): void }`; `BroadcastChannelDuplex<TSend, TRecv>` (constructor `(channelName: string)`) implementing it; `createInMemoryDuplexPair<TA, TB>(): [Duplex<TA, TB>, Duplex<TB, TA>]`. Note `DevtoolsTransport` (Task 2) is structurally `Duplex<AppToInspector, InspectorToApp>` — the app side uses `BroadcastChannelDuplex` directly as its transport.

- [ ] **Step 1: Failing tests.** Use `createInMemoryDuplexPair` for logic tests; for `BroadcastChannelDuplex`, skip when `typeof BroadcastChannel === "undefined"` (Node 26 has it; guard keeps the suite portable):

```ts
import { describe, expect, it } from "vitest";

import { BroadcastChannelDuplex, createInMemoryDuplexPair } from "../channel";

describe("createInMemoryDuplexPair", () => {
  it("delivers a→b and b→a, and stops after dispose", () => {
    const [a, b] = createInMemoryDuplexPair<string, number>();
    const gotB: string[] = [];
    const gotA: number[] = [];
    b.inbound$.subscribe((m) => {
      gotB.push(m);
    });
    a.inbound$.subscribe((m) => {
      gotA.push(m);
    });
    a.send("hi");
    b.send(7);
    expect(gotB).toEqual(["hi"]);
    expect(gotA).toEqual([7]);
    a.dispose();
    b.send(8);
    expect(gotA).toEqual([7]);
  });
});

describe("BroadcastChannelDuplex", () => {
  it.skipIf(typeof BroadcastChannel === "undefined")(
    "round-trips between two duplexes on the same channel name",
    async () => {
      const a = new BroadcastChannelDuplex<{ x: number }, { x: number }>("t-chan");
      const b = new BroadcastChannelDuplex<{ x: number }, { x: number }>("t-chan");
      const got = new Promise<{ x: number }>((resolve) => {
        const sub = b.inbound$.subscribe((m) => {
          sub.unsubscribe();
          resolve(m);
        });
      });
      a.send({ x: 1 });
      expect(await got).toEqual({ x: 1 });
      a.dispose();
      b.dispose();
    },
  );
});
```

- [ ] **Step 2: Run → FAIL.** Then implement `src/channel.ts`:

```ts
import { type Observable, Subject } from "rxjs";

/** Symmetric message duplex. The hub's DevtoolsTransport is structurally
 * Duplex<AppToInspector, InspectorToApp>; the inspector uses the flip. */
export interface Duplex<TSend, TRecv> {
  send(msg: TSend): void;
  inbound$: Observable<TRecv>;
  dispose(): void;
}

/** BroadcastChannel adapter — same-origin only (why the panel is served from
 * the app's origin: /devtools route in prod, Vite middleware in dev). */
export class BroadcastChannelDuplex<TSend, TRecv> implements Duplex<TSend, TRecv> {
  private readonly channel: BroadcastChannel;
  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  constructor(channelName: string) {
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (ev: MessageEvent) => {
      this.inboundSubject.next(ev.data as TRecv);
    };
  }

  send(msg: TSend): void {
    this.channel.postMessage(msg);
  }

  dispose(): void {
    this.channel.close();
    this.inboundSubject.complete();
  }
}

export function createInMemoryDuplexPair<TA, TB>(): [Duplex<TA, TB>, Duplex<TB, TA>] {
  const aToB = new Subject<TA>();
  const bToA = new Subject<TB>();
  let closed = false;
  const a: Duplex<TA, TB> = {
    send: (msg) => {
      if (!closed) {
        aToB.next(msg);
      }
    },
    inbound$: bToA.asObservable(),
    dispose: () => {
      closed = true;
    },
  };
  const b: Duplex<TB, TA> = {
    send: (msg) => {
      if (!closed) {
        bToA.next(msg);
      }
    },
    inbound$: aToB.asObservable(),
    dispose: () => {
      closed = true;
    },
  };
  return [a, b];
}
```

- [ ] **Step 3: Export** (`Duplex`, `BroadcastChannelDuplex`, `createInMemoryDuplexPair`), tests PASS, gauntlet green, commit: `feat(devtools-core): BroadcastChannel duplex + in-memory transport pair`.

---

### Task 4: InspectorClient + InspectorStore (panel-side model)

**Files:**
- Create: `packages/devtools-core/src/inspector/client.ts`
- Create: `packages/devtools-core/src/inspector/store.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/inspector.test.ts`

**Interfaces:**
- Consumes: `Duplex`, protocol types, `DevtoolsHub` (integration test).
- Produces:

```ts
// store.ts — shapes the React panels render
export interface StreamRow {
  streamId: string;
  lastValue: SerializedValue | null;
  lastSeq: number;      // 0 until first emission; drives change-flash keys
  totalEmissions: number;
  ratePerSec: number;   // decayed rolling estimate from coalesced counters
}
export interface MachineRow {
  machineId: string;
  machineKind: string;
  args: SerializedValue;
  state: SerializedValue | null;
  disposed: boolean;
  createdAt: number;
  intents: readonly { name: string; args: SerializedValue; ts: number }[];
  transitions: number;
}
export interface LogRow {
  seq: number;
  ts: number;
  kind: DevtoolsEvent["kind"];
  summary: string;      // one-line preformatted text for the log panel
  event: DevtoolsEvent;
}
export interface InspectorState {
  connected: boolean;
  appId: string | null;
  protocolMismatch: number | null; // app's version when ≠ PROTOCOL_VERSION
  streams: readonly StreamRow[];   // sorted by streamId
  machines: readonly MachineRow[]; // insertion order
  log: readonly LogRow[];          // newest last, capped at 5000
}
export class InspectorStore {
  getSnapshot(): InspectorState;
  subscribe(onChange: () => void): () => void;
  apply(msg: AppToInspector): void;
}
// client.ts
export class InspectorClient {
  constructor(channel: Duplex<InspectorToApp, AppToInspector>, store: InspectorStore);
  start(): void;   // sends hello, starts the 2s ping timer, pipes messages to store
  dispose(): void; // sends bye, stops pinging
}
```

- [ ] **Step 1: Failing tests.** Highest-value cases (write these, then implement):

```ts
// 1. snapshot populates streams+machines; getSnapshot() identity changes only on apply
// 2. batch stream:emission updates lastValue/lastSeq/totalEmissions (+= coalesced)
// 3. machine:intent appends to that machine's intents; machine:disposed flips flag
// 4. log capped at 5000 (apply 5010 wire events → length 5000, oldest dropped)
// 5. end-to-end with a real DevtoolsHub over createInMemoryDuplexPair + fake timers:
//    hub.registerStream → client.start() → advance 40ms → store shows the stream
```

Test 5 skeleton (the wiring later tasks copy):

```ts
const [appSide, inspectorSide] = createInMemoryDuplexPair<AppToInspector, InspectorToApp>();
const hub = new DevtoolsHub({ appId: "e2e" });
hub.attachTransport(appSide);
const source$ = new BehaviorSubject({ mid: 1.09 });
hub.registerStream("priceStream.price$[EURUSD]", source$);
const store = new InspectorStore();
const client = new InspectorClient(inspectorSide, store);
client.start();
vi.advanceTimersByTime(40);
const state = store.getSnapshot();
expect(state.connected).toBe(true);
expect(state.streams[0]).toMatchObject({ streamId: "priceStream.price$[EURUSD]" });
```

- [ ] **Step 2: Run → FAIL. Implement the store.** Copy-on-write: `apply()` mutates internal maps, then rebuilds the public `InspectorState` object (new reference) and notifies subscribers — `useSyncExternalStore`-ready. Rate estimate: per stream keep `{windowStart, windowCount}`; on each emission add `coalesced`; when `ts - windowStart > 2000` set `ratePerSec = windowCount / ((ts - windowStart) / 1000)` and reset the window. `summary` strings: `"EURUSD ← {mid:1.09,…} ×3"` style — `<streamId|machineId> <compact value> ×<coalesced>`; compact value = `JSON.stringify` of the SerializedValue truncated to 120 chars. `welcome` with `v !== PROTOCOL_VERSION` sets `protocolMismatch` and still applies messages (panel shows a banner). `bye` from the app sets `connected: false`.

- [ ] **Step 3: Implement the client.** `start()`: `channel.send({kind:"hello", v: PROTOCOL_VERSION})`; subscribe `channel.inbound$` → `store.apply(msg)`; `setInterval(() => channel.send({kind:"ping"}), 2000)`. `dispose()`: clear interval, `channel.send({kind:"bye"})`, unsubscribe.

- [ ] **Step 4: Export** `InspectorClient`, `InspectorStore`, and the row/state types from the barrel. Tests PASS, gauntlet green, commit: `feat(devtools-core): InspectorClient + InspectorStore panel-side model`.

---

### Task 5: `instrumentMachineFactories` decorator

**Files:**
- Create: `packages/devtools-core/src/instrument/machines.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/instrumentMachines.test.ts`

**Interfaces:**
- Consumes: `DevtoolsHub`.
- Produces: `instrumentMachineFactories<F extends Record<string, AnyMachineFactory>>(factories: F, hub: DevtoolsHub): F` and the structural type `InstrumentableMachine { state$: Observable<unknown>; intents: object; dispose(): void }` (matches client-core's `Machine<S,I>` by shape — no import).

- [ ] **Step 1: Failing tests**

```ts
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../hub";
import { instrumentMachineFactories } from "../instrument/machines";

function makeFactories() {
  const disposeSpy = vi.fn();
  const submitSpy = vi.fn();
  const factories = {
    orderTicket: (symbol: string) => {
      return {
        state$: new BehaviorSubject({ symbol, phase: "editing" }),
        intents: { submit: submitSpy },
        dispose: disposeSpy,
      };
    },
  };
  return { factories, disposeSpy, submitSpy };
}

describe("instrumentMachineFactories", () => {
  it("returns same-shape factories whose machines still work", () => {
    const hub = new DevtoolsHub();
    const { factories, disposeSpy, submitSpy } = makeFactories();
    const wrapped = instrumentMachineFactories(factories, hub);
    const machine = wrapped.orderTicket("AAPL");
    machine.intents.submit("arg");
    expect(submitSpy).toHaveBeenCalledWith("arg");
    machine.dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it("registers lifecycle with the hub", () => {
    const hub = new DevtoolsHub();
    const created = vi.spyOn(hub, "machineCreated");
    const disposed = vi.spyOn(hub, "machineDisposed");
    const intent = vi.spyOn(hub, "machineIntent");
    const { factories } = makeFactories();
    const machine = instrumentMachineFactories(factories, hub).orderTicket("AAPL");
    expect(created).toHaveBeenCalledWith(
      "orderTicket",
      ["AAPL"],
      expect.anything(),
    );
    machine.intents.submit();
    expect(intent).toHaveBeenCalledWith(expect.any(String), "submit", []);
    machine.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("still delegates the intent when hub logging throws", () => {
    const hub = new DevtoolsHub();
    vi.spyOn(hub, "machineIntent").mockImplementation(() => {
      throw new Error("boom");
    });
    const { factories, submitSpy } = makeFactories();
    const machine = instrumentMachineFactories(factories, hub).orderTicket("A");
    expect(() => machine.intents.submit()).not.toThrow();
    expect(submitSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement** `src/instrument/machines.ts`:

```ts
import type { Observable } from "rxjs";

import type { DevtoolsHub } from "../hub";

/** Structural mirror of client-core's Machine<S,I> — devtools-core never
 * imports @rtc/client-core; matching by shape is the whole point. */
export interface InstrumentableMachine {
  state$: Observable<unknown>;
  intents: object;
  dispose: () => void;
}

type AnyMachineFactory = (...args: never[]) => InstrumentableMachine;

/** Wraps every factory so each machine instance reports created / state /
 * intents / disposed to the hub. One generic wrapper covers every current and
 * future factory. Instrumentation failures never block the wrapped call. */
export function instrumentMachineFactories<
  F extends Record<string, AnyMachineFactory>,
>(factories: F, hub: DevtoolsHub): F {
  const wrapped: Record<string, AnyMachineFactory> = {};
  for (const [kind, factory] of Object.entries(factories)) {
    wrapped[kind] = (...args: never[]) => {
      const machine = factory(...args);
      let machineId = "";
      try {
        machineId = hub.machineCreated(kind, args, machine.state$);
      } catch {
        return machine; // devtools failed — hand back the raw machine
      }
      const intents: Record<string, unknown> = {};
      for (const [name, fn] of Object.entries(machine.intents)) {
        if (typeof fn !== "function") {
          intents[name] = fn;
          continue;
        }
        intents[name] = (...intentArgs: unknown[]) => {
          try {
            hub.machineIntent(machineId, name, intentArgs);
          } catch {
            // never block the real intent
          }
          return fn(...intentArgs);
        };
      }
      return {
        state$: machine.state$,
        intents,
        dispose: () => {
          try {
            hub.machineDisposed(machineId);
          } catch {
            // never block disposal
          }
          machine.dispose();
        },
      };
    };
  }
  return wrapped as F;
}
```

- [ ] **Step 3: Tests PASS, export from barrel, gauntlet green, commit**: `feat(devtools-core): machine-factory instrumentation decorator`.

---

### Task 6: `instrumentPresenters` + `instrumentWsAdapter` decorators

**Files:**
- Create: `packages/devtools-core/src/instrument/presenters.ts`
- Create: `packages/devtools-core/src/instrument/wsAdapter.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/instrumentPresenters.test.ts`, `.../instrumentWsAdapter.test.ts`

**Interfaces:**
- Consumes: `DevtoolsHub`, `PresenterManifest` (Task 1), `InstrumentableMachine` (Task 5).
- Produces:
  - `instrumentPresenters<T extends object>(presenters: T, manifest: PresenterManifest, hub: DevtoolsHub): T`
  - `WsAdapterLike { on(type: string, handler: (payload: unknown) => void): () => void; send(type: string, payload?: unknown): void; rpc(type: string, payload?: unknown): Promise<unknown> }` (structural subset of client-core's `IWsAdapter`)
  - `instrumentWsAdapter<T extends WsAdapterLike>(adapter: T, hub: DevtoolsHub): T`

- [ ] **Step 1: Failing presenter tests.** Key behaviors:

```ts
// Presenters are CLASS INSTANCES — the decorator must NOT object-spread them
// (spread drops prototype methods). It returns {...presentersObject} where each
// manifest-listed presenter is replaced by a Proxy over the instance.
// 1. props: register "blotter.trades$" with the hub, passing the same Observable
// 2. methods: calling proxied priceStream.price$("EURUSD") twice registers
//    'priceStream.price$["EURUSD"]' exactly once and returns the SAME
//    observable the real method returned; `this` inside the method still works
//    (test with a class whose method reads a private field)
// 3. machine entries: state$ registered via hub.machineCreated(key, [], state$);
//    intents proxied through hub.machineIntent with the returned id
// 4. non-manifest presenters/properties pass through untouched (same reference)
```

Write these as concrete tests with a small fake presenter class, e.g.:

```ts
class FakePriceStream {
  private readonly cache = new Map<string, BehaviorSubject<number>>();
  price$(pair: string): Observable<number> {
    let s = this.cache.get(pair);
    if (!s) {
      s = new BehaviorSubject(1);
      this.cache.set(pair, s);
    }
    return s;
  }
}
```

- [ ] **Step 2: Implement** `src/instrument/presenters.ts`:

```ts
import type { Observable } from "rxjs";

import type { DevtoolsHub } from "../hub";
import type { PresenterManifest } from "../protocol";
import type { InstrumentableMachine } from "./machines";

function isObservable(x: unknown): x is Observable<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { subscribe?: unknown }).subscribe === "function"
  );
}

function argsKey(args: readonly unknown[]): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args.length);
  }
}

/** Returns a shallow copy of the presenters object where each manifest-listed
 * entry is replaced by a Proxy that (a) registers `props` observables once,
 * (b) wraps `methods` so each distinct arg tuple registers a child stream on
 * first call, (c) for `machine` entries registers state$ and logs intents.
 * Proxies (not spreads): presenters are class instances — spreading would drop
 * prototype methods. Method calls delegate with the ORIGINAL instance as
 * `this`. Any instrumentation failure falls back to the raw member. */
export function instrumentPresenters<T extends object>(
  presenters: T,
  manifest: PresenterManifest,
  hub: DevtoolsHub,
): T {
  const out: Record<string, unknown> = {
    ...(presenters as Record<string, unknown>),
  };
  for (const [key, entry] of Object.entries(manifest)) {
    const target = (presenters as Record<string, unknown>)[key];
    if (typeof target !== "object" || target === null) {
      continue;
    }
    if (entry.machine) {
      out[key] = instrumentSharedMachine(key, target as InstrumentableMachine, hub);
      continue;
    }
    for (const prop of entry.props ?? []) {
      const source = (target as Record<string, unknown>)[prop];
      if (isObservable(source)) {
        hub.registerStream(`${key}.${prop}`, source);
      }
    }
    const methods = entry.methods ?? [];
    if (methods.length === 0) {
      continue;
    }
    const registered = new Set<string>();
    const methodSet = new Set<string>(methods);
    out[key] = new Proxy(target, {
      get(t, p, receiver) {
        if (typeof p === "string" && methodSet.has(p)) {
          const original = Reflect.get(t, p, t) as (
            ...a: readonly unknown[]
          ) => unknown;
          return (...args: readonly unknown[]) => {
            const result = Reflect.apply(original, t, args as unknown[]);
            try {
              const id = `${key}.${p}[${argsKey(args)}]`;
              if (isObservable(result) && !registered.has(id)) {
                registered.add(id);
                hub.registerStream(id, result);
              }
            } catch {
              // observation is best-effort; the caller gets `result` regardless
            }
            return result;
          };
        }
        return Reflect.get(t, p, receiver);
      },
    });
  }
  return out as T;
}

function instrumentSharedMachine(
  key: string,
  machine: InstrumentableMachine,
  hub: DevtoolsHub,
): InstrumentableMachine {
  let machineId = "";
  try {
    machineId = hub.machineCreated(key, [], machine.state$);
  } catch {
    return machine;
  }
  const intents: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(machine.intents)) {
    intents[name] =
      typeof fn === "function"
        ? (...args: unknown[]) => {
            try {
              hub.machineIntent(machineId, name, args);
            } catch {
              // never block the real intent
            }
            return (fn as (...a: unknown[]) => unknown)(...args);
          }
        : fn;
  }
  return { state$: machine.state$, intents, dispose: machine.dispose };
}
```

- [ ] **Step 3: Failing wsAdapter tests, then implement** `src/instrument/wsAdapter.ts`:

```ts
import type { DevtoolsHub } from "../hub";

/** Structural subset of client-core's IWsAdapter that the tap needs. */
export interface WsAdapterLike {
  on(type: string, handler: (payload: unknown) => void): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
}

/** Wire tap: wraps send/on/rpc to report wire:out / wire:in. All other members
 * of the adapter delegate untouched (prototype methods via explicit binding).
 * Returns an object satisfying the SAME interface as the input. */
export function instrumentWsAdapter<T extends WsAdapterLike>(
  adapter: T,
  hub: DevtoolsHub,
): T {
  return new Proxy(adapter, {
    get(t, p, receiver) {
      if (p === "send") {
        return (type: string, payload?: unknown) => {
          try {
            hub.wireOut(type, payload);
          } catch {
            // never block the real send
          }
          t.send(type, payload);
        };
      }
      if (p === "on") {
        return (type: string, handler: (payload: unknown) => void) => {
          return t.on(type, (payload) => {
            try {
              hub.wireIn(type, payload);
            } catch {
              // never block the real handler
            }
            handler(payload);
          });
        };
      }
      if (p === "rpc") {
        return (type: string, payload?: unknown) => {
          try {
            hub.wireOut(type, payload);
          } catch {
            // never block the rpc
          }
          return t.rpc(type, payload).then((result) => {
            try {
              hub.wireIn(`${type}:reply`, result);
            } catch {
              // observation only
            }
            return result;
          });
        };
      }
      const value = Reflect.get(t, p, t);
      return typeof value === "function" ? (value as CallableFunction).bind(t) : value;
    },
  }) as T;
}
```

Tests: send/on/rpc delegate and report; a hub that throws never blocks delivery; `connectionEvents()`/other members still work through the proxy.

- [ ] **Step 4: Tests PASS, export both from barrel, gauntlet green, commit**: `feat(devtools-core): presenter + WS adapter instrumentation decorators`.

---

### Task 7: client-react integration — hub module, manifest, AppRoot + buildBrowserPorts wiring

**Files:**
- Create: `packages/client-react/src/app/devtools/devtoolsHub.ts`
- Create: `packages/client-react/src/app/devtools/presenterManifest.ts`
- Modify: `packages/client-react/src/AppRoot.tsx:31-38`
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts` (wrap the `WsAdapter` at its construction, ~line 35)
- Modify: `packages/client-react/package.json` (add `"@rtc/devtools-core": "workspace:*"` to dependencies)
- Test: `packages/client-react/src/app/__tests__/devtoolsIntegration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: module-level `devtoolsHub: DevtoolsHub` singleton (precedent: `reconnect$`/`incident$` module Subjects in client-core composition); `PRESENTER_MANIFEST: PresenterManifest`.

- [ ] **Step 1: Hub module** (`src/app/devtools/devtoolsHub.ts`):

```ts
import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

/** App-side devtools hub. Module-level singleton (same precedent as the
 * reconnect$/incident$ seams): infrastructure whose lifetime is the page.
 * Dormant until an inspector handshakes on the rtc-devtools channel; costs
 * nothing per-emission until then. BroadcastChannel is same-origin — the
 * inspector must be served from this origin (/devtools route or dev
 * middleware). Guarded so jsdom/StrictMode double-mounts and non-browser
 * environments never throw. */
export const devtoolsHub = new DevtoolsHub({ appId: "rtc-web" });

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));
}
```

- [ ] **Step 2: Presenter manifest** (`src/app/devtools/presenterManifest.ts`). Complete — derived from `createViewModel.ts`'s reads; keep in this order:

```ts
import type { PresenterManifest } from "@rtc/devtools-core";

/** Which members of each presenter the devtools observes. This is call-site
 * knowledge by design: devtools-core stays structurally typed, and this file
 * sits next to the composition wiring that knows the concrete Presenters.
 * When adding a presenter, add its entry here (the state tree panel is the
 * reminder — a missing presenter is visibly absent). */
export const PRESENTER_MANIFEST: PresenterManifest = {
  priceStream: { methods: ["price$"] },
  priceHistory: { methods: ["history$"] },
  blotter: { props: ["trades$", "newTradeIds$", "activity$"] },
  analytics: { props: ["position$"] },
  rfqs: { props: ["rfqs$", "allQuotes$"], methods: ["quotesForRfq$"] },
  currencyPairs: { props: ["pairs$"] },
  instruments: { props: ["list$"] },
  dealers: { props: ["list$"] },
  connection: { props: ["status$"] },
  throughput: { props: ["state$"] },
  themePreference: { props: ["mode$", "modePreference$"] },
  themeSkinPreference: { props: ["skin$"] },
  animatedBackground: { props: ["enabled$"] },
  viewModePreference: { props: ["viewMode$"] },
  creditRfqFilterPreference: { props: ["filter$"] },
  eqWatchlistSortPreference: { props: ["sort$"] },
  eqBlotterViewPreference: { props: ["view$"] },
  animationDirector: { methods: ["intentsFor"] },
  bootGate: { props: ["visible$"] },
  session: { props: ["state$"] },
  watchlist: { props: ["watchlist$"], methods: ["quote$"] },
  candleSeries: { methods: ["candles$"] },
  depth: { methods: ["depth$"] },
  ordersBlotter: { props: ["orders$"] },
  positions: { props: ["positions$"] },
  incident: { machine: true },
  eqWorkspace: { machine: true },
  throughputMetric: { props: ["samples$"] },
  latencyMetric: { props: ["samples$"] },
  errorRateMetric: { props: ["samples$"] },
  topology: { props: ["topology$"] },
  eventLog: { props: ["events$"] },
  sessions: { props: ["sessions$"] },
  sessionsKpi: { props: ["countSeries$"] },
};
```

Verify each entry against `packages/client-core/src/composition.ts:97-146` and `packages/react-bindings/src/createViewModel.ts` before committing — presenters may have gained members since this plan was written.

- [ ] **Step 3: Wire AppRoot** — replace `AppRoot.tsx:32-37` with:

```ts
const { presenters, commands } = createApp(buildBrowserPorts());
const instrumented = instrumentPresenters(
  presenters,
  PRESENTER_MANIFEST,
  devtoolsHub,
);
viewModelRef.current = createViewModel(
  instrumented,
  instrumentMachineFactories(createMachineFactories(instrumented), devtoolsHub),
  commands,
);
```

(with the three new imports). Note `createMachineFactories` receives the *instrumented* presenters so machine-internal parameterized calls also register child streams.

- [ ] **Step 4: Wire the WS tap** — in `buildBrowserPorts.ts`, wrap at construction:

```ts
const ws = instrumentWsAdapter(new WsAdapter(buildWsUrl(url, token)), devtoolsHub);
```

The simulator branch (no `VITE_SERVER_URL`) has no adapter — the wire panel is simply empty there; document that in the wire-panel task.

- [ ] **Step 5: Integration test** (`src/app/__tests__/devtoolsIntegration.test.ts`). Mirror the setup style of `src/app/composition.incident.test.ts` (read it first — jsdom + simulator branch). Test: build the app exactly as AppRoot does (createApp → instrumentPresenters → instrumentMachineFactories), attach a fresh `DevtoolsHub` via `createInMemoryDuplexPair`, drive an `InspectorStore` + `InspectorClient` on the other end with fake timers, then assert:
  - after `client.start()` + one flush: `store.getSnapshot().connected === true`, `streams` contains `"blotter.trades$"` and `"connection.status$"`;
  - creating a machine via the instrumented factories (`machines.notional(1_000_000)`) makes a `MachineRow` with `machineKind: "notional"` appear after a flush; calling its `setValue` intent (check the real `NotionalIntents` name in `packages/client-core/src/presenters/NotionalMachine.ts` first) records an intent row; `dispose()` flips `disposed`.
  - Use a locally-constructed hub in the test, NOT the module singleton, so tests stay isolated.

- [ ] **Step 6: Run** `pnpm --filter @rtc/client-react test` → PASS; full gauntlet green (knip: the two new files are reachable from AppRoot — no knip change needed). Commit: `feat(client-react): wire devtools instrumentation at the composition root`.

---

### Task 8: `@rtc/devtools-app` scaffold — shell, connection, tabs

**Files:**
- Create: `packages/devtools-app/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html` (mirror `packages/client-prototype/` for all config; name/port/base differ)
- Create: `packages/devtools-app/src/main.tsx`
- Create: `packages/devtools-app/src/InspectorApp.tsx`
- Create: `packages/devtools-app/src/useInspectorState.ts`
- Create: `packages/devtools-app/src/inspectorSession.ts`
- Create: `packages/devtools-app/src/InspectorApp.module.css`
- Test: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx`
- Modify: `knip.json`, `.dependency-cruiser.cjs`, root `package.json` (script)

**Interfaces:**
- Consumes: `BroadcastChannelDuplex`, `InspectorClient`, `InspectorStore`, `InspectorState` (devtools-core).
- Produces: `useInspectorState(store: InspectorStore): InspectorState` (via `useSyncExternalStore`); `createInspectorSession(): { store: InspectorStore; dispose(): void }`; `InspectorApp({ store })` component with a `rail` + tab strip: `state | machines | log | wire` (panels arrive in Tasks 9–10; scaffold renders placeholders text "coming in Task N" is fine *during this task only* — Tasks 9–10 replace them).

- [ ] **Step 1: Scaffold.** `package.json` mirrors client-prototype (React 19, Vite 8, vitest, RTL, jsdom) plus `"@rtc/devtools-core": "workspace:*"`; name `@rtc/devtools-app`. `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Served at /devtools/ from the app's origin in both dev (client-react Vite
  // middleware) and prod (copied into client-react/dist/devtools). Standalone
  // `pnpm dev` (port 5280) is for panel-UI iteration only — BroadcastChannel
  // is same-origin, so a standalone panel shows the disconnected state.
  base: "/devtools/",
  server: { host: "127.0.0.1", port: 5280 },
  build: { outDir: "dist" },
});
```

Root `package.json` scripts: `"dev:devtools": "pnpm --filter @rtc/devtools-app dev"`.

`knip.json`:

```json
"packages/devtools-app": {
  "entry": ["src/main.tsx", "index.html", "vite.config.ts"],
  "project": "src/**/*.{ts,tsx}"
}
```

`.dependency-cruiser.cjs`:

```js
{
  name: "devtools-app-protocol-only",
  severity: "error",
  comment:
    "@rtc/devtools-app understands only the wire protocol — devtools-core is its sole @rtc dependency.",
  from: { path: "^packages/devtools-app/src" },
  to: { path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|server|ws-effects)/" },
},
```

- [ ] **Step 2: Session + hook.** `inspectorSession.ts`:

```ts
import {
  type AppToInspector,
  BroadcastChannelDuplex,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";

export function createInspectorSession(): { store: InspectorStore; dispose: () => void } {
  const store = new InspectorStore();
  if (typeof BroadcastChannel === "undefined") {
    return { store, dispose: () => {} };
  }
  const channel = new BroadcastChannelDuplex<InspectorToApp, AppToInspector>(
    "rtc-devtools",
  );
  const client = new InspectorClient(channel, store);
  client.start();
  return {
    store,
    dispose: () => {
      client.dispose();
      channel.dispose();
    },
  };
}
```

`useInspectorState.ts`:

```ts
import { useSyncExternalStore } from "react";

import type { InspectorState, InspectorStore } from "@rtc/devtools-core";

export function useInspectorState(store: InspectorStore): InspectorState {
  return useSyncExternalStore(
    (onChange) => {
      return store.subscribe(onChange);
    },
    () => {
      return store.getSnapshot();
    },
  );
}
```

- [ ] **Step 3: Shell.** `InspectorApp.tsx`: left rail (app id, `connected` dot, per-tab stream/machine/log counts) + tab strip + active panel. Tab state: `useState<"state" | "machines" | "log" | "wire">("state")`. `main.tsx` mirrors client-prototype's mount, calling `createInspectorSession()` once at module level and passing `store` in. Styling in `InspectorApp.module.css`: dark HUD look — background `#0a0e14`, monospace numerals, accent `#22d3ee`; keep it simple, the panels carry the polish.

- [ ] **Step 4: RTL smoke test:** render `<InspectorApp store={store}/>` with a bare `InspectorStore`, assert the disconnected badge and the four tabs; `store.apply({kind:"welcome", v: 1, appId:"rtc-web"})` wrapped in `act()` → connected badge shows `rtc-web`.

- [ ] **Step 5: Gauntlet + commit**: `feat(devtools-app): inspector shell, session wiring, connection rail`.

---

### Task 9: State-tree + machine-registry panels

**Files:**
- Create: `packages/devtools-app/src/panels/StateTreePanel.tsx` + `.module.css`
- Create: `packages/devtools-app/src/panels/MachinesPanel.tsx` + `.module.css`
- Create: `packages/devtools-app/src/panels/ValueView.tsx` + `.module.css`
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (mount real panels)
- Test: `packages/devtools-app/src/__tests__/StateTreePanel.test.tsx`, `.../MachinesPanel.test.tsx`

**Interfaces:**
- Consumes: `InspectorState`, `StreamRow`, `MachineRow`, `SerializedValue`.
- Produces: `StateTreePanel({ streams }: { streams: readonly StreamRow[] })`; `MachinesPanel({ machines }: { machines: readonly MachineRow[] })`; `ValueView({ value }: { value: SerializedValue | null })` (shared by both + Task 10).

- [ ] **Step 1: ValueView.** Recursive renderer for `SerializedValue`: primitives inline; objects/arrays/maps/sets as expandable `<details>` nodes (native disclosure — no state management), collapsed below the first level; tagged nodes rendered distinctly (`{$t:"map"}` → `Map(n)`, `truncated` → `…+N`, `fn` → `ƒ name`, `circular` → `↺`). Tests: renders a nested value, `Map` tag, truncation marker.

- [ ] **Step 2: StateTreePanel.** Group `streams` by prefix before the first `.` (presenter name); render presenter groups with child rows: stream id, `ValueView` of `lastValue`, rate badge when `ratePerSec > 0.5`. Change flash: `<span key={row.lastSeq} className={styles.flash}>` — remount on new seq restarts a 300 ms CSS `@keyframes` opacity animation (compositor-safe: animate `opacity` only, per `docs/performance.md`). Tests: two streams from different presenters render grouped; updating the store re-renders the changed value.

- [ ] **Step 3: MachinesPanel.** Two-column layout: table (id, kind, args compact, current state compact, created time, LIVE/DISPOSED badge; disposed rows at reduced opacity) + detail pane for the selected machine (full `ValueView` state, transitions count, intent history list newest-first). Selection is `useState<string | null>`. Tests: rows render; clicking selects; disposed styling applied; intent list shows recorded intents.

- [ ] **Step 4: Mount both panels in InspectorApp** (replacing placeholders), gauntlet green, commit: `feat(devtools-app): state-tree and machine-registry panels`.

---

### Task 10: Event-log + wire-tap panels

**Files:**
- Create: `packages/devtools-app/src/panels/EventLogPanel.tsx` + `.module.css`
- Create: `packages/devtools-app/src/panels/WirePanel.tsx` + `.module.css`
- Modify: `packages/devtools-app/src/InspectorApp.tsx`
- Test: `packages/devtools-app/src/__tests__/EventLogPanel.test.tsx`, `.../WirePanel.test.tsx`

**Interfaces:**
- Consumes: `LogRow`, `ValueView`.
- Produces: `EventLogPanel({ log }: { log: readonly LogRow[] })`; `WirePanel({ log }: { log: readonly LogRow[] })` (wire panel = the same log filtered to `wire:*` kinds — one source of truth).

- [ ] **Step 1: EventLogPanel.** Controls: free-text filter (matches `summary`), kind checkboxes (`stream`, `machine`, `wire`, `devtools` prefixes), pause toggle (freezes the rendered slice while the store keeps updating). Render the last 500 matching rows, newest at the bottom; each row: time (HH:MM:SS.mmm), kind chip, summary; a row expands (`<details>`) to a `ValueView` of the full event. Tests: filters by text and kind; pause freezes output while store grows.

- [ ] **Step 2: WirePanel.** Filter `log` to `wire:in`/`wire:out`; direction arrows (`▲ out` / `▼ in`), msgType filter text box, per-msgType counts in a header strip; expandable payload via `ValueView`. Empty state must say: "No wire traffic — the app is running on in-process simulators (no WebSocket)." (the simulator branch has no adapter — Task 7 Step 4). Tests: direction filter; empty-state text.

- [ ] **Step 3: Mount, gauntlet, commit**: `feat(devtools-app): event-log and wire-tap panels`.

---

### Task 11: Same-origin serving (dev middleware + build copy) + e2e + spec amendment

**Files:**
- Modify: `packages/client-react/vite.config.ts` (serve + copy plugin)
- Modify: `packages/client-react/package.json` (add `"@rtc/devtools-app": "workspace:*"` to **devDependencies** — build-order + dist-path only; dep-cruiser forbids source imports)
- Create: `tests/browser/playwright/devtools.spec.ts`
- Modify: `docs/superpowers/specs/2026-07-11-custom-devtools-design.md` (§3 + §5 serving sentences)

**Interfaces:**
- Consumes: built `packages/devtools-app/dist`.
- Produces: `/devtools/` served from the app origin in dev and in the production bundle.

- [ ] **Step 1: Vite plugin** in `client-react/vite.config.ts` — zero new deps:

```ts
import { copyFileSync, cpSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/** Serve the built inspector at /devtools/ in dev, and copy it into
 * dist/devtools at build time. Same-origin is load-bearing: the devtools
 * BroadcastChannel cannot cross origins. Requires @rtc/devtools-app to be
 * built (turbo's topological build guarantees it via the devDependency). */
function devtoolsPanel(): Plugin {
  const require = createRequire(import.meta.url);
  // resolve the workspace package root without importing its source
  const appDist = join(
    dirname(require.resolve("@rtc/devtools-app/package.json")),
    "dist",
  );
  return {
    name: "rtc-devtools-panel",
    configureServer(server) {
      server.middlewares.use("/devtools", (req, res, next) => {
        const url = (req.url ?? "/").split("?")[0];
        const file = join(appDist, url === "/" ? "index.html" : url);
        if (existsSync(file) && !file.endsWith("/")) {
          res.setHeader(
            "content-type",
            file.endsWith(".html")
              ? "text/html"
              : file.endsWith(".js")
                ? "text/javascript"
                : file.endsWith(".css")
                  ? "text/css"
                  : "application/octet-stream",
          );
          copyStream(file, res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (existsSync(appDist)) {
        cpSync(appDist, join("dist", "devtools"), { recursive: true });
      }
    },
  };
}
```

(Implementer: `copyStream` = `createReadStream(file).pipe(res)` from `node:fs` — or read+end; keep it dependency-free. If `@rtc/devtools-app/package.json` is not exported, resolve via `../devtools-app` relative path instead — verify which works in this workspace.) Register the plugin in the existing `plugins` array. `"@rtc/devtools-app": "workspace:*"` in devDependencies gives turbo the build edge so `pnpm build`/`pnpm dev` order is correct.

- [ ] **Step 2: Manual verify (dev).** `pnpm --filter @rtc/devtools-app build && pnpm dev`, open the app URL and `<app-origin>/devtools/` in a second tab: rail shows connected, state tree populates live, adding/removing an FX tile births/kills machines in the registry. This is the user's live-acceptance moment — request it before merging.

- [ ] **Step 3: e2e** (`tests/browser/playwright/devtools.spec.ts`) joining the EXISTING playwright suite (no new run-all entry; a second page in the same context shares the origin, so BroadcastChannel connects). Mirror `_openWorkspace.ts` conventions:

```ts
// open app page → wait for tiles; context.newPage() → goto("/devtools/")
// expect connected badge; expect a stream row test-id for "blotter.trades$";
// machines tab → expect at least one row with kind "tileExecution";
// close the app page → expect disconnected badge within 15s (heartbeat timeout 10s).
```

Note: the suite's dev server must serve `/devtools/` → the playwright suite's `with-server` runs the client-react dev server, which now needs `packages/devtools-app/dist` to exist. CI runs `pnpm build` before e2e (verify in `.github/workflows/ci.yml`; if e2e does NOT build first, add a `turbo` dependency or a pretest build of devtools-app — check and wire whichever ci.yml supports).

- [ ] **Step 4: Amend the spec** — §3 integration sentence and §5 transport paragraph: replace "a second Vite dev server locally" with the same-origin middleware + build-copy mechanism (BroadcastChannel is same-origin; standalone port 5280 is disconnected panel-UI iteration only). Also note the Task-level protocol trims (this plan's "Refinements vs the spec" block) in the spec's §5.

- [ ] **Step 5: Gauntlet + e2e locally** (`pnpm test:e2e` or at minimum the playwright suite), commit: `feat(client-react): serve inspector at /devtools same-origin; e2e; spec serving amendment`.

---

### Task 12: Perf acceptance + docs sync

**Files:**
- Create: `docs/architecture/18-devtools.md`
- Create: `packages/devtools-core/README.md`, `packages/devtools-app/README.md`
- Modify: `docs/architecture.md` (ToC entry), `docs/architecture/06-package-dependencies.md` (graph + rules), `docs/architecture/13-codebase-map.md` (two package entries), `CLAUDE.md` (package table + dependency-rule note)

- [ ] **Step 1: Perf acceptance (dormant).** Per `docs/performance.md` recipe: production build, FX tab, 20 s trace, **no inspector attached**. Acceptance: renderer main % within noise of the current baseline (memory: FX ≈ 13.7 % as of PR #164) and zero `compositeFailed`. Record numbers in the PR description.
- [ ] **Step 2: Perf sanity (live).** Same trace with the inspector attached in a second tab: the app tab must stay within ~2 % renderer main of dormant; note the inspector tab's own cost separately (it's allowed to work hard).
- [ ] **Step 3: Write `docs/architecture/18-devtools.md`.** Sections: Why (the devtools-gap objection; choke-point argument); Architecture (decorator diagram — compose TALL per CLAUDE.md's Markdown-Diagrams rules: app column above hub above transport above panel); The dormancy contract (registered-not-subscribed, verbatim `goLive`/`goDormant` fragments); Protocol (envelope + snapshot/batch, verbatim type fragments); Serving topology (same-origin constraint, dev middleware, `/devtools` in prod); Future extensions (spec §9 verbatim summary: intent injection, record/replay, extension shell, RN relay, time-scrubbing). Show-not-tell: quote real code fragments, not prose paraphrases (the §17 lesson).
- [ ] **Step 4: Mechanical syncs.** `06-package-dependencies.md`: add both packages to the dependency graph (devtools-core leaf like ws-effects; devtools-app → devtools-core; client-react → devtools-core runtime + devtools-app dev-only asset edge, drawn dashed) and the rules list. `13-codebase-map.md`: two entries following the existing per-package format. `CLAUDE.md`: two rows in the package table + one dependency-rule sentence (devtools-core rxjs-only; nothing imports devtools-app). READMEs: mirror the 9 existing package READMEs' structure (role, deps, entry points, how to run). `docs/architecture.md`: ToC line for §18.
- [ ] **Step 5: `pnpm check:doc-links`** → PASS (it gates every relative link + anchor). Full gauntlet. Commit: `docs(devtools): architecture §18, dependency graph, codebase map, READMEs, CLAUDE.md`.
- [ ] **Step 6: Ship.** Push branch, PR, CI loop per `shipping-repo-changes`; **user live-acceptance of the running inspector (Task 11 Step 2) before merge**; merge with `--merge`; clean up the worktree.

---

## Self-review notes (already applied)

- Spec §5 `subscribe {filters}` intentionally dropped (refinement 3); §3 serving corrected (refinement 1) — Task 11 Step 4 amends the spec so docs stay honest.
- Type-consistency pass: `DevtoolsTransport` ≡ `Duplex<AppToInspector, InspectorToApp>` (Task 3 note); `machineCreated(kind, args, state$)` signature identical in Tasks 2/5/6; `InspectorState` field names identical in Tasks 4/8/9/10.
- Presenter manifest is a live mirror of `composition.ts:97-146` — Task 7 Step 2 requires re-verification at implementation time (presenters may have been added since).
- RN client intentionally untouched (spec scope: web only); `client-react-native` gains no dependency.
