# Behaviour-Sync Follow-ups + Idle Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the one out-of-scope divergence the behaviour-sync surfaced (the idle-overlay Reconnect button with faithful button-only recovery), clear the four review-flagged cleanups, and close the test-coverage gaps the sync introduced.

**Architecture:** Item 1 is red-first TDD: a dumb-UI `useReconnect()` command hook → a `reconnect$` Subject owned in `composition.ts` → `routeIdleLifecycle` routes `reconnect → ws.reopen()` (real) / `gatewayConnected` (simulator) and no longer auto-reopens on `userActivity`. Items 2–5 are mechanical cleanups. Item 6 is a coverage-gap pass: run each tier's coverage report against the behaviour-sync'd files and add the missing scenarios. Clean architecture, the dependency rule, and the dumb-UI gates are preserved throughout.

**Tech Stack:** TypeScript, pnpm + Turborepo, RxJS (domain/app), React + Vite (client), Vitest (unit/app/contract), Playwright/vitest-browser (visual), CSS Modules, Biome/dependency-cruiser/grep-gates.

**Design spec:** `docs/superpowers/specs/2026-06-25-behaviour-sync-followups-design.md`. **Source of truth:** original ReactiveTraderCloud, commit `4a31f01`, paths under `packages/client/src/` (available read-only at the session scratchpad `rtc-original/`).

## Global Constraints

These bind every task. Any step that would violate one is wrong.

- **Dependency rule (machine-enforced by dependency-cruiser):** `@rtc/domain` depends only on `rxjs` at runtime; no Node built-ins in domain production source; `client`/`server`/`mobile` never import each other.
- **Dumb-UI (machine-enforced by the 29 `@rtc/tests` grep-gates):** no `rxjs`/`localStorage`/`fetch`/`setTimeout`/`setInterval` in `src/ui`; UI drives the app layer only through the `AppHooks` contract. CSS Modules only — no inline `style={{}}`.
- **Framework-swap test structure preserved:** corrected/new assertions live in the framework-neutral contract/shared layer; the `react/` swap-trio (registry + page-objects + fakes) stays coherent so a future SolidJS client inherits the contract.
- **Verification (the lesson from the sync):** every task runs `biome ci`, `pnpm typecheck` (**including `@rtc/server`**), `pnpm --filter @rtc/tests gates` (all 29), and `dependency-cruiser` — not only focused tests.
- **Faithful idle recovery:** after an idle close, recovery is **button-only**. `userActivity` no longer reopens (it keeps resetting the idle countdown while connected, inside `BrowserConnectionEventsAdapter` — unchanged). Original provenance: `components/DisconnectionOverlay.tsx:29-36`, `services/connection.ts:43-50,74-96`.
- **Multi-arch visual goldens:** UI-appearance changes regenerate the `react-local/linux-arm64` set in-sandbox (all 3 tiers: playwright-ct, playwright, vitest-browser); the x86 `react/` (CI-compared) and `darwin-arm64` sets are regenerated at merge time on those platforms — these tasks add to that same merge-time regen list.
- **Commit copy:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work on branch `feat/behaviour-sync-followups` (already created off `main`; the design spec is committed there at `d273362`).
- **Single-file test commands:** domain → `pnpm --filter @rtc/domain exec vitest run <path>`; client-react app/unit → `pnpm --filter @rtc/client-react exec vitest run <path>`; client-react contract tier → `pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts <path>`.

## File-structure map

- **App layer (Item 1):** `src/app/composition.ts` (owns `reconnect$`, `App.commands.reconnect`, updated `routeIdleLifecycle`), `src/ui/hooks/createAppHooks.ts` + the `AppHooks` type (new `useReconnect`), the `HooksProvider` call site, the two fakes (`tests/ui/contract/react/hooksFromWorld.ts`, `tests/ui/visual/react/buildFakeHooks.ts`), `src/app/adapters/WsAdapter.ts` (reconnectTimer nit), `src/app/__tests__/idleTeardown.test.ts`.
- **UI (Item 1):** `src/ui/shell/connection/ConnectionOverlay.tsx` + `.module.css`, the connection contract spec + its `ConnectionOverlayPage`, visual goldens.
- **Cleanups (Items 2–5):** `src/ui/fx/blotter/blotterColumns.ts` + `.test.ts` (dead alias); `packages/domain/src/analytics/numberFormat.ts` (new) + `formatPnlValue.ts` + `formatScale.ts` (formatter dedupe); `packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts` (`rejectedWithoutPrice` reducer case).
- **Coverage (Item 6):** tests added across the owning tiers; `packages/client-react/tests/ui/visual/COVERAGE-GAPS.md` refreshed.

## Task order

