# DevTools Intent Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shipped custom devtools its first *inbound write* — firing a machine's intent from the inspector to reproduce state without hand-driving the UI — realising the `intent:invoke` future-extension from the v1 design ([spec §9.1](../specs/2026-07-11-custom-devtools-design.md#9-future-extensions-designed-for-explicitly-out-of-v1) / [intent-injection design](../specs/2026-07-15-devtools-intent-injection-design.md)). Injection is **compiled out of production bundles entirely** via `import.meta.env.DEV` dead-code-elimination (not merely disabled at runtime), is **confirm-gated** in the panel, and reuses the wrapped intent functions the hub already taps so an injected call is auditable exactly like a UI-driven one.

**Architecture:** A protocol + hub + panel change, no new package. `@rtc/devtools-core` gains: a new inbound protocol member (`intent:invoke`), a `dev` flag on `welcome`, `PROTOCOL_VERSION → 2`, the wrapped-intents map threaded into the hub's machine registry, a dev-build-only inbound handler, and an `InspectorClient.invokeIntent` sender. `@rtc/devtools-app`'s Machines panel gains a dev-gated, confirm-gated intent affordance with a JSON args input. `@rtc/client-react`'s composition root feeds `import.meta.env.DEV` to the hub, and a post-build script proves the invocation code is absent from the shipped app bundle.

**Tech Stack:** TypeScript (strict, `ES2022`/`ESNext`/`bundler`), RxJS 7 (`@rtc/devtools-core`), React 19 + `useSyncExternalStore` (`@rtc/devtools-app`), Vitest 4 (node env for core, jsdom for the panel), Vite 8 (`import.meta.env.DEV` static replacement + Rollup DCE), `@testing-library/react`.

## Global Constraints

