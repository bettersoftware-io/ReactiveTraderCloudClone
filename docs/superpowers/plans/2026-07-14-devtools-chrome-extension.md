# DevTools Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an MV3 Chrome DevTools extension (`@rtc/devtools-extension`) that attaches the existing RTC state inspector to any running app instance — including the deployed build — via a new `Duplex` transport, changing nothing in the protocol, hub, inspector store/client, or the four panels.

**Architecture:** A DevTools "RTC" panel hosts the existing `InspectorApp` but constructs a `ChromeRuntimeDuplex` (a `chrome.runtime.Port`-backed `Duplex`) instead of a `BroadcastChannelDuplex`. A content script injected into the app tab bridges the page's same-origin `rtc-devtools` BroadcastChannel to `chrome.runtime`; a background service worker routes messages between the panel port and the content-script port, keyed by tab id. All routing/relay/transport logic is factored into pure, injected-dependency cores that are unit-tested in node; the thin `chrome.*` entry files are typecheck-only.

**Tech Stack:** TypeScript, MV3 (`manifest_version: 3`), `chrome.devtools.panels`, `chrome.runtime` ports, `@types/chrome`, Vite 8 (multi-entry build), Vitest 4, React 19 (reused via `@rtc/devtools-app`), RxJS 7 (`Subject` in the duplex, matching `@rtc/devtools-core`).

## Global Constraints

