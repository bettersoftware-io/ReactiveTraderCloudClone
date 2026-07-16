# DevTools — React Native Inspection (WebSocket Relay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped RTC state inspector to inspect the React Native client live, over a new `WsRelayDuplex` transport plus a standalone dev-machine relay (`@rtc/devtools-relay`), changing nothing in the protocol, hub, `InspectorStore`/`InspectorClient`, or the four panels. Realises the v1 design's future-extension §9.4 (and `transport.ts`'s named "WebSocket relay (future)").

**Architecture:** A fourth `Duplex` behind the inspector's transport seam. The RN app (dev build only) opens a `WsRelayDuplex(url, "app")` as its `DevtoolsHub` transport and applies the same three composition-root decorators `client-react` applies; the browser `devtools-app` opens a `WsRelayDuplex(url, "panel")`; a tiny standalone WebSocket relay on the dev machine forwards frames between them (app→panels broadcast, panel→app single). Devtools traffic stays entirely off the app's data socket and off the production `@rtc/server`. All wiring is factored into pure, injected-dependency seams (a socket factory on the duplex, a hub factory + a pure `buildViewModelInputs` on the RN side) so the transport, relay, and RN decoration are unit-tested in node without a real device.

**Tech Stack:** TypeScript, RxJS 7 (`Subject` in the duplex, matching `@rtc/devtools-core`), the platform global `WebSocket` (browsers + React Native + Node 26), the `ws` npm package (relay server only — matching `@rtc/server`'s already-vetted `ws@^8.21.0`), Vitest 4 (node env for core/relay/RN-integration; jest-expo for the RN `AppRoot` mount test), Expo SDK 57 / RN 0.86.

## Global Constraints

- **Zero protocol/hub/panel change:** no edit to `packages/devtools-core/src/protocol.ts`, `DevtoolsHub.ts`, `InspectorStore.ts`, `InspectorClient.ts`, or any of the four `packages/devtools-app/src/panels/*`. This feature is a new transport adapter + a new relay package + RN/panel wiring only.
- **`@rtc/devtools-core` is an rxjs-only leaf:** `WsRelayDuplex` may use the **global** `WebSocket` (reached via `globalThis`, present in browsers, RN, and Node 26) but **no new runtime dependency** and **no `node:` built-in import in `src`** (dep-cruiser `devtools-core-no-node-builtins`; test files under `__tests__/` are excepted). It imports no other `@rtc` package (`devtools-core-stays-pure`).
- **`@rtc/devtools-relay` is a standalone `ws`-only leaf:** it MAY use `node:` built-ins (it is a server, not `devtools-core`) and depends on `ws` at runtime; it imports **no** `@rtc` package (a new dep-cruiser rule pins this). It holds no protocol knowledge — it only pipes frames.
- **Dev-only on the RN side:** the RN devtools decoration and relay socket are `__DEV__`-gated; a production RN build applies no decorators and opens no socket (dormant-and-disconnected by construction). Construction is additionally wrapped in try/catch so a missing global `WebSocket` can never break app boot ("the tap must never hurt the app" — design §7).
- **The panel is the *existing* `devtools-app`:** it gains one small session variant (`createRelayInspectorSession`) constructing a `WsRelayDuplex(url, "panel")` instead of `BroadcastChannelDuplex`, selected by a `?relay=<url>` query. No panel/UI logic moves.
- **Every gate covers the new package** (all-gates-cover-every-package policy): `@rtc/devtools-relay` is under `packages/*` (auto-joins `pnpm-workspace.yaml`); this plan wires it into `.dependency-cruiser.cjs`, `knip.json`, and a root `dev:devtools:relay` script, and its `typecheck`/`test`/`build`/`clean` scripts match the other leaf packages so turbo picks them up.
- **Repo lint/style rules (CI-enforced):** run `biome ci` (not just `biome check` — it enforces `assist/organizeImports`); base + typed ESLint; `rtc/class-filename-match` (a file exporting `class Foo` must be `Foo.ts` — so `WsRelayDuplex.ts`); `func-style` (`function` declarations over top-level `const` arrows); `useBlockStatements` (braces on every control statement); `padding-line-between-statements`; no inline `style={{}}`; `#/*` subpath-alias imports (Biome bans ≥2-up relative imports); `verbatimModuleSyntax` (type-only imports must use `import type`); knip; `check:deps`; `check:doc-links`.
- **Dependency-freshness (on any dep add):** `ws@^8.21.0` and `@types/ws@^8.18.1` copy `@rtc/server`'s already-vetted ranges (syncpack enforces one range repo-wide — do not diverge); `@types/node@^26.0.0`, `tsc-alias@1.9.0`, `tsx@^4`, `vitest@^4` copy existing package ranges. Run `pnpm outdated -r` and honour the 24 h `minimumReleaseAge` cooldown before bumping any of them.
- **Test env:** `@rtc/devtools-core`, `@rtc/devtools-relay`, and the RN integration/unit tests run in the **node** environment (RN's vitest picks up `src/**/*.test.ts`; jest-expo picks up `*.test.tsx`). In node, `InspectorStore`'s flush is **synchronous** (no `requestAnimationFrame`), so a snapshot reads immediately after `apply()`; the one jest test that mounts a component uses `@testing-library/react-native`. The devtools-app relay-session test sets `// @vitest-environment node` to keep the store flush synchronous.
- **Run the full local gauntlet before every push:** `pnpm typecheck && pnpm test && pnpm lint && npx biome ci <changed-pkgs> && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links`.

## File Structure

**New in `packages/devtools-core/`:**
- `src/WsRelayDuplex.ts` — `class WsRelayDuplex<TSend,TRecv> implements Duplex` over a WebSocket, with an injectable socket factory.
- `src/__tests__/WsRelayDuplex.test.ts` — unit tests with a controllable fake socket (node).
- `src/index.ts` — **edit**: export `WsRelayDuplex`, `WebSocketLike`, `WebSocketFactory`.

**New package `packages/devtools-relay/`:**
- `package.json`, `tsconfig.json`, `vitest.config.ts` — leaf-package scaffold (mirrors `@rtc/ws-effects`).
- `src/relayServer.ts` — `createRelayServer({ port, log? }): RelayServer` (a `ws` `WebSocketServer` forwarder).
- `src/bin.ts` — CLI entry (`process.argv`/`env` → port; default 8790).
- `src/index.ts` — re-exports the server API.
- `src/__tests__/relayServer.test.ts` — integration test on an ephemeral port with real `ws` clients (node).
- `README.md`.

**New in `packages/client-react-native/`:**
- `src/app/devtools/presenterManifest.ts` — RN's copy of the presenter manifest (call-site knowledge, per the design).
- `src/app/devtools/resolveRelayUrl.ts` — pure `resolveRelayUrl(hostUri): string` (Metro host → `ws://<host>:8790`).
- `src/app/devtools/nativeDevtoolsHub.ts` — `createNativeDevtoolsHub(url, createSocket?): DevtoolsHub` (attaches `WsRelayDuplex(url,"app")`).
- `src/app/devtools/buildViewModelInputs.ts` — pure decorator-application seam (`instrumentPresenters`/`instrumentMachineFactories` when dev, plain otherwise).
- `src/app/devtools/__tests__/resolveRelayUrl.test.ts`, `nativeDevtoolsHub.test.ts`, `buildViewModelInputs.test.ts` — vitest (node).
- `src/app/devtools/relayEndToEnd.test.ts` — end-to-end loopback wiring test over a real relay (vitest, node).
- `src/app/AppRoot.tsx` — **edit**: `__DEV__`-gated devtools decoration + hub disposal.
- `src/app/AppRoot.test.tsx` — **edit**: mock the relay-backed hub so the mount test opens no socket.
- `jest.config.js` — **edit**: add a `@rtc/devtools-core` → dist moduleNameMapper.
- `package.json` — **edit**: add `@rtc/devtools-core` (dep) and `@rtc/devtools-relay` (devDep).

**New in `packages/devtools-app/`:**
- `src/relaySession.ts` — `createRelayInspectorSession(url, createSocket?): InspectorSession`.
- `src/__tests__/relaySession.test.ts` — vitest (node docblock).
- `src/main.tsx` — **edit**: pick relay vs BroadcastChannel from a `?relay=` query.

**Modified shared files:**
- `.dependency-cruiser.cjs` — add `devtools-relay` to two existing `to` lists + a new `devtools-relay-standalone` rule.
- `knip.json` — add the `packages/devtools-relay` workspace entry.
- `package.json` (root) — add `dev:devtools:relay`.
- `CLAUDE.md` — add the `@rtc/devtools-relay` package row + dependency note.
- `docs/architecture/20-devtools.md` — add §20.9 (WebSocket relay transport).

Existing patterns referenced verbatim: `packages/devtools-core/src/BroadcastChannelDuplex.ts` (the `Duplex` adapter shape), `packages/client-core/src/adapters/WsAdapter.ts` (pre-open buffer + reconnect), `packages/client-react/src/app/devtools/devtoolsHub.ts` + `AppRoot.tsx` + `presenterManifest.ts` (composition-root decoration), `packages/devtools-app/src/inspectorSession.ts` (panel session), `packages/client-react/src/app/__tests__/devtoolsIntegration.test.ts` (app↔inspector integration harness).

---

## Task 1: `WsRelayDuplex` transport adapter

**Problem:** RN has no same-origin `BroadcastChannel`; the bridge to the inspector is a WebSocket to the dev-machine relay. Add the adapter — structurally identical to `BroadcastChannelDuplex`, but over a socket with JSON frames, pre-open buffering, and reconnect.

**Files:**
- Create: `packages/devtools-core/src/WsRelayDuplex.ts`
- Modify: `packages/devtools-core/src/index.ts`
- Test: `packages/devtools-core/src/__tests__/WsRelayDuplex.test.ts`

**Interfaces:**
- Consumes: `Duplex` from `./channel`.
- Produces: `class WsRelayDuplex<TSend, TRecv> implements Duplex<TSend, TRecv>`; constructor `(url: string, role: "app" | "panel", createSocket?: WebSocketFactory, reconnectDelayMs?: number)`. Tags `?role=<role>` on the URL, buffers pre-open sends and flushes on open, JSON-encodes sends and JSON-decodes inbound onto `inbound$`, reconnects on drop until `dispose()`. Also exports `interface WebSocketLike` and `type WebSocketFactory` (the injectable seam).

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/WsRelayDuplex.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { WebSocketLike } from "../WsRelayDuplex";
import { WsRelayDuplex } from "../WsRelayDuplex";

class FakeSocket implements WebSocketLike {
  readyState = 0; // CONNECTING

  readonly sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function trackingFactory(sink: FakeSocket[]): (url: string) => WebSocketLike {
  return (url: string): WebSocketLike => {
    const socket = new FakeSocket(url);
    sink.push(socket);

    return socket;
  };
}

describe("WsRelayDuplex", () => {
  it("tags the role, buffers pre-open sends, and flushes them JSON-encoded on open", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<{ kind: string }, unknown>(
      "ws://localhost:8790",
      "app",
      trackingFactory(sockets),
    );

    expect(sockets[0]!.url).toBe("ws://localhost:8790?role=app");

    duplex.send({ kind: "hello" });
    expect(sockets[0]!.sent).toEqual([]); // buffered — socket not OPEN yet

    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual(['{"kind":"hello"}']);

    duplex.dispose();
  });

  it("appends role with & when the url already has a query", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, unknown>(
      "ws://host/relay?x=1",
      "panel",
      trackingFactory(sockets),
    );

    expect(sockets[0]!.url).toBe("ws://host/relay?x=1&role=panel");

    duplex.dispose();
  });

  it("parses inbound socket frames onto inbound$", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, { kind: string }>(
      "ws://host",
      "panel",
      trackingFactory(sockets),
    );
    const got: Array<{ kind: string }> = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    sockets[0]!.open();
    sockets[0]!.receive({ kind: "welcome" });

    expect(got).toEqual([{ kind: "welcome" }]);

    duplex.dispose();
  });

  it("reconnects with a fresh socket when the current one drops", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
      1000,
    );

    sockets[0]!.open();
    sockets[0]!.drop();
    expect(sockets).toHaveLength(1); // reconnect is scheduled, not immediate

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2); // fresh socket opened

    duplex.dispose();
    vi.useRealTimers();
  });

  it("stops reconnecting and drops sends after dispose", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<{ n: number }, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
      1000,
    );
    sockets[0]!.open();

    duplex.dispose();
    sockets[0]!.drop(); // a drop after dispose must not schedule a reconnect
    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1);

    duplex.send({ n: 1 });
    expect(sockets[0]!.sent).toEqual([]); // disposed → dropped

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test WsRelayDuplex`
Expected: FAIL — cannot find module `../WsRelayDuplex`.

- [ ] **Step 3: Implement `WsRelayDuplex`**

`packages/devtools-core/src/WsRelayDuplex.ts`:

```ts
import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import type { Duplex } from "./channel";