Task 1 (reconnect command path) → Task 2 (Reconnect button UI, depends on Task 1's `useReconnect`) → Task 3 (dead alias) → Task 4 (formatter dedupe) → Task 5 (reducer case) → Task 6 (coverage-gap pass — runs last, after 1–5 land so the new code is covered too) → Task 7 (whole-branch verification + finishing).

---

### Task 1: Reconnect command path (app layer) + button-only idle recovery

#### Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `packages/client-react/src/app/__tests__/idleTeardown.test.ts` | Update test cases red-first |
| Modify | `packages/client-react/src/app/composition.ts` | Update `routeIdleLifecycle`; add `reconnect$` Subject; add `reconnect()` entry on `App`; wire both real-WS and simulator branches |
| Modify | `packages/client-react/src/ui/hooks/createAppHooks.ts` | Add `useReconnect` to `AppHooks` interface + factory |
| Modify | `packages/client-react/tests/ui/contract/react/hooksFromWorld.ts` | Implement `useReconnect` in the contract-tier fake |
| Modify | `packages/client-react/tests/ui/visual/react/buildFakeHooks.ts` | Implement `useReconnect` in the visual-tier fake |
| Modify | `packages/client-react/src/app/adapters/WsAdapter.ts` | Defensive nit: `this.reconnectTimer = null` after each `clearTimeout` |

#### Wiring decision: how `reconnect()` reaches the hook factory

`createApp` already returns `{ presenters, ports }` (`App` interface, line 69–72 of `composition.ts`). The cleanest extension is to **add a `commands` field to the `App` interface** that exposes a `reconnect(): void` method. Inside `createApp`, the `reconnect$` Subject is owned at module scope within `composition.ts` (not in a presenter — presenters are read-only push surfaces), and `reconnect()` is a simple closure that calls `reconnect$.next({ type: "reconnect" })`. The hook factory signature stays `createAppHooks(presenters, machines)` but gains a third argument `commands: { reconnect(): void }` so the seam stays thin and testable without passing the whole `App`. The `HooksProvider` (which already calls `createAppHooks`) passes `app.commands` as the third argument. This is the lightest change: no new class, no new presenter, no change to any port interface.

---

#### Step 1a — Update `idleTeardown.test.ts` RED-FIRST

**Current file:** `packages/client-react/src/app/__tests__/idleTeardown.test.ts`  
File header comment and existing test cases to update:

**Current code (lines 1–61):**
```ts
// packages/client-react/src/app/__tests__/idleTeardown.test.ts
//
// Verifies the composition.ts WS-branch tap wiring:
//   idleTimeout  → ws.closeForIdle()
//   userActivity → ws.reopen()
//
// Imports routeIdleLifecycle directly from composition.ts so that removing or
// misspelling the real wiring breaks this test (non-vacuous guard).

import { describe, expect, it, vi } from "vitest";

import type { IWsAdapter } from "../adapters/IWsAdapter";
import { routeIdleLifecycle } from "../composition";

describe("composition.ts idle-teardown wiring (T2.2)", () => {
  function makeWs(): Pick<IWsAdapter, "closeForIdle" | "reopen"> {
    return { closeForIdle: vi.fn(), reopen: vi.fn() };
  }

  it("idleTimeout event invokes closeForIdle() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("userActivity event invokes reopen() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("unrelated events (e.g. gatewayConnected) do not call closeForIdle or reopen", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "gatewayConnected" }, ws);
    routeIdleLifecycle({ type: "gatewayDisconnected" }, ws);
    routeIdleLifecycle({ type: "reconnectAttempt" }, ws);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("repeated userActivity events while NOT idle-closed are safe no-ops (reopen() is idempotent)", () => {
    const ws = makeWs();
    // The FakeWsAdapter guard for reopen() is tested in FakeWsAdapter.test.ts;
    // here we just confirm routeIdleLifecycle delegates to ws.reopen() each time.
    routeIdleLifecycle({ type: "userActivity" }, ws);
    routeIdleLifecycle({ type: "userActivity" }, ws);
    // The real WsAdapter.reopen() is guarded by idleClosed; the spy counts raw calls.
    expect(ws.reopen).toHaveBeenCalledTimes(2);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("full idle→reopen lifecycle: closeForIdle then reopen each called once", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
  });
});
```

**Replacement (complete file, RED — fails until Step 1b lands):**
```ts
// packages/client-react/src/app/__tests__/idleTeardown.test.ts
//
// Verifies the composition.ts WS-branch tap wiring:
//   idleTimeout  → ws.closeForIdle()
//   reconnect    → ws.reopen()         ← sole recovery from idle (Item 1)
//   userActivity → neither             ← resets countdown only, not socket
//
// Imports routeIdleLifecycle directly from composition.ts so that removing or
// misspelling the real wiring breaks this test (non-vacuous guard).

import { describe, expect, it, vi } from "vitest";

import type { IWsAdapter } from "../adapters/IWsAdapter";
import { routeIdleLifecycle } from "../composition";

describe("composition.ts idle-teardown wiring (T2.2)", () => {
  function makeWs(): Pick<IWsAdapter, "closeForIdle" | "reopen"> {
    return { closeForIdle: vi.fn(), reopen: vi.fn() };
  }

  it("idleTimeout event invokes closeForIdle() on the WsAdapter", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("reconnect event invokes reopen() on the WsAdapter (button-only recovery)", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "reconnect" }, ws);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("userActivity event no longer reopens the socket after an idle close", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "userActivity" }, ws);
    expect(ws.reopen).not.toHaveBeenCalled();
    expect(ws.closeForIdle).not.toHaveBeenCalled();
  });

  it("unrelated events (e.g. gatewayConnected) do not call closeForIdle or reopen", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "gatewayConnected" }, ws);
    routeIdleLifecycle({ type: "gatewayDisconnected" }, ws);
    routeIdleLifecycle({ type: "reconnectAttempt" }, ws);
    expect(ws.closeForIdle).not.toHaveBeenCalled();
    expect(ws.reopen).not.toHaveBeenCalled();
  });

  it("full idle→reconnect lifecycle: closeForIdle then reopen each called once", () => {
    const ws = makeWs();
    routeIdleLifecycle({ type: "idleTimeout" }, ws);
    routeIdleLifecycle({ type: "reconnect" }, ws);
    expect(ws.closeForIdle).toHaveBeenCalledTimes(1);
    expect(ws.reopen).toHaveBeenCalledTimes(1);
  });
});
```

**Run RED (expect 3 failures — the "reconnect", "userActivity", and "lifecycle" cases):**
```bash
pnpm --filter @rtc/client-react exec vitest run \
  packages/client-react/src/app/__tests__/idleTeardown.test.ts
```

Expected: 2 tests pass (idleTimeout + unrelated), 3 fail.

---

#### Step 1b — Update `routeIdleLifecycle` in `composition.ts`

**Current code (lines 44–50 of `composition.ts`):**
```ts
/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts). */
export function routeIdleLifecycle(
  event: { type: string },
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") ws.closeForIdle();
  else if (event.type === "userActivity") ws.reopen();
}
```

**Replacement:**
```ts
/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts).
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (sole recovery from idle; button-only)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: { type: string },
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") ws.closeForIdle();
  else if (event.type === "reconnect") ws.reopen();
}
```

**Run GREEN:**
```bash
pnpm --filter @rtc/client-react exec vitest run \
  packages/client-react/src/app/__tests__/idleTeardown.test.ts
```

Expected: all 5 tests pass.

---

#### Step 1c — Add `reconnect$` Subject, `App.commands`, and wire both branches in `composition.ts`

**Current imports block (lines 1–3 of `composition.ts`):**
```ts
import { merge, mergeMap, of, tap } from "rxjs";
```

**Replacement:**
```ts
import { Subject, merge, mergeMap, of, tap } from "rxjs";
```

**Current `App` interface (lines 69–72):**
```ts
export interface App {
  presenters: Presenters;
  ports: AppPorts;
}
```

**Replacement:**
```ts
export interface AppCommands {
  /** Push a user-initiated reconnect intent (wired to reconnect$ in composition). */
  reconnect(): void;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
}
```

**Current `buildDefaultPorts` function (lines 74–114):**
```ts
export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(url);
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        return merge(gateway.events(), browser.events()).pipe(
          // Side-effect the transport in lock-step: idle timeout closes the
          // gateway socket; user activity (after an idle close) re-establishes
          // it. Reconnect is user-initiated, matching original
          // services/connection.ts:91-93.
          tap((e) => routeIdleLifecycle(e, ws)),
        );
      },
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }

  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Idle teardown is a faithful no-op in simulator mode: there is no real
      // socket to close. The state machine still reaches IDLE_DISCONNECTED and
      // userActivity already re-emits gatewayConnected to resume.
      return merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) => {
            return e.type === "browserOnline" || e.type === "userActivity"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e);
          }),
        ),
      );
    },
  };
  return { ...createSimulatorPorts(), connectionEvents };
}
```

**Replacement (two branches refactored; `reconnect$` owned here):**
```ts
/** User-initiated reconnect intent Subject. Owned in composition so both the
 * real-WS and simulator branches can merge it, and the hook factory can push
 * into it via AppCommands.reconnect(). */
const reconnect$ = new Subject<{ type: "reconnect" }>();

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(url);
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // Merge gateway events, browser lifecycle events, and user-initiated
        // reconnect intents. The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()       (sole recovery; button-only)
        //   userActivity → no-op here    (resets countdown in BrowserAdapter)
        // Provenance: original services/connection.ts:74-96.
        return merge(
          gateway.events(),
          browser.events(),
          reconnect$,
        ).pipe(tap((e) => routeIdleLifecycle(e, ws)));
      },
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }

  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Simulator branch: idle closes are faithfully no-ops (no real socket).
      // Recovery from idle is via the Reconnect button, which pushes reconnect$
      // → gatewayConnected to resume the state machine. browserOnline also
      // recovers (unchanged). userActivity no longer auto-resumes (item 1).
      // Provenance: original services/connection.ts:43-50.
      return merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) => {
            return e.type === "browserOnline"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e);
          }),
        ),
        reconnect$.pipe(
          mergeMap(() => of({ type: "gatewayConnected" as const })),
        ),
      );
    },
  };
  return { ...createSimulatorPorts(), connectionEvents };
}
```

**Current `createApp` function (lines 116–134):**
```ts
export function createApp(ports: AppPorts = buildDefaultPorts()): App {
  const presenters: Presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(ports.preferences),
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
  };
  return { presenters, ports };
}
```

**Replacement:**
```ts
export function createApp(ports: AppPorts = buildDefaultPorts()): App {
  const presenters: Presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(ports.preferences),
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
  };
  const commands: AppCommands = {
    reconnect: () => {
      reconnect$.next({ type: "reconnect" });
    },
  };
  return { presenters, ports, commands };
}
```

> **Note on `reconnect$` as module-level:** The Subject is module-level (not per-`createApp` call) because `buildDefaultPorts` is also module-level and captures it by closure — same pattern as any module-level singleton. In tests that call `createApp` directly with injected ports, `reconnect$` is still wired correctly since the real `buildDefaultPorts` path is not exercised. If test isolation of the Subject becomes an issue, move it inside `buildDefaultPorts` return value and thread it through; for now module-level is fine (matches the pattern of `reconnectDelayMs` singletons elsewhere).

---

#### Step 1d — Add `useReconnect` to `AppHooks` + `createAppHooks` + fakes

**1d-i. `AppHooks` interface** (`packages/client-react/src/ui/hooks/createAppHooks.ts`, line 83 — after `useAcceptQuote`):

**Current:**
```ts
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
```

**Replacement:**
```ts
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
  /** Fire-and-forget reconnect command — pushes a reconnect intent into the
   * app layer after an idle close. The sole recovery path from IDLE_DISCONNECTED.
   * Provenance: original components/DisconnectionOverlay.tsx:36 (onClick={initConnection}). */
  useReconnect: () => () => void;
```

**1d-ii. `createAppHooks` factory** — add the third argument and implementation.

**Current signature (line 111–114):**
```ts
export function createAppHooks(
  presenters: Presenters,
  machines: MachineFactories,
): AppHooks {
```

**Replacement:**
```ts
export function createAppHooks(
  presenters: Presenters,
  machines: MachineFactories,
  commands: { reconnect(): void },
): AppHooks {
```

**Current `return` block (lines 196–278) — add after `useAcceptQuote` implementation (line 211 area):**

Find this exact text in the return object:
```ts
    useAcceptQuote: () => {
      return acceptQuote;
    },
```

Add after it:
```ts
    useReconnect: () => {
      return commands.reconnect;
    },
```

**1d-iii. `hooksFromWorld.ts` (contract-tier fake)** — add `useReconnect` to the `World.commands` log and the hook implementation.

First, extend `CommandLog` in `world.ts` (add `reconnect: number[]`):

**Current `CommandLog` interface** (`packages/client-react/tests/ui/contract/shared/harness/world.ts`, lines 82–89):
```ts
/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
  executeTrade: ExecuteTradeInput[];
  requestRfqQuote: { symbol: string; pipsPosition: number }[];
  acceptQuote: number[];
  passQuote: number[];
  quoteRfq: QuoteRequest[];
}
```

**Replacement:**
```ts
/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
  executeTrade: ExecuteTradeInput[];
  requestRfqQuote: { symbol: string; pipsPosition: number }[];
  acceptQuote: number[];
  passQuote: number[];
  quoteRfq: QuoteRequest[];
  /** Incremented each time useReconnect() callback is invoked. */
  reconnect: number;
}
```

Update `createWorld` initializer (find `commands: {` in `world.ts`):

**Current:**
```ts
    commands: {
      createRfq: [],
      executeTrade: [],
      requestRfqQuote: [],
      acceptQuote: [],
      passQuote: [],
      quoteRfq: [],
    },
```

**Replacement:**
```ts
    commands: {
      createRfq: [],
      executeTrade: [],
      requestRfqQuote: [],
      acceptQuote: [],
      passQuote: [],
      quoteRfq: [],
      reconnect: 0,
    },
```

Now add `useReconnect` to `reactHooks` in `hooksFromWorld.ts` — after the `useAcceptQuote` implementation (line 101–105):

**Current:**
```ts
    // Command: record input and resolve undefined so the consuming component's
    // `await` proceeds to its post-await state transition.
    useAcceptQuote: () => {
      return async (quoteId: number) => {
        world.commands.acceptQuote.push(quoteId);
      };
    },
```

**Add after:**
```ts
    // Command: record the reconnect invocation so contract specs can assert
    // "clicking Reconnect fires the command exactly once".
    useReconnect: () => {
      return () => {
        world.commands.reconnect += 1;
      };
    },
```

**1d-iv. `buildFakeHooks.ts` (visual-tier fake)** — add `useReconnect` as a noop (no interaction in static screenshots):

After the `useAcceptQuote` entry (line 53–55 of `buildFakeHooks.ts`):
```ts
    // Commands: async no-op. Not exercised by static screenshots.
    useAcceptQuote: () => {
      return async (_quoteId: number) => {};
    },
```

**Add after:**
```ts
    // Reconnect: static screenshots don't click buttons; no-op is correct.
    useReconnect: () => {
      return noop;
    },
```

---

#### Step 1e — WsAdapter `reconnectTimer = null` defensive nit

**File:** `packages/client-react/src/app/adapters/WsAdapter.ts`

There are three `clearTimeout(this.reconnectTimer)` calls. After each one, add `this.reconnectTimer = null;`:

**Location 1 — `scheduleReconnect` (lines 124–126):**
```ts
  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
```
Replace with:
```ts
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectTimer = setTimeout(() => {
```

**Location 2 — `closeForIdle` (line 215):**
```ts
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const ws = this.ws;
```
Replace with:
```ts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
```

**Location 3 — `dispose` (line 232):**
```ts
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
```
Replace with:
```ts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
```

---

#### Step 1f — Wire `app.commands` into `createAppHooks` call site

Find the `HooksProvider` (or wherever `createAppHooks` is called) and pass `app.commands` as the third argument. The call is in the `HooksProvider` component.

**Find:** `packages/client-react/src/ui/hooks/HooksProvider.tsx` (or similar).

Look for the call to `createAppHooks(app.presenters, machineFactories)` and update it to:
```ts
createAppHooks(app.presenters, machineFactories, app.commands)
```

> The exact file to check: search for `createAppHooks` usages via `grep -rn "createAppHooks" packages/client-react/src`. This will reveal the provider component. The change is one line — add `, app.commands` to the argument list.

---

#### Step 1g — Run app tests + typecheck

```bash
# App-layer unit tests (idleTeardown + all others in src/app)
pnpm --filter @rtc/client-react exec vitest run \
  packages/client-react/src/app/__tests__/idleTeardown.test.ts

# Full app test suite
pnpm --filter @rtc/client-react exec vitest run

# Full typecheck (all packages)
pnpm typecheck

# Biome CI (errors-only gate)
pnpm --filter @rtc/client-react exec biome ci
```

Expected: all tests green; no typecheck errors; biome ci exits 0.

---

#### Step 1h — Commit

```
git add \
  packages/client-react/src/app/__tests__/idleTeardown.test.ts \
  packages/client-react/src/app/composition.ts \
  packages/client-react/src/ui/hooks/createAppHooks.ts \
  packages/client-react/tests/ui/contract/react/hooksFromWorld.ts \
  packages/client-react/tests/ui/contract/shared/harness/world.ts \
  packages/client-react/tests/ui/visual/react/buildFakeHooks.ts \
  packages/client-react/src/app/adapters/WsAdapter.ts \
  packages/client-react/src/ui/hooks/HooksProvider.tsx

git commit -m "$(cat <<'EOF'
feat(client): add reconnect command path + button-only idle recovery (app layer)

- routeIdleLifecycle: reconnect→reopen, drop userActivity→reopen
- composition.ts: reconnect$ Subject + App.commands.reconnect(); wire
  both real-WS tap and simulator mergeMap branches
- AppHooks.useReconnect: interface + factory (commands arg) + both fakes
- WsAdapter: null reconnectTimer after clearTimeout (Item 5 nit)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ConnectionOverlay Reconnect button (UI) + contract + visual

#### Files to create / modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `packages/client-react/tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts` | Extend with button assertions RED-FIRST |
| Modify | `packages/client-react/tests/ui/contract/shared/pages/shell/connection/ConnectionOverlayPage.ts` | Add `reconnectButton()` accessor + `clickReconnect()` |
| Modify | `packages/client-react/src/ui/shell/connection/ConnectionOverlay.tsx` | Add Reconnect `<button>` for `IDLE_DISCONNECTED` only |
| Modify | `packages/client-react/src/ui/shell/connection/ConnectionOverlay.module.css` | Add `.reconnectButton` style |
| Modify | `packages/client-react/tests/ui/visual/shared/fixtures.ts` | Add `connection-idle` fixture |
| Modify | `packages/client-react/tests/ui/visual/shared/scenarios.ts` | Add `connection-overlay/idle` scenario |
| Modify | `packages/client-react/tests/ui/visual/playwright-ct/overlay.spec.tsx` | Add idle overlay test |
| Regenerate | `tests/ui/visual/vitest-browser/__screenshots__/react-local/linux-arm64/visual.spec.tsx/` | All 3 tiers — see Step 2d |

---

#### Step 2a — Extend `ConnectionOverlayPage` with button accessor RED-FIRST

The page object must be updated before the spec so the accessor exists when the spec imports it.

**Current file:** `packages/client-react/tests/ui/contract/shared/pages/shell/connection/ConnectionOverlayPage.ts`

**Current code (full file):**
```ts
import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ConnectionOverlay. It is hook-driven (reads
 * `useConnectionStatus`) and renders nothing for healthy/idle statuses.
 */
export class ConnectionOverlayPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the blocking overlay is visible. */
  isVisible(): boolean {
    return within(this.root).queryByTestId("connection-overlay") !== null;
  }

  /** The overlay message, or null when no overlay is shown. */
  message(): string | null {
    const el = within(this.root).queryByTestId("connection-overlay");
    return el?.textContent?.trim() ?? null;
  }
}
```

**Replacement:**
```ts
import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ConnectionOverlay. It is hook-driven (reads
 * `useConnectionStatus`) and renders nothing for healthy/idle statuses.
 */