- **Surface:** DevTools panel only (`chrome.devtools.panels.create("RTC", …)`). Not side-panel, not popup.
- **Observe-only:** the extension adds a transport, never a new capability. No app-state mutation.
- **Zero app-side changes:** the content script reuses the existing channel name `"rtc-devtools"`. `client-react` and the app-side hub are not modified.
- **Only additive change outside the new package:** `@rtc/devtools-app` gains an `exports` field exposing `InspectorApp` + its CSS. No logic moves.
- **New package is a leaf consumer:** `@rtc/devtools-extension` (`"private": true`, `"type": "module"`) depends on `@rtc/devtools-core` and `@rtc/devtools-app`; nothing depends on it. `@types/chrome` is a devDependency.
- **Distribution:** unpacked dev extension only (`chrome://extensions` → "Load unpacked"). No Chrome Web Store submission.
- **Dormancy preserved:** injecting the content script must not send `hello`; only the panel's `InspectorClient.start()` does. An installed-but-closed panel costs the app nothing.
- **Transport contract (`@rtc/devtools-core/src/channel.ts`):** `interface Duplex<TSend, TRecv> { send(msg: TSend): void; inbound$: Observable<TRecv>; dispose(): void; }`. The inspector side is `Duplex<InspectorToApp, AppToInspector>` (the flip of the hub's transport).
- **Repo lint/style rules (all enforced in CI):** Biome (run `biome ci`, not just `biome check` — it enforces `assist/organizeImports`); base + typed ESLint; `rtc/class-filename-match` (a file exporting class `Foo` must be `Foo.ts`); `func-style` (prefer `function` declarations over `const` arrows for top-level functions); `useBlockStatements` (braces on every control statement); `padding-line-between-statements`; no `style={{}}` inline styles; `#/*` subpath-alias imports (Biome bans ≥2-up relative imports); knip (no unused exports/deps); `check:deps` (dependency-cruiser); `check:doc-links`.
- **Env:** Node 26, pnpm 11 workspace (`packages/*`), Vite 8, Vitest 4. Tests default to the **node** environment (like `devtools-core`); the one jsdom wiring test sets `// @vitest-environment jsdom`.
- **CI-only gate not in local `pnpm check`:** `pnpm --filter @rtc/tests gates` (grep-gates) — run it before pushing anything under `tests/`. This plan adds no `tests/` files, but run the full local gauntlet (`pnpm typecheck && pnpm test && pnpm lint && biome ci && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links`) before each push.

## File Structure

**New package `packages/devtools-extension/`:**
- `package.json` — leaf package manifest.
- `tsconfig.json` — extends base; `lib: [ES2022, DOM, DOM.Iterable]`, `types: ["node", "chrome"]`, `jsx: react-jsx`.
- `vite.config.ts` — multi-entry build (contentBridge, background, devtools, panel) → `dist/`.
- `manifest.json` — MV3 manifest.
- `devtools.html` — host page for the devtools registration script.
- `src/ports.ts` — the minimal structural `RuntimePort` type + a `ConnectFn` alias (shared by duplex/router/bridge, so tests and prod agree on shape).
- `src/ChromeRuntimeDuplex.ts` — `class ChromeRuntimeDuplex<TSend, TRecv> implements Duplex` over a `ConnectFn`, with reconnect-on-disconnect.
- `src/portRouter.ts` — pure `createPortRouter()`: tab-keyed relay between a panel port and a content port, with disconnect cleanup.
- `src/background.ts` — service-worker entry: wires `chrome.runtime.onConnect` to `createPortRouter()`.
- `src/bridgeRelay.ts` — pure `createBridgeRelay({ channel, port })`: relays BroadcastChannel ↔ port both ways, with teardown.
- `src/contentBridge.ts` — content-script entry: opens `new BroadcastChannel("rtc-devtools")`, connects a runtime port, calls `createBridgeRelay`.
- `src/devtools.ts` — devtools-page entry: `chrome.devtools.panels.create("RTC", …)`.
- `src/panel/panel.html` — panel document (`<div id="root">`).
- `src/panel/panelSession.ts` — `createPanelSession(connect)`: builds `InspectorStore` + `ChromeRuntimeDuplex` + `InspectorClient`, returns `{ store, dispose }` (the ChromeRuntimeDuplex analogue of `inspectorSession.ts`).
- `src/panel/panel.tsx` — mounts `<InspectorApp store={session.store} />`, connecting the panel port via `chrome.runtime.connect`.
- `src/__tests__/ChromeRuntimeDuplex.test.ts`, `portRouter.test.ts`, `bridgeRelay.test.ts`, `panelSession.test.ts` (jsdom).
- `README.md`.

**Modified:**
- `packages/devtools-app/package.json` — add `exports` map.
- `packages/devtools-app/src/index.ts` — **create**: `export { InspectorApp } from "#/InspectorApp";`.
- `package.json` (root) — add `dev:ext` script.
- `.dependency-cruiser.cjs` — add a documentary leaf rule for the extension.
- `docs/architecture/20-devtools.md` — add a subsection for the extension transport.

---

## Task 1: Scaffold the package and expose `InspectorApp`

**Files:**
- Create: `packages/devtools-extension/package.json`
- Create: `packages/devtools-extension/tsconfig.json`
- Create: `packages/devtools-extension/src/ports.ts`
- Create: `packages/devtools-app/src/index.ts`
- Modify: `packages/devtools-app/package.json` (add `exports`)
- Test: `packages/devtools-extension/src/__tests__/exports.test.ts`

**Interfaces:**
- Produces: `RuntimePort` (structural port type) and `ConnectFn` in `#/ports`; a resolvable `import { InspectorApp } from "@rtc/devtools-app"`.

- [ ] **Step 1: Add the `exports` field to `@rtc/devtools-app`**

In `packages/devtools-app/package.json`, add a top-level `exports` map (keep everything else). The package builds with Vite to `dist/`, but for a workspace **source** consumer we point the export at the TS source (the extension's own Vite build transpiles it), matching how `#/*` already maps to `./src/*`:

```jsonc
  "exports": {
    ".": "./src/index.ts",
    "./InspectorApp.module.css": "./src/InspectorApp.module.css"
  },
```

- [ ] **Step 2: Create the devtools-app public entry**

`packages/devtools-app/src/index.ts`:

```ts
export { InspectorApp } from "#/InspectorApp";
```

- [ ] **Step 3: Create the extension package manifest**

`packages/devtools-extension/package.json`:

```jsonc
{
  "name": "@rtc/devtools-extension",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "vite build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/devtools-app": "workspace:*",
    "@rtc/devtools-core": "workspace:*",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.287",
    "@types/node": "^26.0.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6",
    "jsdom": "^29",
    "vite": "^8",
    "vitest": "^4"
  }
}
```

- [ ] **Step 4: Create the extension tsconfig**

`packages/devtools-extension/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "chrome"],
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Create the shared port types**

`packages/devtools-extension/src/ports.ts`:

```ts
/** The structural subset of `chrome.runtime.Port` this package uses. Declaring
 * it ourselves (rather than leaning on the `chrome.*` global) lets the pure
 * router/duplex/bridge cores be unit-tested with plain fakes in node. */
export interface RuntimePort {
  name: string;
  postMessage(msg: unknown): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

/** Opens a fresh port. Injected everywhere a real `chrome.runtime.connect` would
 * be called, so reconnection is testable. */
export type ConnectFn = () => RuntimePort;
```

- [ ] **Step 6: Install and write the exports smoke test**

Run: `pnpm install`

`packages/devtools-extension/src/__tests__/exports.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { InspectorApp } from "@rtc/devtools-app";

describe("package wiring", () => {
  it("re-exports InspectorApp from @rtc/devtools-app", () => {
    expect(typeof InspectorApp).toBe("function");
  });
});
```

- [ ] **Step 7: Verify typecheck + test pass**

Run: `pnpm --filter @rtc/devtools-extension typecheck && pnpm --filter @rtc/devtools-extension test`
Expected: typecheck clean; 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add packages/devtools-extension/package.json packages/devtools-extension/tsconfig.json packages/devtools-extension/src/ports.ts packages/devtools-extension/src/__tests__/exports.test.ts packages/devtools-app/package.json packages/devtools-app/src/index.ts pnpm-lock.yaml
git commit -m "feat(devtools-ext): scaffold @rtc/devtools-extension + export InspectorApp"
```

---

## Task 2: `ChromeRuntimeDuplex`

**Files:**
- Create: `packages/devtools-extension/src/ChromeRuntimeDuplex.ts`
- Test: `packages/devtools-extension/src/__tests__/ChromeRuntimeDuplex.test.ts`

**Interfaces:**
- Consumes: `RuntimePort`, `ConnectFn` from `#/ports`; `Duplex` from `@rtc/devtools-core`.
- Produces: `class ChromeRuntimeDuplex<TSend, TRecv> implements Duplex<TSend, TRecv>`; constructor `(connect: ConnectFn)`. Reconnects the port on disconnect until `dispose()`; buffers no messages (the `InspectorClient` re-hello handles resync).

- [ ] **Step 1: Write the failing test**

`packages/devtools-extension/src/__tests__/ChromeRuntimeDuplex.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { ChromeRuntimeDuplex } from "#/ChromeRuntimeDuplex";
import type { RuntimePort } from "#/ports";

function makeFakePort(name = "p"): {
  port: RuntimePort;
  emit(msg: unknown): void;
  disconnect(): void;
  sent: unknown[];
  disconnected: boolean;
} {
  let onMsg: (m: unknown) => void = () => {};
  let onDis: () => void = () => {};
  const sent: unknown[] = [];
  const state = { disconnected: false };
  const port: RuntimePort = {
    name,
    postMessage: (m) => {
      sent.push(m);
    },
    onMessage: {
      addListener: (cb) => {
        onMsg = cb;
      },
    },
    onDisconnect: {
      addListener: (cb) => {
        onDis = cb;
      },
    },
    disconnect: () => {
      state.disconnected = true;
    },
  };

  return {
    port,
    emit: (m) => {
      onMsg(m);
    },
    disconnect: () => {
      onDis();
    },
    sent,
    get disconnected() {
      return state.disconnected;
    },
  };
}

describe("ChromeRuntimeDuplex", () => {
  it("sends via the port and surfaces inbound messages on inbound$", () => {
    const f = makeFakePort();
    const connect = vi.fn(() => f.port);
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    const got: number[] = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    duplex.send("hello");
    f.emit(42);

    expect(f.sent).toEqual(["hello"]);
    expect(got).toEqual([42]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("reconnects on disconnect and keeps delivering inbound", () => {
    const first = makeFakePort("first");
    const second = makeFakePort("second");
    const ports = [first, second];
    let i = 0;
    const connect = vi.fn(() => ports[i++]!.port);
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    const got: number[] = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    first.emit(1);
    first.disconnect(); // SW died — duplex should reconnect
    second.emit(2);

    expect(got).toEqual([1, 2]);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect after dispose", () => {
    const first = makeFakePort("first");
    const second = makeFakePort("second");
    const ports = [first, second];
    let i = 0;
    const connect = vi.fn(() => ports[i++]!.port);
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    duplex.dispose();
    first.disconnect();

    expect(first.disconnected).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-extension test ChromeRuntimeDuplex`
Expected: FAIL — cannot find module `#/ChromeRuntimeDuplex`.

- [ ] **Step 3: Implement `ChromeRuntimeDuplex`**

`packages/devtools-extension/src/ChromeRuntimeDuplex.ts`:

```ts
import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import type { Duplex } from "@rtc/devtools-core";

import type { ConnectFn, RuntimePort } from "#/ports";

/** A `Duplex` over a `chrome.runtime.Port`. The port can die at any time (MV3
 * service workers are killed after ~30s idle), so on disconnect — unless
 * disposed — it transparently reconnects a fresh port via the injected
 * `ConnectFn`. It buffers nothing: the `InspectorClient` re-sends `hello` while
 * disconnected (PR #189), so a reconnected port resynchronises on its own. */
export class ChromeRuntimeDuplex<TSend, TRecv>
  implements Duplex<TSend, TRecv>
{
  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  private port: RuntimePort;

  private disposed = false;

  constructor(private readonly connect: ConnectFn) {
    this.port = this.open();
  }

  private open(): RuntimePort {
    const port = this.connect();

    port.onMessage.addListener((msg: unknown): void => {
      this.inboundSubject.next(msg as TRecv);
    });

    port.onDisconnect.addListener((): void => {
      if (!this.disposed) {
        this.port = this.open();
      }
    });

    return port;
  }

  send(msg: TSend): void {
    if (!this.disposed) {
      this.port.postMessage(msg);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.port.disconnect();
    this.inboundSubject.complete();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-extension test ChromeRuntimeDuplex`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-extension/src/ChromeRuntimeDuplex.ts packages/devtools-extension/src/__tests__/ChromeRuntimeDuplex.test.ts
git commit -m "feat(devtools-ext): ChromeRuntimeDuplex transport with reconnect"
```

---

## Task 3: `portRouter` (pure) + background service worker

**Files:**
- Create: `packages/devtools-extension/src/portRouter.ts`
- Create: `packages/devtools-extension/src/background.ts`
- Test: `packages/devtools-extension/src/__tests__/portRouter.test.ts`

**Interfaces:**
- Consumes: `RuntimePort` from `#/ports`.
- Produces: `createPortRouter(): { connectPanel(tabId: number, port: RuntimePort): void; connectContent(tabId: number, port: RuntimePort): void }`. Relays panel↔content per tab id; on either side's disconnect, drops both and disconnects the surviving sibling.

- [ ] **Step 1: Write the failing test**

`packages/devtools-extension/src/__tests__/portRouter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { RuntimePort } from "#/ports";
import { createPortRouter } from "#/portRouter";

function fakePort(name: string): {
  port: RuntimePort;
  emit(msg: unknown): void;
  fireDisconnect(): void;
  sent: unknown[];
  disconnected: boolean;
} {
  let onMsg: (m: unknown) => void = () => {};
  let onDis: () => void = () => {};
  const sent: unknown[] = [];
  const state = { disconnected: false };

  return {
    port: {
      name,
      postMessage: (m) => {
        sent.push(m);
      },
      onMessage: { addListener: (cb) => { onMsg = cb; } },
      onDisconnect: { addListener: (cb) => { onDis = cb; } },
      disconnect: () => { state.disconnected = true; },
    },
    emit: (m) => { onMsg(m); },
    fireDisconnect: () => { onDis(); },
    sent,
    get disconnected() { return state.disconnected; },
  };
}

describe("createPortRouter", () => {
  it("relays panel→content and content→panel for the same tab", () => {
    const router = createPortRouter();
    const panel = fakePort("rtc-panel:7");
    const content = fakePort("rtc-content");

    router.connectPanel(7, panel.port);
    router.connectContent(7, content.port);

    panel.emit({ kind: "hello" });
    content.emit({ kind: "welcome" });

    expect(content.sent).toEqual([{ kind: "hello" }]);
    expect(panel.sent).toEqual([{ kind: "welcome" }]);
  });

  it("keeps tabs isolated", () => {
    const router = createPortRouter();
    const panelA = fakePort("rtc-panel:1");
    const contentA = fakePort("rtc-content");
    const contentB = fakePort("rtc-content");

    router.connectPanel(1, panelA.port);
    router.connectContent(1, contentA.port);
    router.connectContent(2, contentB.port);

    panelA.emit({ n: 1 });

    expect(contentA.sent).toEqual([{ n: 1 }]);
    expect(contentB.sent).toEqual([]);
  });

  it("on panel disconnect, disconnects the content sibling", () => {
    const router = createPortRouter();
    const panel = fakePort("rtc-panel:5");
    const content = fakePort("rtc-content");

    router.connectPanel(5, panel.port);
    router.connectContent(5, content.port);

    panel.fireDisconnect();

    expect(content.disconnected).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-extension test portRouter`
Expected: FAIL — cannot find module `#/portRouter`.

- [ ] **Step 3: Implement `createPortRouter`**

`packages/devtools-extension/src/portRouter.ts`:

```ts
import type { RuntimePort } from "#/ports";

interface Pairing {
  panel?: RuntimePort;
  content?: RuntimePort;
}

/** Tab-keyed relay between a DevTools panel port and a content-script port.
 * Holds no message state — only the two live ports per tab — so it survives a
 * service-worker restart cleanly (both sides reconnect and re-register). When
 * either side disconnects, the surviving sibling is disconnected too, so the
 * transport tears down symmetrically and the inspector shows "disconnected". */
export function createPortRouter(): {
  connectPanel(tabId: number, port: RuntimePort): void;
  connectContent(tabId: number, port: RuntimePort): void;
} {
  const pairings = new Map<number, Pairing>();

  function pairingFor(tabId: number): Pairing {
    const existing = pairings.get(tabId);

    if (existing) {
      return existing;
    }

    const created: Pairing = {};
    pairings.set(tabId, created);

    return created;
  }

  function teardown(tabId: number): void {
    const pairing = pairings.get(tabId);

    if (!pairing) {
      return;
    }

    pairings.delete(tabId);
    pairing.panel?.disconnect();
    pairing.content?.disconnect();
  }

  function relay(from: RuntimePort, to: () => RuntimePort | undefined): void {
    from.onMessage.addListener((msg: unknown): void => {
      to()?.postMessage(msg);
    });
  }

  return {
    connectPanel(tabId: number, port: RuntimePort): void {
      const pairing = pairingFor(tabId);
      pairing.panel = port;
      relay(port, () => pairings.get(tabId)?.content);
      port.onDisconnect.addListener((): void => {
        teardown(tabId);
      });
    },

    connectContent(tabId: number, port: RuntimePort): void {
      const pairing = pairingFor(tabId);
      pairing.content = port;
      relay(port, () => pairings.get(tabId)?.panel);
      port.onDisconnect.addListener((): void => {
        teardown(tabId);
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-extension test portRouter`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the background service-worker entry**

This file touches the `chrome.*` globals, so it is typecheck-verified, not unit-tested. The panel connects with port name `rtc-panel:<tabId>`; the content script connects with name `rtc-content` and the SW reads its tab id from `port.sender.tab.id`.

`packages/devtools-extension/src/background.ts`:

```ts
import type { RuntimePort } from "#/ports";
import { createPortRouter } from "#/portRouter";

const router = createPortRouter();

const PANEL_PREFIX = "rtc-panel:";
const CONTENT_NAME = "rtc-content";

chrome.runtime.onConnect.addListener((port: chrome.runtime.Port): void => {
  if (port.name.startsWith(PANEL_PREFIX)) {
    const tabId = Number.parseInt(port.name.slice(PANEL_PREFIX.length), 10);

    if (!Number.isNaN(tabId)) {
      router.connectPanel(tabId, port as unknown as RuntimePort);
    }

    return;
  }

  if (port.name === CONTENT_NAME) {
    const tabId = port.sender?.tab?.id;

    if (typeof tabId === "number") {
      router.connectContent(tabId, port as unknown as RuntimePort);
    }
  }
});
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm --filter @rtc/devtools-extension typecheck`
Expected: clean (requires `@types/chrome` from Task 1).

- [ ] **Step 7: Commit**

```bash
git add packages/devtools-extension/src/portRouter.ts packages/devtools-extension/src/background.ts packages/devtools-extension/src/__tests__/portRouter.test.ts
git commit -m "feat(devtools-ext): tab-keyed port router + background service worker"
```

---

## Task 4: `bridgeRelay` (pure) + content-script bridge

**Files:**
- Create: `packages/devtools-extension/src/bridgeRelay.ts`
- Create: `packages/devtools-extension/src/contentBridge.ts`
- Test: `packages/devtools-extension/src/__tests__/bridgeRelay.test.ts`

**Interfaces:**
- Consumes: `RuntimePort` from `#/ports`.
- Produces: `createBridgeRelay(deps: { channel: BridgeChannel; port: RuntimePort }): { dispose(): void }`, where `BridgeChannel = { postMessage(msg: unknown): void; addMessageListener(cb: (msg: unknown) => void): void; close(): void }`. Forwards channel→port and port→channel; `dispose()` and port-disconnect both close the channel.

- [ ] **Step 1: Write the failing test**

`packages/devtools-extension/src/__tests__/bridgeRelay.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { BridgeChannel } from "#/bridgeRelay";
import { createBridgeRelay } from "#/bridgeRelay";
import type { RuntimePort } from "#/ports";

function fakeChannel(): {
  channel: BridgeChannel;
  emit(msg: unknown): void;
  posted: unknown[];
  closed: boolean;
} {
  let onMsg: (m: unknown) => void = () => {};
  const posted: unknown[] = [];
  const state = { closed: false };

  return {
    channel: {
      postMessage: (m) => { posted.push(m); },
      addMessageListener: (cb) => { onMsg = cb; },
      close: () => { state.closed = true; },
    },
    emit: (m) => { onMsg(m); },
    posted,
    get closed() { return state.closed; },
  };
}

function fakePort(): {
  port: RuntimePort;
  emit(msg: unknown): void;
  fireDisconnect(): void;
  sent: unknown[];
} {
  let onMsg: (m: unknown) => void = () => {};
  let onDis: () => void = () => {};
  const sent: unknown[] = [];

  return {
    port: {
      name: "rtc-content",
      postMessage: (m) => { sent.push(m); },
      onMessage: { addListener: (cb) => { onMsg = cb; } },
      onDisconnect: { addListener: (cb) => { onDis = cb; } },
      disconnect: () => {},
    },
    emit: (m) => { onMsg(m); },
    fireDisconnect: () => { onDis(); },
    sent,
  };
}

describe("createBridgeRelay", () => {
  it("forwards channel messages (from the app hub) to the port", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    ch.emit({ kind: "welcome" });

    expect(p.sent).toEqual([{ kind: "welcome" }]);
  });

  it("forwards port messages (from the panel) to the channel", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    p.emit({ kind: "hello" });

    expect(ch.posted).toEqual([{ kind: "hello" }]);
  });

  it("closes the channel when the port disconnects", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    p.fireDisconnect();

    expect(ch.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-extension test bridgeRelay`
Expected: FAIL — cannot find module `#/bridgeRelay`.

- [ ] **Step 3: Implement `createBridgeRelay`**

`packages/devtools-extension/src/bridgeRelay.ts`:

```ts
import type { RuntimePort } from "#/ports";

/** The structural subset of `BroadcastChannel` the bridge needs, adapted so the
 * relay is testable without a real channel (`onmessage` becomes an explicit
 * listener registration). */
export interface BridgeChannel {
  postMessage(msg: unknown): void;
  addMessageListener(cb: (msg: unknown) => void): void;
  close(): void;
}

/** Relays a same-origin `rtc-devtools` BroadcastChannel (from the app hub) to a
 * `chrome.runtime` port (to the panel, via the background router) and back.
 * When the port disconnects — the panel closed, or the router tore the pair
 * down — the channel is closed so the content script stops listening. Purely a
 * forwarder: it never inspects or mutates messages, and never originates a
 * `hello`, so injecting it does not wake the dormant hub. */
export function createBridgeRelay(deps: {
  channel: BridgeChannel;
  port: RuntimePort;
}): { dispose(): void } {
  const { channel, port } = deps;

  channel.addMessageListener((msg: unknown): void => {
    port.postMessage(msg);
  });

  port.onMessage.addListener((msg: unknown): void => {
    channel.postMessage(msg);
  });

  port.onDisconnect.addListener((): void => {
    channel.close();
  });

  return {
    dispose(): void {
      channel.close();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-extension test bridgeRelay`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the content-script entry**

`packages/devtools-extension/src/contentBridge.ts`:

```ts
import type { BridgeChannel } from "#/bridgeRelay";
import { createBridgeRelay } from "#/bridgeRelay";
import type { RuntimePort } from "#/ports";

/** Injected into the app tab (same origin as the hub). Opens the same
 * `rtc-devtools` BroadcastChannel the app-side DevtoolsHub listens on, connects
 * a runtime port to the background router, and relays between them. */
const CHANNEL_NAME = "rtc-devtools";

const raw = new BroadcastChannel(CHANNEL_NAME);

const channel: BridgeChannel = {
  postMessage: (msg: unknown): void => {
    raw.postMessage(msg);
  },
  addMessageListener: (cb: (msg: unknown) => void): void => {
    raw.onmessage = (ev: MessageEvent): void => {
      cb(ev.data);
    };
  },
  close: (): void => {
    raw.close();
  },
};

const port = chrome.runtime.connect({ name: "rtc-content" });

createBridgeRelay({ channel, port: port as unknown as RuntimePort });
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm --filter @rtc/devtools-extension typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/devtools-extension/src/bridgeRelay.ts packages/devtools-extension/src/contentBridge.ts packages/devtools-extension/src/__tests__/bridgeRelay.test.ts
git commit -m "feat(devtools-ext): BroadcastChannel<->runtime content-script bridge"
```

---

## Task 5: Panel session, panel mount, and devtools-page registration

**Files:**
- Create: `packages/devtools-extension/src/panel/panelSession.ts`
- Create: `packages/devtools-extension/src/panel/panel.tsx`
- Create: `packages/devtools-extension/src/panel/panel.html`
- Create: `packages/devtools-extension/src/devtools.ts`
- Create: `packages/devtools-extension/devtools.html`
- Test: `packages/devtools-extension/src/__tests__/panelSession.test.ts` (jsdom)

**Interfaces:**
- Consumes: `ChromeRuntimeDuplex` (Task 2); `ConnectFn` from `#/ports`; `InspectorStore`, `InspectorClient`, `type AppToInspector`, `type InspectorToApp` from `@rtc/devtools-core`; `InspectorApp` from `@rtc/devtools-app`.
- Produces: `createPanelSession(connect: ConnectFn): { store: InspectorStore; dispose(): void }`.

- [ ] **Step 1: Write the failing test**

The session wires a real `InspectorStore` + `InspectorClient` over a `ChromeRuntimeDuplex` built from an injected `connect`. Driving a fake port through the store proves the panel observes a `welcome`. jsdom env because the store's flush is rAF-coalesced (jsdom provides `requestAnimationFrame`), so we await it with `vi.waitFor` after advancing — mirroring `devtoolsIntegration.test.ts`.

`packages/devtools-extension/src/__tests__/panelSession.test.ts`:

```ts
// @vitest-environment jsdom
import { PROTOCOL_VERSION } from "@rtc/devtools-core";
import { describe, expect, it, vi } from "vitest";

import type { RuntimePort } from "#/ports";
import { createPanelSession } from "#/panel/panelSession";

function fakePort(): { port: RuntimePort; emit(msg: unknown): void; sent: unknown[] } {
  let onMsg: (m: unknown) => void = () => {};
  const sent: unknown[] = [];

  return {
    port: {
      name: "rtc-panel:1",
      postMessage: (m) => { sent.push(m); },
      onMessage: { addListener: (cb) => { onMsg = cb; } },
      onDisconnect: { addListener: () => {} },
      disconnect: () => {},
    },
    emit: (m) => { onMsg(m); },
    sent,
  };
}

describe("createPanelSession", () => {
  it("sends hello on start and reflects a welcome in the store", async () => {
    const f = fakePort();
    const session = createPanelSession(() => f.port);

    // InspectorClient.start() (called by createPanelSession) sends hello.
    expect(f.sent).toContainEqual({ kind: "hello", v: PROTOCOL_VERSION });

    f.emit({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });

    await vi.waitFor(() => {
      expect(session.store.getSnapshot().connected).toBe(true);
      expect(session.store.getSnapshot().appId).toBe("rtc-web");
    });

    session.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-extension test panelSession`
Expected: FAIL — cannot find module `#/panel/panelSession`.

- [ ] **Step 3: Implement `createPanelSession`**

`packages/devtools-extension/src/panel/panelSession.ts`:

```ts
import {
  type AppToInspector,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";

import { ChromeRuntimeDuplex } from "#/ChromeRuntimeDuplex";
import type { ConnectFn } from "#/ports";

export interface PanelSession {
  store: InspectorStore;
  dispose(): void;
}

/** The ChromeRuntimeDuplex analogue of `@rtc/devtools-app`'s
 * `createInspectorSession`: an `InspectorStore` plus an `InspectorClient`
 * piping the panel's runtime-port transport into it. `connect` is injected so
 * the panel supplies `chrome.runtime.connect`, while tests supply a fake. */
export function createPanelSession(connect: ConnectFn): PanelSession {
  const store = new InspectorStore();
  const duplex = new ChromeRuntimeDuplex<InspectorToApp, AppToInspector>(
    connect,
  );
  const client = new InspectorClient(duplex, store);
  client.start();

  return {
    store,
    dispose: (): void => {
      client.dispose();
      duplex.dispose();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-extension test panelSession`
Expected: PASS (1 test).

- [ ] **Step 5: Write the panel React entry**

`packages/devtools-extension/src/panel/panel.tsx`. The panel connects a port named `rtc-panel:<inspectedTabId>`; `chrome.devtools.inspectedWindow.tabId` is the app tab. Imports the reused panel CSS so the extension panel looks identical.

```tsx
import "@rtc/devtools-app/InspectorApp.module.css";

import { InspectorApp } from "@rtc/devtools-app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { RuntimePort } from "#/ports";
import { createPanelSession } from "#/panel/panelSession";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in the RTC panel");
}

const tabId = chrome.devtools.inspectedWindow.tabId;

const session = createPanelSession(
  (): RuntimePort =>
    chrome.runtime.connect({
      name: `rtc-panel:${tabId}`,
    }) as unknown as RuntimePort,
);

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={session.store} />
  </StrictMode>,
);
```

- [ ] **Step 6: Write the panel HTML host**

`packages/devtools-extension/src/panel/panel.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>RTC DevTools</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./panel.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write the devtools-page registration**

`packages/devtools-extension/src/devtools.ts`:

```ts
/** Runs in the hidden devtools page. Registers the "RTC" panel; Chrome loads
 * panel.html into it when the developer opens the tab. */
chrome.devtools.panels.create("RTC", "", "panel.html", (): void => {
  // No-op: the panel's own script owns its lifecycle.
});
```

- [ ] **Step 8: Write the devtools-page HTML host**

`packages/devtools-extension/devtools.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <script type="module" src="./src/devtools.ts"></script>
  </body>
</html>
```

- [ ] **Step 9: Verify typecheck + tests pass**

Run: `pnpm --filter @rtc/devtools-extension typecheck && pnpm --filter @rtc/devtools-extension test`
Expected: typecheck clean; all tests pass (exports, ChromeRuntimeDuplex, portRouter, bridgeRelay, panelSession).

- [ ] **Step 10: Commit**

```bash
git add packages/devtools-extension/src/panel packages/devtools-extension/src/devtools.ts packages/devtools-extension/devtools.html packages/devtools-extension/src/__tests__/panelSession.test.ts
git commit -m "feat(devtools-ext): RTC devtools panel + session wiring"
```

---

## Task 6: MV3 manifest + multi-entry Vite build

**Files:**
- Create: `packages/devtools-extension/manifest.json`
- Create: `packages/devtools-extension/vite.config.ts`
- Test: `packages/devtools-extension/src/__tests__/build.test.ts`

**Interfaces:**
- Produces: `dist/` containing `manifest.json`, `devtools.html`, `panel.html`, and the four JS entries (`background.js`, `contentBridge.js`, `devtools.js`, plus the panel bundle) — a loadable unpacked extension.

- [ ] **Step 1: Write the MV3 manifest**

`packages/devtools-extension/manifest.json`. Host scope is localhost + the deployed Vercel domains (`*.vercel.app` covers the on-demand deploys; pin the exact custom host during acceptance if the app is served from a non-`vercel.app` domain).

```json
{
  "manifest_version": 3,
  "name": "RTC DevTools",
  "version": "0.1.0",
  "description": "Live inspector for the Reactive Trader Cloud state layer.",
  "minimum_chrome_version": "116",
  "devtools_page": "devtools.html",
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": [
        "http://localhost:*/*",
        "http://127.0.0.1:*/*",
        "https://*.vercel.app/*"
      ],
      "js": ["contentBridge.js"],
      "run_at": "document_start"
    }
  ],
  "permissions": ["scripting"],
  "host_permissions": ["http://localhost:*/*", "https://*.vercel.app/*"]
}
```

- [ ] **Step 2: Write the Vite multi-entry config**

Each MV3 entry must emit at a **stable, predictable filename** (the manifest references `background.js`, `contentBridge.js`; the devtools page references `panel.html`). Use a multi-input Rollup config with fixed entry names and copy `manifest.json` + the two HTML hosts into `dist/`.

`packages/devtools-extension/vite.config.ts`:

```ts
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "rtc-copy-extension-assets",
      closeBundle(): void {
        copyFileSync(here("manifest.json"), here("dist/manifest.json"));
        copyFileSync(here("devtools.html"), here("dist/devtools.html"));
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: here("src/background.ts"),
        contentBridge: here("src/contentBridge.ts"),
        devtools: here("src/devtools.ts"),
        panel: here("src/panel/panel.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
```

- [ ] **Step 3: Write the build-output test**

`packages/devtools-extension/src/__tests__/build.test.ts` runs the build and asserts the loadable artifacts exist and the manifest is coherent.

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("../../", import.meta.url));
const dist = (p: string): string => `${pkgRoot}dist/${p}`;

describe("extension build", () => {
  it("produces a loadable unpacked MV3 bundle", () => {
    execFileSync("pnpm", ["run", "build"], { cwd: pkgRoot, stdio: "inherit" });

    for (const f of [
      "manifest.json",
      "devtools.html",
      "panel.html",
      "background.js",
      "contentBridge.js",
      "devtools.js",
    ]) {
      expect(existsSync(dist(f)), `${f} missing from dist`).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(dist("manifest.json"), "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.devtools_page).toBe("devtools.html");
    expect(manifest.background.service_worker).toBe("background.js");
  }, 120_000);
});
```

- [ ] **Step 4: Run the build test**

Run: `pnpm --filter @rtc/devtools-extension test build`
Expected: PASS — build runs, all six artifacts present, manifest coherent. (If Vite emits `panel.html` under a nested path, adjust the `input` key or add it to the copy plugin so it lands at `dist/panel.html`, matching the `panels.create(..., "panel.html", …)` reference. Re-run until green.)

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-extension/manifest.json packages/devtools-extension/vite.config.ts packages/devtools-extension/src/__tests__/build.test.ts
git commit -m "feat(devtools-ext): MV3 manifest + multi-entry Vite build"
```

---

## Task 7: Workspace integration, gates, and docs

**Files:**
- Modify: `package.json` (root — add `dev:ext`)
- Modify: `.dependency-cruiser.cjs` (add extension leaf rule)
- Create: `packages/devtools-extension/README.md`
- Modify: `docs/architecture/20-devtools.md` (add the extension-transport subsection)

**Interfaces:** none (integration + documentation).

- [ ] **Step 1: Add the root `dev:ext` script**

In root `package.json` `scripts`, after `dev:devtools`:

```jsonc
    "dev:ext": "pnpm --filter @rtc/devtools-extension build",
```

- [ ] **Step 2: Add a documentary dependency-cruiser rule**

In `.dependency-cruiser.cjs`, after the `devtools-app-protocol-only` rule, add a rule pinning the extension as a leaf that may consume only devtools-core/-app:

```js
    {
      name: "devtools-extension-is-a-leaf",
      severity: "error",
      comment:
        "@rtc/devtools-extension is a leaf consumer of the devtools pair — it may import only devtools-core (transport/protocol/store) and devtools-app (InspectorApp), never a client/server/domain package.",
      from: { path: "^packages/devtools-extension/src" },
      to: {
        path: "^packages/(domain|shared|client-core|client-react|client-react-native|client-prototype|react-bindings|solid-bindings|client-solid|motion-core|ui-contract|server|ws-effects)/",
      },
    },
```

- [ ] **Step 3: Write the package README**

`packages/devtools-extension/README.md`:

```markdown
# @rtc/devtools-extension

MV3 Chrome DevTools extension that attaches the RTC state inspector
(`@rtc/devtools-app`) to any running app instance — including the deployed
build — over a `chrome.runtime` transport.

## Architecture

A third `Duplex` behind the inspector's transport seam. Nothing in the protocol,
hub, `InspectorStore`/`InspectorClient`, or the four panels changes:

- `ChromeRuntimeDuplex` — inspector-side transport over a reconnecting runtime port.
- `contentBridge` — injected into the app tab; relays the same-origin
  `rtc-devtools` BroadcastChannel ↔ `chrome.runtime`.
- `background` — tab-keyed router between panel and content ports.
- `devtools` / `panel` — registers the "RTC" DevTools panel and mounts `InspectorApp`.

Dormancy is preserved: only opening the RTC panel sends `hello`; an installed,
unopened extension costs the app nothing.

## Build & load

    pnpm dev:ext            # build the unpacked bundle to packages/devtools-extension/dist

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked**
→ select `packages/devtools-extension/dist`. Open the app, open DevTools, select
the **RTC** panel.
```

- [ ] **Step 4: Document the transport in the architecture doc**

Add a subsection to `docs/architecture/20-devtools.md` (place it after the existing transport discussion; keep the numbering scheme consistent with the file). Content to include verbatim:

```markdown
### Chrome extension transport

The same-origin `/devtools/` inspector is one transport; the Chrome extension
(`@rtc/devtools-extension`) is a second, added without touching the protocol,
hub, store/client, or panels. A DevTools **RTC** panel mounts the existing
`InspectorApp` with a `ChromeRuntimeDuplex` (a reconnecting `chrome.runtime`
port) instead of a `BroadcastChannelDuplex`. A content script injected into the
app tab bridges the page's `rtc-devtools` BroadcastChannel to `chrome.runtime`;
a background service worker routes messages between the panel port and the
content port, keyed by tab id. This lets the inspector attach to the deployed
app, and is the port/adapter payoff the v1 design anticipated — a new transport,
nothing else. Dormancy holds: only the panel opening sends `hello`.
```

- [ ] **Step 5: Run the doc-links gate**

Run: `pnpm check:doc-links`
Expected: all links OK (the new README and doc edits add no broken relative links).

- [ ] **Step 6: Run the full local gauntlet**

Run:
```bash
pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-extension && pnpm check:deps && pnpm lint:dead && pnpm check:doc-links
```
Expected: all green. Fix any Biome `organizeImports`/`func-style`/`useBlockStatements` findings and any knip unused-export/dep findings before committing. (Knip note: `background.ts`, `contentBridge.ts`, `devtools.ts`, and `panel.tsx` are Vite entry points, not imported by other modules — if knip flags them as unused, add them to the package's knip `entry` globs rather than exporting them from an index.)

- [ ] **Step 7: Commit**

```bash
git add package.json .dependency-cruiser.cjs packages/devtools-extension/README.md docs/architecture/20-devtools.md
git commit -m "chore(devtools-ext): workspace wiring, dep-cruiser leaf rule, docs"
```

---

## Acceptance (manual, documented — not automated)

Automated Chrome-driving of a loaded extension is out of scope for v1 (the Playwright suite drives pages, not extension installs). After Task 7, verify by hand and record the result:

1. `pnpm dev:ext`, then load `packages/devtools-extension/dist` unpacked in Chrome.
2. Open the app (`pnpm dev`, or the deployed URL). Open Chrome DevTools → **RTC** panel.
3. Confirm the four panels render live data and the connection badge shows the app id.
4. Close the app tab → panel flips to "disconnected". Reload the app → panel reconnects with no manual step (the `InspectorClient` re-hello path).
5. Confirm the app itself is unchanged and dormancy holds: with the extension installed but the RTC panel never opened, the app-side hub stays dormant (no subscription; verify via the existing devtools-core dormancy test remaining green and by the app showing no devtools activity).

---

## Self-Review

**Spec coverage:**
- §2 third-`Duplex` transport → Task 2 (`ChromeRuntimeDuplex`). ✓
- §2.1 content-script bridge → Task 4. ✓
- §2.2 dormancy preserved → enforced by bridgeRelay never originating `hello` (Task 4 comment + test) + panel-only `hello` (Task 5 test asserts `createPanelSession` sends it); acceptance step 5. ✓
- §3 package layout → Tasks 1, 3–6 (all listed files created). ✓
- §3 additive `exports` on devtools-app → Task 1. ✓
- §4 manifest (host scope, permissions) → Task 6. ✓
- §5 ephemeral-SW-safe tab-keyed routing + reconnect → Task 3 (router holds only live ports) + Task 2 (duplex reconnect); PR #189 re-hello relied on, not re-implemented. ✓
- §6 testing: (1) duplex unit → Task 2; (2) router unit → Task 3; (3) bridge unit → Task 4; (4) jsdom wiring → Task 5 (`panelSession.test.ts`); (5) manual acceptance → Acceptance section. ✓
- §7 non-goals (no store submission, no lazy injection, observe-only) → respected; lazy injection explicitly deferred (baseline static `content_scripts`). ✓
- §8 build + workspace + gates → Tasks 6, 7. ✓
- §9 success criteria 1–5 → build test (Task 6) + acceptance steps 2–5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓

**Type consistency:** `RuntimePort`/`ConnectFn` defined once in `#/ports` (Task 1) and consumed unchanged in Tasks 2–5. `ChromeRuntimeDuplex(connect: ConnectFn)` used identically in Task 2 and Task 5. `createPortRouter().connectPanel/connectContent(tabId, port)` used identically in Task 3's test and `background.ts`. `createBridgeRelay({ channel, port })` + `BridgeChannel` consistent across Task 4's test, impl, and `contentBridge.ts`. `createPanelSession(connect)` consistent across Task 5's test, impl, and `panel.tsx`. Channel name `"rtc-devtools"` and port names `"rtc-content"` / `"rtc-panel:<tabId>"` consistent across router, bridge, background, and panel. ✓
