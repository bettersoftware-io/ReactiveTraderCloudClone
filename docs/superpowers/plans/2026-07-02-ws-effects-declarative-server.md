# `@rtc/ws-effects` Declarative Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the imperative `switch` in `@rtc/server` with a declarative RxJS WebSocket effects micro-framework extracted into a new `@rtc/ws-effects` package, and close the equities coverage gap so WS-real mode serves all four domains.

**Architecture:** A new `rxjs`-only framework package exposes a pure `WsEffect<Ctx> = (in$, ctx) => out$` primitive plus `stream()`/`rpc()` sugar, `combineEffects()`, and a transport-agnostic `createWsListener()`. `@rtc/server` becomes a thin app: it adapts a `ws.WebSocket` into the framework's `Socket`, defines app effects per domain, and wires them with the shared `serviceContainer`. The wire protocol is byte-identical to today, so the client is untouched apart from consolidating duplicated protocol constants into `@rtc/shared`.

**Tech Stack:** TypeScript (ESM, `#/` subpath imports), RxJS 7, Vitest (+ RxJS `TestScheduler` marble tests), `ws`, Turborepo, pnpm workspaces.

**Design spec:** [`docs/superpowers/specs/2026-07-02-ws-effects-declarative-server-design.md`](../specs/2026-07-02-ws-effects-declarative-server-design.md)

## Global Constraints