export class ConnectionOverlayPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the blocking overlay is visible. */
  isVisible(): boolean {
    return within(this.root).queryByTestId("connection-overlay") !== null;
  }

  /** The overlay message, or null when no overlay is shown. */
  message(): string | null {
    const el = within(this.root).queryByTestId("connection-overlay");
    // Strip inner button text from the message so assertions target the <p> only.
    const p = el?.querySelector("p");
    return p?.textContent?.trim() ?? null;
  }

  /** The Reconnect button element, or null when absent. */
  reconnectButton(): HTMLButtonElement | null {
    return (
      (within(this.root).queryByTestId(
        "reconnect-button",
      ) as HTMLButtonElement | null) ?? null
    );
  }

  /** Click the Reconnect button (throws if absent). */
  clickReconnect(): void {
    const btn = this.reconnectButton();
    if (!btn) throw new Error("Reconnect button not found");
    btn.click();
  }
}
```

> **Note on `message()` change:** The current `message()` returns `el?.textContent?.trim()` which would include the button label if a button is inside the card. We scope it to `<p>` so existing assertions (`toMatch(/inactivity/i)` etc.) keep targeting only the descriptive text.

---

#### Step 2b — Extend `ConnectionOverlay.contract.spec.ts` RED-FIRST

**Current file:** `packages/client-react/tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts`

**Current code (full file):**
```ts
import { ConnectionOverlay } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