/** The structural subset of the platform `WebSocket` this adapter drives.
 * Declaring it ourselves (instead of leaning on the DOM `WebSocket` lib type)
 * keeps `@rtc/devtools-core` free of a DOM-lib dependency and lets the adapter
 * be unit-tested with a plain controllable fake in node. The real global
 * `WebSocket` (browsers, React Native, Node 26) is structurally compatible via
 * the default factory. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

/** Opens a socket to `url`. Injected so tests supply a fake; the default reaches
 * the platform `WebSocket` via `globalThis`. */
export type WebSocketFactory = (url: string) => WebSocketLike;

const WS_OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

function defaultWebSocketFactory(url: string): WebSocketLike {
  const Ctor = (
    globalThis as {
      WebSocket?: new (url: string) => WebSocketLike;
    }
  ).WebSocket;

  if (!Ctor) {
    throw new Error(
      "WsRelayDuplex: no global WebSocket is available in this environment",
    );
  }

  return new Ctor(url);
}

/** A `Duplex` (and therefore a `DevtoolsTransport`) over a WebSocket to the
 * standalone devtools relay — the React-Native / cross-machine counterpart of
 * `BroadcastChannelDuplex`, for environments with no same-origin
 * `BroadcastChannel`. The RN app opens `role: "app"`, the browser panel opens
 * `role: "panel"`, and the relay forwards frames between them.
 *
 * Frames are JSON (the wire protocol is JSON-serializable by design), so `send`
 * stringifies and inbound messages are parsed. Pre-open sends are buffered and
 * flushed on open (mirroring `WsAdapter`); a dropped socket transparently
 * reconnects until `dispose()` — the v1 `InspectorClient` re-hello / hub
 * re-welcome path resynchronises over the fresh socket. */
export class WsRelayDuplex<TSend, TRecv> implements Duplex<TSend, TRecv> {
  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  private readonly taggedUrl: string;

  private readonly createSocket: WebSocketFactory;

  private readonly reconnectDelayMs: number;

  private readonly sendQueue: string[] = [];

  private socket: WebSocketLike | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private disposed = false;

  constructor(
    url: string,
    role: "app" | "panel",
    createSocket: WebSocketFactory = defaultWebSocketFactory,
    reconnectDelayMs: number = DEFAULT_RECONNECT_DELAY_MS,
  ) {
    this.taggedUrl = url.includes("?")
      ? `${url}&role=${role}`
      : `${url}?role=${role}`;
    this.createSocket = createSocket;
    this.reconnectDelayMs = reconnectDelayMs;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) {
      return;
    }

    const socket = this.createSocket(this.taggedUrl);
    this.socket = socket;

    socket.onopen = (): void => {
      this.flushSendQueue();
    };

    socket.onmessage = (event: { data: unknown }): void => {
      let parsed: TRecv;

      try {
        parsed = JSON.parse(String(event.data)) as TRecv;
      } catch {
        return;
      }

      this.inboundSubject.next(parsed);
    };

    socket.onclose = (): void => {
      if (this.disposed) {
        return;
      }

      this.scheduleReconnect();
    };

    socket.onerror = (): void => {
      // onclose fires after onerror; reconnection is handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout((): void => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private flushSendQueue(): void {
    if (this.socket?.readyState !== WS_OPEN) {
      return;
    }

    for (const frame of this.sendQueue) {
      this.socket.send(frame);
    }

    this.sendQueue.length = 0;
  }

  send(msg: TSend): void {
    if (this.disposed) {
      return;
    }

    const frame = JSON.stringify(msg);

    if (this.socket?.readyState === WS_OPEN) {
      this.socket.send(frame);
    } else {
      this.sendQueue.push(frame);
    }
  }