- **This IS a protocol change** (unlike the hardening plan). `protocol.ts` gains one `InspectorToApp` member and one optional `welcome` field, and `PROTOCOL_VERSION` bumps `1 → 2`. Nothing else in the wire protocol changes. The v1 handshake already surfaces `protocolMismatch`, so an old app + new panel degrades gracefully (the app ignores the unknown message; the panel shows the mismatch).
- **Dev-build-only, dead-code-eliminated.** The `intent:invoke` handler is wired **only inside `if (import.meta.env.DEV)`**. In a production Vite build `import.meta.env.DEV` is statically `false`, so Rollup removes the entire branch — the machine-invocation code and the `"intent:invoke"` string literal are **physically absent** from shipped JS. This DCE is load-bearing (spec §5, success criterion #2); Task 9 verifies it with a bundle grep. Never replace the `import.meta.env.DEV` gate with a runtime boolean — a runtime flag would leave the write surface in the bundle.
- **`@rtc/devtools-core` is an rxjs-only leaf** — no new runtime deps, no `@rtc/*` imports, no node built-ins in `src` (dep-cruiser `devtools-core-no-node-builtins`). The one non-rxjs surface this plan adds is a **type-only** ambient declaration for `import.meta.env.DEV` (`src/env.d.ts`) — no runtime dependency on Vite. Tests may use node built-ins.
- **`@rtc/devtools-app` may depend only on `@rtc/devtools-core`** for its *source* (dep-cruiser `devtools-app-protocol-only`). This plan adds no dependency to it.
- **Observe-only guarantee preserved in prod, tap-never-hurts-the-app preserved everywhere.** Every hub entry point stays exception-safe (try/catch → `reportError`, never rethrow toward the app). The injected path is no exception: a missing machine / unknown intent → `devtools:error`, no throw.
- **Test envs:** `@rtc/devtools-core` tests run in the **node** environment (synchronous store flush — no rAF). `@rtc/devtools-app` tests run in **jsdom** (global in its vitest config). The store's flush is rAF-coalesced; in jsdom await it (`waitFor`), in node it flushes synchronously. The dev gate is exercised at runtime with `vi.stubEnv("DEV", true|false)` + `vi.unstubAllEnvs()` in `afterEach` — under vitest `import.meta.env.DEV` is a live property (not statically inlined), so stubbing controls both branches.
- **Repo lint/style rules (CI-enforced):** run `biome ci` (not just `biome check` — it enforces `assist/organizeImports`); base + typed ESLint; `rtc/class-filename-match`; `func-style` (function declarations over top-level const arrows); `useBlockStatements` (braces everywhere); `padding-line-between-statements`; `#/*` subpath alias (Biome bans ≥2-up relative imports); no inline `style={{}}`; knip; `check:deps`; `check:doc-links`.
- **Run the full local gauntlet before every push:** `pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-app packages/client-react scripts && pnpm check:deps && pnpm lint:dead && pnpm build && pnpm check:devtools-no-inject && pnpm check:doc-links`.

## File Structure

- `packages/devtools-core/src/protocol.ts` — Task 1 (`intent:invoke`, `welcome.dev`, `PROTOCOL_VERSION → 2`).
- `packages/devtools-core/src/DevtoolsHub.ts` — Task 2 (`machineCreated` intents param + `MachineEntry.intents`), Task 3 (`dev` option, `welcome.dev`, gated handler).
- `packages/devtools-core/src/instrument/machines.ts` + `.../presenters.ts` — Task 2 (thread the wrapped intents map by reference).
- `packages/devtools-core/src/env.d.ts` — Task 3 (type-only `import.meta.env.DEV` ambient).
- `packages/devtools-core/src/InspectorStore.ts` — Task 4 (`InspectorState.dev`).
- `packages/devtools-core/src/InspectorClient.ts` — Task 5 (`invokeIntent`).
- `packages/devtools-app/src/inspectorSession.ts` + `InspectorApp.tsx` + `main.tsx` — Task 6 (thread `dev` + `onInvokeIntent`).
- `packages/devtools-app/src/panels/MachinesPanel.tsx` + `MachinesPanel.module.css` — Task 7 (intent affordance).
- `packages/client-react/src/app/devtools/devtoolsHub.ts` — Task 8 (`dev: import.meta.env.DEV`).
- `scripts/check-devtools-no-inject.mjs` + root `package.json` — Task 9 (prod-bundle grep).
- `docs/architecture/20-devtools.md` — Final (mark §20.8 item 1 realised).
- Tests colocated: `packages/devtools-core/src/__tests__/*.test.ts`, `packages/devtools-app/src/__tests__/*.test.tsx`.

**Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → Final.** Task 1 (protocol) unblocks everything. Task 3 depends on 1 + 2 (needs `welcome.dev` and the `intents` field). Tasks 6–7 depend on 4 + 5. Task 9 depends on 3 + 8 (needs the gate wired and `dev` fed from `import.meta.env.DEV`).

---

## Task 1: Protocol v2 — `intent:invoke` inbound member + `welcome.dev`

**Problem:** the wire protocol is strictly observe-only. `InspectorToApp` is `hello | ping | bye` with no write surface, and `welcome` carries no signal of whether the app is a dev build (so the panel can't know whether to show the injection affordance). Add the inbound `intent:invoke` member and an optional `dev` field on `welcome`, and bump `PROTOCOL_VERSION` to 2.

**Files:**
- Modify: `packages/devtools-core/src/protocol.ts`
- Test: `packages/devtools-core/src/__tests__/protocolV2.test.ts`

**Interfaces:**
- Produces: `PROTOCOL_VERSION = 2`; `InspectorToApp` gains `{ kind: "intent:invoke"; machineId: string; name: string; args: readonly unknown[] }`; the `welcome` member of `AppToInspector` gains an optional `dev?: boolean`.

- [ ] **Step 1: Write the failing test**

A protocol member is a *type*, but the version bump and the message *shape* are observable at runtime. This test pins both, and the type additions are enforced by `typecheck` (Step 4) — a malformed `intent:invoke`/`welcome` at any call site fails to compile.

`packages/devtools-core/src/__tests__/protocolV2.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("protocol v2", () => {
  it("bumps PROTOCOL_VERSION to 2", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("accepts an intent:invoke inbound message shape", () => {
    const msg: InspectorToApp = {
      kind: "intent:invoke",
      machineId: "m1",
      name: "submit",
      args: ["EURUSD", 1_000_000],
    };
    expect(msg).toMatchObject({ kind: "intent:invoke", machineId: "m1" });
  });

  it("accepts an optional dev flag on welcome", () => {
    const withDev: AppToInspector = {
      kind: "welcome",
      v: PROTOCOL_VERSION,
      appId: "rtc-web",
      dev: true,
    };
    const withoutDev: AppToInspector = {
      kind: "welcome",
      v: PROTOCOL_VERSION,
      appId: "rtc-web",
    };
    expect(withDev).toMatchObject({ dev: true });
    expect(withoutDev).not.toHaveProperty("dev");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test protocolV2`
Expected: FAIL — `PROTOCOL_VERSION` is still `1`; the two type-shaped constructions also fail to type-check (`intent:invoke`/`dev` are not yet on the unions).

- [ ] **Step 3: Add the members and bump the version**

In `packages/devtools-core/src/protocol.ts`, change the version:

```ts
export const PROTOCOL_VERSION = 2;
```

Add the optional `dev` to the `welcome` member of `AppToInspector` (the first union arm):

```ts
export type AppToInspector =
  | { kind: "welcome"; v: number; appId: string; dev?: boolean }
  | {
      kind: "snapshot";
      streams: readonly SnapshotStream[];
      machines: readonly SnapshotMachine[];
    }
  | { kind: "batch"; events: readonly DevtoolsEvent[] }
  | { kind: "bye" };
```

Add the `intent:invoke` member to `InspectorToApp`:

```ts
export type InspectorToApp =
  | { kind: "hello"; v: number }
  | { kind: "ping" }
  | {
      /** DevTools' first inbound WRITE: fire a live machine's intent from the
       * inspector. Handled only in dev builds (compiled out of prod — see
       * DevtoolsHub.attachTransport). `args` is the intent's argument tuple. */
      kind: "intent:invoke";
      machineId: string;
      name: string;
      args: readonly unknown[];
    }
  | { kind: "bye" };
```

- [ ] **Step 4: Verify typecheck + the test pass**

Run: `pnpm --filter @rtc/devtools-core typecheck && pnpm --filter @rtc/devtools-core test protocolV2`
Expected: typecheck clean; the 3 protocol tests pass.

- [ ] **Step 5: Confirm no existing test regressed on the version bump**

Run: `pnpm --filter @rtc/devtools-core test`
Expected: all pass. Existing tests reference `PROTOCOL_VERSION` symbolically (not the literal `1`), the hub ignores `hello.v`, and `toMatchObject`/optional-field reads tolerate the extra `dev` — so nothing breaks.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/protocol.ts packages/devtools-core/src/__tests__/protocolV2.test.ts
git commit -m "feat(devtools-core): protocol v2 — intent:invoke inbound + welcome.dev"
```

---

## Task 2: Thread the wrapped intents map to the hub

**Problem:** the hub stores no way to *call* a machine's intents. `instrument/machines.ts` and `instrument/presenters.ts` call `hub.machineCreated(kind, args, state$)` and keep the wrapped intents (the ones already tapped for `machine:intent`) to themselves. To inject, the hub's `MachineEntry` must hold that same wrapped-intents object. Thread it in via a fourth `machineCreated` parameter, passed **by reference** (the object is created empty, handed to the hub, then populated synchronously right after — injection can only happen later, after go-live + a user action, so the reference is always fully populated by then).

**Files:**
- Modify: `packages/devtools-core/src/DevtoolsHub.ts` (`MachineEntry.intents`, `machineCreated` param)
- Modify: `packages/devtools-core/src/instrument/machines.ts`
- Modify: `packages/devtools-core/src/instrument/presenters.ts`
- Modify (existing tests, call arity): `packages/devtools-core/src/__tests__/instrumentMachines.test.ts`, `.../instrumentPresenters.test.ts`
- Test: `packages/devtools-core/src/__tests__/machineIntents.test.ts`

**Interfaces:**
- `DevtoolsHub.machineCreated(machineKind: string, args: readonly unknown[], state$: Observable<unknown>, intents?: Readonly<Record<string, unknown>>): string` — the fourth param is stored on the machine entry (`entry.intents`). Optional, so existing 3-arg callers (e.g. `DevtoolsHub.test.ts`) are unaffected.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/machineIntents.test.ts`:

```ts
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import { instrumentMachineFactories } from "../instrument/machines";

describe("wrapped intents threaded to the hub", () => {
  it("stores the same (live) wrapped-intents object the app receives", () => {
    const hub = new DevtoolsHub();
    let capturedIntents: Readonly<Record<string, unknown>> | undefined;

    // Intercept the fourth machineCreated argument.
    const realMachineCreated = hub.machineCreated.bind(hub);
    hub.machineCreated = (kind, args, state$, intents): string => {
      capturedIntents = intents;

      return realMachineCreated(kind, args, state$, intents);
    };

    const state$ = new Subject<string>();
    const submitCalls: unknown[][] = [];
    const factories = {
      orderTicket: (_symbol: string) => {
        return {
          state$,
          intents: {
            submit: (...args: unknown[]): void => {
              submitCalls.push(args);
            },
          },
          dispose: (): void => {},
        };
      },
    };

    const machine = instrumentMachineFactories(factories, hub).orderTicket("A");

    // The hub captured the SAME object the app got back, and it is populated.
    expect(capturedIntents).toBe(machine.intents);
    expect(typeof (capturedIntents as Record<string, unknown>).submit).toBe(
      "function",
    );

    // Calling the hub-held reference runs the real intent.
    (capturedIntents as { submit: (a: string) => void }).submit("via-hub");
    expect(submitCalls).toEqual([["via-hub"]]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test machineIntents`
Expected: FAIL — `machineCreated` currently takes 3 args, so `intents` (the 4th) is `undefined`; `capturedIntents` is `undefined` and the `.toBe(machine.intents)` assertion fails.

- [ ] **Step 3: Store the intents on the hub's machine entry**

In `packages/devtools-core/src/DevtoolsHub.ts`, add the field to `MachineEntry`:

```ts
interface MachineEntry {
  machineKind: string;
  args: readonly unknown[];
  state$: Observable<unknown>;
  sub: Subscription | null;
  lastState: unknown;
  hasState: boolean;
  disposed: boolean;
  createdAt: number;
  /** The wrapped intents map (the ones tapped for `machine:intent`), stored so
   * the dev-only inbound handler can invoke one by name. Populated by reference
   * by the instrumentation right after machineCreated returns. */
  intents?: Readonly<Record<string, unknown>>;
}
```

Extend `machineCreated`'s signature and store the param (leave the rest of the method body unchanged):

```ts
  machineCreated(
    machineKind: string,
    args: readonly unknown[],
    state$: Observable<unknown>,
    intents?: Readonly<Record<string, unknown>>,
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
      intents,
    };
    this.machines.set(machineId, entry);
```

- [ ] **Step 4: Pass the intents by reference in `instrument/machines.ts`**

In `packages/devtools-core/src/instrument/machines.ts`, replace the wrapper body (the `wrapped[kind] = …` assignment) so the `intents` object is declared *before* `machineCreated`, passed to it, then populated:

```ts
    wrapped[kind] = (...args: never[]): InstrumentableMachine => {
      const machine = factory(...args);
      let machineId = "";
      const intents: Record<string, unknown> = {};

      try {
        machineId = hub.machineCreated(kind, args, machine.state$, intents);
      } catch {
        return machine; // devtools failed — hand back the raw machine
      }

      try {
        for (const [name, fn] of Object.entries(machine.intents)) {
          if (typeof fn !== "function") {
            intents[name] = fn;
            continue;
          }

          intents[name] = (...intentArgs: unknown[]): unknown => {
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
      } catch {
        // machine.intents was nullish/non-iterable (misconfigured factory
        // result) — hand back the raw machine rather than throwing into the
        // app's composition root.
        return machine;
      }
    };
```

- [ ] **Step 5: Pass the intents by reference in `instrument/presenters.ts`**

In `packages/devtools-core/src/instrument/presenters.ts`, replace `instrumentSharedMachine`'s body the same way:

```ts
function instrumentSharedMachine(
  key: string,
  machine: InstrumentableMachine,
  hub: DevtoolsHub,
): InstrumentableMachine {
  let machineId = "";
  const intents: Record<string, unknown> = {};

  try {
    machineId = hub.machineCreated(key, [], machine.state$, intents);
  } catch {
    return machine;
  }

  try {
    for (const [name, fn] of Object.entries(machine.intents)) {
      intents[name] =
        typeof fn === "function"
          ? (...args: unknown[]): unknown => {
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
  } catch {
    // machine.intents was nullish/non-iterable (misconfigured manifest entry)
    // — hand back the raw machine rather than throwing into the app.
    return machine;
  }
}
```

- [ ] **Step 6: Update the two existing tests' `machineCreated` call-arity assertions**

`machineCreated` is now invoked with 4 args, so the `toHaveBeenCalledWith(...)` assertions (which match arity exactly) need a 4th matcher.

In `packages/devtools-core/src/__tests__/instrumentMachines.test.ts`, in the "registers lifecycle with the hub" test, change:

```ts
    expect(created).toHaveBeenCalledWith(
      "orderTicket",
      ["AAPL"],
      expect.anything(),
    );
```

to:

```ts
    expect(created).toHaveBeenCalledWith(
      "orderTicket",
      ["AAPL"],
      expect.anything(),
      expect.anything(),
    );
```

In `packages/devtools-core/src/__tests__/instrumentPresenters.test.ts`, in the "registers machine entries…" test, change:

```ts
    expect(machineCreated).toHaveBeenCalledWith(
      "orderTicket",
      [],
      orderTicket.state$,
    );
```

to:

```ts
    expect(machineCreated).toHaveBeenCalledWith(
      "orderTicket",
      [],
      orderTicket.state$,
      expect.anything(),
    );
```

- [ ] **Step 7: Run the new + existing tests to verify they pass**

Run: `pnpm --filter @rtc/devtools-core test machineIntents && pnpm --filter @rtc/devtools-core test`
Expected: the new test passes; the two edited tests pass; every other core test stays green (the misconfigured-factory fallbacks still return the raw machine — behaviour unchanged, only the intents reference is now shared with the hub).

- [ ] **Step 8: Commit**

```bash
git add packages/devtools-core/src/DevtoolsHub.ts packages/devtools-core/src/instrument/machines.ts packages/devtools-core/src/instrument/presenters.ts packages/devtools-core/src/__tests__/machineIntents.test.ts packages/devtools-core/src/__tests__/instrumentMachines.test.ts packages/devtools-core/src/__tests__/instrumentPresenters.test.ts
git commit -m "feat(devtools-core): thread wrapped intents map into the hub machine registry"
```

---

## Task 3: Hub `dev` flag + dev-build-only `intent:invoke` handler

**Problem:** the hub must (a) tell the panel whether the app is a dev build (via `welcome.dev`) so the panel shows the affordance only when injection will work, and (b) handle an inbound `intent:invoke` by calling the stored wrapped intent — **only in dev builds**, so the write surface is dead-code-eliminated from production. The wrapped intent self-reports its own `machine:intent` event, so an injected call is auditable exactly like a UI-driven one.

**Files:**
- Create: `packages/devtools-core/src/env.d.ts` (type-only `import.meta.env.DEV`)
- Modify: `packages/devtools-core/src/DevtoolsHub.ts` (`dev` option, `welcome.dev`, gated inbound handler)
- Test: `packages/devtools-core/src/__tests__/hubIntentInject.test.ts`

**Interfaces:**
- `DevtoolsHubOptions` gains `dev?: boolean` (default `false`); `welcome` is sent with `dev: this.dev`.
- `attachTransport`'s `inbound$` handler gains an `else if (import.meta.env.DEV && msg.kind === "intent:invoke")` branch that looks up `this.machines.get(machineId)?.intents?.[name]` and, if it's a function, calls it with `...args`; a missing machine / non-function intent → `reportError("intent:invoke", …)`, no throw. In a prod build the whole branch is DCE'd.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/hubIntentInject.test.ts` (node env — default for this package):

```ts
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type {
  AppToInspector,
  DevtoolsEvent,
  InspectorToApp,
} from "../protocol";

interface Harness {
  hub: DevtoolsHub;
  sent: AppToInspector[];
  inbound$: Subject<InspectorToApp>;
}

function harness(): Harness {
  const sent: AppToInspector[] = [];
  const inbound$ = new Subject<InspectorToApp>();
  const hub = new DevtoolsHub({ appId: "test-app" });
  hub.attachTransport({
    send: (m: AppToInspector): void => {
      sent.push(m);
    },
    inbound$,
    dispose: (): void => {},
  });

  return { hub, sent, inbound$ };
}

function batchedEvents(sent: readonly AppToInspector[]): DevtoolsEvent[] {
  const events: DevtoolsEvent[] = [];

  for (const msg of sent) {
    if (msg.kind === "batch") {
      events.push(...msg.events);
    }
  }

  return events;
}

describe("DevtoolsHub intent injection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("in a dev build, intent:invoke calls the wrapped intent and echoes a machine:intent event", () => {
    vi.stubEnv("DEV", true);
    const { hub, sent, inbound$ } = harness();
    const state$ = new Subject<string>();
    const submit = vi.fn();

    // Wrap the intent exactly as the instrumentation does: it self-reports via
    // hub.machineIntent, so an injected call is auditable like a UI-driven one.
    const intents: Record<string, unknown> = {};
    const id = hub.machineCreated("orderTicket", ["AAPL"], state$, intents);
    intents.submit = (...args: unknown[]): void => {
      hub.machineIntent(id, "submit", args);
      submit(...args);
    };

    inbound$.next({ kind: "hello", v: 2 });
    inbound$.next({
      kind: "intent:invoke",
      machineId: id,
      name: "submit",
      args: ["EURUSD", 1_000_000],
    });

    expect(submit).toHaveBeenCalledWith("EURUSD", 1_000_000);

    vi.advanceTimersByTime(40); // past one 33ms flush window
    const echoed = batchedEvents(sent).some((e) => {
      return e.kind === "machine:intent" && e.name === "submit";
    });
    expect(echoed).toBe(true);
  });

  it("reports a devtools:error (no throw) for an unknown machine or unknown intent", () => {
    vi.stubEnv("DEV", true);
    const { hub, sent, inbound$ } = harness();
    const state$ = new Subject<string>();
    const intents: Record<string, unknown> = { submit: vi.fn() };
    const id = hub.machineCreated("orderTicket", [], state$, intents);

    inbound$.next({ kind: "hello", v: 2 });

    expect(() => {
      inbound$.next({
        kind: "intent:invoke",
        machineId: "does-not-exist",
        name: "submit",
        args: [],
      });
      inbound$.next({
        kind: "intent:invoke",
        machineId: id,
        name: "nope",
        args: [],
      });
    }).not.toThrow();

    vi.advanceTimersByTime(40);
    const errors = batchedEvents(sent).filter((e) => {
      return e.kind === "devtools:error";
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("in a production build, intent:invoke is a runtime no-op (gate off)", () => {
    vi.stubEnv("DEV", false);
    const { hub, inbound$ } = harness();
    const state$ = new Subject<string>();
    const submit = vi.fn();
    const intents: Record<string, unknown> = { submit };
    const id = hub.machineCreated("orderTicket", [], state$, intents);

    inbound$.next({ kind: "hello", v: 2 });
    inbound$.next({
      kind: "intent:invoke",
      machineId: id,
      name: "submit",
      args: [],
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it("sends welcome.dev reflecting the hub's dev option", () => {
    vi.stubEnv("DEV", true);
    const sent: AppToInspector[] = [];
    const inbound$ = new Subject<InspectorToApp>();
    const hub = new DevtoolsHub({ appId: "test-app", dev: true });
    hub.attachTransport({
      send: (m: AppToInspector): void => {
        sent.push(m);
      },
      inbound$,
      dispose: (): void => {},
    });

    inbound$.next({ kind: "hello", v: 2 });

    const welcome = sent.find((m) => {
      return m.kind === "welcome";
    });
    expect(welcome).toMatchObject({ kind: "welcome", dev: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test hubIntentInject`
Expected: FAIL — there is no `intent:invoke` handler yet (the `submit` spy is never called, no `machine:intent` echo), and `welcome` carries no `dev` field. It may also fail to type-check `import.meta.env.DEV` usage once Step 3 adds it without Step 4's ambient — do Steps 3 + 4 together.

- [ ] **Step 3: Add the type-only `import.meta.env.DEV` ambient**

`packages/devtools-core` is a `tsc`-built leaf with no `vite/client` types, so declare exactly the one Vite constant this package reads. This is a **type-only** file — it emits nothing and adds no runtime dependency on Vite. Because it declares no `import`/`export`, it is an ambient (global) script and merges with the built-in `ImportMeta` interface.

Create `packages/devtools-core/src/env.d.ts`:

```ts
// Type-only ambient for the single Vite-provided constant devtools-core reads:
// `import.meta.env.DEV`. It gates the intent-injection handler so a production
// bundle dead-code-eliminates that branch (see DevtoolsHub.attachTransport).
// devtools-core is a tsc-built leaf without `vite/client` types, so declare
// exactly the surface used — no runtime dependency on Vite. This file emits
// nothing and is not referenced by the package's public .d.ts, so the global
// augmentation never leaks to consumers.

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Add the `dev` option, `welcome.dev`, and the gated handler**

In `packages/devtools-core/src/DevtoolsHub.ts`:

Extend the options interface:

```ts
export interface DevtoolsHubOptions {
  appId?: string;
  dev?: boolean;
  flushIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  ringBufferSize?: number;
}
```

Add a field beside `private readonly appId: string;`:

```ts
  private readonly dev: boolean;
```

Set it in the constructor (beside `this.appId = …`):

```ts
    this.dev = options.dev ?? false;
```

Send it on `welcome` — in `sendWelcomeAndSnapshot`, change the welcome send:

```ts
    this.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: this.appId, dev: this.dev });