describe("ConnectionOverlay", () => {
  it("shows no overlay while connected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.message()).toBeNull();
  });

  it("shows no overlay while connecting", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTING },
    });
    expect(overlay.isVisible()).toBe(false);
  });

  it("blocks the UI with a reconnect message when disconnected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.message()).toMatch(/re-connect/i);
  });

  it("explains an idle disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/inactivity/i);
  });

  it("explains an offline disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/offline/i);
  });

  it("appears on a live connection drop and clears on recovery", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    overlay.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(overlay.isVisible()).toBe(false);
  });
});
```

**Replacement (add new `describe` block at the end for the Reconnect button):**
```ts
import { ConnectionOverlay } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

afterEach(() => {
  return cleanupMounted();
});

describe("ConnectionOverlay", () => {
  it("shows no overlay while connected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.message()).toBeNull();
  });

  it("shows no overlay while connecting", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTING },
    });
    expect(overlay.isVisible()).toBe(false);
  });

  it("blocks the UI with a reconnect message when disconnected", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.message()).toMatch(/re-connect/i);
  });

  it("explains an idle disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/inactivity/i);
  });

  it("explains an offline disconnect", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
    });
    expect(overlay.message()).toMatch(/offline/i);
  });

  it("appears on a live connection drop and clears on recovery", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(overlay.isVisible()).toBe(false);
    overlay.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(overlay.isVisible()).toBe(false);
  });
});