  dispose(): void {
    this.disposed = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.sendQueue.length = 0;
    this.socket?.close();
    this.socket = null;
    this.inboundSubject.complete();
  }
}
```

- [ ] **Step 4: Export it from the package index**

In `packages/devtools-core/src/index.ts`, add the export in alphabetical position (Biome `organizeImports`/export ordering — place it after the `type SerializedValue` line, before `type DevtoolsTransport`, or wherever Biome sorts it; re-run `biome ci` to confirm order):

```ts
export {
  type WebSocketFactory,
  type WebSocketLike,
  WsRelayDuplex,
} from "./WsRelayDuplex";
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @rtc/devtools-core test WsRelayDuplex && pnpm --filter @rtc/devtools-core typecheck && pnpm --filter @rtc/devtools-core test`
Expected: 5 new tests pass; typecheck clean; the existing devtools-core suite stays green.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/WsRelayDuplex.ts packages/devtools-core/src/index.ts packages/devtools-core/src/__tests__/WsRelayDuplex.test.ts
git commit -m "feat(devtools-core): WsRelayDuplex transport adapter (WebSocket relay)"
```

---

## Task 2: `@rtc/devtools-relay` — the standalone relay server

**Problem:** the RN app and the browser panel are on different transports/origins; a small dev-machine WebSocket server forwards frames between them. It identifies each connection as app or panel (via the `?role=` query the duplex adds), broadcasts app→panels and forwards panel→app, and is stateless beyond the connection pair.

**Files:**
- Create: `packages/devtools-relay/package.json`
- Create: `packages/devtools-relay/tsconfig.json`
- Create: `packages/devtools-relay/vitest.config.ts`
- Create: `packages/devtools-relay/src/relayServer.ts`
- Create: `packages/devtools-relay/src/bin.ts`
- Create: `packages/devtools-relay/src/index.ts`
- Test: `packages/devtools-relay/src/__tests__/relayServer.test.ts`

**Interfaces:**
- Produces: `createRelayServer(options: { port: number; log?: (message: string) => void }): RelayServer`, where `RelayServer = { whenReady: Promise<number>; close(): Promise<void> }`. `whenReady` resolves with the bound port (pass `port: 0` for an ephemeral port in tests). A `bin` (`rtc-devtools-relay`) starts it on port 8790 (or `$RTC_DEVTOOLS_RELAY_PORT` / `argv[2]`).

- [ ] **Step 1: Create the package manifest**

`packages/devtools-relay/package.json` (mirrors `@rtc/ws-effects` + `@rtc/server`'s `ws` usage; `bin`/`start` per the task requirement):

```jsonc
{
  "name": "@rtc/devtools-relay",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "rtc-devtools-relay": "./dist/bin.js"
  },
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
    "test:coverage": "vitest run --coverage",
    "dev": "tsx src/bin.ts",
    "start": "node dist/bin.js",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "ws": "^8.21.0"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "@types/ws": "^8.18.1",
    "tsc-alias": "1.9.0",
    "tsx": "^4",
    "vitest": "^4"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

`packages/devtools-relay/tsconfig.json` (mirrors `@rtc/server`'s; `types: ["node"]` for the `node:http`/`process` usage):

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "types": ["node"],
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the vitest config**

`packages/devtools-relay/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Install so the workspace resolves the new package**

Run: `pnpm install`
Expected: `@rtc/devtools-relay` is linked; `ws`/`@types/ws`/`tsx` resolve. (If `pnpm` reports a syncpack range mismatch on `ws`/`@types/ws`/`@types/node`/`tsc-alias`/`tsx`/`vitest`, align the range with the one already in `packages/server/package.json` or the other packages — a single range is enforced.)

- [ ] **Step 5: Write the failing integration test**

`packages/devtools-relay/src/__tests__/relayServer.test.ts` (real `ws` clients on an ephemeral port — the relay stays `@rtc`-free, so tests use `ws` directly, never `WsRelayDuplex`):

```ts
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { createRelayServer, type RelayServer } from "#/relayServer";

let relay: RelayServer | null = null;

afterEach(async () => {
  await relay?.close();
  relay = null;
});

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => {
      resolve(ws);
    });
    ws.on("error", reject);
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(String(data));
    });
  });
}

describe("createRelayServer", () => {
  it("forwards panel->app and app->panel frames", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;

    const app = await open(`ws://127.0.0.1:${port}?role=app`);
    const panel = await open(`ws://127.0.0.1:${port}?role=panel`);

    const gotByApp = nextMessage(app);
    panel.send(JSON.stringify({ kind: "hello" }));
    expect(JSON.parse(await gotByApp)).toEqual({ kind: "hello" });

    const gotByPanel = nextMessage(panel);
    app.send(JSON.stringify({ kind: "welcome" }));
    expect(JSON.parse(await gotByPanel)).toEqual({ kind: "welcome" });

    app.close();
    panel.close();
  });

  it("broadcasts app frames to every connected panel", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;

    const app = await open(`ws://127.0.0.1:${port}?role=app`);
    const panelA = await open(`ws://127.0.0.1:${port}?role=panel`);
    const panelB = await open(`ws://127.0.0.1:${port}?role=panel`);

    const gotA = nextMessage(panelA);
    const gotB = nextMessage(panelB);
    app.send(JSON.stringify({ kind: "batch" }));

    expect(JSON.parse(await gotA)).toEqual({ kind: "batch" });
    expect(JSON.parse(await gotB)).toEqual({ kind: "batch" });

    app.close();
    panelA.close();
    panelB.close();
  });

  it("resolves close() cleanly with live connections", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;
    await open(`ws://127.0.0.1:${port}?role=app`);

    await expect(relay.close()).resolves.toBeUndefined();
    relay = null; // already closed; afterEach becomes a no-op
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-relay test relayServer`
Expected: FAIL — cannot find module `#/relayServer`.

- [ ] **Step 7: Implement the relay server**

`packages/devtools-relay/src/relayServer.ts`:

```ts
import type { IncomingMessage } from "node:http";

import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";

export interface RelayServerOptions {
  port: number;
  log?: (message: string) => void;
}

export interface RelayServer {
  /** Resolves with the actually-bound port once listening. Pass `port: 0` for
   * an ephemeral port in tests, then await this to learn it. */
  readonly whenReady: Promise<number>;
  close(): Promise<void>;
}

function roleFromRequest(req: IncomingMessage): "app" | "panel" {
  const url = req.url ?? "";
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const role = new URLSearchParams(query).get("role");

  return role === "app" ? "app" : "panel";
}

/** A tiny standalone WebSocket relay for devtools traffic. It identifies each
 * connection as app or panel (from the `?role=` query the WsRelayDuplex adds),
 * forwards app->panel(s) and panel->app, and supports multiple panels attached
 * to one app (broadcast app->panels). Stateless beyond the current app/panel
 * connections: it holds no protocol knowledge, it only pipes frames — the
 * devtools equivalent of the Chrome-extension background router, over sockets.
 * It carries only devtools frames on the dev machine, never the app's data
 * socket or the production @rtc/server. */
export function createRelayServer(options: RelayServerOptions): RelayServer {
  const log =
    options.log ??
    ((message: string): void => {
      console.log(`[devtools-relay] ${message}`);
    });

  const wss = new WebSocketServer({ port: options.port });
  let app: WebSocket | null = null;
  const panels = new Set<WebSocket>();

  const whenReady = new Promise<number>((resolve, reject) => {
    wss.on("listening", () => {
      const address = wss.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      log(`listening on ws://localhost:${port}`);
      resolve(port);
    });
    wss.on("error", reject);
  });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const role = roleFromRequest(req);

    if (role === "app") {
      app = socket;
      log("app connected");

      socket.on("message", (data: RawData) => {
        const frame = String(data);

        for (const panel of panels) {
          panel.send(frame);
        }
      });

      socket.on("close", () => {
        if (app === socket) {
          app = null;
        }

        log("app disconnected");
      });

      return;
    }

    panels.add(socket);
    log(`panel connected (${panels.size} total)`);

    socket.on("message", (data: RawData) => {
      app?.send(String(data));
    });

    socket.on("close", () => {
      panels.delete(socket);
      log(`panel disconnected (${panels.size} total)`);
    });
  });

  return {
    whenReady,
    close(): Promise<void> {
      return new Promise((resolve) => {
        for (const panel of panels) {
          panel.close();
        }

        panels.clear();
        app?.close();
        app = null;
        wss.close(() => {
          resolve();
        });
      });
    },
  };
}
```

- [ ] **Step 8: Write the package index + bin**

`packages/devtools-relay/src/index.ts`:

```ts
export {
  createRelayServer,
  type RelayServer,
  type RelayServerOptions,
} from "#/relayServer";
```

`packages/devtools-relay/src/bin.ts`:

```ts
import { createRelayServer } from "#/relayServer";