- **`@rtc/ws-effects` runtime deps = `rxjs` only.** No `ws`, no domain, no shared. It is generic over a `Ctx` type param and knows nothing about trading. (Mirrors `@rtc/domain`'s single-dep rule.)
- **RxJS version `^7.8`** verbatim (syncpack enforces a single range across the monorepo — match `@rtc/domain`/`@rtc/server`).
- **Wire protocol unchanged.** Same `{ type, payload, correlationId }` envelope and the same message-type string values. No protocol version bump. The client's observable behaviour must not change.
- **Build a tsc project-referenced lib**: `tsc --build && tsc-alias -p tsconfig.json` (tsc leaks `#/` aliases into `dist`; `tsc-alias` rewrites them). Model `package.json`/`tsconfig.json` on `packages/shared`.
- **Zero lint disables.** Must pass `biome check`, `eslint .`, and `eslint . --config eslint.config.typed.mjs` clean (Biome-clean ≠ ESLint-clean in this repo — run both).
- **CI-only gates apply** (not in the local test loop): `knip` (`lint:dead`), `depcruise` (`check:deps`), `manypkg check && syncpack lint` (`check:versions`). A new package must be registered in `knip.json` and satisfy dependency-cruiser.
- **Server-only behavioural change** → no visual-golden / UI-contract impact expected.
- **Merging to `main` requires explicit user OK** (main auto-pushes to origin). Isolate all work in a git worktree off the latest `origin/main` (per `superpowers:using-git-worktrees` / `shipping-repo-changes`).

---

## Prerequisites (run once before Task 1)

- [ ] Create a fresh worktree off the latest `origin/main` (see `shipping-repo-changes`): `git fetch origin main` then `EnterWorktree`.
- [ ] `pnpm install` at the repo root.
- [ ] Confirm the baseline is green: `pnpm --filter @rtc/server test && pnpm --filter @rtc/server typecheck`.

## File Structure

**New package `packages/ws-effects/`:**
- `package.json` — `@rtc/ws-effects`, `rxjs` only, tsc+tsc-alias build.
- `tsconfig.json` — references none (leaf lib); `#/` paths.
- `src/index.ts` — public barrel.
- `src/types.ts` — `Inbound`, `Outbound`, `WsEffect<Ctx>`, `Socket`.
- `src/operators.ts` — `out()`, `matchType()`.
- `src/combineEffects.ts` — `combineEffects()`.
- `src/stream.ts` — `stream()` sugar.
- `src/rpc.ts` — `rpc()` sugar.
- `src/createWsListener.ts` — `createWsListener()`.
- `src/*.test.ts` — marble tests per unit.

**`@rtc/shared` (protocol consolidation, D5):**
- Create: `packages/shared/src/protocol/messages.ts` — `CLIENT_MSG`, `SERVER_MSG` (all 24 message-type constants, incl. equities).
- Modify: `packages/shared/src/index.ts` — export the constants.

**`@rtc/server` (the thin app):**
- Create: `src/ws/toSocket.ts` — `ws.WebSocket` → `Socket` adapter.
- Create: `src/effects/fx.effects.ts`, `credit.effects.ts`, `admin.effects.ts`, `equities.effects.ts`.
- Create: `src/effects/context.ts` — `Ctx` = `ServiceContainer` alias re-export (keeps effect files import-clean).
- Modify: `src/services/serviceContainer.ts` — add `marketData`, `orders`, `positions`.
- Modify: `src/index.ts` — `createWsListener(combineEffects(...), services)`.
- Modify: `src/ws/protocol.ts` — re-export the constants from `@rtc/shared` (keep the file as the server-local import site, or delete and import directly; this plan re-exports to minimise churn).
- Delete: `src/ws/wsHandler.ts` + `src/ws/wsHandler.test.ts` (replaced by effect tests). Keep `src/ws/FakeWs.testHelpers.ts` (reused).

**`@rtc/client-react` (D5 consumer):**
- Modify: `src/app/adapters/portFactory.ts` — replace the inline `CLIENT_MSG`/`SERVER_MSG` blocks with an import from `@rtc/shared`.

**`tests/` (e2e):**
- Modify: `tests/fullstack/browser/fullstack.spec.ts` — assert an equities panel receives data over WS.

---

## Task 1: Scaffold `@rtc/ws-effects`

**Files:**
- Create: `packages/ws-effects/package.json`
- Create: `packages/ws-effects/tsconfig.json`
- Create: `packages/ws-effects/src/index.ts`
- Create: `packages/ws-effects/src/smoke.test.ts`
- Modify: `knip.json` (add workspace)
- Modify: `.dependency-cruiser.cjs` (add purity rule)

**Interfaces:**
- Produces: the `@rtc/ws-effects` package resolvable as a workspace dependency; empty public barrel.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@rtc/ws-effects",
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
    "test:coverage": "vitest run --coverage",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.8",
    "@vitest/ui": "^4.1.8",
    "tsc-alias": "1.8.17",
    "vitest": "^4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create a temporary public barrel and a smoke test**

`src/index.ts`:
```ts
export const WS_EFFECTS_VERSION = "0.0.0";
```

`src/smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { WS_EFFECTS_VERSION } from "#/index";

describe("@rtc/ws-effects", () => {
  it("exposes a version marker", () => {
    expect(WS_EFFECTS_VERSION).toBe("0.0.0");
  });
});
```

- [ ] **Step 4: Register the workspace in `knip.json`** (add under `workspaces`, after `packages/shared`)

```jsonc
"packages/ws-effects": {
  "entry": "src/index.ts",
  "project": "src/**/*.ts"
},
```

- [ ] **Step 5: Add a dependency-cruiser purity rule** in `.dependency-cruiser.cjs` (append to the `forbidden` array)

```js
{
  name: "ws-effects-stays-pure",
  severity: "error",
  comment:
    "@rtc/ws-effects is a transport framework — it must not depend on domain/shared/client/server.",
  from: { path: "^packages/ws-effects/src" },
  to: { path: "^packages/(domain|shared|client-react|server)/" },
},
```

- [ ] **Step 6: Install + build + test**

Run: `pnpm install && pnpm --filter @rtc/ws-effects build && pnpm --filter @rtc/ws-effects test`
Expected: install links the new workspace; build emits `dist/`; smoke test PASSES.

- [ ] **Step 7: Commit**

```bash
git add packages/ws-effects knip.json .dependency-cruiser.cjs pnpm-lock.yaml
git commit -m "feat(ws-effects): scaffold rxjs-only framework package"
```

---

## Task 2: Core types + operators (`out`, `matchType`)

**Files:**
- Create: `packages/ws-effects/src/types.ts`
- Create: `packages/ws-effects/src/operators.ts`
- Create: `packages/ws-effects/src/operators.test.ts`
- Modify: `packages/ws-effects/src/index.ts`

**Interfaces:**
- Produces:
  - `interface Inbound { readonly type: string; readonly payload?: unknown; readonly correlationId?: string }`
  - `interface Outbound { readonly type: string; readonly payload?: unknown; readonly correlationId?: string }`
  - `type WsEffect<Ctx> = (in$: Observable<Inbound>, ctx: Ctx) => Observable<Outbound>`
  - `interface Socket { readonly messages$: Observable<Inbound>; send(m: Outbound): void; readonly closed$: Observable<void> }`
  - `function out(type: string, payload?: unknown, correlationId?: string): Outbound`
  - `function matchType(type: string): MonoTypeOperatorFunction<Inbound>`

- [ ] **Step 1: Write the failing test** — `src/operators.test.ts`

```ts
import { of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { matchType, out } from "#/operators";
import type { Inbound } from "#/types";

describe("out", () => {
  it("omits correlationId when not supplied", () => {
    expect(out("stream.priceTick", { bid: 1 })).toEqual({
      type: "stream.priceTick",
      payload: { bid: 1 },
    });
  });

  it("includes correlationId when supplied", () => {
    expect(out("rpc.x.response", { type: "ack" }, "42")).toEqual({
      type: "rpc.x.response",
      payload: { type: "ack" },
      correlationId: "42",
    });
  });
});

describe("matchType", () => {
  it("keeps only messages of the given type", async () => {
    const in$ = of<Inbound>(
      { type: "a", payload: 1 },
      { type: "b", payload: 2 },
      { type: "a", payload: 3 },
    );
    const kept = await new Promise((resolve) => {
      in$.pipe(matchType("a"), toArray()).subscribe(resolve);
    });
    expect(kept).toEqual([
      { type: "a", payload: 1 },
      { type: "a", payload: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/ws-effects test operators`
Expected: FAIL — cannot find `#/operators` / `#/types`.

- [ ] **Step 3: Write `src/types.ts`**

```ts
import type { Observable } from "rxjs";

/** A parsed client → server frame. */
export interface Inbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/** A server → client frame to be serialised and sent. */
export interface Outbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/**
 * The one primitive. An effect transforms the inbound message stream into an
 * outbound message stream, given an application context `Ctx`.
 */
export type WsEffect<Ctx> = (
  in$: Observable<Inbound>,
  ctx: Ctx,
) => Observable<Outbound>;

/** Transport-agnostic socket the listener drives. Adapted from `ws` in the app. */
export interface Socket {
  readonly messages$: Observable<Inbound>;
  send(message: Outbound): void;
  readonly closed$: Observable<void>;
}
```

- [ ] **Step 4: Write `src/operators.ts`**

```ts
import { filter, type MonoTypeOperatorFunction } from "rxjs";

import type { Inbound, Outbound } from "./types.js";

/** Build an outbound frame, omitting `correlationId` when absent. */
export function out(
  type: string,
  payload?: unknown,
  correlationId?: string,
): Outbound {
  return correlationId === undefined
    ? { type, payload }
    : { type, payload, correlationId };
}

/** Keep only inbound frames whose `type` matches. */
export function matchType(type: string): MonoTypeOperatorFunction<Inbound> {
  return filter((msg: Inbound): boolean => msg.type === type);
}
```

- [ ] **Step 5: Export from the barrel** — replace `src/index.ts` contents

```ts
export { combineEffects } from "./combineEffects.js";
export { createWsListener } from "./createWsListener.js";
export { matchType, out } from "./operators.js";
export { rpc } from "./rpc.js";
export { stream } from "./stream.js";
export type { Inbound, Outbound, Socket, WsEffect } from "./types.js";
```

> Note: the barrel references files created in Tasks 3–6. Until those land, temporarily export only `./operators.js` and `./types.js`, and add the rest as each task completes. Delete `src/smoke.test.ts` now (superseded).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @rtc/ws-effects test operators`
Expected: PASS (5 assertions).

- [ ] **Step 7: Commit**

```bash
git add packages/ws-effects/src
git rm packages/ws-effects/src/smoke.test.ts
git commit -m "feat(ws-effects): core types + out/matchType operators"
```

---

## Task 3: `combineEffects`

**Files:**
- Create: `packages/ws-effects/src/combineEffects.ts`
- Create: `packages/ws-effects/src/combineEffects.test.ts`

**Interfaces:**
- Consumes: `WsEffect`, `Inbound`, `Outbound` (Task 2).
- Produces: `function combineEffects<Ctx>(...effects: WsEffect<Ctx>[]): WsEffect<Ctx>`

- [ ] **Step 1: Write the failing test** — `src/combineEffects.test.ts`

```ts
import { map, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { combineEffects } from "#/combineEffects";
import { matchType, out } from "#/operators";
import type { Inbound, WsEffect } from "#/types";

const echoA: WsEffect<unknown> = (in$) =>
  in$.pipe(matchType("a"), map(() => out("A")));
const echoB: WsEffect<unknown> = (in$) =>
  in$.pipe(matchType("b"), map(() => out("B")));

describe("combineEffects", () => {
  it("merges outputs of all effects over one inbound stream", async () => {
    const in$ = of<Inbound>({ type: "a" }, { type: "b" }, { type: "a" });
    const combined = combineEffects(echoA, echoB);
    const outs = await new Promise((resolve) => {
      combined(in$, undefined).pipe(toArray()).subscribe(resolve);
    });
    expect(outs).toEqual([{ type: "A" }, { type: "B" }, { type: "A" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/ws-effects test combineEffects` → FAIL (no module).

- [ ] **Step 3: Implement `src/combineEffects.ts`**

```ts
import { merge, type Observable } from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

/** Merge many effects into one, all sharing the same inbound stream. */
export function combineEffects<Ctx>(
  ...effects: WsEffect<Ctx>[]
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> =>
    merge(...effects.map((effect) => effect(in$, ctx)));
}
```

- [ ] **Step 4: Add to barrel** — ensure `export { combineEffects } from "./combineEffects.js";` is present in `src/index.ts`.

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/ws-effects test combineEffects` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ws-effects/src
git commit -m "feat(ws-effects): combineEffects merges effects over one inbound stream"
```

---

## Task 4: `stream()` sugar

**Files:**
- Create: `packages/ws-effects/src/stream.ts`
- Create: `packages/ws-effects/src/stream.test.ts`

**Interfaces:**
- Consumes: `WsEffect`, `Inbound`, `Outbound`, `matchType`.
- Produces: `function stream<Ctx>(inType: string, project: (payload: unknown, ctx: Ctx) => Observable<Outbound>): WsEffect<Ctx>`

- [ ] **Step 1: Write the failing marble test** — `src/stream.test.ts`

```ts
import { TestScheduler } from "rxjs/testing";
import { map } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { out } from "#/operators";
import { stream } from "#/stream";
import type { Inbound, Outbound } from "#/types";

describe("stream", () => {
  let scheduler: TestScheduler;
  beforeEach(() => {
    scheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it("projects each matching inbound into its outbound stream", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      // project: for a subscribe.pricing message, emit two ticks then keep going
      const ticks$ = cold("x-y|", { x: out("tick", 1), y: out("tick", 2) });
      const effect = stream<unknown>("subscribe.pricing", () => ticks$);

      const in$ = hot("  a---", { a: { type: "subscribe.pricing" } as Inbound });
      const expected = " x-y";
      expectObservable(effect(in$, undefined)).toBe(expected, {
        x: out("tick", 1) as Outbound,
        y: out("tick", 2) as Outbound,
      });
    });
  });

  it("ignores non-matching inbound", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      const effect = stream<unknown>("subscribe.pricing", () =>
        cold("x|", { x: out("tick", 1) }),
      );
      const in$ = hot("b|", { b: { type: "subscribe.other" } as Inbound });
      expectObservable(effect(in$, undefined).pipe(map((m) => m))).toBe("-|");
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/ws-effects test stream` → FAIL (no module).

- [ ] **Step 3: Implement `src/stream.ts`**

```ts
import { mergeMap, type Observable } from "rxjs";

import { matchType } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

/**
 * Sugar for a subscription effect: on each matching inbound, subscribe the
 * projected observable and forward its outbound frames. `project` returns
 * `Outbound`s directly, so it covers 1→N streaming and SoW-marker fan-out.
 */
export function stream<Ctx>(
  inType: string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> =>
    in$.pipe(
      matchType(inType),
      mergeMap((msg) => project(msg.payload, ctx)),
    );
}
```

- [ ] **Step 4: Add to barrel** — ensure `export { stream } from "./stream.js";`.

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/ws-effects test stream` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ws-effects/src
git commit -m "feat(ws-effects): stream() sugar with marble tests"
```

---

## Task 5: `rpc()` sugar (ack / nack + correlationId)

**Files:**
- Create: `packages/ws-effects/src/rpc.ts`
- Create: `packages/ws-effects/src/rpc.test.ts`

**Interfaces:**
- Consumes: `WsEffect`, `Inbound`, `Outbound`, `matchType`, `out`.
- Produces: `function rpc<Ctx>(inType: string, outType: string, handle: (payload: unknown, ctx: Ctx) => Observable<unknown> | Promise<unknown> | unknown): WsEffect<Ctx>`
- Response shape: success → `{ type: "ack", payload: result }`; error/throw → `{ type: "nack" }` — both carrying the request's `correlationId`. Matches `RpcResponse<T>` in `@rtc/shared`.

- [ ] **Step 1: Write the failing test** — `src/rpc.test.ts`

```ts
import { of, throwError } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { rpc } from "#/rpc";
import type { Inbound } from "#/types";

const drain = (source: import("rxjs").Observable<unknown>): Promise<unknown[]> =>
  new Promise((resolve) => {
    source.pipe(toArray()).subscribe((v) => resolve(v as unknown[]));
  });

describe("rpc", () => {
  it("wraps a resolved observable value as an ack with the correlationId", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => of(7));
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "1" });
    expect(await drain(effect(in$, undefined))).toEqual([
      { type: "rpc.x.response", payload: { type: "ack", payload: 7 }, correlationId: "1" },
    ]);
  });

  it("wraps a plain synchronous value as an ack", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () => 42);
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "2" });
    expect(await drain(effect(in$, undefined))).toEqual([
      { type: "rpc.x.response", payload: { type: "ack", payload: 42 }, correlationId: "2" },
    ]);
  });

  it("emits nack on error", async () => {
    const effect = rpc<unknown>("rpc.x", "rpc.x.response", () =>
      throwError(() => new Error("boom")),
    );
    const in$ = of<Inbound>({ type: "rpc.x", payload: {}, correlationId: "3" });
    expect(await drain(effect(in$, undefined))).toEqual([
      { type: "rpc.x.response", payload: { type: "nack" }, correlationId: "3" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/ws-effects test rpc` → FAIL (no module).

- [ ] **Step 3: Implement `src/rpc.ts`**

```ts
import {
  catchError,
  from,
  isObservable,
  map,
  mergeMap,
  type Observable,
  of,
  take,
} from "rxjs";

import { matchType, out } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

function toObservable(
  value: Observable<unknown> | Promise<unknown> | unknown,
): Observable<unknown> {
  if (isObservable(value)) return value;
  if (value instanceof Promise) return from(value);
  return of(value);
}

/**
 * Sugar for a request/response effect. Runs `handle` per matching inbound,
 * takes its first emission as the result, and replies with an ack (or nack on
 * error), threading the request's correlationId. Absorbs the try/ack/catch/nack
 * boilerplate.
 */
export function rpc<Ctx>(
  inType: string,
  outType: string,
  handle: (payload: unknown, ctx: Ctx) => Observable<unknown> | Promise<unknown> | unknown,
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> =>
    in$.pipe(
      matchType(inType),
      mergeMap((msg) =>
        toObservable(handle(msg.payload, ctx)).pipe(
          take(1),
          map((result) =>
            out(outType, { type: "ack", payload: result }, msg.correlationId),
          ),
          catchError(() =>
            of(out(outType, { type: "nack" }, msg.correlationId)),
          ),
        ),
      ),
    );
}
```

> **Known simplification:** if `handle`'s source completes without emitting, no reply is sent (vs `firstValueFrom`, which would reject → nack). The server simulators always emit for these RPCs, so this is not reachable in practice; documented for the reviewer.

- [ ] **Step 4: Add to barrel** — ensure `export { rpc } from "./rpc.js";`.

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/ws-effects test rpc` → PASS (3 assertions).

- [ ] **Step 6: Commit**

```bash
git add packages/ws-effects/src
git commit -m "feat(ws-effects): rpc() sugar with ack/nack + correlationId"
```

---

## Task 6: `createWsListener` (wiring + teardown)

**Files:**
- Create: `packages/ws-effects/src/createWsListener.ts`
- Create: `packages/ws-effects/src/createWsListener.test.ts`

**Interfaces:**
- Consumes: `WsEffect`, `Socket`.
- Produces: `function createWsListener<Ctx>(effect: WsEffect<Ctx>, ctx: Ctx): (socket: Socket) => void`
- Behaviour: subscribes `effect(shared messages$, ctx)` to `socket.send`; tears down on `socket.closed$`; a shared inbound stream means one upstream subscription regardless of effect count.

- [ ] **Step 1: Write the failing test** — `src/createWsListener.test.ts`

```ts
import { map, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { createWsListener } from "#/createWsListener";
import { matchType, out } from "#/operators";
import type { Inbound, Outbound, Socket, WsEffect } from "#/types";

function fakeSocket() {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = { messages$, closed$, send: (m) => sent.push(m) };
  return { socket, messages$, closed$, sent };
}

const pingPong: WsEffect<unknown> = (in$) =>
  in$.pipe(matchType("ping"), map(() => out("pong")));

describe("createWsListener", () => {
  it("sends effect output to the socket", () => {
    const { socket, messages$, sent } = fakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("stops sending after the socket closes", () => {
    const { socket, messages$, closed$, sent } = fakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    closed$.next();
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("subscribes the inbound stream only once across effects", () => {
    const messages$ = new Subject<Inbound>();
    const subscribe = vi.spyOn(messages$, "subscribe");
    const closed$ = new Subject<void>();
    const socket: Socket = { messages$, closed$, send: () => {} };
    const two = (i$: typeof messages$) =>
      // two effects reading the same stream
      // combineEffects is exercised elsewhere; here assert single upstream sub
      i$.pipe(matchType("ping"), map(() => out("pong")));
    createWsListener<undefined>((i$) => two(i$ as never), undefined)(socket);
    messages$.next({ type: "ping" });
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/ws-effects test createWsListener` → FAIL (no module).

- [ ] **Step 3: Implement `src/createWsListener.ts`**

```ts
import { share, takeUntil } from "rxjs";

import type { Socket, WsEffect } from "./types.js";

/**
 * Wire an effect to sockets. Returns a per-connection handler that pipes the
 * (shared) inbound stream through the effect and out to `socket.send`, tearing
 * the subscription down on `socket.closed$`. A top-level error handler isolates
 * a failed effect from the process (RPC errors are already handled by `rpc()`).
 */
export function createWsListener<Ctx>(
  effect: WsEffect<Ctx>,
  ctx: Ctx,
): (socket: Socket) => void {
  return (socket: Socket): void => {
    const in$ = socket.messages$.pipe(share());
    effect(in$, ctx)
      .pipe(takeUntil(socket.closed$))
      .subscribe({
        next: (message) => socket.send(message),
        error: (err: unknown) => {
          console.error("ws-effects: effect stream error", err);
        },
      });
  };
}
```

- [ ] **Step 4: Add to barrel** — ensure `export { createWsListener } from "./createWsListener.js";`.

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/ws-effects test` (all files) → PASS.

- [ ] **Step 6: Verify the framework builds + gates locally**

Run: `pnpm --filter @rtc/ws-effects build && pnpm --filter @rtc/ws-effects typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ws-effects/src
git commit -m "feat(ws-effects): createWsListener wiring + teardown"
```

---

## Task 7: Consolidate protocol constants into `@rtc/shared` (D5)

**Files:**
- Create: `packages/shared/src/protocol/messages.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/protocol/messages.test.ts`

**Interfaces:**
- Produces (value exports): `CLIENT_MSG`, `SERVER_MSG` — the single source of truth for all 24 wire message-type strings. String values are copied verbatim from `packages/server/src/ws/protocol.ts` (16) and the inline blocks in `packages/client-react/src/app/adapters/portFactory.ts` (equities 8).

- [ ] **Step 1: Write the failing test** — `src/protocol/messages.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "#/protocol/messages";

describe("protocol messages", () => {
  it("keeps the FX/Credit/Admin wire names stable", () => {
    expect(CLIENT_MSG.SUBSCRIBE_PRICING).toBe("subscribe.pricing");
    expect(CLIENT_MSG.EXECUTE_TRADE).toBe("rpc.executeTrade");
    expect(SERVER_MSG.PRICE_TICK).toBe("stream.priceTick");
  });

  it("includes the equities wire names", () => {
    expect(CLIENT_MSG.SUBSCRIBE_WATCHLIST).toBe("subscribe.watchlist");
    expect(CLIENT_MSG.PLACE_ORDER).toBe("rpc.placeOrder");
    expect(SERVER_MSG.ORDER_LIFECYCLE).toBe("stream.orderLifecycle");
    expect(SERVER_MSG.POSITIONS).toBe("stream.positions");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/shared test messages` → FAIL (no module).

- [ ] **Step 3: Create `src/protocol/messages.ts`** (verbatim values — 24 client + server keys)

```ts
export const CLIENT_MSG = {
  // FX subscriptions
  SUBSCRIBE_REFERENCE_DATA: "subscribe.referenceData",
  SUBSCRIBE_PRICING: "subscribe.pricing",
  SUBSCRIBE_BLOTTER: "subscribe.blotter",
  SUBSCRIBE_ANALYTICS: "subscribe.analytics",
  // Credit subscriptions
  SUBSCRIBE_INSTRUMENTS: "subscribe.instruments",
  SUBSCRIBE_DEALERS: "subscribe.dealers",
  SUBSCRIBE_WORKFLOW: "subscribe.workflow",
  // FX RPCs
  EXECUTE_TRADE: "rpc.executeTrade",
  GET_PRICE_HISTORY: "rpc.getPriceHistory",
  // Credit RPCs
  CREATE_RFQ: "rpc.createRfq",
  CANCEL_RFQ: "rpc.cancelRfq",
  QUOTE: "rpc.quote",
  PASS: "rpc.pass",
  ACCEPT: "rpc.accept",
  // Admin
  GET_THROUGHPUT: "admin.getThroughput",
  SET_THROUGHPUT: "admin.setThroughput",
  // Equities
  SUBSCRIBE_WATCHLIST: "subscribe.watchlist",
  SUBSCRIBE_EQ_QUOTES: "subscribe.eqQuotes",
  GET_CANDLES: "rpc.getCandles",
  SUBSCRIBE_DEPTH: "subscribe.depth",
  PLACE_ORDER: "rpc.placeOrder",
  CANCEL_ORDER: "rpc.cancelOrder",
  SUBSCRIBE_ORDERS: "subscribe.orders",
  SUBSCRIBE_POSITIONS: "subscribe.positions",
} as const;

export const SERVER_MSG = {
  // FX streams
  REFERENCE_DATA: "stream.referenceData",
  PRICE_TICK: "stream.priceTick",
  BLOTTER: "stream.blotter",
  ANALYTICS: "stream.analytics",
  // Credit streams
  INSTRUMENT_EVENT: "stream.instrumentEvent",
  DEALER_EVENT: "stream.dealerEvent",
  WORKFLOW_EVENT: "stream.workflowEvent",
  // RPC responses
  EXECUTION_RESPONSE: "rpc.executeTrade.response",
  PRICE_HISTORY_RESPONSE: "rpc.getPriceHistory.response",
  CREATE_RFQ_RESPONSE: "rpc.createRfq.response",
  CANCEL_RFQ_RESPONSE: "rpc.cancelRfq.response",
  QUOTE_RESPONSE: "rpc.quote.response",
  PASS_RESPONSE: "rpc.pass.response",
  ACCEPT_RESPONSE: "rpc.accept.response",
  // Admin
  THROUGHPUT_RESPONSE: "admin.getThroughput.response",
  SET_THROUGHPUT_RESPONSE: "admin.setThroughput.response",
  // Equities
  WATCHLIST: "stream.watchlist",
  EQ_QUOTE: "stream.eqQuote",
  CANDLES_RESPONSE: "rpc.getCandles.response",
  DEPTH: "stream.depth",
  PLACE_ORDER_RESPONSE: "rpc.placeOrder.response",
  ORDER_LIFECYCLE: "stream.orderLifecycle",
  CANCEL_ORDER_RESPONSE: "rpc.cancelOrder.response",
  ORDERS: "stream.orders",
  POSITIONS: "stream.positions",
} as const;
```

> **`PLACE_ORDER_RESPONSE` is server-only.** The client's `WsAdapter.rpc` matches responses purely by `correlationId` (`WsAdapter.ts:84`, resolving with `msg.payload`) — it never inspects the response `type`. So `createOrderPort` needs no `PLACE_ORDER_RESPONSE` constant; only the server references it. It lives here so the server has one source of truth.

- [ ] **Step 4: Export from `src/index.ts`** — add (note: `export`, not `export type`, since these are values)

```ts
export { CLIENT_MSG, SERVER_MSG } from "./protocol/messages.js";
```

- [ ] **Step 5: Run to verify it passes** — `pnpm --filter @rtc/shared test messages` → PASS, then `pnpm --filter @rtc/shared build`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): single-source protocol constants (incl equities)"
```

---

## Task 8: `toSocket` adapter + server dependency on `@rtc/ws-effects`

**Files:**
- Modify: `packages/server/package.json` (add deps)
- Create: `packages/server/src/ws/toSocket.ts`
- Create: `packages/server/src/ws/toSocket.test.ts`
- Create: `packages/server/src/effects/context.ts`

**Interfaces:**
- Consumes: `Socket` (`@rtc/ws-effects`), the `FakeWs` test helper.
- Produces:
  - `function toSocket(ws: WebSocket): Socket` — lifts `ws` `message`/`close` events into `messages$`/`closed$`, forwards `send` (guarding `readyState`), drops unparseable frames.
  - `type Ctx = ServiceContainer` (re-exported for effect files).

- [ ] **Step 1: Add dependencies** to `packages/server/package.json` `dependencies`

```jsonc
"@rtc/ws-effects": "workspace:*",
```
Add to `references` in `packages/server/tsconfig.json`: `{ "path": "../ws-effects" }`.

- [ ] **Step 2: Write the failing test** — `src/ws/toSocket.test.ts`

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { FakeWs } from "./FakeWs.testHelpers.js";
import { toSocket } from "./toSocket.js";

describe("toSocket", () => {
  it("emits parsed inbound frames", async () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const first = firstValueFrom(socket.messages$);
    ws.receive({ type: "subscribe.pricing", payload: { symbol: "EURUSD" } });
    expect(await first).toEqual({
      type: "subscribe.pricing",
      payload: { symbol: "EURUSD" },
    });
  });

  it("forwards send() as JSON when open", () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    socket.send({ type: "stream.priceTick", payload: { bid: 1 } });
    expect(ws.framesOfType("stream.priceTick")).toHaveLength(1);
  });

  it("completes closed$ on socket close", async () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const closed = firstValueFrom(socket.closed$);
    ws.closeConnection();
    await expect(closed).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @rtc/server test toSocket` → FAIL (no module).

- [ ] **Step 4: Implement `src/ws/toSocket.ts`**

```ts
import { fromEvent, map, Observable, take } from "rxjs";
import type { WebSocket } from "ws";

import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";

export function toSocket(ws: WebSocket): Socket {
  const messages$ = new Observable<Inbound>((subscriber) => {
    const onMessage = (data: unknown): void => {
      try {
        subscriber.next(JSON.parse(String(data)) as Inbound);
      } catch {
        // ignore unparseable frames (parity with the old handler)
      }
    };
    ws.on("message", onMessage);
    return () => ws.off("message", onMessage);
  });

  const closed$ = fromEvent(ws, "close").pipe(
    take(1),
    map((): void => undefined),
  );

  return {
    messages$,
    closed$,
    send: (message: Outbound): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
  };
}
```

- [ ] **Step 5: Create `src/effects/context.ts`**

```ts
export type { ServiceContainer as Ctx } from "../services/serviceContainer.js";
```

- [ ] **Step 6: Run to verify it passes** — `pnpm --filter @rtc/server test toSocket` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json packages/server/src/ws/toSocket.ts packages/server/src/ws/toSocket.test.ts packages/server/src/effects/context.ts pnpm-lock.yaml
git commit -m "feat(server): toSocket ws adapter + depend on @rtc/ws-effects"
```

---

## Task 9: FX effects

**Files:**
- Create: `packages/server/src/effects/fx.effects.ts`
- Create: `packages/server/src/effects/fx.effects.test.ts`

**Interfaces:**
- Consumes: `stream`, `rpc`, `out` (`@rtc/ws-effects`); `CLIENT_MSG`, `SERVER_MSG`, DTO types (`@rtc/shared`); `Ctx`.
- Produces: `export const fxEffects: WsEffect<Ctx>[]` = `[referenceData$, pricing$, blotter$, analytics$, executeTrade$, getPriceHistory$]`.

> **Porting rule:** the DTO mapping bodies already exist in `packages/server/src/ws/wsHandler.ts` — transcribe them verbatim into the `project`/`handle` callbacks. Line references below point at the exact source to move.

- [ ] **Step 1: Write the failing test** — `src/effects/fx.effects.test.ts`

```ts
import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { combineEffects, createWsListener } from "@rtc/ws-effects";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { fxEffects } from "./fx.effects.js";
import type { Ctx } from "./context.js";

function harness(ctx: Partial<Ctx>) {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = { messages$, closed$, send: (m) => sent.push(m) };
  createWsListener(combineEffects(...fxEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}

describe("fx effects", () => {
  it("streams price ticks as PriceTickDto on subscribe.pricing", () => {
    const tick = {
      symbol: "EURUSD", bid: 1.1, ask: 1.1002, mid: 1.1001,
      valueDate: "2026-07-02", creationTimestamp: 1,
    };
    const ctx = { pricing: { getPriceUpdates: vi.fn(() => of(tick)) } };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_PRICING, payload: { symbol: "EURUSD" } });
    expect(sent).toEqual([{ type: SERVER_MSG.PRICE_TICK, payload: tick }]);
  });

  it("acks executeTrade with the ExecutionResponseDto", () => {
    const trade = {
      tradeId: 1, tradeName: "EUR", currencyPair: "EURUSD", notional: 1_000_000,
      dealtCurrency: "EUR", direction: "Buy", spotRate: 1.1, status: "Done",
      tradeDate: "2026-07-02", valueDate: "2026-07-04",
    };
    const ctx = { execution: { executeTrade: vi.fn(() => of(trade)) } };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.EXECUTE_TRADE, payload: { currencyPair: "EURUSD", spotRate: 1.1, direction: "Buy", notional: 1_000_000, dealtCurrency: "EUR" }, correlationId: "9" });
    expect(sent).toEqual([
      { type: SERVER_MSG.EXECUTION_RESPONSE, payload: { type: "ack", payload: trade }, correlationId: "9" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/server test fx.effects` → FAIL (no module).

- [ ] **Step 3: Implement `src/effects/fx.effects.ts`** — exemplar shapes shown in full; transcribe the DTO maps from `wsHandler.ts` at the referenced lines.

```ts
import { map, type Observable } from "rxjs";

import { out, rpc, stream, type Outbound, type WsEffect } from "@rtc/ws-effects";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type {
  AnalyticsDto, CurrencyPairUpdateDto, ExecutionRequestDto, ExecutionResponseDto,
  PriceTickDto, ReferenceDataMessage, TradeDto,
} from "@rtc/shared";
import type { CurrencyPair, PositionUpdates, PriceTick, Trade } from "@rtc/domain";

import type { Ctx } from "./context.js";

// referenceData — bulk SoW; first emission is the state-of-the-world.
// Transcribe the CurrencyPairUpdateDto mapping from wsHandler.ts:182-223.
const referenceData$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA, (_payload, ctx) => {
  let isFirst = true;
  return ctx.referenceData.getCurrencyPairs().pipe(
    map((pairs: readonly CurrencyPair[]): Outbound => {
      const updates: CurrencyPairUpdateDto[] = pairs.map((p) => ({
        symbol: p.symbol, ratePrecision: p.ratePrecision, pipsPosition: p.pipsPosition,
      }));
      const message: ReferenceDataMessage = { updates, isStateOfTheWorld: isFirst, isStale: false };
      isFirst = false;
      return out(SERVER_MSG.REFERENCE_DATA, message);
    }),
  );
});

// pricing — 1:1 tick → PriceTickDto (wsHandler.ts:225-261).
const pricing$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_PRICING, (payload, ctx) => {
  const { symbol } = payload as { symbol: string };
  return ctx.pricing.getPriceUpdates(symbol).pipe(
    map((tick: PriceTick): Outbound => {
      const dto: PriceTickDto = {
        symbol: tick.symbol, bid: tick.bid, ask: tick.ask, mid: tick.mid,
        valueDate: tick.valueDate, creationTimestamp: tick.creationTimestamp,
      };
      return out(SERVER_MSG.PRICE_TICK, dto);
    }),
  );
});

// blotter — bulk SoW (wsHandler.ts:263-311).  analytics — 1:1 (wsHandler.ts:313-357).
// (Transcribe both the same way as referenceData$/pricing$.)

// executeTrade — rpc; map Trade → ExecutionResponseDto (wsHandler.ts:536-578).
const executeTrade$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.EXECUTE_TRADE, SERVER_MSG.EXECUTION_RESPONSE,
  (payload, ctx): Observable<ExecutionResponseDto> => {
    const req = payload as ExecutionRequestDto;
    return ctx.execution.executeTrade({
      currencyPair: req.currencyPair, spotRate: req.spotRate, direction: req.direction,
      notional: req.notional, dealtCurrency: req.dealtCurrency,
    }).pipe(map((t: Trade): ExecutionResponseDto => ({
      tradeId: t.tradeId, tradeName: t.tradeName, currencyPair: t.currencyPair,
      notional: t.notional, dealtCurrency: t.dealtCurrency, direction: t.direction,
      spotRate: t.spotRate, status: t.status, tradeDate: t.tradeDate, valueDate: t.valueDate,
    })));
  },
);

// getPriceHistory — rpc; map to PriceHistoryDto (wsHandler.ts:580-616).

export const fxEffects: WsEffect<Ctx>[] = [
  referenceData$, pricing$, /* blotter$, analytics$, */ executeTrade$, /* getPriceHistory$ */
];
```

> Complete `blotter$`, `analytics$`, and `getPriceHistory$` by transcribing the referenced `wsHandler.ts` bodies into the same `stream`/`rpc` shape, then add them to the `fxEffects` array. `blotter$`/`analytics$` follow `referenceData$`/`pricing$`; `getPriceHistory$` follows `executeTrade$` but returns `{ prices: [...] }` (see wsHandler.ts:580-616).

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @rtc/server test fx.effects` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/effects/fx.effects.ts packages/server/src/effects/fx.effects.test.ts
git commit -m "feat(server): FX effects (streams + RPCs)"
```

---

## Task 10: Credit effects (incl. SoW-marker fan-out)

**Files:**
- Create: `packages/server/src/effects/credit.effects.ts`
- Create: `packages/server/src/effects/credit.effects.test.ts`

**Interfaces:**
- Produces: `export const creditEffects: WsEffect<Ctx>[]` = `[instruments$, dealers$, workflow$, createRfq$, cancelRfq$, quote$, pass$, accept$]`.

- [ ] **Step 1: Write the failing test** — assert `instruments$` emits `startOfStateOfTheWorld`, one `added` per instrument, then `endOfStateOfTheWorld` on `SUBSCRIBE_INSTRUMENTS`; assert `createRfq$` acks with the rfqId. (Model the harness on Task 9's `harness()`.)

```ts
import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { combineEffects, createWsListener } from "@rtc/ws-effects";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { creditEffects } from "./credit.effects.js";
import type { Ctx } from "./context.js";

it("instruments$ emits SoW markers then endOfStateOfTheWorld", () => {
  const inst = { id: 1, name: "n", cusip: "c", ticker: "t", maturity: "2030", interestRate: 1, benchmark: "b" };
  const ctx = { instruments: { getInstruments: vi.fn(() => of([inst])) } };
  const messages$ = new Subject<Inbound>(); const closed$ = new Subject<void>(); const sent: Outbound[] = [];
  createWsListener(combineEffects(...creditEffects), ctx as unknown as Ctx)({ messages$, closed$, send: (m) => sent.push(m) } as Socket);
  messages$.next({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS });
  expect(sent.map((m) => (m.payload as { type: string }).type)).toEqual([
    "startOfStateOfTheWorld", "added", "endOfStateOfTheWorld",
  ]);
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (no module).

- [ ] **Step 3: Implement `src/effects/credit.effects.ts`** — the SoW-marker effect is the fan-out shape; transcribe the marker logic from `wsHandler.ts:361-417` (instruments), `419-466` (dealers), `468-532` (workflow), and the five RPCs from `wsHandler.ts:618-714`.

```ts
import { concat, map, of, type Observable } from "rxjs";
import { out, rpc, stream, type Outbound, type WsEffect } from "@rtc/ws-effects";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { InstrumentDto, InstrumentEvent } from "@rtc/shared";
import type { Instrument } from "@rtc/domain";
import type { Ctx } from "./context.js";

// SoW-marker fan-out: start → per-item added (once, on first emission) → end.
const instruments$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_INSTRUMENTS, (_payload, ctx) => {
  let isFirst = true;
  const start$ = of(out(SERVER_MSG.INSTRUMENT_EVENT, { type: "startOfStateOfTheWorld" } satisfies InstrumentEvent));
  const events$: Observable<Outbound> = ctx.instruments.getInstruments().pipe(
    map((instruments: readonly Instrument[]): Outbound[] => {
      const added = instruments.map((inst): Outbound => {
        const dto: InstrumentDto = {
          id: inst.id, name: inst.name, cusip: inst.cusip, ticker: inst.ticker,
          maturity: inst.maturity, interestRate: inst.interestRate, benchmark: inst.benchmark,
        };
        return out(SERVER_MSG.INSTRUMENT_EVENT, { type: "added", payload: dto } satisfies InstrumentEvent);
      });
      const frames = isFirst
        ? [...added, out(SERVER_MSG.INSTRUMENT_EVENT, { type: "endOfStateOfTheWorld" } satisfies InstrumentEvent)]
        : added;
      isFirst = false;
      return frames;
    }),
    // flatten Outbound[] → Outbound
    // eslint-disable-next-line rxjs — use mergeMap(from) in the real impl
  ) as unknown as Observable<Outbound>;
  return concat(start$, events$);
});

// dealers$, workflow$ follow the same fan-out; the 5 RPCs use rpc():
//   createRfq$  (CREATE_RFQ  → CREATE_RFQ_RESPONSE, ack payload = rfqId number)
//   cancelRfq$  (CANCEL_RFQ  → CANCEL_RFQ_RESPONSE, void)
//   quote$      (QUOTE       → QUOTE_RESPONSE, void)
//   pass$       (PASS        → PASS_RESPONSE, void)
//   accept$     (ACCEPT      → ACCEPT_RESPONSE, void)

export const creditEffects: WsEffect<Ctx>[] = [instruments$ /* , ...rest */];
```

> **Fan-out note:** emit `Outbound[]` per source emission by flattening with `mergeMap((frames) => from(frames))` rather than the placeholder cast above — replace the marked line with a proper `mergeMap(from)` so each frame is a distinct emission. The reviewer must confirm no `eslint-disable` remains.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @rtc/server test credit.effects` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): Credit effects (SoW fan-out + RFQ RPCs)"`

---

## Task 11: Admin effects

**Files:**
- Create: `packages/server/src/effects/admin.effects.ts`
- Create: `packages/server/src/effects/admin.effects.test.ts`

**Interfaces:**
- Produces: `export const adminEffects: WsEffect<Ctx>[]` = `[getThroughput$, setThroughput$]`.

- [ ] **Step 1: Write the failing test** — assert `getThroughput$` acks with `svc.throughput.getThroughput()` (a synchronous number, proving `rpc()`'s plain-value path), and `setThroughput$` acks after calling `setThroughput(value)`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** (transcribe from `wsHandler.ts:154-169, 716-738`)

```ts
import { rpc, type WsEffect } from "@rtc/ws-effects";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Ctx } from "./context.js";

const getThroughput$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_THROUGHPUT, SERVER_MSG.THROUGHPUT_RESPONSE,
  (_payload, ctx) => ctx.throughput.getThroughput(), // sync number
);

const setThroughput$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.SET_THROUGHPUT, SERVER_MSG.SET_THROUGHPUT_RESPONSE,
  (payload, ctx) => {
    const { value } = payload as { value: number };
    ctx.throughput.setThroughput(value);
    return undefined; // void ack
  },
);

export const adminEffects: WsEffect<Ctx>[] = [getThroughput$, setThroughput$];
```

> The old `getThroughput` handler wrapped the value as `{ type: "ack", payload: svc.throughput.getThroughput() }`. `rpc()` produces exactly this envelope, so the wire is unchanged.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `git commit -m "feat(server): Admin throughput effects"`

---

## Task 12: Wire equity simulators into `serviceContainer`

**Files:**
- Modify: `packages/server/src/services/serviceContainer.ts`
- Modify: `packages/server/src/services/__tests__/serviceContainer.test.ts` (create if absent)

**Interfaces:**
- Produces (added to `ServiceContainer`): `readonly marketData: MarketDataPort; readonly orders: OrderPort; readonly positions: PositionPort;` (import the port types from `@rtc/domain`).

- [ ] **Step 1: Write the failing test** — assert `createServices()` returns `marketData`, `orders`, `positions`, and that `orders.orders()` and `positions.positions()` emit.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — mirror `createSimulatorPorts` in `packages/client-react/src/app/adapters/portFactory.ts:114-153`

```ts
import {
  AnalyticsSimulator, CreditRfqSimulator, DEALERS_CATALOG, DealerSimulator,
  EquityMarketDataSimulator, EquityOrderSimulator, EquityPositionSimulator,
  ExecutionSimulator, type FillEvent, InstrumentSimulator, type MarketDataPort,
  type OrderPort, type PositionPort, PricingSimulator, ReferenceDataSimulator,
  TradeStoreSimulator,
} from "@rtc/domain";
// ...existing imports + ThroughputService

export interface ServiceContainer {
  // ...existing 9 fields
  readonly marketData: MarketDataPort;
  readonly orders: OrderPort;
  readonly positions: PositionPort;
}

export function createServices(): ServiceContainer {
  // ...existing sims
  const marketData = new EquityMarketDataSimulator();
  const positions = new EquityPositionSimulator(marketData);
  const orders = new EquityOrderSimulator({
    listener: (fill: FillEvent): void => positions.onFill(fill),
    markFor: (symbol: string): number => marketData.currentPrice(symbol),
  });
  return { /* ...existing */, marketData, orders, positions };
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit** — `git commit -m "feat(server): wire equity simulators into serviceContainer"`

---

## Task 13: Equities effects (incl. raw `placeOrder$`)

**Files:**
- Create: `packages/server/src/effects/equities.effects.ts`
- Create: `packages/server/src/effects/equities.effects.test.ts`

**Interfaces:**
- Produces: `export const equitiesEffects: WsEffect<Ctx>[]` = `[watchlist$, eqQuotes$, depth$, orders$, positions$, getCandles$, cancelOrder$, placeOrder$]`.
- Equities are **domain types sent directly** (no DTO layer): payloads are `EquityInstrument[]`, `EquityQuote`, `Candle[]`, `DepthBook`, `EquityOrder`, `EquityPosition` — mirror the client `portFactory.ts` equities ports exactly.

- [ ] **Step 1: Write the failing test** — assert `watchlist$` streams the instruments array on `SUBSCRIBE_WATCHLIST`, `getCandles$` acks with the candles array, and **`placeOrder$` both acks with `{ orderId }` and streams `ORDER_LIFECYCLE`** frames:

```ts
import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { combineEffects, createWsListener } from "@rtc/ws-effects";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { equitiesEffects } from "./equities.effects.js";
import type { Ctx } from "./context.js";

it("placeOrder$ acks with orderId and streams lifecycle", () => {
  const order = { id: "o1", symbol: "AAPL", side: "buy", type: "market", qty: 10, status: "filled" };
  const ctx = { orders: { place: vi.fn(() => of(order)) } };
  const messages$ = new Subject<Inbound>(); const closed$ = new Subject<void>(); const sent: Outbound[] = [];
  createWsListener(combineEffects(...equitiesEffects), ctx as unknown as Ctx)({ messages$, closed$, send: (m) => sent.push(m) } as Socket);
  messages$.next({ type: CLIENT_MSG.PLACE_ORDER, payload: { symbol: "AAPL", side: "buy", type: "market", qty: 10 }, correlationId: "7" });
  expect(sent).toEqual([
    { type: SERVER_MSG.PLACE_ORDER_RESPONSE, payload: { type: "ack", payload: { orderId: "o1" } }, correlationId: "7" },
    { type: SERVER_MSG.ORDER_LIFECYCLE, payload: order },
  ]);
});
```

> `PLACE_ORDER_RESPONSE` was defined in Task 7. The client (`createOrderPort`, portFactory.ts:838-887) awaits `ws.rpc(PLACE_ORDER, …)` — which resolves on `correlationId` alone — then subscribes to `ORDER_LIFECYCLE` filtered by `order.id`. The ack payload shape must be `{ orderId }`.

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `src/effects/equities.effects.ts`** — streams/rpcs via sugar; `placeOrder$` uses the raw `WsEffect` primitive:

```ts
import { map, matchType, merge, mergeMap, out, rpc, shareReplay, stream, take, type WsEffect } from "@rtc/ws-effects"; // note: rxjs ops from "rxjs"
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { PlaceOrderRequest } from "@rtc/domain";
import type { Ctx } from "./context.js";

// (Correct imports: matchType/out/rpc/stream from "@rtc/ws-effects";
//  map/merge/mergeMap/shareReplay/take from "rxjs".)

const watchlist$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_WATCHLIST, (_p, ctx) =>
  ctx.marketData.watchlist().pipe(map((list) => out(SERVER_MSG.WATCHLIST, list))));

const eqQuotes$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_EQ_QUOTES, (p, ctx) =>
  ctx.marketData.quotes((p as { symbol: string }).symbol).pipe(map((q) => out(SERVER_MSG.EQ_QUOTE, q))));

const depth$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_DEPTH, (p, ctx) =>
  ctx.marketData.depth((p as { symbol: string }).symbol).pipe(map((b) => out(SERVER_MSG.DEPTH, b))));

const orders$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_ORDERS, (_p, ctx) =>
  ctx.orders.orders().pipe(map((o) => out(SERVER_MSG.ORDERS, o))));

const positions$: WsEffect<Ctx> = stream(CLIENT_MSG.SUBSCRIBE_POSITIONS, (_p, ctx) =>
  ctx.positions.positions().pipe(map((p) => out(SERVER_MSG.POSITIONS, p))));

const getCandles$: WsEffect<Ctx> = rpc(CLIENT_MSG.GET_CANDLES, SERVER_MSG.CANDLES_RESPONSE,
  (p, ctx) => ctx.marketData.candles((p as { symbol: string }).symbol));

const cancelOrder$: WsEffect<Ctx> = rpc(CLIENT_MSG.CANCEL_ORDER, SERVER_MSG.CANCEL_ORDER_RESPONSE,
  (p, ctx) => ctx.orders.cancel((p as { orderId: string }).orderId));

// Raw primitive: ack with { orderId } AND stream lifecycle from one source.
const placeOrder$: WsEffect<Ctx> = (in$, ctx) => in$.pipe(
  matchType(CLIENT_MSG.PLACE_ORDER),
  mergeMap((msg) => {
    // refCount:true so the sim subscription is released on socket close
    // (via createWsListener's takeUntil); bufferSize:1 lets the ack's take(1)
    // and the lifecycle stream both see the first emission even in the
    // synchronous case where merge subscribes ack$ before stream$.
    const lifecycle$ = ctx.orders.place(msg.payload as PlaceOrderRequest).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    const ack$ = lifecycle$.pipe(take(1),
      map((o) => out(SERVER_MSG.PLACE_ORDER_RESPONSE, { type: "ack", payload: { orderId: o.id } }, msg.correlationId)));
    const stream$ = lifecycle$.pipe(map((o) => out(SERVER_MSG.ORDER_LIFECYCLE, o)));
    return merge(ack$, stream$);
  }),
);

export const equitiesEffects: WsEffect<Ctx>[] = [
  watchlist$, eqQuotes$, depth$, orders$, positions$, getCandles$, cancelOrder$, placeOrder$,
];
```

> Fix the import lines: RxJS operators (`map`, `merge`, `mergeMap`, `shareReplay`, `take`) come from `"rxjs"`; only `matchType`, `out`, `rpc`, `stream`, `WsEffect` come from `"@rtc/ws-effects"`.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @rtc/server test equities.effects` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(server): equities effects incl raw placeOrder"`

---

## Task 14: Cutover `index.ts`; delete the switch

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/ws/protocol.ts` (re-export from `@rtc/shared`)
- Delete: `packages/server/src/ws/wsHandler.ts`, `packages/server/src/ws/wsHandler.test.ts`

**Interfaces:**
- Consumes: `combineEffects`, `createWsListener`, `toSocket`, `fxEffects`, `creditEffects`, `adminEffects`, `equitiesEffects`, `createServices`.

- [ ] **Step 1: Rewire `src/index.ts`** — replace the `handleConnection` wiring:

```ts
import { combineEffects, createWsListener } from "@rtc/ws-effects";
import { adminEffects } from "./effects/admin.effects.js";
import { creditEffects } from "./effects/credit.effects.js";
import { equitiesEffects } from "./effects/equities.effects.js";
import { fxEffects } from "./effects/fx.effects.js";
import { createServices } from "./services/serviceContainer.js";
import { toSocket } from "./ws/toSocket.js";

const services = createServices();
const listen = createWsListener(
  combineEffects(...fxEffects, ...creditEffects, ...adminEffects, ...equitiesEffects),
  services,
);
// ...existing httpServer + WebSocketServer setup unchanged...
wss.on("connection", (ws) => listen(toSocket(ws)));
```

- [ ] **Step 2: Reduce `src/ws/protocol.ts`** to a re-export (keeps existing server-internal importers working)

```ts
export { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

export interface WsMessage {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}
```

- [ ] **Step 3: Delete the old handler + its test**

```bash
git rm packages/server/src/ws/wsHandler.ts packages/server/src/ws/wsHandler.test.ts
```

- [ ] **Step 4: Build + typecheck + full server tests**

Run: `pnpm --filter @rtc/server build && pnpm --filter @rtc/server typecheck && pnpm --filter @rtc/server test`
Expected: green. `FakeWs.testHelpers.ts` is still used by `toSocket.test.ts`.

- [ ] **Step 5: Commit** — `git commit -m "refactor(server): cutover to declarative effects; delete switch"`

---

## Task 15: Client — import protocol constants from `@rtc/shared` (D5 consumer)

**Files:**
- Modify: `packages/client-react/src/app/adapters/portFactory.ts`

- [ ] **Step 1: Replace the inline constant blocks** (`portFactory.ts:157-209`) with:

```ts
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
```
Delete the two local `const CLIENT_MSG = {…} as const;` / `const SERVER_MSG = {…} as const;` declarations.

- [ ] **Step 2: Typecheck + client tests**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test`
Expected: green (the imported constants are identical strings; no behaviour change).

- [ ] **Step 3: Run the port contract tests** (they drive WsReal via canonical wire frames)

Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-react test`
Expected: green.

- [ ] **Step 4: Commit** — `git commit -m "refactor(client): import protocol constants from @rtc/shared"`

---

## Task 16: Extend fullstack e2e to cover equities over WS

**Files:**
- Modify: `tests/fullstack/browser/fullstack.spec.ts`

**Interfaces:**
- Consumes: the existing fullstack harness (`_orchestration.ts` sets `VITE_SERVER_URL`, spins up the real server).

- [ ] **Step 1: Add an assertion** that, with the real server running, an equities panel renders live data (e.g. the watchlist shows instruments, or a price/quote updates). Follow the existing spec's page-object/selector patterns in `tests/fullstack/browser/fullstack.spec.ts`; assert on a stable `TESTIDS` selector for an equities tile/row.

- [ ] **Step 2: Run the fullstack browser smoke**

Run: `pnpm --filter @rtc/tests test:fullstack:browser`
Expected: PASS — equities now served over WS (would have failed before Tasks 12–13).

- [ ] **Step 3: Commit** — `git commit -m "test(fullstack): assert equities served over WebSocket"`

---

## Task 17: Full verification + CI-only gates

- [ ] **Step 1: Build + typecheck + unit tests, whole repo**

```bash
pnpm build && pnpm typecheck && pnpm test
```

- [ ] **Step 2: Lint (both engines — Biome-clean ≠ ESLint-clean)**

```bash
pnpm check              # biome
pnpm lint:eslint
pnpm lint:eslint:types
```
Expected: zero findings, zero disables.

- [ ] **Step 3: CI-only gates the local loop misses**

```bash
pnpm check:versions    # manypkg + syncpack — @rtc/ws-effects rxjs range must match
pnpm lint:dead         # knip — new package registered; no unused exports
pnpm check:deps        # depcruise — ws-effects-stays-pure holds; server→ws-effects allowed
```
Expected: all green. If knip flags an unused framework export, confirm every `@rtc/ws-effects` export is consumed by the server; remove any genuinely unused surface.

- [ ] **Step 4: E2E (Playwright oracle; Cypress de-gated)**

```bash
RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e
pnpm --filter @rtc/tests test:fullstack:browser
pnpm --filter @rtc/tests test:fullstack:node
```
Expected: green.

- [ ] **Step 5: Update stale docs** — remove the "Marble.js" server references in `README.md:36,42,88` and `CLAUDE.md:32,42` (replace with "native WebSocket + `@rtc/ws-effects` (declarative RxJS effects)"). Commit.

```bash
git commit -am "docs: server is native WS + @rtc/ws-effects (drop stale Marble.js refs)"
```

- [ ] **Step 6: Ship** — follow `shipping-repo-changes`: push, open PR, poll `gh run list --workflow CI` until the run for your HEAD SHA is `success`, catch up to `origin/main` if behind, then merge with `--merge` **after explicit user OK**.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- D1 mini-framework → Tasks 1–6. D2 own package → Task 1. D3 hybrid API (pure core + `stream`/`rpc`) → Tasks 2–6 (raw primitive exercised in Task 13 `placeOrder$`). D4 rewrite + equities → Tasks 9–14 (rewrite), 12–13 (equities), 16 (e2e proof). D5 protocol consolidation → Tasks 7, 15.
- Framework API (§4.2) → Tasks 2–6. The 24 effects (§5.1) → Tasks 9 (6), 10 (8), 11 (2), 13 (8) = 24. `toSocket`/`Socket` (§4.1) → Task 8. Teardown (§4.4) → Task 6. Testing strategy (§7): marble tests → Tasks 4–6; effect tests → Tasks 9–13; fullstack e2e → Task 16. Migration (§8) → Task 14. Risks (§9): CI-gates → Tasks 1, 17; placeOrder ordering → Task 13 note; framework `ws`-free → Task 1 depcruise rule + Task 8 keeping `ws` in the app.

**2. Placeholder scan:** Two intentional "transcribe from wsHandler.ts:NN-NN" directives (Tasks 9, 10) point at exact existing source to move — the code exists and is referenced by line, not invented. The Task 10 fan-out and Task 13 import lines carry explicit correction notes so no `eslint-disable` survives; the reviewer gate enforces this. No `TBD`/`TODO`.

**3. Type consistency:** `WsEffect<Ctx>`, `Inbound`, `Outbound`, `Socket`, `out`, `matchType`, `stream`, `rpc`, `combineEffects`, `createWsListener` are used identically across Tasks 2–13. Effect array names (`fxEffects`/`creditEffects`/`adminEffects`/`equitiesEffects`) match between their defining tasks and Task 14's `index.ts`. `CLIENT_MSG`/`SERVER_MSG` defined once (Task 7), consumed by server (Tasks 9–14) and client (Task 15). `PLACE_ORDER_RESPONSE` added to `SERVER_MSG` (Task 7/13) and used in Task 13.