describe("ConnectionOverlay — Reconnect button (item 1, button-only idle recovery)", () => {
  // Provenance: original components/DisconnectionOverlay.tsx:29-36
  // (button renders only for IDLE_DISCONNECTED; absent for OFFLINE and plain DISCONNECTED).

  it("shows a labelled Reconnect button for IDLE_DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    const btn = overlay.reconnectButton();
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim()).toBe("Reconnect");
  });

  it("does NOT show a Reconnect button for OFFLINE_DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
    });
    expect(overlay.reconnectButton()).toBeNull();
  });

  it("does NOT show a Reconnect button for generic DISCONNECTED", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED },
    });
    expect(overlay.reconnectButton()).toBeNull();
  });

  it("clicking Reconnect invokes the useReconnect command exactly once", () => {
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.reconnectButton()).not.toBeNull();
    overlay.clickReconnect();
    expect(overlay.commands.reconnect).toBe(1);
  });

  it("recovery is button-only: a userActivity hook push after idle close does not dismiss the overlay", () => {
    // This test verifies the UI contract: the overlay only hides when the
    // connection status changes (driven by the app layer), not when userActivity
    // is emitted. The app layer no longer routes userActivity→reopen (Task 1).
    // Here we confirm the overlay component itself has no direct userActivity
    // wiring — it only responds to useConnectionStatus changes.
    const overlay = mount(ConnectionOverlay, {
      hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
    });
    expect(overlay.isVisible()).toBe(true);
    // Simulate a userActivity event reaching the hook layer (no-op in new wiring).
    // The overlay must remain visible because useConnectionStatus has not changed.
    // (There is no "userActivity" hook to push; this comment documents intent:
    // the overlay is stateless w.r.t. userActivity — it only reads useConnectionStatus.)
    overlay.emit({ useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED });
    expect(overlay.isVisible()).toBe(true);
    // Recovery: the app layer pushes CONNECTING after reconnect$.
    overlay.emit({ useConnectionStatus: ConnectionStatus.CONNECTING });
    expect(overlay.isVisible()).toBe(false);
  });
});
```

**Run RED (expect all new Reconnect-button tests to fail):**
```bash
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts \
  tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts
```

Expected: existing 6 tests pass (message/visibility tests); 5 new Reconnect button tests fail (button not rendered yet).

> **Note on `overlay.commands`:** The `PageContext` exposes `commands: world.commands` (see `mount.ts` line 93). The `ConnectionOverlayPage` inherits `MountedComponent` which should expose `this.commands` — check `MountedComponent` for the `commands` accessor; if absent add it as `get commands() { return this.ctx.commands; }`. This is already how other page objects access command logs (e.g. `world.commands.acceptQuote`). The `reconnect` field added to `CommandLog` in Task 1d will be available here.

---

#### Step 2c — Implement the Reconnect button in `ConnectionOverlay.tsx` + CSS

**2c-i. `ConnectionOverlay.tsx`** — add button for `IDLE_DISCONNECTED` only:

**Current file (full):**
```tsx
import type { ReactElement } from "react";

import { ConnectionStatus } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ConnectionOverlay.module.css";

// The distinct idle/offline/plain disconnection wording lives here, in the
// modal — the footer only ever shows "Disconnected".
// Provenance: original components/DisconnectionOverlay.tsx:29-42.
const overlayMessages: Partial<Record<ConnectionStatus, string>> = {
  [ConnectionStatus.DISCONNECTED]: "Trying to re-connect to the server...",
  [ConnectionStatus.IDLE_DISCONNECTED]:
    "You have been disconnected due to inactivity.",
  [ConnectionStatus.OFFLINE_DISCONNECTED]:
    "This device has been detected to be offline.  Connection to the server will resume when a stable internet connection is established.",
};