const DEFAULT_PORT = 8790;

function resolvePort(): number {
  const raw = process.argv[2] ?? process.env.RTC_DEVTOOLS_RELAY_PORT;

  if (raw === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
}

const relay = createRelayServer({ port: resolvePort() });

relay.whenReady.catch((error: unknown): void => {
  console.error("[devtools-relay] failed to start:", error);
  process.exitCode = 1;
});
```

- [ ] **Step 9: Run the tests + typecheck + a manual boot**

Run: `pnpm --filter @rtc/devtools-relay test relayServer && pnpm --filter @rtc/devtools-relay typecheck`
Expected: 3 tests pass; typecheck clean.

Then verify the CLI boots and stops:
Run: `pnpm --filter @rtc/devtools-relay dev & sleep 1; kill %1`
Expected: a `[devtools-relay] listening on ws://localhost:8790` line, then it exits on the `kill`.

- [ ] **Step 10: Commit**

```bash
git add packages/devtools-relay pnpm-lock.yaml
git commit -m "feat(devtools-relay): standalone WebSocket relay for devtools traffic"
```

---

## Task 3: RN devtools building blocks (manifest, relay URL, hub factory, decorator seam)

**Problem:** the RN composition root needs the same three decorators `client-react` applies, fed by a hub whose transport is `WsRelayDuplex(url, "app")`. Factor the testable pieces out of `AppRoot` first: a call-site presenter manifest, a Metro-host→relay-URL resolver, a hub factory, and a pure decorator-application seam — each unit-tested without `__DEV__` or a real socket.

**Files:**
- Create: `packages/client-react-native/src/app/devtools/presenterManifest.ts`
- Create: `packages/client-react-native/src/app/devtools/resolveRelayUrl.ts`
- Create: `packages/client-react-native/src/app/devtools/nativeDevtoolsHub.ts`
- Create: `packages/client-react-native/src/app/devtools/buildViewModelInputs.ts`
- Modify: `packages/client-react-native/package.json` (add `@rtc/devtools-core` dep)
- Test: `packages/client-react-native/src/app/devtools/__tests__/resolveRelayUrl.test.ts`
- Test: `packages/client-react-native/src/app/devtools/__tests__/nativeDevtoolsHub.test.ts`
- Test: `packages/client-react-native/src/app/devtools/__tests__/buildViewModelInputs.test.ts`

**Interfaces:**
- `resolveRelayUrl(hostUri: string | undefined): string` — `ws://<host-of-hostUri>:8790`, defaulting the host to `localhost`.
- `createNativeDevtoolsHub(relayUrl: string, createSocket?: WebSocketFactory): DevtoolsHub` — builds a `DevtoolsHub({ appId: "rtc-native" })` and attaches `WsRelayDuplex(relayUrl, "app", createSocket)`.
- `buildViewModelInputs(presenters, devtools: NativeDevtools | null): { presenters; factories }` — when `devtools` is null, returns `presenters` untouched + plain `createMachineFactories(presenters)`; otherwise returns `instrumentPresenters(...)` + `instrumentMachineFactories(createMachineFactories(instrumented), hub)`. `NativeDevtools = { hub: DevtoolsHub; manifest: PresenterManifest }`.

- [ ] **Step 1: Add the `@rtc/devtools-core` dependency**

In `packages/client-react-native/package.json` `dependencies`, add (alphabetical, next to the other `@rtc/*`):

```jsonc
    "@rtc/devtools-core": "workspace:*",
```

Run: `pnpm install`
Expected: linked. (Dependency-cruiser allows `client-react-native → devtools-core`; no rule forbids it — `client-react` already depends on it.)

- [ ] **Step 2: Create the RN presenter manifest**

The manifest is call-site knowledge (design §3). RN's `createApp` yields the same `Presenters` shape as `client-react`'s (both from `@rtc/client-core`), so the entries are identical — but `client-react`'s copy cannot be imported (`clients-never-import-each-other`), so RN carries its own.

`packages/client-react-native/src/app/devtools/presenterManifest.ts`:

```ts
import type { PresenterManifest } from "@rtc/devtools-core";

/** Which members of each presenter the RN devtools observes — the React-Native
 * call-site copy of client-react's manifest. devtools-core stays structurally
 * typed, so this concrete map lives next to the composition root. Entries mirror
 * how `createViewModel` reads each presenter: `props` are the observable-valued
 * properties, `methods` are parameterized stream methods, `machine: true` marks
 * shared Machine seams. Command-only presenters (execution, rfqQuote,
 * bootPreference) expose no observed state and are intentionally absent. */
export const NATIVE_PRESENTER_MANIFEST: PresenterManifest = {
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

> Note: verify this stays a verbatim copy of `packages/client-react/src/app/devtools/presenterManifest.ts`'s `PRESENTER_MANIFEST` object at implementation time (the two are kept in sync manually; a `git diff --no-index` of the two object bodies should show only the export-name difference).

- [ ] **Step 3: Create the relay-URL resolver + its failing test**

`packages/client-react-native/src/app/devtools/__tests__/resolveRelayUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveRelayUrl } from "#/app/devtools/resolveRelayUrl";

describe("resolveRelayUrl", () => {
  it("defaults to localhost when there is no Metro host", () => {
    expect(resolveRelayUrl(undefined)).toBe("ws://localhost:8790");
  });

  it("uses the Metro host so a physical device can reach the dev machine", () => {
    expect(resolveRelayUrl("192.168.1.5:8081")).toBe("ws://192.168.1.5:8790");
  });

  it("handles a bare host without a port", () => {
    expect(resolveRelayUrl("localhost")).toBe("ws://localhost:8790");
  });
});
```

Run: `pnpm --filter @rtc/client-react-native test resolveRelayUrl`
Expected: FAIL — cannot find module `#/app/devtools/resolveRelayUrl`.

`packages/client-react-native/src/app/devtools/resolveRelayUrl.ts`:

```ts
const DEFAULT_RELAY_PORT = 8790;

/** Build the devtools-relay URL from Metro's dev-server host. `hostUri`
 * (expo-constants, e.g. "192.168.1.5:8081" on a device or "localhost:8081" on
 * the simulator) gives the dev machine's reachable address; the relay listens
 * on DEFAULT_RELAY_PORT there. Falls back to localhost when hostUri is absent
 * (e.g. a production build, where the devtools path is never taken anyway). */
export function resolveRelayUrl(hostUri: string | undefined): string {
  const host = hostUri ? (hostUri.split(":")[0] ?? "localhost") : "localhost";

  return `ws://${host}:${DEFAULT_RELAY_PORT}`;
}
```

Run: `pnpm --filter @rtc/client-react-native test resolveRelayUrl`
Expected: PASS (3 tests).

- [ ] **Step 4: Create the native hub factory + its failing test**

`packages/client-react-native/src/app/devtools/__tests__/nativeDevtoolsHub.test.ts`:

```ts
import type { WebSocketLike } from "@rtc/devtools-core";
import { afterEach, describe, expect, it } from "vitest";

import { createNativeDevtoolsHub } from "#/app/devtools/nativeDevtoolsHub";

class SilentSocket implements WebSocketLike {
  readyState = 0;

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(): void {}

  close(): void {
    this.readyState = 3;
  }
}

describe("createNativeDevtoolsHub", () => {
  const sockets: SilentSocket[] = [];

  afterEach(() => {
    sockets.length = 0;
  });

  it("wires an app-tagged WsRelayDuplex at the given relay url", () => {
    const hub = createNativeDevtoolsHub("ws://localhost:8790", (url) => {
      const socket = new SilentSocket(url);
      sockets.push(socket);

      return socket;
    });

    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe("ws://localhost:8790?role=app");
    expect(typeof hub.dispose).toBe("function");

    hub.dispose();
  });
});
```

Run: `pnpm --filter @rtc/client-react-native test nativeDevtoolsHub`
Expected: FAIL — cannot find module `#/app/devtools/nativeDevtoolsHub`.