```

Replace the whole `attachTransport` method with the gated version:

```ts
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
        } else if (import.meta.env.DEV && msg.kind === "intent:invoke") {
          // FIRST INBOUND WRITE — wired ONLY in dev builds. With
          // `import.meta.env.DEV` statically false in a production bundle, the
          // bundler dead-code-eliminates this whole branch, so the machine-
          // invocation code (and the "intent:invoke" literal) are physically
          // absent from shipped JS — the tap stays strictly observe-only where
          // it matters. The stored wrapped intent self-reports a machine:intent
          // event, so an injected call is auditable like a UI-driven one.
          const entry = this.machines.get(msg.machineId);
          const intent = entry?.intents?.[msg.name];

          if (typeof intent === "function") {
            (intent as (...intentArgs: readonly unknown[]) => unknown)(
              ...msg.args,
            );
          } else {
            this.reportError(
              "intent:invoke",
              new Error(
                `no injectable intent "${msg.name}" on machine "${msg.machineId}"`,
              ),
            );
          }
        }
      } catch (error) {
        this.reportError("transport.inbound", error);
      }
    });
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-core typecheck && pnpm --filter @rtc/devtools-core test hubIntentInject && pnpm --filter @rtc/devtools-core test`
Expected: typecheck clean (the ambient supplies `import.meta.env.DEV`); all 4 new tests pass; every existing core test (including `DevtoolsHub.test.ts`, whose `welcome` assertions are partial `toMatchObject`) stays green.

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-core/src/env.d.ts packages/devtools-core/src/DevtoolsHub.ts packages/devtools-core/src/__tests__/hubIntentInject.test.ts
git commit -m "feat(devtools-core): dev-build-only intent:invoke handler + welcome.dev"
```