export function ConnectionOverlay(): ReactElement | null {
  const { useConnectionStatus } = useHooks();
  const status = useConnectionStatus();
  const message = overlayMessages[status];

  if (!message) return null;

  return (
    <div data-testid="connection-overlay" className={styles.overlay}>
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
```

**Replacement:**
```tsx
import type { ReactElement } from "react";

import { ConnectionStatus } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ConnectionOverlay.module.css";

// The distinct idle/offline/plain disconnection wording lives here, in the
// modal — the footer only ever shows "Disconnected".
// Provenance: original components/DisconnectionOverlay.tsx:29-42.
const overlayMessages: Partial<Record<ConnectionStatus, string>> = {
  [ConnectionStatus.DISCONNECTED]: "Trying to re-connect to the server...",
  [ConnectionStatus.IDLE_DISCONNECTED]:
    "You have been disconnected due to inactivity.",
  [ConnectionStatus.OFFLINE_DISCONNECTED]:
    "This device has been detected to be offline.  Connection to the server will resume when a stable internet connection is established.",
};

export function ConnectionOverlay(): ReactElement | null {
  const { useConnectionStatus, useReconnect } = useHooks();
  const status = useConnectionStatus();
  const reconnect = useReconnect();
  const message = overlayMessages[status];

  if (!message) return null;

  const isIdle = status === ConnectionStatus.IDLE_DISCONNECTED;

  return (
    <div data-testid="connection-overlay" className={styles.overlay}>
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
        {isIdle && (
          <button
            type="button"
            data-testid="reconnect-button"
            className={styles.reconnectButton}
            onClick={reconnect}
          >
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
```

**2c-ii. `ConnectionOverlay.module.css`** — add `.reconnectButton` style following the `TileExecution` outline-button idiom:

**Current file (full):**
```css
.overlay {
  position: fixed;
  inset: 0;
  background-color: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 32px 48px;
  text-align: center;
  color: var(--text-primary);
  max-width: 400px;
}

.message {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}
```

**Replacement:**
```css
.overlay {
  position: fixed;
  inset: 0;
  background-color: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 32px 48px;
  text-align: center;
  color: var(--text-primary);
  max-width: 400px;
}

.message {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}

/* Reconnect button — outline style, matches original variant="outline".
 * Provenance: original components/DisconnectionOverlay.tsx:33 (variant="outline"). */
.reconnectButton {
  margin-top: 20px;
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background-color: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: opacity 0.15s;
}

.reconnectButton:hover {
  opacity: 0.8;
}
```

**Run GREEN (contract tests):**
```bash
pnpm --filter @rtc/client-react exec vitest run -c tests/ui/contract/vitest.config.ts \
  tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts
```

Expected: all 11 tests (6 existing + 5 new) pass.

**Typecheck:**
```bash
pnpm typecheck
```

Expected: no errors.

---

#### Step 2d — Add `connection-overlay/idle` visual scenario + regenerate goldens

**2d-i. Add fixture in `fixtures.ts`** (`packages/client-react/tests/ui/visual/shared/fixtures.ts`).

Find the `connection-offline` fixture block (around line 783):
```ts
  "connection-offline": makeAppData({
    connectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED,
```

Add a new fixture adjacent to it (after the `connection-offline` entry closes):
```ts
  "connection-idle": makeAppData({
    connectionStatus: ConnectionStatus.IDLE_DISCONNECTED,
  }),
```

**2d-ii. Add scenario in `scenarios.ts`** (`packages/client-react/tests/ui/visual/shared/scenarios.ts`).

Find:
```ts
  "connection-overlay/offline": {
    componentKey: "ConnectionOverlay",
    fixtureKey: "connection-offline",
  },
```

Add after:
```ts
  "connection-overlay/idle": {
    componentKey: "ConnectionOverlay",
    fixtureKey: "connection-idle",
  },
```

**2d-iii. Add playwright-ct test** (`packages/client-react/tests/ui/visual/playwright-ct/overlay.spec.tsx`).

**Current file:**
```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("connection-overlay/offline", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/offline" />);
  await expect(page).toHaveScreenshot("offline.png", {
    animations: "disabled",
  });
});
```

**Replacement:**
```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("connection-overlay/offline", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/offline" />);
  await expect(page).toHaveScreenshot("offline.png", {
    animations: "disabled",
  });
});

test("connection-overlay/idle", async ({ mount, page }) => {
  await mount(<VisualScenario name="connection-overlay/idle" />);
  await expect(page).toHaveScreenshot("idle.png", {
    animations: "disabled",
  });
});
```

**2d-iv. Regenerate react-local/linux-arm64 goldens (vitest-browser tier + playwright-ct tier):**

```bash
# Tier 3: vitest-browser — update ALL goldens (the offline golden will also re-render
# due to the message() page-object change scoping to <p>; all changes are cosmetic)
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update

# Tier 2: playwright-ct — update the overlay spec goldens
pnpm --filter @rtc/client-react exec playwright test \
  --config tests/ui/visual/playwright-ct/playwright-ct.config.ts \
  --update-snapshots overlay.spec.tsx
```

> **Note on x86/darwin goldens:** The `react/` (CI x86) and `react-local/darwin-arm64` golden sets are deferred to merge time on those platforms, per the global constraints in the design spec. Flag them in the commit message.

---

#### Step 2e — Commit

```bash
git add \
  packages/client-react/tests/ui/contract/specs/shell/connection/ConnectionOverlay.contract.spec.ts \
  packages/client-react/tests/ui/contract/shared/pages/shell/connection/ConnectionOverlayPage.ts \
  packages/client-react/src/ui/shell/connection/ConnectionOverlay.tsx \
  packages/client-react/src/ui/shell/connection/ConnectionOverlay.module.css \
  packages/client-react/tests/ui/visual/shared/fixtures.ts \
  packages/client-react/tests/ui/visual/shared/scenarios.ts \
  packages/client-react/tests/ui/visual/playwright-ct/overlay.spec.tsx \
  packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react-local/linux-arm64/ \
  packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react-local/linux-arm64/

git commit -m "$(cat <<'EOF'
feat(client): ConnectionOverlay Reconnect button + visual golden (UI layer)

- ConnectionOverlay: <button data-testid="reconnect-button"> for
  IDLE_DISCONNECTED only; calls useReconnect(); CSS Modules outline style
- Contract spec: 5 new assertions (button present/labelled, absent for
  OFFLINE+generic, click fires command, recovery-is-button-only)
- ConnectionOverlayPage: reconnectButton() + clickReconnect() + scoped message()
- Visual: connection-overlay/idle scenario + react-local/linux-arm64 goldens
  (x86 react/ + darwin-arm64 sets deferred to merge-time regen)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

#### Verification checklist (Tasks 1 + 2 combined)

```bash
# App-layer unit tests (includes idleTeardown + all src/app tests)
pnpm --filter @rtc/client-react exec vitest run

# Contract tier
pnpm --filter @rtc/client-react exec vitest run \
  -c tests/ui/contract/vitest.config.ts

# Full typecheck (all packages incl. server)
pnpm typecheck

# Biome CI
pnpm --filter @rtc/client-react exec biome ci

# Dumb-UI gates (must include @rtc/tests package)
pnpm --filter @rtc/tests gates

# dependency-cruiser
pnpm --filter @rtc/client-react exec depcruise src

# Visual (linux-arm64 in-sandbox only; x86+darwin at merge time)
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react
```

### Task 3: Remove the dead `formatCellValue` alias

**Files:**
- Modify: `packages/client-react/src/ui/fx/blotter/blotterColumns.ts:80` (delete the alias)
- Modify: `packages/client-react/src/ui/fx/blotter/blotterColumns.test.ts` (repoint to `formatFxCell`)

**Interfaces:**
- Consumes: `formatFxCell: CellFormatter<Trade>` — already exported from `blotterColumns.ts` and used by `FxBlotter.tsx` / `csvExport.ts`.
- Produces: nothing new. `formatCellValue` (the zero-production-caller `@deprecated` alias) ceases to exist.

**Context:** `blotterColumns.ts:80` is `export const formatCellValue: CellFormatter<Trade> = formatFxCell;`. No production source imports it (they use `formatFxCell`), but `blotterColumns.test.ts` imports and exercises it across ~10 assertions. Repoint the test to the real name first (preserving that coverage), then delete the alias.

- [ ] **Step 1: Repoint the test from `formatCellValue` to `formatFxCell`.**
In `packages/client-react/src/ui/fx/blotter/blotterColumns.test.ts`:
  - Change the import (line 5) from `import { COLUMNS, type ColumnDef, formatCellValue } from "./blotterColumns";` to `import { COLUMNS, type ColumnDef, formatFxCell } from "./blotterColumns";`
  - Replace every call-site `formatCellValue(` with `formatFxCell(` (≈10 occurrences in the file).
  - Change the `describe("formatCellValue", ...)` block title (line 92) to `describe("formatFxCell", ...)`.

- [ ] **Step 2: Run the test — it stays GREEN (behaviour identical, only the name changed).**
Run: `pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter/blotterColumns.test.ts`
Expected: PASS (same assertion count as before).

- [ ] **Step 3: Delete the alias.**
In `packages/client-react/src/ui/fx/blotter/blotterColumns.ts`, delete line 80 (`export const formatCellValue: CellFormatter<Trade> = formatFxCell;`) and any now-orphaned blank line / doc-comment that introduced it.

- [ ] **Step 4: Verify nothing else referenced it + gates clean.**
```bash
grep -rn "formatCellValue" packages/client-react/src   # MUST return nothing
pnpm --filter @rtc/client-react exec vitest run src/ui/fx/blotter/blotterColumns.test.ts
pnpm --filter @rtc/client-react typecheck
pnpm exec biome ci packages/client-react/src/ui/fx/blotter
pnpm --filter @rtc/client-react lint:dead   # knip — no new unused export
```
Expected: grep empty; test PASS; typecheck exit 0; biome clean; knip reports no new finding.

- [ ] **Step 5: Commit.**
```bash
git add packages/client-react/src/ui/fx/blotter/blotterColumns.ts \
        packages/client-react/src/ui/fx/blotter/blotterColumns.test.ts
git commit -m "refactor(client): drop dead formatCellValue alias, test formatFxCell directly

The formatCellValue alias for formatFxCell had no production caller; only its
test referenced it. Repoint the test to formatFxCell (preserving the coverage
under the real name) and delete the alias.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Dedupe the `wholeNumber` Intl formatter into a shared domain helper

**Files:**
- Create: `packages/domain/src/analytics/numberFormat.ts`
- Modify: `packages/domain/src/analytics/formatPnlValue.ts:1-17`
- Modify: `packages/domain/src/analytics/formatScale.ts:11-15` (and the `wholeNumber.format(` call sites)

**Interfaces:**
- Produces: `wholeNumberFormat: Intl.NumberFormat` from `./numberFormat.js` — `en-US`, 0 fraction digits. Internal to the analytics folder (NOT re-exported from the domain index; `formatPnlValue`/`formatScale` remain the public surface).

**Context:** `formatPnlValue.ts:5-8` and `formatScale.ts:12-15` each declare a byte-identical `const wholeNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })`. Extract it once. `formatScale.ts`'s `precise2` is single-use — leave it where it is.

- [ ] **Step 1: Create the shared formatter.**
Create `packages/domain/src/analytics/numberFormat.ts`:
```ts
// Mirrors the original client's formatAsWholeNumber = precisionNumberFormatter(0):
// Intl.NumberFormat with 0 fraction digits (comma grouping, rounding).
// See rtc-original@4a31f01 utils/formatNumber.ts:95-99,136. Locale pinned to
// en-US so comma grouping is deterministic across the Node 26 CI/sandbox runtimes.
export const wholeNumberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
```

- [ ] **Step 2: Point `formatPnlValue.ts` at the shared formatter.**
Replace the whole of `packages/domain/src/analytics/formatPnlValue.ts` with:
```ts
import { wholeNumberFormat } from "./numberFormat.js";

/**
 * Formats a P&L value the way the original "last position" figure does:
 * a leading "+" for non-negative values (negatives carry their own "-"),
 * then the value as a whole number with locale comma grouping.
 * See rtc-original@4a31f01 App/Analytics/ProfitAndLoss/LastPosition.tsx:16.
 */
export function formatPnlValue(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${wholeNumberFormat.format(value)}`;
}
```

- [ ] **Step 3: Point `formatScale.ts` at the shared formatter.**
In `packages/domain/src/analytics/formatScale.ts`:
  - Add at the top of the imports/declarations: `import { wholeNumberFormat } from "./numberFormat.js";`
  - Delete the local `const wholeNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });` block (lines 12-15).
  - Replace every `wholeNumber.format(` in the file with `wholeNumberFormat.format(`.
  - Leave the `precise2` formatter unchanged.

- [ ] **Step 4: Run the golden + unit tests — they stay GREEN (output unchanged).**
```bash
pnpm --filter @rtc/domain exec vitest run src/analytics/formatPnlValue.test.ts src/analytics/formatScale.test.ts
pnpm --filter @rtc/domain typecheck
pnpm exec dependency-cruiser --config .dependency-cruiser.cjs packages   # domain still pure
```
Expected: both test files PASS unchanged; typecheck exit 0; dep-cruiser clean.

- [ ] **Step 5: Commit.**
```bash
git add packages/domain/src/analytics/numberFormat.ts \
        packages/domain/src/analytics/formatPnlValue.ts \
        packages/domain/src/analytics/formatScale.ts
git commit -m "refactor(domain): share the whole-number Intl formatter across analytics

formatPnlValue and formatScale each declared an identical en-US 0-fraction
Intl.NumberFormat. Extract it to numberFormat.ts and import from both; output
is unchanged (golden tests stay green).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Direct reducer unit case for `quoteRejected` (rejectedWithoutPrice)

**Files:**
- Modify: `packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts`

**Interfaces:**
- Consumes: `reduceRfqEvent(state, event)` and the test's existing `quote(...)`/`emptyState()` helpers (already imported in the file).

**Context:** The reducer test already covers `quoteRejected` with a priced quote (`rejectedWithPrice`, line 158) and `rfqClosed` (line 89). The one gap (the T3.1 review's Minor) is a direct case for a **without-price** rejection — a quote whose state is `rejectedWithoutPrice`. Add exactly that.

- [ ] **Step 1: Read the existing `quoteRejected (rejectedWithPrice)` case (around line 158-174) and the `quote(...)` helper** to match the file's exact construction style (the `Quote` shape, how `state` is expressed). The new case mirrors it but with a `rejectedWithoutPrice` state and no price.

- [ ] **Step 2: Add the failing-then-passing case.** Inside the `describe("reduceRfqEvent", ...)` block, after the existing `quoteRejected (rejectedWithPrice)` `it`, add (adjust the `quote({...})` fields + the exact `state` shape to match the sibling case and the `Quote` type in `../credit/quote.js`):
```ts
  it("quoteRejected upserts the rejected quote (rejectedWithoutPrice)", () => {
    const rejected = quote({ id: 6, state: { type: "rejectedWithoutPrice" } });
    const next = reduceRfqEvent(emptyState(), {
      type: "quoteRejected",
      payload: rejected,
    });
    expect(next.quotes.get(6)?.state).toEqual({ type: "rejectedWithoutPrice" });
    expect(next.rfqs.size).toBe(0);
  });
```
> If the `Quote` `state` union spells the without-price rejection differently (e.g. a different discriminant), use the exact shape from `packages/domain/src/credit/quote.js` — the assertion must match the real type. Confirm by reading `quote.js` before writing.

- [ ] **Step 3: Run it — RED first if the helper/shape needs adjusting, then GREEN.**
Run: `pnpm --filter @rtc/domain exec vitest run src/usecases/WorkflowEventStreamUseCase.test.ts`
Expected: the new case PASSES (the reducer already handles `quoteRejected` generically; this test pins the without-price path explicitly). The whole file stays green.

- [ ] **Step 4: Typecheck + commit.**
```bash
pnpm --filter @rtc/domain typecheck
git add packages/domain/src/usecases/WorkflowEventStreamUseCase.test.ts
git commit -m "test(domain): pin reduceRfqEvent rejectedWithoutPrice path

The reducer's quoteRejected handling was only covered for the priced case at the
unit level (the without-price path was exercised only transitively via the
simulator test). Add a direct rejectedWithoutPrice reducer case.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Coverage-gap pass across every test tier

**Files:**
- Add tests across the owning tiers (domain/server unit, `src/app` app-coverage, contract tier, visual tier).
- Modify: `packages/client-react/tests/ui/visual/COVERAGE-GAPS.md` (refresh dated numbers).

**Interfaces:** none new — this task only adds tests and refreshes a doc.

**Context:** This is a discovery task: the exact missing scenarios depend on what each coverage report shows. Drive the **behaviour-sync'd files** back to the repo's pre-sync coverage standard for their tier. Tests must verify real behaviour (no coverage-only no-ops) and follow the existing test conventions for each tier. This task runs LAST so Items 1–5's new code (Reconnect path, deduped formatter, reducer case) is included.

**Method — do each tier in turn; commit per tier so each is an independent reviewer gate.**

- [ ] **Step 1: Domain (v8).**
Run `pnpm --filter @rtc/domain test:coverage` and read the line/branch coverage of: `analytics/formatPnlValue.ts`, `analytics/formatScale.ts`, `analytics/aggregatePositions.ts`, `credit/rfq.ts` (`applyMaximum`, `CREDIT_RFQ_EXPIRY_SECONDS`), `simulators/PricingSimulator.ts` (`rfqResponseDelayMs`), `simulators/CreditRfqSimulator.ts` (expiry + `quoteRejected` emit), `usecases/WorkflowEventStreamUseCase.ts`, `usecases/CreateRfqUseCase.ts`. For each uncovered line/branch, add a focused unit test next to the existing tests for that file (golden-fixtured where the value is original-derived; provenance-cited otherwise). Re-run to confirm the file's coverage rose. Commit: `test(domain): close behaviour-sync coverage gaps` (+ trailer).

- [ ] **Step 2: Server (v8).**
Run `pnpm --filter @rtc/server test:coverage` and read `ws/wsHandler.ts` — specifically the `quoteRejected`/`rfqClosed` transform branches added during the sync. Add a `wsHandler`/transform test case for any uncovered event-type branch (mirror the existing transform tests + the shared `wireFrames.ts` fixtures). Re-run to confirm. Commit: `test(server): cover quoteRejected/rfqClosed wire transform` (+ trailer).

- [ ] **Step 3: Client app layer (v8).**
Run `pnpm --filter @rtc/client-react test:app:coverage` and read `app/presenters/RfqCountdownMachine.ts`, `app/adapters/WsAdapter.ts` (`closeForIdle`/`reopen`/the new reconnect path + the reconnectTimer branch), `app/composition.ts` (`routeIdleLifecycle` — all three branches: idleTimeout, reconnect, userActivity-no-op). Add tests in `src/app/.../__tests__/` for any uncovered branch (fake-timers for the machines/adapters, following the existing `WsAdapter.test.ts` / `RfqCountdownMachine.test.ts` patterns). Re-run to confirm. Commit: `test(client): close app-layer coverage gaps (reconnect/idle/countdown)` (+ trailer).

- [ ] **Step 4: Contract tier → `src/ui` (v8).**
Run `pnpm --filter @rtc/client-react test:ui:contract:coverage` and read `ui/fx/analytics/PositionBubbles.tsx` + `PairPnlBars.tsx`, `ui/credit/blotter/CreditBlotter.tsx`, the generified `ui/fx/blotter/*`, `ui/shell/connection/ConnectionOverlay.tsx` (incl. the new Reconnect button). For each uncovered behavioural branch, add a contract spec assertion (framework-neutral, via the page objects) in the shared layer. Re-run to confirm. Commit: `test(client): close src/ui contract-tier coverage gaps` (+ trailer).

- [ ] **Step 5: Visual tier → `src/ui` (istanbul).**
Run `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:coverage` and read the render-path coverage of the same `src/ui` components. Where a render branch (e.g. a `data-*` state, an empty/populated variant, the idle-vs-offline overlay, the Reconnect button) is uncovered, add a visual scenario to `tests/ui/visual/shared/scenarios.ts` (+ `scenarioActions.ts` if interaction is needed) and regenerate its `react-local/linux-arm64` golden across the affected tiers. Re-run the coverage to confirm. Commit: `test(client): close src/ui visual-tier coverage gaps` (+ trailer; note x86/darwin goldens deferred to merge).

- [ ] **Step 6: Refresh `COVERAGE-GAPS.md`.**
Update `packages/client-react/tests/ui/visual/COVERAGE-GAPS.md` with the new dated coverage numbers per tier and a short list of any gap intentionally left open (with the reason). Commit: `docs(coverage): refresh COVERAGE-GAPS.md after the behaviour-sync coverage pass` (+ trailer).

**Acceptance:** each behaviour-sync'd file is covered at or above the repo's prior standard for its tier; every remaining gap is documented in `COVERAGE-GAPS.md` with a justification. (Coverage is report-only — no new CI gate is added.)

---

### Task 7: Whole-branch verification + finishing

**Files:** verify-only (no source change unless a regression surfaces).

**Interfaces:** consumes every prior task's deliverable.

- [ ] **Step 1: Full static + unit verification.**
```bash
pnpm build
pnpm typecheck                                              # all 9 packages incl. server
pnpm test                                                   # all packages
pnpm exec biome ci .                                        # 0 errors
pnpm exec dependency-cruiser --config .dependency-cruiser.cjs packages tests
pnpm --filter @rtc/tests gates                              # all 29
grep -n d3 packages/domain/package.json                     # MUST be empty
```
Expected: build 4/4; typecheck 9/9; tests green; biome clean; dep-cruiser clean; 29 gates pass; grep empty.

- [ ] **Step 2: e2e.**
```bash
pnpm test:e2e:no-cypress
```
Expected: all suites pass (`:no-cypress` per the aarch64 Cypress busy-spin caveat; CI runs the full set on x86).

- [ ] **Step 3: Visual (linux-arm64) clean + the coverage reports run.**
```bash
pnpm --filter @rtc/client-react run test:ui:visual:vitest-browser:react
pnpm --filter @rtc/client-react run test:ui:visual:playwright-ct:react
pnpm --filter @rtc/client-react run test:ui:visual:playwright:react
git status --porcelain packages/client-react/tests/ui/visual   # no stray -actual/-diff PNGs
```
Expected: all 3 tiers green against the committed `react-local/linux-arm64` set.

- [ ] **Step 4: Audit re-check vs the original.**
Confirm against `rtc-original@4a31f01`: the idle overlay shows a Reconnect button (and only for `IDLE_DISCONNECTED`); recovery is button-only (a `userActivity` after idle does not reconnect); offline/generic overlays are unchanged. Confirm the four cleanups landed and the coverage pass restored the sync'd files to standard.

- [ ] **Step 5: Append a resolution note.**
In `docs/research/2026-06-23-spec-driven-reimplementation-fidelity.md`, under the existing `## Resolution` section, append a short paragraph: the Reconnect button + button-only idle recovery now match the original (closing the one out-of-scope divergence the sync noted), the review follow-ups are cleared, and coverage was restored. Commit: `docs(research): note idle-reconnect + follow-ups complete` (+ trailer).

- [ ] **Step 6: Finish the branch.**
Use the superpowers:finishing-a-development-branch skill to choose merge / PR / keep for `feat/behaviour-sync-followups`. Surface the standing **merge prerequisite**: the x86 `react/` and `darwin-arm64` visual-golden sets (from this branch's UI changes — the Reconnect button + any visual coverage scenarios) must be regenerated on those platforms before pushing, alongside the still-pending regen from the behaviour-sync branch already merged to `main`.

---