`packages/client-react-native/src/app/devtools/nativeDevtoolsHub.ts`:

```ts
import {
  type AppToInspector,
  DevtoolsHub,
  type InspectorToApp,
  type WebSocketFactory,
  WsRelayDuplex,
} from "@rtc/devtools-core";

/** Constructs the RN app-side devtools hub and attaches a WsRelayDuplex tagged
 * "app", pointed at the standalone relay. Called only under `__DEV__` from the
 * composition root, so a production RN build never constructs it and never opens
 * a socket. `createSocket` is injectable so unit tests assert the wiring without
 * a real WebSocket. */
export function createNativeDevtoolsHub(
  relayUrl: string,
  createSocket?: WebSocketFactory,
): DevtoolsHub {
  const hub = new DevtoolsHub({ appId: "rtc-native" });
  const transport = new WsRelayDuplex<AppToInspector, InspectorToApp>(
    relayUrl,
    "app",
    createSocket,
  );
  hub.attachTransport(transport);

  return hub;
}
```

Run: `pnpm --filter @rtc/client-react-native test nativeDevtoolsHub`
Expected: PASS (1 test).

- [ ] **Step 5: Create the decorator seam + its failing test**

The seam is the pure heart of §5.3 ("decorators applied under `__DEV__`, none in prod"). The test drives a real hub over an in-memory duplex pair (as `devtoolsIntegration.test.ts` does) and asserts the panel store observes a manifest-registered stream when devtools is on, and that plain factories are returned when off. It needs the same `expo-constants`/`react-native` stubs `buildNativePorts.test.ts` uses (RN's vitest runs in node, where those native modules do not load).

`packages/client-react-native/src/app/devtools/__tests__/buildViewModelInputs.test.ts`:

```ts
import { createApp } from "@rtc/client-core";
import {
  type AppToInspector,
  createInMemoryDuplexPair,
  DevtoolsHub,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildNativePorts } from "#/app/buildNativePorts";
import { buildViewModelInputs } from "#/app/devtools/buildViewModelInputs";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

// expo-constants has no runtime `expoConfig` under vitest-node; stub it so
// buildNativePorts imports cleanly (simulator branch never reads serverUrl).
vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
});

// buildNativePorts wires an AppearanceColorSchemeAdapter that reads
// react-native's `Appearance` at import time; react-native's Flow entry point
// does not parse under vitest's node transform, so stub the sliver used here.
vi.mock("react-native", () => {
  return {
    Appearance: {
      getColorScheme: () => {
        return null;
      },
      addChangeListener: () => {
        return { remove: () => {} };
      },
    },
  };
});

describe("buildViewModelInputs", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }

    cleanups.length = 0;
  });

  it("returns presenters untouched and plain factories when devtools is null", () => {
    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );

    const inputs = buildViewModelInputs(presenters, null);

    expect(inputs.presenters).toBe(presenters);
    expect(typeof inputs.factories.tileExecution).toBe("function");
  });

  it("applies the decorators so the panel store observes a registered stream", () => {
    const hub = new DevtoolsHub({ appId: "rtc-native-test" });
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    hub.attachTransport(appSide);

    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );
    const inputs = buildViewModelInputs(presenters, {
      hub,
      manifest: NATIVE_PRESENTER_MANIFEST,
    });

    // instrumentPresenters returns an instrumented COPY, not the raw object.
    expect(inputs.presenters).not.toBe(presenters);
    expect(typeof inputs.factories.tileExecution).toBe("function");

    const store = new InspectorStore();
    const client = new InspectorClient(inspectorSide, store);
    cleanups.push(() => {
      client.dispose();
      hub.dispose();
    });

    // In node env the store flushes synchronously, and the hub answers hello
    // with welcome + snapshot synchronously over the in-memory pair.
    client.start();

    const snapshot = store.getSnapshot();
    expect(snapshot.connected).toBe(true);
    expect(
      snapshot.streams.map((s) => {
        return s.streamId;
      }),
    ).toContain("connection.status$");
  });
});
```

Run: `pnpm --filter @rtc/client-react-native test buildViewModelInputs`
Expected: FAIL — cannot find module `#/app/devtools/buildViewModelInputs`.

`packages/client-react-native/src/app/devtools/buildViewModelInputs.ts`:

```ts
import {
  createMachineFactories,
  type MachineFactories,
  type Presenters,
} from "@rtc/client-core";
import {
  type DevtoolsHub,
  instrumentMachineFactories,
  instrumentPresenters,
  type PresenterManifest,
} from "@rtc/devtools-core";

export interface NativeDevtools {
  hub: DevtoolsHub;
  manifest: PresenterManifest;
}

export interface ViewModelInputs {
  presenters: Presenters;
  factories: MachineFactories;
}

/** Applies the same presenter/machine decorators client-react applies at its
 * composition root — but only when `devtools` is provided (dev builds). Returns
 * the (possibly instrumented) presenters and the machine factories to feed
 * `createViewModel`. When `devtools` is null (production), it returns the
 * presenters untouched and plain factories — zero devtools cost, matching how a
 * production RN build ships dormant. Pure and socket-free, so it is unit-tested
 * directly with an in-memory-transport hub. */
export function buildViewModelInputs(
  presenters: Presenters,
  devtools: NativeDevtools | null,
): ViewModelInputs {
  if (!devtools) {
    return {
      presenters,
      factories: createMachineFactories(presenters),
    };
  }

  const instrumented = instrumentPresenters(
    presenters,
    devtools.manifest,
    devtools.hub,
  );

  return {
    presenters: instrumented,
    factories: instrumentMachineFactories(
      createMachineFactories(instrumented),
      devtools.hub,
    ),
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native test buildViewModelInputs resolveRelayUrl nativeDevtoolsHub`
Expected: all pass. (If module resolution of `@rtc/devtools-core`/`@rtc/client-core` fails because dist is stale, run `pnpm build` once first — RN vitest resolves workspace packages to their built `dist/`.)

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/app/devtools packages/client-react-native/package.json pnpm-lock.yaml
git commit -m "feat(rn): devtools manifest, relay-url resolver, hub factory, decorator seam"
```

---

## Task 4: Wire the RN composition root (`__DEV__`-gated)

**Problem:** `AppRoot` builds the ViewModel from plain presenters/factories. Gate the devtools decoration behind `__DEV__`, feed it a relay-backed hub, and dispose the hub on unmount — while keeping the existing jest mount test green (it must not open a socket).

**Files:**
- Modify: `packages/client-react-native/src/app/AppRoot.tsx`
- Modify: `packages/client-react-native/src/app/AppRoot.test.tsx`
- Modify: `packages/client-react-native/jest.config.js`

**Interfaces:** none new — this is composition wiring (typecheck-verified + the existing jest mount test).

- [ ] **Step 1: Add the jest moduleNameMapper for devtools-core**

`AppRoot.tsx` now transitively imports `@rtc/devtools-core` (via `buildViewModelInputs`), which jest-expo must resolve to built JS like the other `@rtc/*` packages. In `packages/client-react-native/jest.config.js`, add to `moduleNameMapper` (after the `@rtc/react-bindings` line):

```js
    "^@rtc/devtools-core$": "<rootDir>/../devtools-core/dist/index.js",
```

- [ ] **Step 2: Edit `AppRoot.tsx`**

Replace the current imports block and the `if (ref.current === null)` build with the dev-gated version. Full replacement of the two edited regions:

Imports (replace the existing `createApp, createMachineFactories` import and add the devtools imports; keep the React and react-bindings imports):

```tsx
import { type ReactElement, type ReactNode, useEffect, useRef } from "react";

import Constants from "expo-constants";

import { createApp } from "@rtc/client-core";
import {
  createViewModel,
  type ViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";

import { buildNativePorts } from "#/app/buildNativePorts";
import {
  buildViewModelInputs,
  type NativeDevtools,
} from "#/app/devtools/buildViewModelInputs";
import { createNativeDevtoolsHub } from "#/app/devtools/nativeDevtoolsHub";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";
import { resolveRelayUrl } from "#/app/devtools/resolveRelayUrl";
```

Add this module-level helper (below the imports, above `AppRoot`):

```tsx
/** Dev-only devtools wiring. In a production RN build (`__DEV__` false) this is
 * null — no decorators, no relay socket, dormant-and-disconnected by
 * construction. Wrapped in try/catch because the tap must never break app boot:
 * if the relay transport can't be constructed (e.g. no global WebSocket), the
 * app ships without devtools rather than crashing. */
function createNativeDevtools(): NativeDevtools | null {
  if (!__DEV__) {
    return null;
  }

  try {
    return {
      hub: createNativeDevtoolsHub(
        resolveRelayUrl(Constants.expoConfig?.hostUri),
      ),
      manifest: NATIVE_PRESENTER_MANIFEST,
    };
  } catch {
    return null;
  }
}
```

Replace the ref build inside `AppRoot`:

```tsx
  if (ref.current === null) {
    const { ports, dispose } = buildNativePorts({ simulator });
    const { presenters, commands } = createApp(ports);

    const devtools = createNativeDevtools();
    const inputs = buildViewModelInputs(presenters, devtools);
    const viewModel = createViewModel(
      inputs.presenters,
      inputs.factories,
      commands,
    );

    ref.current = {
      viewModel,
      dispose: (): void => {
        devtools?.hub.dispose();
        dispose();
      },
    };
  }
```

(Leave the `keepAlive`/`useEffect` teardown block and the `Composition` interface unchanged — `Composition.dispose` now also disposes the hub.)

- [ ] **Step 3: Update the jest mount test so it opens no socket**

In `packages/client-react-native/src/app/AppRoot.test.tsx`, add a mock of the hub factory (below the existing AsyncStorage mock). A `Proxy` returns a no-op for every hub method so `instrumentPresenters`/`instrumentMachineFactories` inside `buildViewModelInputs` run without a real hub or socket, and `dispose` is a no-op:

```ts
// __DEV__ is true under jest; stub the relay-backed hub so mounting opens no
// socket. Every hub method is a no-op (machineCreated returns an id string),
// so buildViewModelInputs' decorators run harmlessly and unmount's
// hub.dispose() is a no-op.
jest.mock("#/app/devtools/nativeDevtoolsHub", () => {
  const noopHub = new Proxy(
    {},
    {
      get: (_target, prop): unknown => {
        if (prop === "machineCreated") {
          return (): string => {
            return "m0";
          };
        }

        return (): void => {};
      },
    },
  );

  return {
    createNativeDevtoolsHub: (): unknown => {
      return noopHub;
    },
  };
});
```

- [ ] **Step 4: Run the RN test suites + typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`
Expected: typecheck clean (`__DEV__` resolves from RN's globals); vitest tests (Task 3) pass; the jest `AppRoot` mount/unmount test passes with no socket opened. (Run `pnpm build` first if `@rtc/*` dist is stale.)

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/app/AppRoot.tsx packages/client-react-native/src/app/AppRoot.test.tsx packages/client-react-native/jest.config.js
git commit -m "feat(rn): dev-gated devtools decoration at the composition root"
```

---

## Task 5: Panel-side relay session in `devtools-app`

**Problem:** the browser inspector must be pointable at the relay. Add a session variant that constructs `WsRelayDuplex(url, "panel")` instead of `BroadcastChannelDuplex` (like the Chrome extension's `panelSession`), selected by a `?relay=<url>` query on the panel URL.

**Files:**
- Create: `packages/devtools-app/src/relaySession.ts`
- Modify: `packages/devtools-app/src/main.tsx`
- Test: `packages/devtools-app/src/__tests__/relaySession.test.ts`

**Interfaces:**
- Consumes: `WsRelayDuplex`, `InspectorClient`, `InspectorStore`, `type AppToInspector`, `type InspectorToApp`, `type WebSocketFactory` from `@rtc/devtools-core`; `type InspectorSession` from `#/inspectorSession`.
- Produces: `createRelayInspectorSession(relayUrl: string, createSocket?: WebSocketFactory): InspectorSession`.

- [ ] **Step 1: Write the failing test**

The test drives a fake socket (injected via `createSocket`) and asserts the session sends `hello` on open and reflects a `welcome` in the store. `@vitest-environment node` keeps the store flush synchronous (devtools-app defaults to jsdom).

`packages/devtools-app/src/__tests__/relaySession.test.ts`:

```ts
// @vitest-environment node
import { PROTOCOL_VERSION, type WebSocketLike } from "@rtc/devtools-core";
import { describe, expect, it } from "vitest";

import { createRelayInspectorSession } from "#/relaySession";

class FakeSocket implements WebSocketLike {
  readyState = 0;

  readonly sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("createRelayInspectorSession", () => {
  it("connects a panel-tagged relay socket, sends hello, and reflects welcome", () => {
    let socket: FakeSocket | null = null;
    const session = createRelayInspectorSession("ws://localhost:8790", (url) => {
      socket = new FakeSocket(url);

      return socket;
    });

    const live = socket as unknown as FakeSocket;
    expect(live.url).toBe("ws://localhost:8790?role=panel");

    live.open(); // flush the buffered hello
    expect(
      live.sent.some((frame) => {
        return frame.includes('"hello"');
      }),
    ).toBe(true);

    live.receive({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-native" });

    const snapshot = session.store.getSnapshot();
    expect(snapshot.connected).toBe(true);
    expect(snapshot.appId).toBe("rtc-native");

    session.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test relaySession`
Expected: FAIL — cannot find module `#/relaySession`.

- [ ] **Step 3: Implement `createRelayInspectorSession`**

`packages/devtools-app/src/relaySession.ts`:

```ts
import {
  type AppToInspector,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
  type WebSocketFactory,
  WsRelayDuplex,
} from "@rtc/devtools-core";

import type { InspectorSession } from "#/inspectorSession";

/** Panel-side session pointed at the standalone WebSocket relay (React Native
 * inspection): the browser `devtools-app`, served from anywhere, constructs a
 * `WsRelayDuplex` tagged "panel" instead of a same-origin
 * `BroadcastChannelDuplex`. The `InspectorStore` + `InspectorClient` and the
 * four panels are byte-identical to the BroadcastChannel path — only the
 * transport differs. `createSocket` is injectable so tests drive a fake socket
 * without a real relay. */
export function createRelayInspectorSession(
  relayUrl: string,
  createSocket?: WebSocketFactory,
): InspectorSession {
  const store = new InspectorStore();
  const channel = new WsRelayDuplex<InspectorToApp, AppToInspector>(
    relayUrl,
    "panel",
    createSocket,
  );
  const client = new InspectorClient(channel, store);
  client.start();

  return {
    store,
    dispose: (): void => {
      client.dispose();
      channel.dispose();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-app test relaySession`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the `?relay=` query into `main.tsx`**

In `packages/devtools-app/src/main.tsx`, select the session by URL query so the same bundle serves both transports. Replace the session construction line:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { InspectorApp } from "#/InspectorApp";
import "#/index.css";
import { createInspectorSession } from "#/inspectorSession";
import { createRelayInspectorSession } from "#/relaySession";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

// Point at the standalone relay (React Native inspection) via `?relay=<ws-url>`;
// otherwise use the same-origin BroadcastChannel (web app inspection).
const relayUrl = new URLSearchParams(window.location.search).get("relay");

// One session for the module's lifetime — the panel never remounts the
// underlying transport/InspectorClient, only the view over its store.
const { store } = relayUrl
  ? createRelayInspectorSession(relayUrl)
  : createInspectorSession();

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={store} />
  </StrictMode>,
);
```

- [ ] **Step 6: Verify the app still builds + tests pass**

Run: `pnpm --filter @rtc/devtools-app typecheck && pnpm --filter @rtc/devtools-app test`
Expected: typecheck clean; all devtools-app tests (including the new relay session) pass.

- [ ] **Step 7: Commit**

```bash
git add packages/devtools-app/src/relaySession.ts packages/devtools-app/src/main.tsx packages/devtools-app/src/__tests__/relaySession.test.ts
git commit -m "feat(devtools-app): relay-backed panel session selectable via ?relay="
```

---

## Task 6: End-to-end loopback wiring test

**Problem:** prove the whole loop over **real** sockets, in node, with no device: an app-side hub (`WsRelayDuplex "app"`) ↔ the real relay ↔ a panel-side `InspectorClient` (`WsRelayDuplex "panel"`), asserting the panel store observes streams the RN-equivalent app emits (the in-memory simulator harness, not a device). This is design §5.4.

**Files:**
- Modify: `packages/client-react-native/package.json` (add `@rtc/devtools-relay` devDep)
- Test: `packages/client-react-native/src/app/devtools/relayEndToEnd.test.ts`

**Interfaces:** none — an integration test.

- [ ] **Step 1: Add the relay devDependency**

In `packages/client-react-native/package.json` `devDependencies`, add (alphabetical):

```jsonc
    "@rtc/devtools-relay": "workspace:*",
```

Run: `pnpm install`
Expected: linked. (RN → devtools-relay is allowed; devtools-relay is not a client, and no dep-cruiser rule forbids it. Housing the e2e here — rather than inside `@rtc/devtools-relay` — keeps the relay package a pure, `@rtc`-free leaf.)

- [ ] **Step 2: Write the failing end-to-end test**

`packages/client-react-native/src/app/devtools/relayEndToEnd.test.ts` (real relay + real global `WebSocket` from Node 26; real timers with `vi.waitFor`; the same expo-constants/react-native stubs as Task 3):

```ts
import { createApp } from "@rtc/client-core";
import {
  type AppToInspector,
  DevtoolsHub,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
  instrumentPresenters,
  WsRelayDuplex,
} from "@rtc/devtools-core";
import { createRelayServer, type RelayServer } from "@rtc/devtools-relay";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildNativePorts } from "#/app/buildNativePorts";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
});