---

## Task 4: Store the `dev` flag in `InspectorState`

**Problem:** the panel reads its world from `InspectorStore`'s `InspectorState`, which has no `dev`. Fold `welcome.dev` into the store so the panel can gate the injection affordance on `state.dev`.

**Files:**
- Modify: `packages/devtools-core/src/InspectorStore.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorDev.test.ts`

**Interfaces:**
- `InspectorState` gains `dev: boolean` (default `false`); a `welcome` with `dev: true` flips it, a `welcome` without `dev` leaves it `false`.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/inspectorDev.test.ts` (node env — synchronous flush):

```ts
import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore dev flag", () => {
  it("defaults dev to false and a welcome without dev keeps it false", () => {
    const store = new InspectorStore();
    expect(store.getSnapshot().dev).toBe(false);

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    expect(store.getSnapshot().dev).toBe(false);
  });

  it("flows welcome.dev === true into InspectorState.dev", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a", dev: true });
    expect(store.getSnapshot().dev).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test inspectorDev`
Expected: FAIL — `InspectorState` has no `dev`; `store.getSnapshot().dev` is `undefined`, and typecheck flags the missing property.

- [ ] **Step 3: Add `dev` to the state, the initial state, the field, the welcome reducer, and the rebuild**

In `packages/devtools-core/src/InspectorStore.ts`:

Add to the `InspectorState` interface (after `connected`):

```ts
export interface InspectorState {
  connected: boolean;
  /** True when the connected app is a dev build (welcome.dev). Gates the
   * panel's intent-injection affordance. */
  dev: boolean;
  appId: string | null;
  /** The app's version when it differs from PROTOCOL_VERSION; null when matched. */
  protocolMismatch: number | null;
  streams: readonly StreamRow[];
  machines: readonly MachineRow[];
  /** Newest last, capped at 5000. */
  log: readonly LogRow[];
}
```

Add `dev: false,` to `INITIAL_STATE`:

```ts
const INITIAL_STATE: InspectorState = {
  connected: false,
  dev: false,
  appId: null,
  protocolMismatch: null,
  streams: [],
  machines: [],
  log: [],
};
```

Add a private field (beside `private connected = false;`):

```ts
  private dev = false;
```

Set it in the `welcome` case of `apply`:

```ts
      case "welcome": {
        this.connected = true;
        this.dev = msg.dev === true;
        this.appId = msg.appId;
        this.protocolMismatch = msg.v === PROTOCOL_VERSION ? null : msg.v;
        break;
      }
```

Include it in `rebuildState`'s state object:

```ts
    this.state = {
      connected: this.connected,
      dev: this.dev,
      appId: this.appId,
      protocolMismatch: this.protocolMismatch,
      streams,
      machines,
      log: this.logAll.slice(),
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-core test inspectorDev && pnpm --filter @rtc/devtools-core test`
Expected: both new tests pass; existing `inspector.test.ts` stays green (it never asserts snapshot object identity by key-set, and `dev` defaults `false`).

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-core/src/InspectorStore.ts packages/devtools-core/src/__tests__/inspectorDev.test.ts
git commit -m "feat(devtools-core): fold welcome.dev into InspectorState.dev"
```

---

## Task 5: `InspectorClient.invokeIntent`

**Problem:** the panel needs a way to *send* an `intent:invoke` over the same duplex the client already owns. Add `invokeIntent(machineId, name, args)` to `InspectorClient` — a thin sender, independent of the handshake/heartbeat loop.

**Files:**
- Modify: `packages/devtools-core/src/InspectorClient.ts`
- Test: `packages/devtools-core/src/__tests__/inspectorClientInvoke.test.ts`

**Interfaces:**
- `InspectorClient.invokeIntent(machineId: string, name: string, args: readonly unknown[]): void` — sends `{ kind: "intent:invoke", machineId, name, args }` on the channel. No timer/handshake interaction.

- [ ] **Step 1: Write the failing test**

`packages/devtools-core/src/__tests__/inspectorClientInvoke.test.ts` (node env):

```ts
import { describe, expect, it } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { InspectorClient } from "../InspectorClient";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, InspectorToApp } from "../protocol";

describe("InspectorClient.invokeIntent", () => {
  it("sends a well-shaped intent:invoke message on the channel", () => {
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    const received: InspectorToApp[] = [];
    appSide.inbound$.subscribe((m) => {
      received.push(m);
    });

    const client = new InspectorClient(inspectorSide, new InspectorStore());
    client.invokeIntent("m1", "submit", ["EURUSD", 1_000_000]);

    expect(received).toContainEqual({
      kind: "intent:invoke",
      machineId: "m1",
      name: "submit",
      args: ["EURUSD", 1_000_000],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-core test inspectorClientInvoke`
Expected: FAIL — `client.invokeIntent` does not exist (typecheck error / runtime `TypeError`).

- [ ] **Step 3: Add the method**

In `packages/devtools-core/src/InspectorClient.ts`, add the method after `start()` (before `dispose()`):

```ts
  /** Fire a live machine's intent from the inspector. The app-side hub only
   * acts on this in a dev build (the handler is compiled out of production —
   * see DevtoolsHub.attachTransport); against a prod app it is a silent no-op.
   * Independent of the handshake/heartbeat loop — just a send. */
  invokeIntent(machineId: string, name: string, args: readonly unknown[]): void {
    this.channel.send({ kind: "intent:invoke", machineId, name, args });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-core test inspectorClientInvoke && pnpm --filter @rtc/devtools-core test`
Expected: the new test passes; all existing `InspectorClient` tests stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-core/src/InspectorClient.ts packages/devtools-core/src/__tests__/inspectorClientInvoke.test.ts
git commit -m "feat(devtools-core): InspectorClient.invokeIntent sender"
```

---

## Task 6: Thread `dev` + `onInvokeIntent` through the devtools-app shell

**Problem:** the inspector session exposes only `store`; the panel shell has no way to send an intent. Expose `invokeIntent` from the session, pass it (and `state.dev`) down through `InspectorApp` to the Machines panel, and wire it in `main.tsx`. The new props are **optional** so the existing `<InspectorApp store={store} />` tests keep compiling.

**Files:**
- Modify: `packages/devtools-app/src/inspectorSession.ts`
- Modify: `packages/devtools-app/src/InspectorApp.tsx`
- Modify: `packages/devtools-app/src/main.tsx`
- Test: `packages/devtools-app/src/__tests__/inspectorSession.test.ts`

**Interfaces:**
- `InspectorSession` gains `invokeIntent(machineId: string, name: string, args: readonly unknown[]): void` (a no-op in the store-only fallback, delegates to the client otherwise).
- `InspectorAppProps` gains `onInvokeIntent?: (machineId: string, name: string, args: readonly unknown[]) => void`, threaded to `MachinesPanel` alongside `dev={state.dev}`.

- [ ] **Step 1: Write the failing test**

`packages/devtools-app/src/__tests__/inspectorSession.test.ts` (jsdom is global; jsdom has no `BroadcastChannel`, so this exercises the store-only fallback — `invokeIntent` must exist and be a safe no-op):

```ts
import { expect, test } from "vitest";

import { createInspectorSession } from "#/inspectorSession";

test("exposes a store and a no-throw invokeIntent in the BroadcastChannel-less fallback", () => {
  const session = createInspectorSession();

  expect(session.store).toBeDefined();
  expect(typeof session.invokeIntent).toBe("function");
  expect(() => {
    session.invokeIntent("m1", "submit", []);
  }).not.toThrow();

  session.dispose();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test inspectorSession`
Expected: FAIL — `session.invokeIntent` is not a property of `InspectorSession` (typecheck error / `session.invokeIntent is not a function`).

- [ ] **Step 3: Expose `invokeIntent` from the session**

In `packages/devtools-app/src/inspectorSession.ts`, add it to the interface and both return paths:

```ts
export interface InspectorSession {
  store: InspectorStore;
  invokeIntent(machineId: string, name: string, args: readonly unknown[]): void;
  dispose(): void;
}
```

```ts
export function createInspectorSession(): InspectorSession {
  const store = new InspectorStore();

  if (typeof BroadcastChannel === "undefined") {
    return { store, invokeIntent: (): void => {}, dispose: (): void => {} };
  }

  const channel = new BroadcastChannelDuplex<InspectorToApp, AppToInspector>(
    CHANNEL_NAME,
  );
  const client = new InspectorClient(channel, store);
  client.start();

  return {
    store,
    invokeIntent: (machineId, name, args): void => {
      client.invokeIntent(machineId, name, args);
    },
    dispose: (): void => {
      client.dispose();
      channel.dispose();
    },
  };
}
```

- [ ] **Step 4: Thread the prop through `InspectorApp`**

In `packages/devtools-app/src/InspectorApp.tsx`, extend the props and pass `dev` + `onInvokeIntent` to `MachinesPanel`:

Change the component signature and props interface:

```ts
export function InspectorApp({
  store,
  onInvokeIntent,
}: InspectorAppProps): ReactElement {
  const state = useInspectorState(store);
  const [tab, setTab] = useState<InspectorTab>("state");

  return (
    <div className={styles.app}>
      <ConnectionRail state={state} />
      <div className={styles.main}>
        <TabStrip active={tab} onSelect={setTab} />
        <div className={styles.panel}>
          <TabPanel tab={tab} state={state} onInvokeIntent={onInvokeIntent} />
        </div>
      </div>
    </div>
  );
}
```

```ts
export interface InspectorAppProps {
  store: InspectorStore;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}
```

Extend `TabPanelProps` and the `TabPanel` function to forward to `MachinesPanel`:

```ts
interface TabPanelProps {
  tab: InspectorTab;
  state: InspectorState;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

function TabPanel({ tab, state, onInvokeIntent }: TabPanelProps): ReactElement {
  if (tab === "state") {
    return <StateTreePanel streams={state.streams} />;
  }

  if (tab === "machines") {
    return (
      <MachinesPanel
        machines={state.machines}
        dev={state.dev}
        onInvokeIntent={onInvokeIntent}
      />
    );
  }

  if (tab === "log") {
    return <EventLogPanel log={state.log} />;
  }

  return <WirePanel log={state.log} />;
}
```

(Note: `MachinesPanel` gains its `dev`/`onInvokeIntent` props in Task 7. If you run `pnpm --filter @rtc/devtools-app typecheck` between tasks, expect a "props do not exist on MachinesPanelProps" error until Task 7 lands — that is the intended red for the next task. To keep this task self-contained-green, land Task 7's `MachinesPanelProps` change together with this one, or run the two tasks back-to-back before typechecking.)

- [ ] **Step 5: Wire `main.tsx`**

In `packages/devtools-app/src/main.tsx`, destructure and pass `invokeIntent`:

```ts
// One session for the module's lifetime — the panel never remounts the
// underlying BroadcastChannel/InspectorClient, only the view over its store.
const { store, invokeIntent } = createInspectorSession();

createRoot(rootEl).render(
  <StrictMode>
    <InspectorApp store={store} onInvokeIntent={invokeIntent} />
  </StrictMode>,
);
```

- [ ] **Step 6: Run the session test to verify it passes**

Run: `pnpm --filter @rtc/devtools-app test inspectorSession`
Expected: PASS. (Full `pnpm --filter @rtc/devtools-app typecheck`/`test` goes green once Task 7 adds the `MachinesPanel` props — run this task and Task 7 together before the package-wide typecheck.)

- [ ] **Step 7: Commit**

```bash
git add packages/devtools-app/src/inspectorSession.ts packages/devtools-app/src/InspectorApp.tsx packages/devtools-app/src/main.tsx packages/devtools-app/src/__tests__/inspectorSession.test.ts
git commit -m "feat(devtools-app): expose invokeIntent from the session and thread dev + onInvokeIntent"
```

---

## Task 7: Machines panel intent-injection affordance

**Problem:** the Machines panel is read-only. Add a dev-gated, confirm-gated "Inject intent" affordance to the selected machine's detail pane: a button per *observed* intent name (derived from the machine's intent history — the only place intent names reach the panel under the locked protocol scope), a JSON args input, and an explicit confirm step that parses the args to an array and calls `onInvokeIntent`. It renders only when `dev === true`. This is a documented v1 limitation: only intents that have fired at least once are injectable; a future protocol addition could surface the full intent name set up front.

**Files:**
- Modify: `packages/devtools-app/src/panels/MachinesPanel.tsx`
- Modify: `packages/devtools-app/src/panels/MachinesPanel.module.css`
- Test: `packages/devtools-app/src/__tests__/MachinesPanelInject.test.tsx`

**Interfaces:**
- `MachinesPanelProps` gains `dev?: boolean` (default `false`) and `onInvokeIntent?: (machineId, name, args) => void`. When `dev` and a machine is selected, the detail pane renders `IntentInjector`: distinct observed intent names as `data-testid="intent-invoke-button"` buttons; clicking one arms a `data-testid="intent-confirm"` bar with a `data-testid="intent-confirm-yes"` button; confirming parses the `Args (JSON array)` textarea and, if a valid JSON array, calls `onInvokeIntent(machineId, name, parsed)`; invalid/non-array JSON shows `data-testid="intent-error"` and does not invoke.

- [ ] **Step 1: Write the failing test**

`packages/devtools-app/src/__tests__/MachinesPanelInject.test.tsx` (jsdom global):

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { MachinesPanel } from "#/panels/MachinesPanel";

afterEach(cleanup);

function machineRow(overrides: Partial<MachineRow>): MachineRow {
  return {
    machineId: "m1",
    machineKind: "OrderTicketMachine",
    args: { symbol: "EURUSD" },
    state: { status: "idle" },
    disposed: false,
    createdAt: 0,
    intents: [{ name: "submit", args: [], ts: 1 }],
    transitions: 0,
    ...overrides,
  };
}

test("hides the intent injector when the app is not a dev build", () => {
  render(<MachinesPanel machines={[machineRow({})]} />);
  fireEvent.click(screen.getByText("m1"));

  expect(screen.queryByTestId("intent-injector")).toBeNull();
});

test("shows one invoke button per DISTINCT observed intent name when dev", () => {
  const machine = machineRow({
    intents: [
      { name: "submit", args: [], ts: 1 },
      { name: "cancel", args: [], ts: 2 },
      { name: "submit", args: [1], ts: 3 },
    ],
  });
  render(<MachinesPanel machines={[machine]} dev />);
  fireEvent.click(screen.getByText("m1"));

  const labels = screen.getAllByTestId("intent-invoke-button").map((b) => {
    return b.textContent;
  });
  expect(labels).toEqual(["submit", "cancel"]);
});

test("confirming an armed intent calls onInvokeIntent with the parsed JSON array args", () => {
  const onInvokeIntent = vi.fn();
  render(
    <MachinesPanel
      machines={[machineRow({})]}
      dev
      onInvokeIntent={onInvokeIntent}
    />,
  );
  fireEvent.click(screen.getByText("m1"));

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: '["EURUSD", 1000000]' },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));

  expect(onInvokeIntent).toHaveBeenCalledWith("m1", "submit", [
    "EURUSD",
    1000000,
  ]);
});

test("rejects invalid / non-array JSON args without invoking", () => {
  const onInvokeIntent = vi.fn();
  render(
    <MachinesPanel
      machines={[machineRow({})]}
      dev
      onInvokeIntent={onInvokeIntent}
    />,
  );
  fireEvent.click(screen.getByText("m1"));

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{ not valid" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));

  expect(onInvokeIntent).not.toHaveBeenCalled();
  expect(screen.getByTestId("intent-error")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app test MachinesPanelInject`
Expected: FAIL — `MachinesPanel` accepts no `dev`/`onInvokeIntent` props and renders no injector (`getByTestId("intent-injector")` and the buttons are absent).

- [ ] **Step 3: Add the props + the `IntentInjector` to `MachinesPanel.tsx`**

In `packages/devtools-app/src/panels/MachinesPanel.tsx`:

Change the imports to add `useState` (already imported) — no change needed there; it already imports `useState`. Update the top-level component to accept and thread the new props:

```tsx
export function MachinesPanel({
  machines,
  dev = false,
  onInvokeIntent,
}: MachinesPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    machines.find((machine) => {
      return machine.machineId === selectedId;
    }) ?? null;

  return (
    <div className={styles.panel}>
      <MachineTable
        machines={machines}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <MachineDetail
        machine={selected}
        dev={dev}
        onInvokeIntent={onInvokeIntent}
      />
    </div>
  );
}
```

Extend `MachinesPanelProps`:

```tsx
export interface MachinesPanelProps {
  machines: readonly MachineRow[];
  dev?: boolean;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}
```

Extend `MachineDetailProps` and render the injector at the end of the populated detail pane:

```tsx
interface MachineDetailProps {
  machine: MachineRow | null;
  dev: boolean;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

function MachineDetail({
  machine,
  dev,
  onInvokeIntent,
}: MachineDetailProps): ReactElement {
  if (machine === null) {
    return (
      <div className={styles.detail}>
        <p className={styles.empty}>Select a machine to inspect its state.</p>
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <h3 className={styles.detailTitle}>{machine.machineId}</h3>
      <dl className={styles.meta}>
        <MetaRow label="Kind" value={machine.machineKind} />
        <MetaRow label="Transitions" value={String(machine.transitions)} />
        <MetaRow
          label="Status"
          value={machine.disposed ? "DISPOSED" : "LIVE"}
        />
      </dl>
      <h4 className={styles.sectionTitle}>State</h4>
      <ValueView value={machine.state} />
      <h4
        className={styles.sectionTitle}
      >{`Intents (${machine.intents.length})`}</h4>
      <IntentList intents={machine.intents} />
      {dev ? (
        <IntentInjector machine={machine} onInvokeIntent={onInvokeIntent} />
      ) : null}
    </div>
  );
}
```

Add the `IntentInjector` component and its `distinctIntentNames` helper (place them below `IntentList`, above `compactValue`):

```tsx
interface IntentInjectorProps {
  machine: MachineRow;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

/** Dev-only, confirm-gated intent injection. Buttons come from the DISTINCT
 * intent names observed on this machine (the only place names reach the panel
 * under the v1 protocol); a future protocol addition could surface the full
 * name set up front. Confirming parses the JSON textarea to an array and hands
 * it to `onInvokeIntent`, which the session forwards over `intent:invoke`. */
function IntentInjector({
  machine,
  onInvokeIntent,
}: IntentInjectorProps): ReactElement {
  const names = distinctIntentNames(machine.intents);
  const [pending, setPending] = useState<string | null>(null);
  const [argsText, setArgsText] = useState("[]");
  const [error, setError] = useState<string | null>(null);

  function arm(name: string): void {
    setPending(name);
    setError(null);
  }

  function cancel(): void {
    setPending(null);
    setError(null);
  }

  function confirm(): void {
    if (pending === null) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(argsText);
    } catch {
      setError("Args must be valid JSON.");

      return;
    }

    if (!Array.isArray(parsed)) {
      setError('Args must be a JSON array, e.g. ["EURUSD", 1000000].');

      return;
    }

    onInvokeIntent?.(machine.machineId, pending, parsed as readonly unknown[]);
    setPending(null);
    setError(null);
  }

  return (
    <section data-testid="intent-injector" className={styles.inject}>
      <h4 className={styles.sectionTitle}>Inject intent (dev)</h4>
      {names.length === 0 ? (
        <p className={styles.empty}>
          No intents observed yet — trigger one from the app to enable injection.
        </p>
      ) : (
        <div className={styles.injectButtons}>
          {names.map((name) => {
            return (
              <button
                key={name}
                type="button"
                data-testid="intent-invoke-button"
                className={styles.injectButton}
                onClick={() => {
                  arm(name);
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <label className={styles.injectLabel}>
        Args (JSON array)
        <textarea
          className={styles.injectArgs}
          value={argsText}
          onChange={(event) => {
            setArgsText(event.target.value);
          }}
        />
      </label>
      {error !== null ? (
        <p data-testid="intent-error" className={styles.injectError}>
          {error}
        </p>
      ) : null}
      {pending !== null ? (
        <div data-testid="intent-confirm" className={styles.injectConfirm}>
          <span className={styles.injectConfirmText}>
            {`Fire ${pending}(${argsText}) on ${machine.machineId}?`}
          </span>
          <button
            type="button"
            data-testid="intent-confirm-yes"
            className={styles.injectButton}
            onClick={confirm}
          >
            Confirm
          </button>
          <button
            type="button"
            className={styles.injectButton}
            onClick={cancel}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}

function distinctIntentNames(
  intents: readonly MachineIntentRow[],
): readonly string[] {
  const seen = new Set<string>();

  for (const intent of intents) {
    seen.add(intent.name);
  }

  return [...seen];
}
```

(`MachineIntentRow` is already imported at the top of the file — no import change needed.)

- [ ] **Step 4: Add the CSS**

In `packages/devtools-app/src/panels/MachinesPanel.module.css`, append (static classes only — no `style={{}}`, no animation, no `will-change`):

```css
.inject {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.injectButtons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.injectButton {
  padding: 2px 8px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.injectLabel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--dim);
  font-size: 10px;
}

.injectArgs {
  min-height: 44px;
  padding: 4px 6px;
  color: var(--fg);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: inherit;
  font-size: 11px;
  resize: vertical;
}

.injectError {
  margin: 0;
  color: var(--negative, tomato);
  font-size: 11px;
}

.injectConfirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.injectConfirmText {
  color: var(--fg);
  font-size: 11px;
}
```

- [ ] **Step 5: Run the injection tests + the whole app suite**

Run: `pnpm --filter @rtc/devtools-app typecheck && pnpm --filter @rtc/devtools-app test`
Expected: the 4 `MachinesPanelInject` tests pass; the existing `MachinesPanel.test.tsx` (no `dev` prop → injector hidden), `InspectorApp.test.tsx`, and `inspectorSession.test.ts` all stay green. `stylelint` (at gauntlet time) accepts the new classes; confirm no unused CSS class remains (knip/stylelint).

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-app/src/panels/MachinesPanel.tsx packages/devtools-app/src/panels/MachinesPanel.module.css packages/devtools-app/src/__tests__/MachinesPanelInject.test.tsx
git commit -m "feat(devtools-app): dev-gated, confirm-gated intent-injection affordance in the Machines panel"
```

---

## Task 8: Feed `import.meta.env.DEV` to the app-side hub

**Problem:** the hub sends `welcome.dev` from its `dev` option, but the client-react composition root constructs it without one, so `dev` is always `false` and the panel never shows the affordance even in a dev build. Pass `dev: import.meta.env.DEV` at the composition root (client-react has `vite/client` types, so `import.meta.env.DEV` is typed and Vite statically replaces it).

**Files:**
- Modify: `packages/client-react/src/app/devtools/devtoolsHub.ts`
- Test: none — this is a one-line composition-root wiring change; its behaviour is covered by Task 3's `welcome.dev` hub test and Task 9's build check. (The composition root is deliberately excluded from unit coverage — see `client-react/vitest.app.coverage.config.ts`.)

**Interfaces:**
- Produces: `new DevtoolsHub({ appId: "rtc-web", dev: import.meta.env.DEV })` — in a dev server `DEV` is `true` (affordance shown); in a prod build it is statically `false` (affordance hidden and, per Task 3, the handler is DCE'd).

- [ ] **Step 1: Pass `dev`**

In `packages/client-react/src/app/devtools/devtoolsHub.ts`, change the construction:

```ts
// `dev: import.meta.env.DEV` tells the inspector whether this is a dev build so
// the panel shows the intent-injection affordance only when it will work. Vite
// statically replaces `import.meta.env.DEV` (true on the dev server, false in a
// production build), which — together with the hub's compiled-out handler —
// keeps the write surface dev-only.
export const devtoolsHub = new DevtoolsHub({
  appId: "rtc-web",
  dev: import.meta.env.DEV,
});
```

- [ ] **Step 2: Verify typecheck + build + existing tests**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test`
Expected: clean — `import.meta.env.DEV` is a `boolean` under `vite/client`, and `DevtoolsHubOptions.dev` accepts it. No test asserts the exact hub-options object.

- [ ] **Step 3: Commit**

```bash
git add packages/client-react/src/app/devtools/devtoolsHub.ts
git commit -m "feat(client-react): feed import.meta.env.DEV to the devtools hub"
```

---

## Task 9: Prove the invocation code is absent from the production app bundle

**Problem:** success criterion #2 is that a production build contains **no** intent-invocation code. The DCE happens in client-react's Vite build; nothing currently asserts it stayed dead. Add a fast, dependency-free post-build check that greps the built app chunks for the `"intent:invoke"` sentinel and fails if present. The literal appears in the hub **only** inside the `import.meta.env.DEV` branch (protocol type positions are erased; `InspectorClient.invokeIntent`, which also names it, is in the *panel* bundle under `dist/devtools/`, excluded here), so its absence proves the branch was eliminated.

**Files:**
- Create: `scripts/check-devtools-no-inject.mjs`
- Modify: `package.json` (root — add `check:devtools-no-inject`)
- Test: none (the script *is* the check; wired into the local gauntlet).

**Interfaces:**
- Produces: `pnpm check:devtools-no-inject` — exits non-zero with a diagnostic if any `.js` under `packages/client-react/dist/assets` contains `intent:invoke`; exits 0 otherwise. Assumes `pnpm build` (production mode) has run. `dist/devtools/` (the copied panel bundle, which legitimately contains the sender) is not scanned.

- [ ] **Step 1: Write the check script**

`scripts/check-devtools-no-inject.mjs`:

```js
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "packages/client-react/dist/assets");
const SENTINEL = "intent:invoke";

function jsFilesUnder(dir) {
  const out = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...jsFilesUnder(full));
    } else if (full.endsWith(".js")) {
      out.push(full);
    }
  }

  return out;
}

const offenders = [];

for (const file of jsFilesUnder(assetsDir)) {
  if (readFileSync(file, "utf8").includes(SENTINEL)) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error(
    `check-devtools-no-inject: the production app bundle still contains the ` +
      `"${SENTINEL}" intent-injection handler — dev-only dead-code ` +
      `elimination failed (the DevtoolsHub gate must be ` +
      `\`import.meta.env.DEV && msg.kind === "intent:invoke"\`). Offenders:\n` +
      offenders.join("\n"),
  );
  process.exit(1);
}

console.log("check-devtools-no-inject: production app bundle is injection-free");
```

- [ ] **Step 2: Add the root script**

In root `package.json` `scripts`, next to `check:doc-links`:

```jsonc
    "check:devtools-no-inject": "node scripts/check-devtools-no-inject.mjs",
```

- [ ] **Step 3: Verify it passes against a real production build**

Run: `pnpm build && pnpm check:devtools-no-inject`
Expected: `check-devtools-no-inject: production app bundle is injection-free`. (`pnpm build` runs Vite in production mode → `import.meta.env.DEV` is `false` → Rollup removes the branch → the `intent:invoke` literal is gone from `dist/assets`.)

- [ ] **Step 4: Sanity-check the sentinel actually discriminates**

Confirm the check is not vacuously green (e.g. if the assets dir were empty). Run:

```bash
grep -rl "intent:invoke" packages/client-react/dist/devtools/assets 2>/dev/null && echo "panel-bundle-has-sentinel (expected)" || echo "panel-bundle-missing-sentinel (investigate)"
```

Expected: `panel-bundle-has-sentinel (expected)` — the *panel* bundle (which contains `InspectorClient.invokeIntent`) does carry the literal, proving the grep matches when the string is present and that Task 9's exclusion of `dist/devtools/` is what keeps the app-bundle check clean. If the panel bundle lacks it, the panel wasn't built — run a full `pnpm build` first.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-devtools-no-inject.mjs package.json
git commit -m "test(devtools): assert the prod app bundle dead-code-eliminates intent injection"
```

Note for the executor: wiring `pnpm check:devtools-no-inject` into CI (a step after the build job in `.github/workflows/ci.yml`) is a one-line addition — include it in this commit if the CI file is straightforward to extend; otherwise note it in the PR description as a follow-up.

---

## Final: docs + STATUS + gauntlet

- [ ] **Update the devtools architecture doc**

In `docs/architecture/20-devtools.md`, §20.8 "Future extensions" item 1 ("Intent injection") is now realised. Soften it to record that machine-level intent injection has shipped: dev-build-only (compiled out of prod via `import.meta.env.DEV`), confirm-gated in the panel, reusing the wrapped intents the hub already taps. Keep it to one or two sentences and link the design (`../superpowers/specs/2026-07-15-devtools-intent-injection-design.md`); do not renumber sections. If you add a new subsection, verify its slug with the real `github-slugger` before referencing it (`pnpm check:doc-links` gates every relative md link + anchor).

- [ ] **Update STATUS + the design spec status line**

Per the `tracking-workstream-status` skill: this workstream is shipping. In `docs/STATUS.md`, add or update the devtools intent-injection line to reflect it landing (or remove it if it was a pending backlog entry now cleared), and bump the `Last updated` header. In `docs/superpowers/specs/2026-07-15-devtools-intent-injection-design.md`, change the `**Status:**` line from "implementation plan to follow" to reference this plan / mark it implemented.

- [ ] **Run the full local gauntlet**

```bash
pnpm typecheck && pnpm test && pnpm lint && npx biome ci packages/devtools-core packages/devtools-app packages/client-react scripts && pnpm check:deps && pnpm lint:dead && pnpm build && pnpm check:devtools-no-inject && pnpm check:doc-links
```
Expected: all green. Fix any Biome `organizeImports`/`func-style`/`useBlockStatements`, knip, or dep-cruiser findings before pushing. In particular: `knip` must not flag the new `env.d.ts` (it is an ambient type file, referenced implicitly by the compiler, not an unused export); `check:deps` must still show `@rtc/devtools-core` as an rxjs-only leaf (the `env.d.ts` adds no runtime import) and `@rtc/devtools-app` importing only `@rtc/devtools-core`.

- [ ] **Manual smoke (optional but recommended)**

Run `pnpm dev`, open the app, open `/devtools/`, click a machine that has fired an intent (e.g. an FX tile's `tileExecution` after a trade), open "Inject intent (dev)", enter args, Confirm — the machine's real state should advance live in the inspector, and the injected call should appear in the event log as a `machine:intent` (auditable). Then `pnpm build` + serve the prod bundle and confirm the affordance is hidden (the app reports `dev: false`).

---

## Self-Review

**Spec coverage** (design §2–§8):
- §2(a) thread wrapped intents to the hub → **Task 2** (`machineCreated` 4th param + `MachineEntry.intents`, both instrument sites populate by reference) ✓
- §2(b) new inbound `intent:invoke` member + `PROTOCOL_VERSION → 2` → **Task 1** ✓
- §2(c) gated handler wired only inside `if (import.meta.env.DEV)`; missing machine/intent → `reportError`, no throw → **Task 3** ✓
- §2(d) panel intent buttons + JSON args + confirm gate, dev-gated → **Task 7** ✓
- §4 `welcome.dev` signalling → **Task 1** (protocol) + **Task 3** (hub sends) + **Task 4** (store) + **Task 8** (`import.meta.env.DEV` fed in) ✓
- §5 security: prod physically cannot inject (DCE) → **Task 3** + verified by **Task 9**; auditability via normal `machine:intent` → **Task 3** (wrapped intent self-reports); confirm-gate → **Task 7** ✓
- §6 testing: hub handler happy path + unknown machine/intent + gate off → **Task 3**; protocol shape → **Task 1**; `invokeIntent` sends → **Task 5**; panel dev-gating + confirm + JSON validation → **Task 7** ✓
- §8 success criteria: (1) intent advances real state → covered by Task 3's echo assertion + the Final smoke; (2) prod bundle has no invocation code → **Task 9**; (3) observe-only/dormancy/tap-safety preserved → no change to dormancy paths, every new entry point try/catch-wrapped ✓

**Design decisions recorded (not deviations):**
- *Auditability without a new `machine:intent` field.* The hub invokes the **stored wrapped intent**, which self-reports `machine:intent` (exactly one event, untagged, indistinguishable from UI-driven — spec §2(a) calls this "correct and auditable"). The spec's "optionally tagged `injected: true`" is intentionally **not** implemented: tagging would require either a second hub-emitted event (double-report) or threading an injected flag through the wrapper, and the untagged self-report already satisfies the auditability requirement. Documented here so the executor does not add a protocol field.
- *Injectable intent names come from observed history.* Under the locked protocol scope (only `intent:invoke` + `welcome.dev` added), intent names reach the panel solely via `MachineRow.intents` (the invocation history). The affordance therefore lists **distinct observed** intent names; a machine that has never fired an intent shows a "trigger one from the app" hint. This v1 limitation is documented in Task 7 and is the natural consequence of not expanding the protocol further.
- *Inline (not a helper method) handler body.* The invocation logic is inlined inside the `import.meta.env.DEV` branch so Rollup removes it wholesale in prod (a private class method would survive tree-shaking, leaving the `"intent:invoke"` literal and breaking success criterion #2 / Task 9). The unit test drives it through the transport (`inbound$.next(...)`), matching how it is actually triggered.
- *Type-only `env.d.ts`.* `import.meta.env.DEV` needs a type in the `tsc`-built `devtools-core`, which has no `vite/client`. A minimal ambient (`ImportMetaEnv.DEV`) supplies it with no runtime Vite dependency — the rxjs-only-leaf constraint holds.

**Placeholder scan:** every code step shows complete, final code; every command has expected output. No "TBD"/"TODO"/"similar to Task N". The only steps that ask the executor to *observe an intended cross-task red* (Task 6 Step 4's note that `MachinesPanel` props arrive in Task 7) are explicit sequencing guidance, not placeholders — run Tasks 6 and 7 back-to-back before the package-wide typecheck.

**Type consistency:** `PROTOCOL_VERSION` is `2` in one place (`protocol.ts`); tests reference it symbolically. The `intent:invoke` shape is identical across `protocol.ts` (`InspectorToApp`), `DevtoolsHub` (reads `msg.machineId/name/args`), `InspectorClient.invokeIntent` (sends it), and the session/panel signatures (`(machineId: string, name: string, args: readonly unknown[]) => void`) — one signature, repeated verbatim. `welcome.dev?: boolean` is optional on the wire and normalised to a non-optional `boolean` in `InspectorState.dev` / `DevtoolsHubOptions.dev` (both defaulting `false`). `MachineEntry.intents?: Readonly<Record<string, unknown>>` (hub) is populated from `Record<string, unknown>` (instrument sites) — assignable. `check:devtools-no-inject` script name is consistent between Task 9's `package.json` entry and the Final gauntlet. New files (`env.d.ts`, three core test files, two app test files, one script) each defined once; every modified file lists exact old→new code.

**Ordering & conflict note:** Tasks touch mostly disjoint files. `DevtoolsHub.ts` is edited by Task 2 (`machineCreated`/`MachineEntry`) and Task 3 (`attachTransport`/options/`welcome`) — different regions, land 2 before 3. `InspectorApp.tsx`/`MachinesPanel.tsx` couple across Tasks 6–7 (prop plumbing) — land them back-to-back. Everything else is independent within the recommended `1 → 9` order.