vi.mock("react-native", () => {
  return {
    Appearance: {
      getColorScheme: () => {
        return null;
      },
      addChangeListener: () => {
        return { remove: () => {} };
      },
    },
  };
});

describe("RN inspection end-to-end over the relay", () => {
  let relay: RelayServer | null = null;
  let hub: DevtoolsHub | null = null;
  let client: InspectorClient | null = null;

  afterEach(async () => {
    client?.dispose();
    hub?.dispose();
    await relay?.close();
    client = null;
    hub = null;
    relay = null;
  });

  it("delivers the RN app's manifest streams to the panel store", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;
    const url = `ws://127.0.0.1:${port}`;

    // App side — exactly what AppRoot builds under __DEV__.
    hub = new DevtoolsHub({ appId: "rtc-native" });
    hub.attachTransport(
      new WsRelayDuplex<AppToInspector, InspectorToApp>(url, "app"),
    );
    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );
    instrumentPresenters(presenters, NATIVE_PRESENTER_MANIFEST, hub);

    // Panel side — exactly what createRelayInspectorSession builds.
    const store = new InspectorStore();
    client = new InspectorClient(
      new WsRelayDuplex<InspectorToApp, AppToInspector>(url, "panel"),
      store,
    );
    client.start();

    await vi.waitFor(
      () => {
        const snapshot = store.getSnapshot();
        expect(snapshot.connected).toBe(true);
        expect(
          snapshot.streams.map((s) => {
            return s.streamId;
          }),
        ).toContain("connection.status$");
      },
      { timeout: 5000, interval: 25 },
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `pnpm build && pnpm --filter @rtc/client-react-native test relayEndToEnd`
Expected: first run (before `@rtc/devtools-relay` is built) may fail to resolve; after `pnpm build` the relay + core dist exist and the test PASSES — the panel store flips `connected: true` and lists `connection.status$` within the window. (It exercises the real Node-26 global `WebSocket` client + the `ws` relay server end to end.)

- [ ] **Step 4: Commit**

```bash
git add packages/client-react-native/src/app/devtools/relayEndToEnd.test.ts packages/client-react-native/package.json pnpm-lock.yaml
git commit -m "test(rn): end-to-end devtools loopback over the real relay"
```

---

## Task 7: Workspace integration, gates, and docs

**Files:**
- Modify: `.dependency-cruiser.cjs`
- Modify: `knip.json`
- Modify: `package.json` (root — add `dev:devtools:relay`)
- Create: `packages/devtools-relay/README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture/20-devtools.md`

**Interfaces:** none (integration + documentation).

- [ ] **Step 1: Extend the dependency-cruiser rules**

In `.dependency-cruiser.cjs`:

(a) Add `devtools-relay` to the `devtools-core-stays-pure` rule's `to.path` regex group (devtools-core must not import the relay):

```js
        path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|solid-bindings|client-solid|motion-core|ui-contract|server|ws-effects|devtools-app|devtools-relay)/",
```

(b) Add `devtools-relay` to the `devtools-app-protocol-only` rule's `to.path` regex group (the panel app must not import the relay):

```js
        path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|solid-bindings|client-solid|motion-core|ui-contract|server|ws-effects|devtools-relay)/",
```

(c) Add a new leaf rule after `devtools-app-protocol-only` (the relay is a standalone `ws`-only server — it imports no `@rtc` package):

```js
    {
      name: "devtools-relay-standalone",
      severity: "error",
      comment:
        "@rtc/devtools-relay is a standalone ws-only relay — it holds no protocol knowledge and must not import any @rtc package.",
      from: { path: "^packages/devtools-relay/src" },
      to: {
        path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|solid-bindings|client-solid|motion-core|ui-contract|server|ws-effects|devtools-core|devtools-app)/",
      },
    },
```

Run: `pnpm check:deps`
Expected: clean (devtools-core imports no relay; devtools-app imports no relay; relay imports no `@rtc`; RN → devtools-core/relay is allowed and unflagged).

- [ ] **Step 2: Add the knip workspace entry**

In `knip.json` `workspaces`, add after the `packages/devtools-app` block (`bin.ts` is an entry point, not imported by other modules, so it must be declared or knip flags it unused):

```jsonc
    "packages/devtools-relay": {
      "entry": ["src/index.ts", "src/bin.ts"],
      "project": "src/**/*.ts"
    },
```

Run: `pnpm lint:dead`
Expected: clean (no unused exports/deps; `ws` is used by `relayServer.ts`, `@rtc/devtools-relay` is used by the RN e2e test, `@rtc/devtools-core` is used across RN + devtools-app).

- [ ] **Step 3: Add the root dev script**

In root `package.json` `scripts`, after `dev:devtools`:

```jsonc
    "dev:devtools:relay": "pnpm --filter @rtc/devtools-relay dev",
```

Run: `pnpm dev:devtools:relay & sleep 1; kill %1`
Expected: `[devtools-relay] listening on ws://localhost:8790`, then exit.

- [ ] **Step 4: Write the relay package README**

`packages/devtools-relay/README.md`:

```markdown
# @rtc/devtools-relay

A tiny standalone WebSocket relay that bridges the RTC state inspector
(`@rtc/devtools-app`) to the React Native client. Runs only on the developer's
machine; carries only devtools frames — never app data, never the production
`@rtc/server`.

## How it fits

A fourth `Duplex` behind the inspector's transport seam (after
BroadcastChannel, the Chrome extension's runtime port). The protocol, hub,
`InspectorStore`/`InspectorClient`, and the four panels are unchanged:

- The RN app (dev build only) opens `WsRelayDuplex(url, "app")` as its
  `DevtoolsHub` transport and applies the same three composition-root decorators
  `client-react` applies.
- The browser `devtools-app` opens `WsRelayDuplex(url, "panel")` (via
  `?relay=<ws-url>`).
- This relay identifies each connection by its `?role=` query, broadcasts
  app -> panels, forwards panel -> app, and pipes bytes with no protocol
  knowledge.

## Run it

    pnpm dev:devtools:relay        # ws://localhost:8790 (default)
    RTC_DEVTOOLS_RELAY_PORT=9999 pnpm dev:devtools:relay
    pnpm --filter @rtc/devtools-relay dev 8123   # positional port arg

Then boot a dev RN build (`pnpm dev:ios`) and open the panel in a browser at
`http://localhost:5280/?relay=ws://localhost:8790` (standalone dev server) or
the deployed `/devtools/?relay=...`. The panels show the mobile client live;
backgrounding the app flips the panel to "disconnected" (relay socket drop +
the panel-side liveness timer), and reconnecting recovers via the re-hello path.

Dormancy holds: the hub stays dormant until the panel's `InspectorClient` sends
`hello` through the relay — opening the relay socket alone wakes nothing.
```

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, add the package to the Package Structure block (after the `devtools-app/` line):

```
  devtools-relay/      @rtc/devtools-relay      — Standalone dev-machine WebSocket relay bridging the browser inspector to the React Native client (WsRelayDuplex "app" ↔ relay ↔ "panel"). Dev-only, carries only devtools frames. Depends on `ws` at runtime; imports no @rtc package. Pure ws-only leaf.
```

And extend the **Devtools dependency rule** paragraph with one sentence:

```
`@rtc/devtools-relay` is a standalone `ws`-only leaf that imports no `@rtc` package (a dep-cruiser rule pins it); `WsRelayDuplex` (in `devtools-core`) is the RN/cross-machine transport that pairs with it, and `client-react-native` applies the same three decorators under `__DEV__` only.
```

- [ ] **Step 6: Document the transport in the architecture doc**

In `docs/architecture/20-devtools.md`, add a new subsection after §20.8 (keep the numbering scheme — this becomes §20.9). Content verbatim:

```markdown
### 20.9 WebSocket relay transport (React Native)

React Native has no same-origin `BroadcastChannel`, so RN inspection uses a
third transport adapter, `WsRelayDuplex` (in `@rtc/devtools-core`), plus a
standalone dev-machine relay (`@rtc/devtools-relay`). The RN app — dev build
only, `__DEV__`-gated at the composition root — opens `WsRelayDuplex(url,
"app")` as its `DevtoolsHub` transport and applies the same three decorators
`client-react` applies; the browser `devtools-app` opens `WsRelayDuplex(url,
"panel")` via a `?relay=<ws-url>` query; the relay forwards frames between them
(broadcast app→panels, single panel→app), identifying each connection by its
`?role=` query and holding no protocol knowledge. Frames are JSON; the duplex
buffers pre-open sends and reconnects on drop, so a device reconnect or relay
restart recovers via the v1 `InspectorClient` re-hello / hub re-welcome path
(and the panel-side liveness timer covers an abrupt device loss). Devtools
traffic stays entirely off the app's data socket and the production
`@rtc/server`. A production RN build applies no decorators and opens no socket
— dormant-and-disconnected by construction, exactly like the web app ships
dormant.
```

- [ ] **Step 7: Run the doc-links gate**

Run: `pnpm check:doc-links`
Expected: clean (the new README and doc text add no broken relative links or anchors).

- [ ] **Step 8: Commit**

```bash
git add .dependency-cruiser.cjs knip.json package.json packages/devtools-relay/README.md CLAUDE.md docs/architecture/20-devtools.md
git commit -m "chore(devtools-relay): workspace wiring, dep-cruiser leaf rule, docs"
```

---

## Final: gauntlet + STATUS

- [ ] **Run the full local gauntlet**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-relay packages/devtools-app packages/client-react-native && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links
```
Expected: all green. Fix any Biome `organizeImports`/`func-style`/`useBlockStatements`/`padding-line-between-statements` findings, knip unused-export/dep findings, or dep-cruiser findings before pushing. (`pnpm build` first so RN's vitest integration tests can resolve the built `@rtc/devtools-core` / `@rtc/devtools-relay` dist.)

- [ ] **Manual acceptance (documented, not automated)**

Automated device-driving is out of scope (design §5.5). Verify by hand and record the result in the PR:
1. `pnpm dev:devtools:relay` (relay on `ws://localhost:8790`).
2. `pnpm dev:ios` (a dev RN build; run once from the primary checkout to create the native `ios/` folder).
3. Open the panel in a browser at `http://localhost:5280/?relay=ws://localhost:8790` (`pnpm dev:devtools` for the standalone panel server).
4. Confirm the four panels render live data and the connection badge shows `rtc-native`.
5. Background the app → panel flips to "disconnected" (relay drop + liveness timer). Foreground → panel reconnects with no manual step.
6. Confirm a production RN export (`pnpm --filter @rtc/client-react-native export`) opens no relay socket (dormant by construction).

- [ ] **Update STATUS.md**

Per the `tracking-workstream-status` skill: this workstream realises the RN-inspection future extension. When the PR merges, update `docs/STATUS.md` — if a "DevTools React Native inspection" pending line exists, remove it (or mark the relay/transport items done); bump the `Last updated` header. If no such line exists, add nothing.

---

## Self-Review

**Spec coverage:**
- §2.1 `WsRelayDuplex` transport adapter (constructor `(url, role)`, role tag, pre-open buffer, `inbound$`, reconnect, dispose) → Task 1 (with an injected socket-factory seam per the spec's "inject via constructor param or factory"). ✓
- §2.2 relay process — new package `@rtc/devtools-relay`, `ws`-based, role identification, app→panel(s) broadcast + panel→app, logs connect/disconnect, stateless, ephemeral-port test with fake app+panel clients, `bin`/start + root `dev:devtools:relay` → Task 2 + Task 7 Step 3. ✓ (Chose the **new package**, not an RN dev script, per the instruction.)
- §2.3 RN composition-root wiring — dev-gated (`__DEV__`), same three decorators, hub with `WsRelayDuplex(url,"app")`, Metro/localhost default port 8790 → Tasks 3–4 (`instrumentWsAdapter` note below). ✓
- §3 "adds a panel-side session variant like the Chrome extension's" → Task 5 (`createRelayInspectorSession`). ✓
- §4 dormancy — prod RN opens no socket, dev RN dormant until `hello` → Task 4 (`__DEV__` gate + try/catch), asserted by `buildViewModelInputs(null)` and by the hub going live only on `hello`. ✓
- §5.1 duplex unit test → Task 1; §5.2 relay unit/integration → Task 2; §5.3 RN wiring (decorators under dev, none in prod, hub receives a WsRelayDuplex) → Task 3 (`buildViewModelInputs` on/off + `createNativeDevtoolsHub` app-tag test); §5.4 end-to-end node loopback → Task 6; §5.5 manual acceptance → Final. ✓
- §7 success criteria 1–5 → Task 6 (loopback proof of criteria 1/4) + Final acceptance (2/3) + zero protocol/hub/panel edits (criterion 4, enforced by the Global Constraints). ✓

**`instrumentWsAdapter` note:** the spec §2.3 lists all three decorators. `instrumentPresenters` and `instrumentMachineFactories` are applied via `buildViewModelInputs` (Task 3). `instrumentWsAdapter` taps the WS transport for the wire panel; RN's real-WS branch lives in `buildNativePorts`. This plan wires the two composition-root decorators (the observable state/machine layer, which the loopback test proves); adding `instrumentWsAdapter` to the RN real-WS branch is a one-line analogue of `client-react`'s `buildBrowserPorts` (`instrumentWsAdapter(new WsAdapter(...), hub)`), but it requires threading the dev-gated hub into `buildNativePorts` and is only exercised against a live server (not the simulator loopback). If the executor wants full wire-panel parity in this PR, add it in Task 4 by passing the hub into `buildNativePorts({ simulator, hub })` and wrapping `new WsAdapter(...)` — otherwise note it in the PR as a scoped follow-up (the wire panel is simply empty under the simulator branch, exactly as it is for `client-react`'s simulator branch).

**Placeholder scan:** every code step shows complete code; every command has an expected result. The two "verify/read" asides (Task 3 Step 2's manifest sync check, the `instrumentWsAdapter` note) are deliberate correctness guards, not placeholders.

**Type consistency:** `WsRelayDuplex(url, role, createSocket?, reconnectDelayMs?)`, `WebSocketLike`, `WebSocketFactory` (Task 1) are consumed identically in `nativeDevtoolsHub.ts`, `relaySession.ts`, and all their tests. `createRelayServer({ port, log? }): { whenReady, close }` (Task 2) is used identically in the relay test and the RN e2e test. `resolveRelayUrl(hostUri)`, `createNativeDevtoolsHub(url, createSocket?)`, `buildViewModelInputs(presenters, devtools)` + `NativeDevtools` (Task 3) are consumed unchanged in `AppRoot.tsx` (Task 4). `createRelayInspectorSession(url, createSocket?)` (Task 5) matches its test and `main.tsx`. The `?role=app`/`?role=panel` query and port `8790` are consistent across the duplex, relay, resolver, README, and docs.

**Ordering note:** Tasks are sequential by dependency — Task 1 (duplex) → Task 2 (relay, independent but before the e2e) → Task 3 (RN seams, needs the duplex export) → Task 4 (RN wiring, needs Task 3) → Task 5 (panel, needs the duplex export; independent of 3/4) → Task 6 (e2e, needs the duplex + relay + RN manifest) → Task 7 (gates/docs). Task 5 may be done any time after Task 1. No two tasks edit the same file except `packages/client-react-native/package.json` (Task 3 adds the dep, Task 6 adds the devDep — additive, non-conflicting).
