# Pluggable Application Core — Slice 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application layer pluggable — extract its contract into a types-only `@rtc/core-api`, add two sibling cores (`@rtc/client-core-async`, `@rtc/client-core-effect`) that boot both web clients at 100% delegation, add the `@rtc/core-contract` behavioural tier with slice 1a's suites green on the RxJS core, and wire `VITE_CORE_IMPL` selection, the e2e-per-core matrix, the bundle-leak gate, and ADR-006. No business logic is ported in this slice.

**Architecture:** The bindings consume exactly three client-core types (`Presenters`, `MachineFactories`, `AppCommands`) plus `Machine<S,I>`; those, every type they transitively reference, and one interface per presenter move to `@rtc/core-api` while `@rtc/client-core` keeps its name, its adapters, and re-exports the moved types so no consumer import changes. Each alternative core exports the same `CoreFactory` pair and, for now, spreads the RxJS `App` and overrides nothing; a committed `parity.json` plus a reference-inequality drift test keep provenance honest. `@rtc/core-contract` mirrors `@rtc/ui-contract`: dev-only suites keyed by member name, one runner file per core.

**Tech Stack:** TypeScript 6 (`moduleResolution: bundler`, `verbatimModuleSyntax`), pnpm 11 workspaces + Turborepo (strict env), vitest 4.1 (fake timers), RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2, dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md)

## Global Constraints

- `effect` is pinned `^3.22.2` (published 2026-09-09, past the 24 h cooldown). **Do not** add `@effect/vitest`: its peer is `vitest ^3.2` and the repo is on `vitest ^4.1.10`; use `effect`'s own `TestContext` / `TestClock` under plain vitest (the spec's "`@effect/vitest` devDependency" line is amended in Task 12).
- Shared dep versions must match the repo exactly or `pnpm check:versions` (manypkg + syncpack) fails: `vitest ^4.1.10`, `@vitest/coverage-v8 ^4.1.10`, `tsc-alias 1.9.4`, `rxjs ^7.8`, `@rx-state/core ^0.1.4`, `@types/node ^26.2.0`.
- Every package's `typecheck` script must be exactly `tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo` and every package needs a `test` script (`scripts/check-workspace-scripts.mjs` gate).
- Every new package needs: a line pair in `tsconfig.depcruise.json`, a workspace entry in `knip.json`, and a dependency-cruiser rule (allowlist form; a new package is forbidden by default).
- `#/` subpath imports only (`imports: { "#/*": "./src/*" }` + tsconfig `paths`); never `@/`; ≥2-up relative imports are banned.
- Biome: mandatory braces on every control statement; zero findings; no `biome-ignore`. Function names state their effect (`rtc/name-functions-by-effect`); slot props stay `onX`.
- Turbo strict env: any new env var must be declared on the task (`build.env` / `dev.env`) or in `globalPassThroughEnv`, or it is silently stripped.
- Bridge rule: outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports. Grep gate 43 enforces it.
- Types-only rule: `packages/core-api/src` exports no runtime value. Grep gate 42 enforces it.
- Grep gates 28/36 ban `import.meta.env` inside `src/ui/`; the `VITE_CORE_IMPL` read lives in `src/app/selectCore.ts`.
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

---

## File structure

```
packages/core-api/                       NEW, types-only
  package.json, tsconfig.json, vitest.config.ts, README.md
  src/index.ts                           barrel
  src/stream.ts                          Stream<T>, StateStream<S> aliases
  src/machine.ts                         Machine, ReadOnlyMachine, MachineFactories   (moved from client-core)
  src/layout.ts                          WorkspaceTab, PanelId, PanelSpec, SplitDir, LayoutNode, LayoutState, LayoutPort
  src/adapters.ts                        SessionStore, StoredSession, DockLayoutStore, ColorSchemeSource, IWsAdapter, MessageHandler,
                                         JarvisPort, JarvisAskOptions, JarvisAvailability, JarvisUsagePort, AuthGatedTransport
  src/machines/*.ts                      one file per machine's State/Intents/View/Handle types (18 + submissions)
  src/presenters/*.ts                    one interface per presenter (43) + the view types they reference
  src/presenters/animationDirector.ts    AnimationIntent, AnimationKind, AnimationDirector interface
  src/app.ts                             AppPorts, TransportPorts, Presenters, AppCommands, App, CoreFactory
  src/__tests__/contract.test.ts         expectTypeOf assertions

packages/client-core/                    EXISTING — implements core-api
  src/presenters/<X>Presenter.ts         + `implements <X>PresenterApi`; type defs replaced by re-exports
  src/presenters/machine.ts              becomes a re-export shim
  src/composition.ts                     Presenters/AppCommands/App become re-exports; createApp gains dispose
  src/composition.coreContract.test.ts   the RxJS runner for @rtc/core-contract

packages/core-contract/                  NEW, dev-only
  src/harness/scriptedPorts.ts           createScriptedPorts(): { ports, driver, teardown }
  src/harness/harness.ts                 CoreHarness, MakeHarness, collect()
  src/registry.ts                        CONTRACT_SUITES: exhaustive Record<Member, Suite | null> + PENDING list
  src/registry.test.ts                   pending list drift test
  src/suites/connection.ts ... powerSaver.ts, reconnect.ts   slice 1a suites
  src/index.ts                           describeCoreContract(label, makeHarness)

packages/client-core-async/              NEW
  src/kernel/store.ts, topic.ts, spawn.ts, sleep.ts (+ tests)
  src/bridge/in.ts, out.ts (+ tests)     the ONLY files importing rxjs values
  src/composition.ts                     createApp/createMachineFactories, delegating
  src/parity.json, src/parity.test.ts
  src/coreContract.test.ts               runner

packages/client-core-effect/             NEW
  src/bridge/in.ts, out.ts (+ tests)
  src/composition.ts, src/parity.json, src/parity.test.ts, src/coreContract.test.ts

packages/client-react/src/app/selectCore.ts   (+ test)      packages/client-solid/src/app/selectCore.ts (+ test)
packages/client-{react,solid}/src/vite-env.d.ts             ImportMetaEnv.VITE_CORE_IMPL
packages/client-{react,solid}/src/AppRoot.tsx               import from selectCore
turbo.json, package.json (root), .github/workflows/{ci,deploy}.yml
tests/scripts/devServer.ts, tests/browser/playwright/playwright.config.ts, tests/scripts/grep-gates.ts
scripts/check-core-bundle.mjs
docs/adr/ADR-006-pluggable-application-core.md, docs/architecture/22-pluggable-application-core.md,
docs/architecture.md, docs/architecture/08-replaceability-matrix.md, CLAUDE.md, docs/STATUS.md
```

---

### Task 1: Scaffold `@rtc/core-api` with the envelope aliases and the `Machine` types

**Files:**
- Create: `packages/core-api/package.json`, `packages/core-api/tsconfig.json`, `packages/core-api/vitest.config.ts`, `packages/core-api/README.md`
- Create: `packages/core-api/src/index.ts`, `packages/core-api/src/stream.ts`, `packages/core-api/src/machine.ts`, `packages/core-api/src/__tests__/stream.test.ts`
- Modify: `packages/client-core/src/presenters/machine.ts` (becomes a re-export shim), `packages/client-core/package.json` (dependency), `packages/client-core/tsconfig.json` (reference)
- Modify: `tsconfig.depcruise.json`, `knip.json`, `.dependency-cruiser.cjs`, `tests/scripts/grep-gates.ts`

**Interfaces:**
- Produces: `Stream<T>` (= `Observable<T>`), `StateStream<S>` (= `StateObservable<S>`), `Machine<TState, TIntents>`, `ReadOnlyMachine<TState>`. `MachineFactories` is NOT moved in this task (its member types move in Task 3); leave it in client-core's `machine.ts` for now.

- [ ] **Step 1: Create the package manifest**

`packages/core-api/package.json`:
```json
{
  "name": "@rtc/core-api",
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
    "typecheck": "tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo",
    "test": "vitest run",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports coverage 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "@rx-state/core": "^0.1.4",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "tsc-alias": "1.9.4",
    "vitest": "^4.1.10"
  }
}
```
`rxjs` and `@rx-state/core` are listed as dependencies because the aliases reference their types; no runtime code imports them (gate 42 proves it).

`packages/core-api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "../domain" }, { "path": "../shared" }]
}
```

`packages/core-api/vitest.config.ts`:
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

`packages/core-api/README.md`:
```md
# @rtc/core-api

Types only. The contract every application core (`@rtc/client-core`,
`@rtc/client-core-async`, `@rtc/client-core-effect`) implements and every
binding consumes: `Presenters`, `MachineFactories`, `AppCommands`, `App`,
`AppPorts`, `CoreFactory`, the `Machine` shape, and the `Stream` /
`StateStream` envelope aliases. Exports no runtime value (grep gate 42).
See `docs/adr/ADR-006-pluggable-application-core.md`.
```

- [ ] **Step 2: Write the envelope aliases and the type test**

`packages/core-api/src/stream.ts`:
```ts
import type { StateObservable } from "@rx-state/core";
import type { Observable } from "rxjs";

/** The envelope every core hands the bindings for a multi-value stream.
 * Named once so the later flip to the web-standard `Observable` is an alias
 * edit plus the per-core `bridge/` modules — never a signature refactor. */
export type Stream<T> = Observable<T>;

/** The envelope for machine state: a `Stream` that also carries its current
 * value synchronously on subscribe (the warmth precondition `toSignal` and
 * `useStateObservable` rely on). */
export type StateStream<S> = StateObservable<S>;
```

`packages/core-api/src/__tests__/stream.test.ts`:
```ts
import { state } from "@rx-state/core";
import { of } from "rxjs";
import { describe, expectTypeOf, it } from "vitest";

import type { StateStream, Stream } from "#/stream";

describe("envelope aliases", () => {
  it("Stream<T> is assignable from an rxjs Observable", () => {
    const s: Stream<number> = of(1);
    expectTypeOf(s).toEqualTypeOf<Stream<number>>();
  });

  it("StateStream<S> is assignable from a defaulted state()", () => {
    const s: StateStream<number> = state(of(1), 0);
    expectTypeOf(s).toEqualTypeOf<StateStream<number>>();
  });
});
```
(`@rx-state/core` and `rxjs` are imported as values only inside `__tests__/`, which gate 42 excludes.)

- [ ] **Step 3: Move `Machine` / `ReadOnlyMachine` into core-api**

`packages/core-api/src/machine.ts` — copy the `Machine` doc comment and interface from `packages/client-core/src/presenters/machine.ts:30-53` verbatim, replacing `StateObservable<TState>` with `StateStream<TState>`:
```ts
import type { StateStream } from "#/stream";

/** Every app-layer machine factory returns this: a framework-agnostic
 * StateStream carrying current state, plain intent methods, and dispose()
 * that completes the machine's sources / tears down subscriptions.
 * Bridge-only consumer.
 *
 * Pre-condition: `state$` MUST have a live subscriber before `useMachine`
 * first renders, OR carry a synchronous default value. Factory
 * implementations are responsible for keeping it warm. A cold `state$` with
 * no default will suspend. */
export interface Machine<TState, TIntents extends object> {
  state$: StateStream<TState>;
  intents: TIntents;
  dispose: () => void;
}

/** A machine with no intents — a purely derived, read-only state stream. */
export type ReadOnlyMachine<TState> = Machine<TState, Record<string, never>>;
```

`packages/core-api/src/index.ts`:
```ts
export type * from "#/machine";
export type * from "#/stream";
```

In `packages/client-core/src/presenters/machine.ts` delete the `Machine` and `ReadOnlyMachine` declarations (lines 30–53) and the now-unused `import type { StateObservable } from "@rx-state/core";`, and add at the top:
```ts
import type { Machine, ReadOnlyMachine } from "@rtc/core-api";

export type { Machine, ReadOnlyMachine };
```
`MachineFactories` stays in this file until Task 3.

Add `"@rtc/core-api": "workspace:*"` to `packages/client-core/package.json` `dependencies` (alphabetically, before `@rtc/domain`) and `{ "path": "../core-api" }` to its `tsconfig.json` `references`.

- [ ] **Step 4: Register the package in every global gate**

`tsconfig.depcruise.json` — add after the `@rtc/client-core/*` pair (line 30):
```json
      "@rtc/core-api": ["packages/core-api/src/index.ts"],
      "@rtc/core-api/*": ["packages/core-api/src/*"],
```

`knip.json` — add a workspace entry next to `"packages/client-core"`:
```json
    "packages/core-api": {
      "entry": "src/index.ts",
      "project": "src/**/*.ts"
    },
```

`.dependency-cruiser.cjs` — (a) in `client-core-stays-inner` (line 201) change `pathNot` to `"^packages/(client-core|core-api|domain|shared)/"`; (b) in `react-bindings-no-apps` (line 220) and `solid-bindings-no-apps` (line 231) add `core-api` to their `pathNot` alternations; (c) in `ui-contract-stays-neutral` (line 190) add `core-api`; (d) insert a new rule directly before `client-core-stays-inner`:
```js
    {
      name: "core-api-stays-inner",
      severity: "error",
      comment:
        "@rtc/core-api is the types-only application-core contract — it may import only domain/shared (types), never a core, a binding, a client, or the server.",
      from: { path: "^packages/core-api/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(core-api|domain|shared)/",
      },
    },
```

`tests/scripts/grep-gates.ts` — append to `GATES` after gate 41:
```ts
  {
    name: "42. @rtc/core-api exports no runtime value (types-only contract)",
    pattern: "^export (const|let|function|class|enum|async function) ",
    paths: ["../packages/core-api/src/"],
    excludes: ["/__tests__/", ".test."],
  },
```

- [ ] **Step 5: Install, typecheck, test, gates**

Run:
```bash
pnpm install
pnpm --filter @rtc/core-api build
pnpm --filter @rtc/core-api typecheck && pnpm --filter @rtc/client-core typecheck
pnpm --filter @rtc/core-api test
pnpm check:deps && pnpm lint:dead && pnpm check:versions && pnpm check:scripts
pnpm --filter @rtc/tests gates
```
Expected: all green; gate 42 prints `PASS`. If `pnpm typecheck` at the root reports `Machine` unresolved anywhere, the consumer imports it from `@rtc/client-core` and the shim in Step 3 is missing an export.

- [ ] **Step 6: Commit**

```bash
git add packages/core-api packages/client-core/package.json packages/client-core/tsconfig.json packages/client-core/src/presenters/machine.ts tsconfig.depcruise.json knip.json .dependency-cruiser.cjs tests/scripts/grep-gates.ts pnpm-lock.yaml
git commit -m "feat(core-api): scaffold types-only @rtc/core-api — Stream/StateStream aliases + Machine types moved out of client-core"
```

---

### Task 2: Move the pure-type modules (layout, adapters, colour scheme) into core-api

**Files:**
- Create: `packages/core-api/src/layout.ts`, `packages/core-api/src/adapters.ts`
- Modify: `packages/client-core/src/layout/layoutPort.ts`, `packages/client-core/src/layout/defaultLayoutPort.ts`, `packages/client-core/src/theme/colorSchemeSource.ts`, `packages/client-core/src/adapters/sessionStore.ts`, `packages/client-core/src/adapters/dockLayoutStore.ts`, `packages/client-core/src/adapters/jarvisPort.ts`, `packages/client-core/src/adapters/jarvisUsagePort.ts`, `packages/client-core/src/adapters/IWsAdapter.ts`, `packages/client-core/src/adapters/portFactory.ts` (the `AuthGatedTransport` interface, line 95), `packages/core-api/src/index.ts`

**Interfaces:**
- Produces in core-api: `WorkspaceTab`, `PanelId`, `PanelSpec`, `SplitDir`, `LayoutNode`, `LayoutState`, `LayoutPort`, `SessionStore`, `StoredSession`, `DockLayoutStore`, `ColorSchemeSource`, `IWsAdapter`, `MessageHandler`, `JarvisPort`, `JarvisAskOptions`, `JarvisAvailability`, `JarvisUsagePort`, `AuthGatedTransport`. Every one stays importable from `@rtc/client-core` unchanged.

The procedure is the same for every file and is written out once here; apply it to each row of the table.

- [ ] **Step 1: Write the failing consumer test**

`packages/core-api/src/__tests__/moved-types.test.ts`:
```ts
import { describe, expectTypeOf, it } from "vitest";

import type {
  ColorSchemeSource,
  DockLayoutStore,
  IWsAdapter,
  JarvisPort,
  JarvisUsagePort,
  LayoutState,
  SessionStore,
  WorkspaceTab,
} from "#/index";

describe("moved pure-type modules", () => {
  it("WorkspaceTab is the closed four-tab union", () => {
    expectTypeOf<WorkspaceTab>().toEqualTypeOf<"fx" | "credit" | "admin" | "equities">();
  });

  it("the adapter port interfaces are reachable from the barrel", () => {
    expectTypeOf<SessionStore>().toHaveProperty("read");
    expectTypeOf<DockLayoutStore>().toHaveProperty("load");
    expectTypeOf<ColorSchemeSource>().toHaveProperty("prefersDark$");
    expectTypeOf<IWsAdapter>().toHaveProperty("rpc");
    expectTypeOf<JarvisPort>().toHaveProperty("ask");
    expectTypeOf<JarvisUsagePort>().toHaveProperty("usage$");
    expectTypeOf<LayoutState>().toHaveProperty("root");
  });
});
```
Run `pnpm --filter @rtc/core-api typecheck` — expected: FAIL, the names do not exist yet. (If `LayoutState` has no `root` member, read `layoutPort.ts` and use its first member name instead.)

- [ ] **Step 2: Move each module**

For each row: cut the listed type declarations (with their doc comments) out of the client-core file, paste them into the core-api file, rewrite any `Observable<T>` in them as `Stream<T>` (`import type { Stream } from "#/stream"`), and replace them in the client-core file with `import type { … } from "@rtc/core-api"; export type { … };` so `export *` chains keep working. Value declarations stay where they are.

| client-core source | symbols to move | core-api destination |
|---|---|---|
| `src/layout/layoutPort.ts` (whole file is types) | `PanelId`, `PanelSpec`, `SplitDir`, `LayoutNode`, `LayoutState`, `LayoutPort` | `src/layout.ts` |
| `src/layout/defaultLayoutPort.ts` | `WorkspaceTab` only (`PANEL_SPECS` and `createDefaultLayoutPort` stay) | `src/layout.ts` |
| `src/theme/colorSchemeSource.ts` (whole file) | `ColorSchemeSource` | `src/adapters.ts` |
| `src/adapters/sessionStore.ts` (whole file) | `SessionStore`, `StoredSession` | `src/adapters.ts` |
| `src/adapters/dockLayoutStore.ts` (whole file) | `DockLayoutStore` | `src/adapters.ts` |
| `src/adapters/jarvisPort.ts` | `JarvisPort`, `JarvisAskOptions`, `JarvisAvailability` (keep the `JarvisEvent` re-export from `@rtc/shared` in client-core) | `src/adapters.ts` |
| `src/adapters/jarvisUsagePort.ts` | `JarvisUsagePort` (keep the `@rtc/shared` re-exports) | `src/adapters.ts` |
| `src/adapters/IWsAdapter.ts` (whole file) | `IWsAdapter`, `MessageHandler` | `src/adapters.ts` |
| `src/adapters/portFactory.ts:95` | `AuthGatedTransport` | `src/adapters.ts` |

Domain types those declarations reference (`SessionUser`, `ConnectionEvent`, `JarvisBrain`, `JarvisEffort`, `AdminJarvisUsagePayload`, `JarvisEvent`, …) are imported in core-api from `@rtc/domain` / `@rtc/shared` with `import type`.

Add to `packages/core-api/src/index.ts`:
```ts
export type * from "#/adapters";
export type * from "#/layout";
```

- [ ] **Step 3: Typecheck the whole repo and run the moved-types test**

Run: `pnpm typecheck && pnpm --filter @rtc/core-api test && pnpm --filter @rtc/client-core test`
Expected: PASS. A `TS2305 has no exported member` anywhere means a re-export line was dropped in Step 2.

- [ ] **Step 4: Gates and commit**

Run: `pnpm check:deps && pnpm lint:dead && pnpm --filter @rtc/tests gates`
```bash
git add packages/core-api packages/client-core/src
git commit -m "refactor(core-api): move layout/adapter/colour-scheme types out of client-core; client-core re-exports them"
```

---

### Task 3: Move every machine's State/Intents/Handle types and `MachineFactories` into core-api

**Files:**
- Create: `packages/core-api/src/machines/<name>.ts` (one per row below), `packages/core-api/src/machines/index.ts`
- Modify: the 18 `packages/client-core/src/presenters/*Machine.ts`, `packages/client-core/src/presenters/RfqsPresenter.ts`, `packages/client-core/src/presenters/machine.ts`, `packages/core-api/src/machine.ts`, `packages/core-api/src/index.ts`

**Interfaces:**
- Produces: `MachineFactories` in `@rtc/core-api` (same 12 members as today, typed over the moved types); every `*State` / `*Intents` / `*View` / `*Handle` name listed below, importable from both `@rtc/core-api` and (unchanged) `@rtc/client-core`.

- [ ] **Step 1: Write the failing test**

`packages/core-api/src/__tests__/machine-factories.test.ts`:
```ts
import { describe, expectTypeOf, it } from "vitest";

import type { JarvisMachineHandle, MachineFactories, TileExecutionState } from "#/index";

describe("MachineFactories contract", () => {
  it("has exactly the eleven factory members", () => {
    expectTypeOf<keyof MachineFactories>().toEqualTypeOf<
      | "tileExecution" | "rfqTile" | "staleFlag" | "analyticsStaleFlag" | "rowHighlight"
      | "notional" | "rfqSubmission" | "ticketSubmission" | "layout" | "boot" | "orderTicket"
    >();
  });

  it("machine state unions are closed", () => {
    expectTypeOf<TileExecutionState["status"]>().toEqualTypeOf<
      "ready" | "started" | "tooLong" | "finished" | "timeout"
    >();
    expectTypeOf<JarvisMachineHandle>().toHaveProperty("events$");
  });
});
```
Run `pnpm --filter @rtc/core-api typecheck` — expected: FAIL (names unresolved). `MachineFactories` declares eleven factories today; if `pnpm typecheck` disagrees, `machine.ts` is the source of truth — fix the test, not the type.

- [ ] **Step 2: Move the types, one file per machine**

Same procedure as Task 2 Step 2 (cut → paste into core-api → `Observable`→`Stream`, `StateObservable`→`StateStream` → re-export from the client-core file). Runtime members (`create*Machine`, `*_MS` constants, `JARVIS_DEMO_STEPS`, `UNSUPPORTED_SENTINEL_SPEC`, …) stay in client-core.

| client-core file | types to move | core-api file |
|---|---|---|
| `BootSequenceMachine.ts` | `BootSequenceState`, `BootSequenceIntents`, `BootSequenceDeps` | `machines/bootSequence.ts` |
| `EqDrawingsMachine.ts` | `EqDrawTool`, `EqDrawingAnchor`, `EqDrawing`, `EqDrawingsState`, `EqDrawingsIntents` | `machines/eqDrawings.ts` |
| `EqWorkspaceMachine.ts` | `EqChartType`, `EqIndicatorId`, `EqPaneId`, `EqYScale`, `EqWorkspaceState`, `EqWorkspaceIntents`, `EqWorkspaceDeps` | `machines/eqWorkspace.ts` |
| `IncidentMachine.ts` | `IncidentKind`, `IncidentIntents`, `IncidentState`, `IncidentDeps` | `machines/incident.ts` |
| `JarvisDemoMachine.ts` | `JarvisDemoStep`, `JarvisDemoState`, `JarvisDemoIntents`, `JarvisDemoMachineHandle`, `JarvisDemoDeps` | `machines/jarvisDemo.ts` |
| `JarvisDriverMachine.ts` | `DriveOutcome`, `JarvisDriverState`, `JarvisDriverMachineHandle`, `JarvisDriverDeps` | `machines/jarvisDriver.ts` |
| `JarvisMachine.ts` | `JarvisRole`, `JarvisEntry`, `JarvisConfirmation`, `JarvisState`, `JarvisIntents`, `JarvisDeps`, `JarvisMachineHandle` | `machines/jarvis.ts` |
| `JarvisPanelsMachine.ts` | `PanelStatus`, `PanelInstance`, `JarvisPanelsState`, `JarvisPanelsMachineHandle` | `machines/jarvisPanels.ts` |
| `LayoutMachine.ts` | `LayoutIntents`, `LayoutMachineOptions` | `machines/layout.ts` |
| `NarratorMachine.ts` | `NarratorDeps`, `NarratorHandle` | `machines/narrator.ts` |
| `NotionalMachine.ts` | `NotionalView`, `NotionalIntents` | `machines/notional.ts` |
| `OrderTicketMachine.ts` | `OrderTicketState`, `OrderTicketIntents`, `OrderTicketDeps` | `machines/orderTicket.ts` |
| `RfqTileMachine.ts` | `RfqQuote`, `RfqState`, `RfqTileDeps`, `RfqTileIntents` | `machines/rfqTile.ts` |
| `StaleFlagMachine.ts` | `StaleFlagDeps<T>` | `machines/staleFlag.ts` |
| `TileExecutionMachine.ts` | `TileExecutionState`, `TileExecutionDeps`, `TileExecutionIntents` | `machines/tileExecution.ts` |
| `WorkspaceNavMachine.ts` | `WorkspaceNavState`, `WorkspaceNavIntents` | `machines/workspaceNav.ts` |
| `RfqsPresenter.ts` | `RfqSubmissionState`, `RfqSubmissionIntents`, `TicketSubmissionState`, `TicketSubmissionIntents` | `machines/submissions.ts` |

(`RfqCountdownMachine.ts` and `RowHighlightMachine.ts` export no types.) A `*Deps` type that references a client-core presenter *class* (e.g. `JarvisDriverDeps` naming presenter classes) must reference the core-api presenter **interface** from Task 4 instead; if Task 4 has not run yet, move that `Deps` type in Task 4 and leave a `// moved in Task 4` note out of the code — just do it then.

`packages/core-api/src/machines/index.ts` re-exports every file with `export type * from "#/machines/<name>";`. Add `export type * from "#/machines/index";` to `src/index.ts`.

- [ ] **Step 3: Move `MachineFactories`**

Cut the `MachineFactories` interface and its doc comments from `packages/client-core/src/presenters/machine.ts:55-99` into `packages/core-api/src/machine.ts`, importing its member types from `#/machines/index` and `#/layout`. `client-core/src/presenters/machine.ts` is now three lines:
```ts
import type { Machine, MachineFactories, ReadOnlyMachine } from "@rtc/core-api";

export type { Machine, MachineFactories, ReadOnlyMachine };
```

- [ ] **Step 4: Typecheck, test, gates, commit**

Run: `pnpm typecheck && pnpm test && pnpm check:deps && pnpm lint:dead && pnpm --filter @rtc/tests gates`
Expected: green. `pnpm test` covers ui-contract's `Machine`/`EqWorkspaceState` imports from `@rtc/client-core`, which must still resolve through the re-exports.
```bash
git add packages/core-api packages/client-core/src
git commit -m "refactor(core-api): move machine State/Intents/Handle types + MachineFactories into core-api"
```

---

### Task 4: One interface per presenter, implemented by the RxJS classes

**Files:**
- Create: `packages/core-api/src/presenters/<name>.ts` (43 interfaces + their view types), `packages/core-api/src/presenters/index.ts`
- Modify: all 43 `packages/client-core/src/presenters/<X>Presenter.ts` + `AnimationDirector.ts` (`implements` clause, view-type re-exports), `packages/core-api/src/index.ts`

**Interfaces:**
- Produces: for every presenter class `X`, an interface named `X` in `@rtc/core-api` whose members are exactly the class's public surface, with `Observable<T>` → `Stream<T>` and `StateObservable<T>` → `StateStream<T>`. Client-core imports each as `import type { X as XApi } from "@rtc/core-api"` and declares `class X implements XApi`. Bare presenter names are therefore exported by **both** packages (interface vs class); client-core does NOT re-export the interfaces.
- Produces: the client-core-local view types moved to core-api and re-exported from their original client-core file: `AuthStatus`, `LoginWaitCycle`, `AuthViewState` (`AuthPresenter.ts`), `ActivityEntry` (`BlotterPresenter.ts`), `ThroughputView` (`ThroughputPresenter.ts`), `ExecutionOutcome` (`TradeExecutionPresenter.ts`), `EquityFillSignal` (`OrdersBlotterPresenter.ts`), `JarvisPanelVm` (`JarvisPanelsPresenter.ts`), `PanelPoint`, `PanelTone`, `PanelData`, `PanelStreamDeps` (`composePanelStream.ts`), `AnimationIntent`, `AnimationKind` (currently file-private — export it), `AnimationDirectorDeps` (`AnimationDirector.ts`).

- [ ] **Step 1: Write the failing conformance test in client-core**

`packages/client-core/src/presenters/__tests__/presenterApiConformance.test.ts`:
```ts
import { describe, expectTypeOf, it } from "vitest";

import type {
  ConnectionStatusPresenter as ConnectionStatusPresenterApi,
  PriceStreamPresenter as PriceStreamPresenterApi,
  ThemePreferencePresenter as ThemePreferencePresenterApi,
} from "@rtc/core-api";

import type { ConnectionStatusPresenter } from "../ConnectionStatusPresenter";
import type { PriceStreamPresenter } from "../PriceStreamPresenter";
import type { ThemePreferencePresenter } from "../ThemePreferencePresenter";

describe("RxJS presenters satisfy the core-api interfaces", () => {
  it("public surfaces match", () => {
    expectTypeOf<ConnectionStatusPresenter>().toMatchTypeOf<ConnectionStatusPresenterApi>();
    expectTypeOf<PriceStreamPresenter>().toMatchTypeOf<PriceStreamPresenterApi>();
    expectTypeOf<ThemePreferencePresenter>().toMatchTypeOf<ThemePreferencePresenterApi>();
  });
});
```
Run `pnpm --filter @rtc/client-core typecheck` — expected: FAIL (core-api has no presenter interfaces).

- [ ] **Step 2: Write the 43 interfaces**

One file per presenter under `packages/core-api/src/presenters/`, named in camelCase after the class (`priceStream.ts`, `themePreference.ts`, …). Each interface copies the class's public members verbatim from the table below, swapping the envelope names. Three worked examples set the pattern; the rest follow the table.

`packages/core-api/src/presenters/connectionStatus.ts`:
```ts
import type { ConnectionStatus } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Connection status fold over the connection-events port; replay-current. */
export interface ConnectionStatusPresenter {
  readonly status$: Stream<ConnectionStatus>;
}
```

`packages/core-api/src/presenters/themePreference.ts`:
```ts
import type { ThemeMode, ThemeModePreference } from "@rtc/domain";

import type { Stream } from "#/stream";

export interface ThemePreferencePresenter {
  /** The stored mode choice; "system" is left un-resolved here. */
  readonly modePreference$: Stream<ThemeModePreference>;
  /** The concrete mode to paint — "system" resolved against the OS scheme. */
  readonly mode$: Stream<ThemeMode>;
  setMode(mode: ThemeModePreference): void;
  /** Advance the stored preference one step (dark → light → system → dark). */
  cycle(): void;
}
```

`packages/core-api/src/presenters/rfqs.ts` (the one with machine-returning methods):
```ts
import type { CreateRfqInput, Quote, QuoteRequest, Rfq, RfqEvent } from "@rtc/domain";

import type { Machine } from "#/machine";
import type {
  RfqSubmissionIntents,
  RfqSubmissionState,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "#/machines/submissions";
import type { Stream } from "#/stream";

export interface RfqsPresenter {
  readonly rfqs$: Stream<readonly Rfq[]>;
  readonly allQuotes$: Stream<ReadonlyMap<number, Quote>>;
  readonly events$: Stream<RfqEvent>;
  quotesForRfq$(rfqId: number): Stream<readonly Quote[]>;
  createRfq(input: CreateRfqInput): Stream<number>;
  acceptQuote(quoteId: number): Stream<void>;
  cancelRfq(rfqId: number): Stream<void>;
  passQuote(quoteId: number): Stream<void>;
  quoteRfq(request: QuoteRequest): Stream<void>;
  createSubmission(): Machine<RfqSubmissionState, RfqSubmissionIntents>;
  createTicketSubmission(): Machine<TicketSubmissionState, TicketSubmissionIntents>;
}
```

The full member table (public surface per class; `Observable`→`Stream`, `StateObservable`→`StateStream`; default parameter values become optional parameters `?`):

| interface | members |
|---|---|
| `AmbientStylePresenter` | `readonly style$: Stream<AmbientStyle>`; `setStyle(style: AmbientStyle): void` |
| `AnalyticsPresenter` | `readonly position$: Stream<PositionUpdates>` |
| `AnimatedBackgroundPresenter` | `readonly enabled$: Stream<boolean>`; `set(on: boolean): void`; `toggle(current: boolean): void` |
| `AuthPresenter` | `readonly state$: Stream<AuthViewState>`; `login(username: string, password: string): void`; `lock(): void`; `unlock(password: string): void`; `logout(): void` |
| `BlotterPresenter` | `readonly trades$: Stream<readonly Trade[]>`; `readonly newTradeIds$: Stream<ReadonlySet<number>>`; `readonly activity$: Stream<readonly ActivityEntry[]>` |
| `BootGatePresenter` | `readonly visible$: Stream<boolean>`; `readonly visible: boolean` (the class getter satisfies this); `reboot(): void`; `dismiss(): void` |
| `BootPreferencePresenter` | `current(): BootVariant`; `setVariant(variant: BootVariant): void` |
| `CandleSeriesPresenter` | `candles$(symbol: string, timeframe?: CandleTimeframe): Stream<readonly Candle[]>`; `loadOlder(symbol: string, timeframe?: CandleTimeframe): void`; `loadingOlder$(symbol: string, timeframe?: CandleTimeframe): Stream<boolean>`; `historyExhausted$(symbol: string, timeframe?: CandleTimeframe): Stream<boolean>` |
| `ChartSubstratePresenter` | `readonly substrate$: Stream<ChartSubstrate>`; `setSubstrate(substrate: ChartSubstrate): void` |
| `ConnectionStatusPresenter` | (above) |
| `CreditRfqFilterPreferencePresenter` | `readonly filter$: Stream<CreditRfqFilter>`; `setFilter(filter: CreditRfqFilter): void` |
| `CurrencyPairsPresenter` | `readonly pairs$: Stream<readonly CurrencyPair[]>` |
| `DealersPresenter` | `readonly list$: Stream<readonly Dealer[]>` |
| `DepthPresenter` | `depth$(symbol: string): Stream<DepthBook>` |
| `EqBlotterViewPreferencePresenter` | `readonly view$: Stream<EqBlotterView>`; `setView(view: EqBlotterView): void` |
| `EqWatchlistSortPreferencePresenter` | `readonly sort$: Stream<EqWatchlistSort>`; `setSort(sort: EqWatchlistSort): void`; `cycle(): void` |
| `ErrorRatePresenter` | `readonly samples$: Stream<readonly MetricSample[]>` |
| `EventLogPresenter` | `readonly events$: Stream<readonly LogEvent[]>` |
| `ForceBootAnimationPresenter` | `readonly enabled$: Stream<boolean>`; `set(on: boolean): void`; `toggle(current: boolean): void` |
| `InstrumentsPresenter` | `readonly list$: Stream<readonly Instrument[]>` |
| `JarvisPanelsPresenter` | `readonly panels$: Stream<readonly JarvisPanelVm[]>`; `readonly dockedPanels$: Stream<readonly JarvisPanelVm[]>`; `readonly floatingPanels$: Stream<readonly JarvisPanelVm[]>`; `readonly dismissPanel: (panelId: string) => void`; `readonly restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => void`; `panelData$(panelId: string): Stream<PanelData \| null>` |
| `JarvisPreferencesPresenter` | `readonly brain$: Stream<JarvisBrain>`; `readonly effort$: Stream<JarvisEffort>`; `readonly narrator$: Stream<JarvisNarratorPreference>`; `setBrain(brain: JarvisBrain): void`; `setEffort(effort: JarvisEffort): void`; `setNarrator(preference: JarvisNarratorPreference): void` |
| `JarvisUsagePresenter` | `readonly usage$: Stream<AdminJarvisUsagePayload \| null>` |
| `LatencyPresenter` | `readonly samples$: Stream<readonly MetricSample[]>` |
| `LayoutEnginePresenter` | `readonly engine$: Stream<LayoutEngine>`; `setEngine(engine: LayoutEngine): void` |
| `LoginWaitPreferencesPresenter` | `readonly style$: Stream<LoginWaitStyle>`; `readonly delay$: Stream<LoginWaitDelay>`; `setStyle(style: LoginWaitStyle): void`; `setDelay(delay: LoginWaitDelay): void` |
| `OrdersBlotterPresenter` | `readonly fills$: Stream<EquityFillSignal>`; `readonly orders$: Stream<readonly EquityOrder[]>`; `place(req: PlaceOrderRequest): Stream<EquityOrder>` |
| `PositionsPresenter` | `readonly positions$: Stream<readonly EquityPosition[]>` |
| `PowerSaverPresenter` | `readonly level$: Stream<PowerSaverLevel>`; `readonly isCalm$: Stream<boolean>`; `readonly isFreeze$: Stream<boolean>`; `setLevel(level: PowerSaverLevel): void` |
| `PriceHistoryPresenter` | `history$(symbol: string): Stream<readonly PriceTick[]>` |
| `PriceStreamPresenter` | `price$(pair: CurrencyPair): Stream<Price>` |
| `RfqQuotePresenter` | `requestQuote(symbol: string, pipsPosition: number): Stream<RfqQuoteResult>` |
| `RfqsPresenter` | (above) |
| `ServiceTopologyPresenter` | `readonly topology$: Stream<ServiceTopology>` |
| `SessionsKpiPresenter` | `readonly countSeries$: Stream<readonly MetricSample[]>` |
| `SessionsPresenter` | `readonly sessions$: Stream<readonly SessionInfo[]>` |
| `ThemePreferencePresenter` | (above) |
| `ThemeSkinPreferencePresenter` | `readonly skin$: Stream<ThemeSkin>`; `setSkin(skin: ThemeSkin): void` |
| `ThroughputMetricPresenter` | `readonly samples$: Stream<readonly MetricSample[]>` |
| `ThroughputPresenter` | `readonly state$: StateStream<ThroughputView>`; `setValue(value: number): void` |
| `TradeExecutionPresenter` | `readonly executions$: Stream<ExecutionOutcome>`; `execute(input: ExecuteTradeInput): Stream<ExecuteTradeResult>` |
| `ViewModePreferencePresenter` | `readonly viewMode$: Stream<ViewMode>`; `setViewMode(viewMode: ViewMode): void` |
| `WatchlistPresenter` | `readonly watchlist$: Stream<readonly EquityInstrument[]>`; `quote$(symbol: string): Stream<EquityQuote>` |
| `AnimationDirector` | `intentsFor(target: string): Stream<AnimationIntent>` |

Domain/shared type origins the implementer will need: `AmbientStyle`, `ChartSubstrate`, `LayoutEngine`, `ViewMode`, `CreditRfqFilter`, `EqWatchlistSort`, `EqBlotterView`, `JarvisNarratorPreference`, `LoginWaitStyle`, `LoginWaitDelay`, `ThemeModePreference`, `ThemeMode`, `ThemeSkin`, `PowerSaverLevel`, `BootVariant` → `@rtc/domain` (preferences); `PositionUpdates`, `RfqQuoteResult`, `RfqEvent`, `CreateRfqInput`, `QuoteRequest`, `MetricControl` → `@rtc/domain`; `PanelSpecV1`, `AdminJarvisUsagePayload`, `JarvisBrain`, `JarvisEffort` → `@rtc/shared`. If `TradeExecutionPresenter.executions$` is untyped in the class (it is inferred from `asObservable()`), annotate the class field `readonly executions$: Observable<ExecutionOutcome>` explicitly.

The view types listed under **Produces** move with the same cut → paste → re-export procedure as Task 2. `AnimationKind` becomes `export type AnimationKind = …` in core-api and is re-exported by `AnimationDirector.ts`.

`packages/core-api/src/presenters/index.ts` re-exports every presenter file; `src/index.ts` adds `export type * from "#/presenters/index";`.

- [ ] **Step 3: Add `implements` to every class**

In each of the 43 class files (and `AnimationDirector.ts`):
```ts
import type { PriceStreamPresenter as PriceStreamPresenterApi } from "@rtc/core-api";

export class PriceStreamPresenter implements PriceStreamPresenterApi {
```
Extend `presenterApiConformance.test.ts` so that every one of the 44 pairs has a `toMatchTypeOf` line (same shape as Step 1, one line per presenter). This is the file a future core's implementer copies to prove their own classes conform.

- [ ] **Step 4: Typecheck, test, gates, commit**

Run: `pnpm typecheck && pnpm test && pnpm check:deps && pnpm lint:dead && pnpm --filter @rtc/tests gates`
Expected: green. The most likely failure is a class whose public method has a wider parameter type than the interface — fix the interface to match the class (the class is the behaviour of record in this slice).
```bash
git add packages/core-api packages/client-core/src
git commit -m "refactor(core-api): one interface per presenter; client-core classes implement them; view types moved"
```

---

### Task 5: Move `Presenters`, `AppCommands`, `App`, `AppPorts` and add `CoreFactory` + `App.dispose`

**Files:**
- Create: `packages/core-api/src/app.ts`, `packages/core-api/src/__tests__/app.test.ts`
- Modify: `packages/client-core/src/composition.ts` (`Presenters`/`AppCommands`/`App` → re-exports; `createApp` returns `dispose`), `packages/client-core/src/adapters/portFactory.ts` (`AppPorts`, `TransportPorts` → re-exports), `packages/core-api/src/index.ts`
- Test: `packages/client-core/src/composition.dispose.test.ts`

**Interfaces:**
- Produces in core-api:
  ```ts
  export interface AppCommands { reconnect(): void }
  export interface App { presenters: Presenters; ports: AppPorts; commands: AppCommands; dispose(): Promise<void> }
  export interface CoreFactory {
    createApp(ports: AppPorts): App;
    createMachineFactories(presenters: Presenters): MachineFactories;
  }
  ```
  `Presenters` keeps today's ~60 members with every class-typed member retyped to the Task 4 interface (`priceStream: PriceStreamPresenter` now names the interface). `AppPorts` keeps its 26 members (all domain- or core-api-typed after Task 2).

- [ ] **Step 1: Write the failing tests**

`packages/core-api/src/__tests__/app.test.ts`:
```ts
import { describe, expectTypeOf, it } from "vitest";

import type { App, AppCommands, CoreFactory, Presenters } from "#/index";

describe("App contract", () => {
  it("App carries presenters, ports, commands and an async dispose", () => {
    expectTypeOf<App["dispose"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<AppCommands>().toHaveProperty("reconnect");
  });

  it("CoreFactory is the createApp/createMachineFactories pair", () => {
    expectTypeOf<keyof CoreFactory>().toEqualTypeOf<"createApp" | "createMachineFactories">();
  });

  it("Presenters names the interfaces, never a class", () => {
    expectTypeOf<Presenters["connection"]["status$"]>().not.toBeAny();
  });
});
```

`packages/client-core/src/composition.dispose.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { createSimulatorPorts } from "#/adapters/portFactory";
import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import { createApp } from "#/composition";
import { AuthSimulator, ConnectionEventsSimulator, PreferencesSimulator } from "@rtc/domain";

describe("createApp().dispose", () => {
  it("resolves and is idempotent", async () => {
    const preferences = new PreferencesSimulator();
    const ports = {
      ...createSimulatorPorts({ preferences, auth: new AuthSimulator({ demo: "demo" }), sessionStore: new InMemorySessionStore() }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
    const app = createApp(ports);
    await expect(app.dispose()).resolves.toBeUndefined();
    await expect(app.dispose()).resolves.toBeUndefined();
  });
});
```
Check `ConnectionEventsSimulator`'s constructor in `packages/domain/src/simulators/` and `AuthSimulator`'s (`packages/domain/src/simulators/AuthSimulator.ts:18`) and adjust the two `new` calls to their real signatures — other client-core tests (`composition.*.test.ts`) already construct both; copy their calls.

Run: `pnpm --filter @rtc/core-api typecheck; pnpm --filter @rtc/client-core test composition.dispose` — expected: FAIL.

- [ ] **Step 2: Write `app.ts` and re-export from client-core**

`packages/core-api/src/app.ts` — move `AppPorts` (+ `TransportPorts`, `PortFactoryDeps` stays in client-core because it is only an input to the port factories) from `portFactory.ts:100-163`, and `Presenters` / `AppCommands` / `App` from `composition.ts:150-313`, verbatim including doc comments, with every presenter class type name now resolving to the `#/presenters/index` interface of the same name; append:
```ts
export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
  /** Release everything the core owns (fibers, timers, subscriptions). No-op
   * for the RxJS core, abort for the async core, ManagedRuntime.dispose()
   * for the Effect core. Idempotent. */
  dispose(): Promise<void>;
}

/** The whole plug: what a client's `selectCore` returns. */
export interface CoreFactory {
  createApp(ports: AppPorts): App;
  createMachineFactories(presenters: Presenters): MachineFactories;
}
```
Add `export type * from "#/app";` to `src/index.ts`.

In `composition.ts` replace the three interface declarations with:
```ts
import type { App, AppCommands, AppPorts, CoreFactory, Presenters } from "@rtc/core-api";

export type { App, AppCommands, AppPorts, CoreFactory, Presenters };
```
(delete the existing `export type { AppPorts };` at line 125). In `portFactory.ts` replace `AppPorts`/`TransportPorts` with `import type { AppPorts, TransportPorts } from "@rtc/core-api"; export type { AppPorts, TransportPorts };`.

At the end of `createApp` (the returned object literal) add:
```ts
    dispose: async (): Promise<void> => {
      // The RxJS core owns no runtime of its own: every stream tears down
      // with its last subscriber and every composition-root machine is a
      // session singleton. Nothing to release.
    },
```
Annotate `export function createApp(ports: AppPorts): App` unchanged; the return literal must now satisfy `Presenters`' interface-typed members — it does, because every class implements its interface (Task 4).

Also export a `rxjsCore` bundle for the alternative cores to delegate to, at the bottom of `composition.ts`:
```ts
/** The RxJS core as a `CoreFactory` — what `selectCore` returns for
 * `VITE_CORE_IMPL=rxjs` and what the alternative cores delegate to. */
export const rxjsCore: CoreFactory = { createApp, createMachineFactories };
```

- [ ] **Step 3: Typecheck, run the two tests, full test, gates, commit**

Run: `pnpm typecheck && pnpm test && pnpm check:deps && pnpm lint:dead && pnpm --filter @rtc/tests gates`
Expected: green.
```bash
git add packages/core-api packages/client-core/src
git commit -m "refactor(core-api): Presenters/AppCommands/App/AppPorts move to core-api; CoreFactory + App.dispose; rxjsCore export"
```

---

### Task 6: `@rtc/core-contract` — harness, registry, slice 1a suites, RxJS runner

**Files:**
- Create: `packages/core-contract/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
- Create: `packages/core-contract/src/index.ts`, `src/harness/harness.ts`, `src/harness/scriptedPorts.ts`, `src/harness/collect.ts`, `src/registry.ts`, `src/registry.test.ts`
- Create: `packages/core-contract/src/suites/connection.ts`, `themePreference.ts`, `themeSkinPreference.ts`, `viewModePreference.ts`, `powerSaver.ts`, `reconnect.ts`
- Create: `packages/client-core/src/composition.coreContract.test.ts` (the RxJS runner)
- Modify: `packages/client-core/package.json` (devDependency), `tsconfig.depcruise.json`, `knip.json`, `.dependency-cruiser.cjs`

**Interfaces:**
- Produces:
  ```ts
  export interface CoreHarness { app: App; machines: MachineFactories; driver: ScriptedDriver; teardown(): Promise<void> }
  export type MakeHarness = () => CoreHarness
  export type Suite = (label: string, makeHarness: MakeHarness) => void
  export interface ScriptedDriver {
    emitConnection(event: ConnectionEvent): void
    connectionEvents$(): Stream<ConnectionEvent>      // the merged stream the core sees
    setPrefersDark(on: boolean): void
  }
  export function scriptPorts(base: AppPorts): { ports: AppPorts; driver: ScriptedDriver; teardown(): void }
  export function describeCoreContract(label: string, makeHarness: MakeHarness): void
  export function collect<T>(stream: Stream<T>): { readonly values: T[]; unsubscribe(): void }
  ```
- Dependency shape: `core-contract` depends on `core-api`, `domain`, `rxjs` only. It must **not** depend on `client-core` (client-core devDepends on it; a workspace cycle would break turbo's task graph). Each runner supplies the base ports itself.

- [ ] **Step 1: Scaffold the package**

`packages/core-contract/package.json`:
```json
{
  "name": "@rtc/core-contract",
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
    "typecheck": "tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo",
    "test": "vitest run",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports coverage 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/core-api": "workspace:*",
    "@rtc/domain": "workspace:*",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "tsc-alias": "1.9.4",
    "vitest": "^4.1.10"
  },
  "peerDependencies": {
    "vitest": "^4.1.10"
  }
}
```
`vitest` is a peer because the suites call `describe`/`it` inside the consumer's run. tsconfig as in Task 1 with `references` to `../core-api` and `../domain`, plus `"types": ["vitest/globals"]` is NOT used — suites import from `vitest` explicitly. vitest.config as in Task 1 (`include: ["src/**/*.test.ts"]`).

Registries: `tsconfig.depcruise.json` line pair for `@rtc/core-contract`; `knip.json` entry `{ "entry": "src/index.ts", "project": "src/**/*.ts" }`; dep-cruiser rule inserted after `core-api-stays-inner`:
```js
    {
      name: "core-contract-stays-neutral",
      severity: "error",
      comment:
        "@rtc/core-contract is the paradigm-neutral behavioural spec of the application core — it may import only core-api and domain, never a core (each core's runner supplies its own factory), a binding, or a client.",
      from: { path: "^packages/core-contract/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(core-contract|core-api|domain)/",
      },
    },
```
Add `core-contract` to `client-core-stays-inner`'s `pathNot` (client-core's runner imports it). Add `"@rtc/core-contract": "workspace:*"` to `packages/client-core/package.json` **devDependencies** and `{ "path": "../core-contract" }` to its tsconfig references.

- [ ] **Step 2: Write the harness**

`packages/core-contract/src/harness/collect.ts`:
```ts
import type { Stream } from "@rtc/core-api";

/** Subscribe and keep every emission. `values` is live: read it after
 * driving the ports or advancing fake timers. Synchronous emissions on
 * subscribe land before `collect` returns — that is how the suites assert
 * replay-current behaviour. */
export function collect<T>(stream: Stream<T>): {
  readonly values: T[];
  unsubscribe(): void;
} {
  const values: T[] = [];
  const subscription = stream.subscribe((value) => {
    values.push(value);
  });
  return {
    values,
    unsubscribe: () => {
      subscription.unsubscribe();
    },
  };
}
```

`packages/core-contract/src/harness/scriptedPorts.ts`:
```ts
import { BehaviorSubject, merge, type Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type { ConnectionEvent, ConnectionEventsPort } from "@rtc/domain";

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
}

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events and the colour scheme deterministically. Everything else in
 * `base` is passed through untouched — the runner decides what backs it
 * (domain simulators, in-memory stores). */
export function scriptPorts(base: AppPorts): ScriptedPorts {
  const connection$ = new Subject<ConnectionEvent>();
  const prefersDark$ = new BehaviorSubject<boolean>(false);

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      return merge(base.connectionEvents.events(), connection$);
    },
  };
  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      return prefersDark$;
    },
  };

  return {
    ports: { ...base, connectionEvents, colorScheme },
    driver: {
      emitConnection: (event) => {
        connection$.next(event);
      },
      connectionEvents$: () => {
        return connectionEvents.events();
      },
      setPrefersDark: (on) => {
        prefersDark$.next(on);
      },
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();
    },
  };
}
```

`packages/core-contract/src/harness/harness.ts`:
```ts
import type { App, MachineFactories } from "@rtc/core-api";

import type { ScriptedDriver } from "#/harness/scriptedPorts";

export interface CoreHarness {
  app: App;
  machines: MachineFactories;
  driver: ScriptedDriver;
  teardown(): Promise<void>;
}

export type MakeHarness = () => CoreHarness;

export type Suite = (label: string, makeHarness: MakeHarness) => void;
```

- [ ] **Step 3: Write the registry and its drift test (failing first)**

`packages/core-contract/src/registry.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { CONTRACT_SUITES, PENDING_SUITES } from "#/registry";

describe("core-contract registry", () => {
  it("every member without a suite is listed in PENDING_SUITES, and nothing else is", () => {
    const pending = Object.entries(CONTRACT_SUITES)
      .filter(([, suite]) => {
        return suite === null;
      })
      .map(([member]) => {
        return member;
      })
      .sort();
    expect(pending).toEqual([...PENDING_SUITES].sort());
  });

  it("slice 1a members have suites", () => {
    for (const member of [
      "presenters.connection",
      "presenters.themePreference",
      "presenters.themeSkinPreference",
      "presenters.viewModePreference",
      "presenters.powerSaver",
      "commands.reconnect",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });
});
```
Run: `pnpm --filter @rtc/core-contract test` — expected: FAIL (no registry).

`packages/core-contract/src/registry.ts`:
```ts
import type { MachineFactories, Presenters } from "@rtc/core-api";

import type { Suite } from "#/harness/harness";
import { describeConnectionContract } from "#/suites/connection";
import { describePowerSaverContract } from "#/suites/powerSaver";
import { describeReconnectContract } from "#/suites/reconnect";
import { describeThemePreferenceContract } from "#/suites/themePreference";
import { describeThemeSkinPreferenceContract } from "#/suites/themeSkinPreference";
import { describeViewModePreferenceContract } from "#/suites/viewModePreference";

type PresenterMember = `presenters.${keyof Presenters & string}`;
type MachineMember = `machines.${keyof MachineFactories & string}`;
type CommandMember = "commands.reconnect";

/** Every member of the core contract, by dotted path. */
export type ContractMember = PresenterMember | MachineMember | CommandMember;

/** The exhaustive registry: adding a member to `Presenters` or
 * `MachineFactories` is a compile error here until it is listed — with a
 * suite, or `null` while it is pending (then it must also appear in
 * `PENDING_SUITES`, which `registry.test.ts` enforces). */
export const CONTRACT_SUITES: Record<ContractMember, Suite | null> = {
  "presenters.priceStream": null,
  "presenters.priceHistory": null,
  "presenters.execution": null,
  "presenters.blotter": null,
  "presenters.analytics": null,
  "presenters.rfqs": null,
  "presenters.currencyPairs": null,
  "presenters.instruments": null,
  "presenters.dealers": null,
  "presenters.connection": describeConnectionContract,
  "presenters.rfqQuote": null,
  "presenters.throughput": null,
  "presenters.themePreference": describeThemePreferenceContract,
  "presenters.themeSkinPreference": describeThemeSkinPreferenceContract,
  "presenters.animatedBackground": null,
  "presenters.ambientStyle": null,
  "presenters.chartSubstrate": null,
  "presenters.layoutEngine": null,
  "presenters.dockLayoutStore": null,
  "presenters.forceBootAnimation": null,
  "presenters.powerSaver": describePowerSaverContract,
  "presenters.viewModePreference": describeViewModePreferenceContract,
  "presenters.creditRfqFilterPreference": null,
  "presenters.eqWatchlistSortPreference": null,
  "presenters.eqBlotterViewPreference": null,
  "presenters.animationDirector": null,
  "presenters.bootPreference": null,
  "presenters.bootGate": null,
  "presenters.auth": null,
  "presenters.loginWaitPreferences": null,
  "presenters.jarvisPreferences": null,
  "presenters.watchlist": null,
  "presenters.candleSeries": null,
  "presenters.depth": null,
  "presenters.ordersBlotter": null,
  "presenters.positions": null,
  "presenters.incident": null,
  "presenters.eqWorkspace": null,
  "presenters.workspaceNav": null,
  "presenters.layoutFor": null,
  "presenters.eqDrawings": null,
  "presenters.throughputMetric": null,
  "presenters.latencyMetric": null,
  "presenters.errorRateMetric": null,
  "presenters.topology": null,
  "presenters.eventLog": null,
  "presenters.sessions": null,
  "presenters.sessionsKpi": null,
  "presenters.jarvis": null,
  "presenters.jarvisUsage": null,
  "presenters.jarvisPanels": null,
  "presenters.dockPanel": null,
  "presenters.undockPanel": null,
  "presenters.dismissPanel": null,
  "presenters.resetWorkspaceLayout": null,
  "presenters.jarvisDriver": null,
  "presenters.jarvisDemo": null,
  "machines.tileExecution": null,
  "machines.rfqTile": null,
  "machines.staleFlag": null,
  "machines.analyticsStaleFlag": null,
  "machines.rowHighlight": null,
  "machines.notional": null,
  "machines.rfqSubmission": null,
  "machines.ticketSubmission": null,
  "machines.layout": null,
  "machines.boot": null,
  "machines.orderTicket": null,
  "commands.reconnect": describeReconnectContract,
};

/** Members whose suite is still to be written. Hand-maintained on purpose:
 * the drift test fails if this list and the `null`s above disagree, so a
 * member cannot silently lose its suite. Shrinks slice by slice. */
export const PENDING_SUITES: readonly ContractMember[] = [
  "presenters.priceStream",
  "presenters.priceHistory",
  "presenters.execution",
  "presenters.blotter",
  "presenters.analytics",
  "presenters.rfqs",
  "presenters.currencyPairs",
  "presenters.instruments",
  "presenters.dealers",
  "presenters.rfqQuote",
  "presenters.throughput",
  "presenters.animatedBackground",
  "presenters.ambientStyle",
  "presenters.chartSubstrate",
  "presenters.layoutEngine",
  "presenters.dockLayoutStore",
  "presenters.forceBootAnimation",
  "presenters.creditRfqFilterPreference",
  "presenters.eqWatchlistSortPreference",
  "presenters.eqBlotterViewPreference",
  "presenters.animationDirector",
  "presenters.bootPreference",
  "presenters.bootGate",
  "presenters.auth",
  "presenters.loginWaitPreferences",
  "presenters.jarvisPreferences",
  "presenters.watchlist",
  "presenters.candleSeries",
  "presenters.depth",
  "presenters.ordersBlotter",
  "presenters.positions",
  "presenters.incident",
  "presenters.eqWorkspace",
  "presenters.workspaceNav",
  "presenters.layoutFor",
  "presenters.eqDrawings",
  "presenters.throughputMetric",
  "presenters.latencyMetric",
  "presenters.errorRateMetric",
  "presenters.topology",
  "presenters.eventLog",
  "presenters.sessions",
  "presenters.sessionsKpi",
  "presenters.jarvis",
  "presenters.jarvisUsage",
  "presenters.jarvisPanels",
  "presenters.dockPanel",
  "presenters.undockPanel",
  "presenters.dismissPanel",
  "presenters.resetWorkspaceLayout",
  "presenters.jarvisDriver",
  "presenters.jarvisDemo",
  "machines.tileExecution",
  "machines.rfqTile",
  "machines.staleFlag",
  "machines.analyticsStaleFlag",
  "machines.rowHighlight",
  "machines.notional",
  "machines.rfqSubmission",
  "machines.ticketSubmission",
  "machines.layout",
  "machines.boot",
  "machines.orderTicket",
];
```
If `pnpm typecheck` reports a `Presenters` key missing from the record, add it — the member list above was read from `composition.ts:150-302` on 2026-09-12 and the type is the source of truth.

`packages/core-contract/src/index.ts`:
```ts
import { CONTRACT_SUITES, type ContractMember } from "#/registry";
import type { MakeHarness } from "#/harness/harness";

export type { CoreHarness, MakeHarness, Suite } from "#/harness/harness";
export { collect } from "#/harness/collect";
export { type ScriptedDriver, type ScriptedPorts, scriptPorts } from "#/harness/scriptedPorts";
export { CONTRACT_SUITES, type ContractMember, PENDING_SUITES } from "#/registry";

/** Run every registered suite against one core. Each core has exactly one
 * runner file calling this — the core-level twin of ui-contract's
 * per-framework driver trio. */
export function describeCoreContract(label: string, makeHarness: MakeHarness): void {
  for (const [member, suite] of Object.entries(CONTRACT_SUITES) as [ContractMember, (typeof CONTRACT_SUITES)[ContractMember]][]) {
    if (suite !== null) {
      suite(`${label} :: ${member}`, makeHarness);
    }
  }
}
```

- [ ] **Step 4: Write the six slice 1a suites**

`packages/core-contract/src/suites/connection.ts`:
```ts
import { ConnectionStatus } from "@rtc/domain";
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeConnectionContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("status$ carries CONNECTING synchronously on subscribe", async () => {
      const h = makeHarness();
      try {
        const c = collect(h.app.presenters.connection.status$);
        expect(c.values).toEqual([ConnectionStatus.CONNECTING]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("folds gateway events: connected → disconnected → reconnect attempt", async () => {
      const h = makeHarness();
      try {
        const c = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "reconnectAttempt" });
        expect(c.values).toEqual([
          ConnectionStatus.CONNECTING,
          ConnectionStatus.CONNECTED,
          ConnectionStatus.DISCONNECTED,
          ConnectionStatus.CONNECTING,
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current status, not the history", async () => {
      const h = makeHarness();
      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        const late = collect(h.app.presenters.connection.status$);
        expect(late.values).toEqual([ConnectionStatus.CONNECTED]);
        first.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("tears down on the last unsubscribe: a fresh subscriber restarts from CONNECTING", async () => {
      const h = makeHarness();
      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        first.unsubscribe();
        const again = collect(h.app.presenters.connection.status$);
        expect(again.values).toEqual([ConnectionStatus.CONNECTING]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/themePreference.ts`:
```ts
import { DEFAULT_THEME_MODE_PREFERENCE } from "@rtc/domain";
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeThemePreferenceContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("modePreference$ replays the stored choice synchronously", async () => {
      const h = makeHarness();
      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        expect(c.values).toEqual([DEFAULT_THEME_MODE_PREFERENCE]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("setMode persists and emits", async () => {
      const h = makeHarness();
      try {
        const c = collect(h.app.presenters.themePreference.modePreference$);
        h.app.presenters.themePreference.setMode("light");
        expect(c.values.at(-1)).toBe("light");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("cycle() walks dark → light → system → dark from the CURRENT stored value", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.themePreference;
        p.setMode("dark");
        const c = collect(p.modePreference$);
        p.cycle();
        p.cycle();
        p.cycle();
        expect(c.values).toEqual(["dark", "light", "system", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("mode$ resolves 'system' against the OS scheme and de-duplicates", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.themePreference;
        p.setMode("system");
        const c = collect(p.mode$);
        expect(c.values).toEqual(["light"]);
        h.driver.setPrefersDark(true);
        h.driver.setPrefersDark(true);
        expect(c.values).toEqual(["light", "dark"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/themeSkinPreference.ts`:
```ts
import { DEFAULT_THEME_SKIN } from "@rtc/domain";
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeThemeSkinPreferenceContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("skin$ replays the default synchronously and follows setSkin", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.themeSkinPreference;
        const c = collect(p.skin$);
        expect(c.values).toEqual([DEFAULT_THEME_SKIN]);
        p.setSkin("classic");
        expect(c.values.at(-1)).toBe("classic");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/viewModePreference.ts`:
```ts
import { DEFAULT_VIEW_MODE } from "@rtc/domain";
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeViewModePreferenceContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("viewMode$ replays the default synchronously and follows setViewMode", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.viewModePreference;
        const c = collect(p.viewMode$);
        expect(c.values).toEqual([DEFAULT_VIEW_MODE]);
        p.setViewMode("price");
        expect(c.values.at(-1)).toBe("price");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/powerSaver.ts`:
```ts
import { DEFAULT_POWER_SAVER_LEVEL } from "@rtc/domain";
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describePowerSaverContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("level$, isCalm$ and isFreeze$ replay synchronously from the default", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.powerSaver;
        const level = collect(p.level$);
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        expect(level.values).toEqual([DEFAULT_POWER_SAVER_LEVEL]);
        expect(calm.values).toEqual([false]);
        expect(freeze.values).toEqual([false]);
        level.unsubscribe();
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("calm is any non-off level; freeze is only 'freeze'", async () => {
      const h = makeHarness();
      try {
        const p = h.app.presenters.powerSaver;
        const calm = collect(p.isCalm$);
        const freeze = collect(p.isFreeze$);
        p.setLevel("calm");
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(false);
        p.setLevel("freeze");
        expect(calm.values.at(-1)).toBe(true);
        expect(freeze.values.at(-1)).toBe(true);
        p.setLevel("off");
        expect(calm.values.at(-1)).toBe(false);
        expect(freeze.values.at(-1)).toBe(false);
        calm.unsubscribe();
        freeze.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

`packages/core-contract/src/suites/reconnect.ts`:
```ts
import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeReconnectContract(label: string, makeHarness: MakeHarness): void {
  describe(label, () => {
    it("commands.reconnect() pushes a 'reconnect' event into the connection stream", async () => {
      const h = makeHarness();
      try {
        const c = collect(h.driver.connectionEvents$());
        h.app.commands.reconnect();
        expect(c.values).toEqual([{ type: "reconnect" }]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
```

- [ ] **Step 5: Write the RxJS runner**

`packages/client-core/src/composition.coreContract.test.ts`:
```ts
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";
import { type CoreHarness, describeCoreContract, scriptPorts } from "@rtc/core-contract";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { createApp, createMachineFactories, reconnect$ } from "#/composition";

function makeRxjsHarness(): CoreHarness {
  const base = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({ demo: "demo" }),
      sessionStore: new InMemorySessionStore(),
    }),
    // The RxJS core's user-initiated reconnect intent is a module-level
    // Subject that the browser port factories merge into connectionEvents;
    // the harness mirrors that merge so `commands.reconnect()` is observable.
    connectionEvents: { events: () => reconnect$ },
  };
  const { ports, driver, teardown } = scriptPorts(base);
  const app = createApp(ports);
  return {
    app,
    machines: createMachineFactories(app.presenters),
    driver,
    teardown: async () => {
      await app.dispose();
      teardown();
    },
  };
}

describeCoreContract("rxjs", makeRxjsHarness);
```
If `AuthSimulator`'s constructor takes a different shape, copy the call from an existing `composition.*.test.ts`. `reconnect$` emits `ReconnectIntent` objects; confirm at `composition.ts:128` that the shape is `{ type: "reconnect" }` and adjust the reconnect suite's expected literal if it carries more fields.

- [ ] **Step 6: Run it all, gates, commit**

Run:
```bash
pnpm install
pnpm --filter @rtc/core-contract build && pnpm --filter @rtc/core-contract test
pnpm --filter @rtc/client-core test composition.coreContract
pnpm typecheck && pnpm check:deps && pnpm lint:dead && pnpm check:versions && pnpm check:scripts && pnpm --filter @rtc/tests gates
```
Expected: the registry drift test passes; all six suites pass against the RxJS core. A failing `cycle()` expectation means `ThemePreferencePresenter.cycle()` reads the *stored* preference synchronously — that is the contract; fix the test only if the presenter's documented cycle order differs.
```bash
git add packages/core-contract packages/client-core tsconfig.depcruise.json knip.json .dependency-cruiser.cjs pnpm-lock.yaml
git commit -m "feat(core-contract): behavioural contract tier for the application core — harness, exhaustive registry, slice 1a suites, RxJS runner"
```

---

### Task 7: `@rtc/client-core-async` — kernel, bridge, delegating composition, parity manifest, runner

**Files:**
- Create: `packages/client-core-async/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
- Create: `src/index.ts`, `src/kernel/store.ts` (+ `store.test.ts`), `src/kernel/topic.ts` (+ test), `src/kernel/spawn.ts` (+ test), `src/kernel/sleep.ts` (+ test)
- Create: `src/bridge/in.ts` (+ test), `src/bridge/out.ts` (+ test)
- Create: `src/composition.ts`, `src/parity.json`, `src/parity.test.ts`, `src/coreContract.test.ts`
- Modify: `tsconfig.depcruise.json`, `knip.json`, `.dependency-cruiser.cjs`, `tests/scripts/grep-gates.ts`

**Interfaces:**
- Produces: `asyncCore: CoreFactory`; kernel `Store<S>`, `Topic<T>`, `spawn`, `sleep`; bridge `iterate`, `once`, `topicToStream`, `storeToStateStream`; `composeWithBase(ports): { base: App; app: App }` (for the drift test).
- Consumes: `rxjsCore`, `createApp`, `createMachineFactories` from `@rtc/client-core`; `CoreFactory`, `App`, `AppPorts`, `Presenters`, `Stream`, `StateStream` from `@rtc/core-api`.

- [ ] **Step 1: Scaffold**

`package.json` — as `@rtc/core-api`'s in Task 1 with `"name": "@rtc/client-core-async"`, `"sideEffects": false` (so a client build that selects another core tree-shakes this one away), and:
```json
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports coverage 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/client-core": "workspace:*",
    "@rtc/core-api": "workspace:*",
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*",
    "@rx-state/core": "^0.1.4",
    "rxjs": "^7.8"
  },
  "devDependencies": {
    "@rtc/core-contract": "workspace:*",
    "@types/node": "^26.2.0",
    "@vitest/coverage-v8": "^4.1.10",
    "tsc-alias": "1.9.4",
    "vitest": "^4.1.10"
  }
```
tsconfig references: `../client-core`, `../core-api`, `../core-contract`, `../domain`, `../shared`; `"types": ["node"]`. `vitest.config.ts` as devtools-core's (coverage `include: ["src/**/*.ts"]`, `exclude` the `.test.ts` and `parity.json`, thresholds `statements/lines/functions 95, branches 85`).

Registries: depcruise line pair; knip entry; rules:
```js
    {
      name: "alt-cores-stay-inner",
      severity: "error",
      comment:
        "The alternative application cores may import only core-api, client-core (strangler delegation + shared pure reducers), core-contract (their runner test), domain, and shared — never a binding, a client, the server, or each other.",
      from: { path: "^packages/client-core-(async|effect)/src" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(client-core|core-api|core-contract|domain|shared)/",
      },
    },
    {
      name: "alt-cores-framework-free",
      severity: "error",
      comment: "Alternative cores are framework-free like client-core.",
      from: { path: "^packages/client-core-(async|effect)/src" },
      to: { path: "node_modules/(react|react-dom|react-native|solid-js)/" },
    },
    {
      name: "bridge-owns-rxjs",
      severity: "error",
      comment:
        "Outside bridge/, an alternative core may not import rxjs or @rx-state/core at runtime — otherwise it is RxJS with extra steps. Type-only imports are allowed (dependencyTypesNot excludes them).",
      from: {
        path: "^packages/client-core-(async|effect)/src",
        pathNot: "^packages/client-core-(async|effect)/src/bridge/|\\.test\\.ts$",
      },
      to: {
        path: "node_modules/(rxjs|@rx-state)/",
        dependencyTypesNot: ["type-only"],
      },
    },
```
Grep gate (belt and braces for the same rule, catches `import { x }` of a value from rxjs even when the cruiser's type-only detection misses a mixed import):
```ts
  {
    name: "43. Alternative cores import rxjs/@rx-state as types only outside bridge/ (bridge-owns-rxjs)",
    pattern: "^import \\{[^}]*\\} from \"(rxjs|rxjs/operators|@rx-state/core)\"",
    paths: ["../packages/client-core-async/src/", "../packages/client-core-effect/src/"],
    excludes: ["/bridge/", ".test."],
  },
```
(A brace import without `type` is what a value import looks like under `verbatimModuleSyntax`; the runner uses `grep -rE`, which has no lookahead, so the pattern matches the value form directly.)

- [ ] **Step 2: Kernel — `Store<S>` (test first)**

`src/kernel/store.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { createStore } from "#/kernel/store";

describe("Store", () => {
  it("get() returns the current value synchronously", () => {
    const store = createStore(1);
    expect(store.get()).toBe(1);
  });

  it("subscribe() delivers the current value synchronously, then every change", () => {
    const store = createStore("a");
    const seen: string[] = [];
    const stop = store.subscribe((v) => {
      seen.push(v);
    });
    store.set("b");
    store.set((prev) => `${prev}c`);
    expect(seen).toEqual(["a", "b", "bc"]);
    stop();
    store.set("d");
    expect(seen).toEqual(["a", "b", "bc"]);
  });

  it("set() with an identical value (Object.is) does not notify", () => {
    const store = createStore(0);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.set(0);
    expect(notifications).toBe(1);
  });
});
```
Run: `pnpm --filter @rtc/client-core-async test store` — expected: FAIL (module missing).

`src/kernel/store.ts`:
```ts
/** A synchronous, replay-current cell. Every async-core machine is a Store
 * plus async intent functions: `subscribe` hands the current value to the
 * listener before returning, which is the warmth guarantee the bindings
 * rely on (`toSignal` throws without it). */
export interface Store<S> {
  get(): S;
  set(next: S | ((previous: S) => S)): void;
  subscribe(listener: (value: S) => void): () => void;
}

export function createStore<S>(initial: S): Store<S> {
  let current = initial;
  const listeners = new Set<(value: S) => void>();

  return {
    get: () => {
      return current;
    },
    set: (next) => {
      const value = typeof next === "function" ? (next as (previous: S) => S)(current) : next;
      if (Object.is(value, current)) {
        return;
      }
      current = value;
      for (const listener of [...listeners]) {
        listener(value);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```
Run the test — expected: PASS.

- [ ] **Step 3: Kernel — `sleep` and `spawn` (test first)**

`src/kernel/sleep.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbortError, sleep } from "#/kernel/sleep";

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay", async () => {
    const p = sleep(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects with AbortError when the signal aborts first, and clears the timer", async () => {
    const controller = new AbortController();
    const p = sleep(100, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects immediately on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(100, controller.signal)).rejects.toBeInstanceOf(AbortError);
  });
});
```
`src/kernel/sleep.ts`:
```ts
export class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

/** Promise-shaped timer that honours an AbortSignal — the async core's only
 * clock primitive. Every `timer(...)`/`delay(...)` in the RxJS core becomes
 * an `await sleep(ms, signal)`. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const abort = (): void => {
      clearTimeout(handle);
      reject(new AbortError());
    };
    const handle = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
```

`src/kernel/spawn.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { AbortError } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";

describe("spawn", () => {
  it("runs the loop and swallows AbortError", async () => {
    const errors: unknown[] = [];
    await spawn(
      async () => {
        throw new AbortError();
      },
      (error) => {
        errors.push(error);
      },
    );
    expect(errors).toEqual([]);
  });

  it("routes any other error to onError", async () => {
    const errors: unknown[] = [];
    await spawn(
      async () => {
        throw new Error("boom");
      },
      (error) => {
        errors.push(error);
      },
    );
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
  });
});
```
`src/kernel/spawn.ts`:
```ts
import { AbortError } from "#/kernel/sleep";

/** Fire-and-forget an async loop. Abort is the normal way a loop ends and
 * is silent; any other rejection is routed to `onError` so it surfaces as
 * a stream error exactly the way an RxJS source error would. Returns the
 * settled promise so tests can await it. */
export function spawn(loop: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
  return loop().catch((error: unknown) => {
    if (error instanceof AbortError) {
      return;
    }
    onError(error);
  });
}
```
Run both tests — expected: PASS.

- [ ] **Step 4: Kernel — `Topic<T>` (test first)**

`src/kernel/topic.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { createTopic } from "#/kernel/topic";

describe("Topic", () => {
  it("starts the producer on the first subscriber and aborts it on the last unsubscribe", () => {
    let starts = 0;
    let aborted = false;
    const topic = createTopic<number>(async (signal) => {
      starts += 1;
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
    const a = topic.subscribe(() => {});
    const b = topic.subscribe(() => {});
    expect(starts).toBe(1);
    a();
    expect(aborted).toBe(false);
    b();
    expect(aborted).toBe(true);
  });

  it("multicasts publish() to every subscriber and replays the last value to late subscribers when replay is on", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const seenA: string[] = [];
    topic.subscribe((v) => {
      seenA.push(v);
    });
    topic.publish("x");
    const seenB: string[] = [];
    topic.subscribe((v) => {
      seenB.push(v);
    });
    expect(seenA).toEqual(["x"]);
    expect(seenB).toEqual(["x"]);
  });

  it("forgets the replayed value after teardown", () => {
    const topic = createTopic<string>(async () => {}, { replay: true });
    const stop = topic.subscribe(() => {});
    topic.publish("x");
    stop();
    const seen: string[] = [];
    topic.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([]);
  });

  it("fail() delivers the error to every subscriber and ends the topic", () => {
    const topic = createTopic<number>(async () => {});
    const errors: unknown[] = [];
    topic.subscribe(() => {}, (e) => {
      errors.push(e);
    });
    topic.fail(new Error("boom"));
    expect(errors).toHaveLength(1);
  });
});
```
`src/kernel/topic.ts`:
```ts
import { spawn } from "#/kernel/spawn";

export interface TopicOptions {
  /** Hand the most recent value to late subscribers (shareReplay bufferSize 1). */
  replay?: boolean;
}

/** A hot multicast channel with refCount semantics: the producer starts on
 * the first subscriber and is aborted on the last unsubscribe. This is
 * `shareReplay({ bufferSize: 1, refCount: true })` written once, explicitly,
 * instead of implied by an operator. */
export interface Topic<T> {
  subscribe(next: (value: T) => void, error?: (error: unknown) => void): () => void;
  publish(value: T): void;
  fail(error: unknown): void;
}

interface Subscriber<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
}

export function createTopic<T>(
  producer: (signal: AbortSignal, publish: (value: T) => void) => Promise<void>,
  options: TopicOptions = {},
): Topic<T> {
  const subscribers = new Set<Subscriber<T>>();
  let controller: AbortController | null = null;
  let last: { value: T } | null = null;

  const publish = (value: T): void => {
    if (options.replay === true) {
      last = { value };
    }
    for (const s of [...subscribers]) {
      s.next(value);
    }
  };

  const fail = (error: unknown): void => {
    for (const s of [...subscribers]) {
      s.error(error);
    }
    subscribers.clear();
    controller?.abort();
    controller = null;
    last = null;
  };

  return {
    publish,
    fail,
    subscribe: (next, error = () => {}) => {
      const subscriber: Subscriber<T> = { next, error };
      subscribers.add(subscriber);
      if (last !== null) {
        next(last.value);
      }
      if (controller === null) {
        controller = new AbortController();
        void spawn(() => producer(controller!.signal, publish), fail);
      }
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          controller?.abort();
          controller = null;
          last = null;
        }
      };
    },
  };
}
```
Run — expected: PASS. (`controller!` is the one non-null assertion; if Biome's `noNonNullAssertion` is enabled at error level, capture `const c = new AbortController(); controller = c;` and pass `c.signal`.)

- [ ] **Step 5: Bridge in/out (test first)**

`src/bridge/in.test.ts`:
```ts
import { of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { iterate, once } from "#/bridge/in";

describe("bridge/in", () => {
  it("once() resolves with the first emission", async () => {
    await expect(once(of(7, 8))).resolves.toBe(7);
  });

  it("iterate() yields pushed values in order and stops on abort", async () => {
    const source = new Subject<number>();
    const controller = new AbortController();
    const seen: number[] = [];
    const done = (async () => {
      for await (const v of iterate(source, controller.signal)) {
        seen.push(v);
      }
    })();
    source.next(1);
    source.next(2);
    await Promise.resolve();
    controller.abort();
    await done;
    expect(seen).toEqual([1, 2]);
  });

  it("iterate() ends when the source completes", async () => {
    const seen: number[] = [];
    for await (const v of iterate(of(1, 2, 3), new AbortController().signal)) {
      seen.push(v);
    }
    expect(seen).toEqual([1, 2, 3]);
  });
});
```
`src/bridge/in.ts`:
```ts
import { firstValueFrom, type Observable } from "rxjs";

/** One-shot RPC shape: the first value of an Observable port method. */
export function once<T>(source: Observable<T>): Promise<T> {
  return firstValueFrom(source);
}

/** Pull an Observable as an AsyncIterable with an unbounded queue. Ends on
 * completion, throws on error, and stops (without throwing) on abort — the
 * consuming `for await` simply exits, which is what `spawn` expects. */
export async function* iterate<T>(source: Observable<T>, signal: AbortSignal): AsyncIterable<T> {
  const queue: T[] = [];
  let done = false;
  let failure: { error: unknown } | null = null;
  let wake: (() => void) | null = null;

  const notify = (): void => {
    wake?.();
    wake = null;
  };
  const subscription = source.subscribe({
    next: (value) => {
      queue.push(value);
      notify();
    },
    error: (error: unknown) => {
      failure = { error };
      notify();
    },
    complete: () => {
      done = true;
      notify();
    },
  });
  const onAbort = (): void => {
    done = true;
    notify();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal.aborted) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (failure !== null) {
        throw failure.error;
      }
      if (done) {
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    subscription.unsubscribe();
  }
}
```

`src/bridge/out.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { storeToStateStream, topicToStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";
import { createTopic } from "#/kernel/topic";

describe("bridge/out", () => {
  it("topicToStream() forwards publishes and tears the topic down on unsubscribe", () => {
    let aborted = false;
    const topic = createTopic<number>(async (signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
    const seen: number[] = [];
    const sub = topicToStream(topic).subscribe((v) => {
      seen.push(v);
    });
    topic.publish(1);
    sub.unsubscribe();
    expect(seen).toEqual([1]);
    expect(aborted).toBe(true);
  });

  it("storeToStateStream() carries the current value synchronously", () => {
    const store = createStore(5);
    const seen: number[] = [];
    const sub = storeToStateStream(store).subscribe((v) => {
      seen.push(v);
    });
    store.set(6);
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });
});
```
`src/bridge/out.ts`:
```ts
import { state } from "@rx-state/core";
import { Observable } from "rxjs";

import type { StateStream, Stream } from "@rtc/core-api";

import type { Store } from "#/kernel/store";
import type { Topic } from "#/kernel/topic";

/** The only two places in this package that construct an rxjs Observable.
 * Everything upstream is Topics, Stores and AsyncIterables. */
export function topicToStream<T>(topic: Topic<T>): Stream<T> {
  return new Observable<T>((subscriber) => {
    return topic.subscribe(
      (value) => {
        subscriber.next(value);
      },
      (error) => {
        subscriber.error(error);
      },
    );
  });
}

export function storeToStateStream<S>(store: Store<S>): StateStream<S> {
  const changes = new Observable<S>((subscriber) => {
    return store.subscribe((value) => {
      subscriber.next(value);
    });
  });
  return state(changes, store.get());
}
```
Run: `pnpm --filter @rtc/client-core-async test` — expected: PASS.

- [ ] **Step 6: Delegating composition, parity manifest, drift test, runner**

`src/composition.ts`:
```ts
import { createApp as createRxjsApp, createMachineFactories as createRxjsMachineFactories } from "@rtc/client-core";
import type { App, AppPorts, CoreFactory, MachineFactories, Presenters } from "@rtc/core-api";

/** Members this core implements natively. Empty in slice 0: every member
 * delegates to the RxJS core. `parity.json` is the committed record of the
 * same fact and `parity.test.ts` proves the two agree by reference. */
function nativePresenters(_base: Presenters): Partial<Presenters> {
  return {};
}

export function composeWithBase(ports: AppPorts): { base: App; app: App } {
  const base = createRxjsApp(ports);
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...nativePresenters(base.presenters) },
    dispose: async () => {
      await base.dispose();
    },
  };
  return { base, app };
}

export function createApp(ports: AppPorts): App {
  return composeWithBase(ports).app;
}

export function createMachineFactories(presenters: Presenters): MachineFactories {
  return createRxjsMachineFactories(presenters);
}

export const asyncCore: CoreFactory = { createApp, createMachineFactories };
```

`src/parity.json`:
```json
{
  "core": "@rtc/client-core-async",
  "presenters": {},
  "machines": {}
}
```
with **every** `Presenters` member and every `MachineFactories` member listed as `"delegated"` — the same 57 + 11 keys as the registry in Task 6 Step 3 (e.g. `"priceStream": "delegated"`). The drift test below fails to compile if a key is missing because it iterates `keyof Presenters` through the registry's key list.

`src/parity.test.ts`:
```ts
import { AuthSimulator, PreferencesSimulator } from "@rtc/domain";
import { createSimulatorPorts, InMemorySessionStore, reconnect$ } from "@rtc/client-core";
import { CONTRACT_SUITES, type ContractMember } from "@rtc/core-contract";
import { describe, expect, it } from "vitest";

import { composeWithBase, createMachineFactories } from "#/composition";
import parity from "#/parity.json" with { type: "json" };

type Provenance = "native" | "delegated";

describe("parity manifest", () => {
  const ports = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({ demo: "demo" }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: { events: () => reconnect$ },
  };
  const { base, app } = composeWithBase(ports);
  const baseMachines = createMachineFactories(base.presenters);
  const machines = createMachineFactories(app.presenters);

  it("lists every contract member exactly once", () => {
    const listed = [
      ...Object.keys(parity.presenters).map((k) => `presenters.${k}`),
      ...Object.keys(parity.machines).map((k) => `machines.${k}`),
    ].sort();
    const members = (Object.keys(CONTRACT_SUITES) as ContractMember[])
      .filter((m) => {
        return m !== "commands.reconnect";
      })
      .sort();
    expect(listed).toEqual(members);
  });

  it("matches reality: native members differ from the RxJS instance, delegated ones are it", () => {
    for (const [member, provenance] of Object.entries(parity.presenters) as [keyof typeof base.presenters, Provenance][]) {
      const same = Object.is(app.presenters[member], base.presenters[member]);
      expect(same, `presenters.${member} is marked ${provenance}`).toBe(provenance === "delegated");
    }
    for (const [member, provenance] of Object.entries(parity.machines) as [keyof typeof machines, Provenance][]) {
      const same = Object.is(machines[member], baseMachines[member]);
      expect(same, `machines.${member} is marked ${provenance}`).toBe(provenance === "delegated");
    }
  });
});
```
`tsconfig.json` needs `"resolveJsonModule": true` for the JSON import (add it under `compilerOptions`).

`src/coreContract.test.ts` — identical to Task 6 Step 5's runner but importing `createApp`/`createMachineFactories` from `#/composition` and `createSimulatorPorts`, `InMemorySessionStore`, `reconnect$` from `@rtc/client-core`, with label `"async"`.

`src/index.ts`:
```ts
export { asyncCore, composeWithBase, createApp, createMachineFactories } from "#/composition";
```

- [ ] **Step 7: Run everything, gates, commit**

Run:
```bash
pnpm install
pnpm --filter @rtc/client-core-async build && pnpm --filter @rtc/client-core-async test:coverage
pnpm typecheck && pnpm check:deps && pnpm lint:dead && pnpm check:versions && pnpm check:scripts && pnpm --filter @rtc/tests gates
```
Expected: kernel + bridge + parity + the six contract suites green under label `async`; coverage ≥95%/85%; gate 43 `PASS`; dep-cruiser `bridge-owns-rxjs` no violations.
```bash
git add packages/client-core-async tsconfig.depcruise.json knip.json .dependency-cruiser.cjs tests/scripts/grep-gates.ts pnpm-lock.yaml
git commit -m "feat(client-core-async): async/await core — kernel (Store/Topic/spawn/sleep), rxjs bridge, delegating composition, parity manifest, contract runner"
```

---

### Task 8: `@rtc/client-core-effect` — bridge, delegating composition, parity manifest, runner

**Files:**
- Create: `packages/client-core-effect/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
- Create: `src/index.ts`, `src/bridge/in.ts` (+ test), `src/bridge/out.ts` (+ test), `src/composition.ts`, `src/parity.json`, `src/parity.test.ts`, `src/coreContract.test.ts`
- Modify: `tsconfig.depcruise.json`, `knip.json` (the dep-cruiser rules and grep gate from Task 7 already cover `client-core-(async|effect)`)

**Interfaces:**
- Produces: `effectCore: CoreFactory`; bridge `fromObservable(obs): Stream<T, E>` (Effect stream), `rpc(obs): Effect<T, unknown>`, `streamToStream(runtime, stream): Stream<T>` (core-api envelope), `refToStateStream(runtime, ref): StateStream<S>`; `composeWithBase(ports): { base: App; app: App }`.
- Consumes: `effect` 3.22.2 (`Stream`, `Effect`, `SubscriptionRef`, `ManagedRuntime`, `Layer`, `Fiber`, `Cause`, `TestContext`, `TestClock`).

- [ ] **Step 1: Scaffold**

Same manifest as Task 7 with `"name": "@rtc/client-core-effect"`, `"sideEffects": false`, and `"effect": "^3.22.2"` added to `dependencies`. Before adding, confirm freshness: `pnpm view effect version` must be `3.22.2` or a later version published ≥24 h ago (`pnpm view effect time --json`); pin the caret at whichever qualifies. Same tsconfig (with `"resolveJsonModule": true`), same vitest thresholds, same registries (line pair + knip entry).

- [ ] **Step 2: Bridge in (test first)**

`src/bridge/in.test.ts`:
```ts
import { Chunk, Effect, Stream } from "effect";
import { of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { fromObservable, rpc } from "#/bridge/in";

describe("bridge/in", () => {
  it("rpc() succeeds with the first emission", async () => {
    await expect(Effect.runPromise(rpc(of(7, 8)))).resolves.toBe(7);
  });

  it("fromObservable() yields values in order and ends on completion", async () => {
    const values = await Effect.runPromise(Stream.runCollect(fromObservable(of(1, 2, 3))));
    expect(Chunk.toArray(values)).toEqual([1, 2, 3]);
  });

  it("fromObservable() unsubscribes from the source when the consumer stops", async () => {
    const source = new Subject<number>();
    const program = Stream.runCollect(Stream.take(fromObservable(source), 1));
    const fiber = Effect.runFork(program);
    source.next(1);
    await Effect.runPromise(Effect.fromFiber(fiber));
    expect(source.observed).toBe(false);
  });
});
```
`src/bridge/in.ts`:
```ts
import { Effect, Stream } from "effect";
import type { Observable } from "rxjs";

/** Push an Observable into an Effect Stream. The subscription is acquired
 * when the stream starts and released by the scope finaliser when the
 * consumer stops, completes, or is interrupted. Errors on the Observable
 * fail the stream with the raw error. */
export function fromObservable<T>(source: Observable<T>): Stream.Stream<T, unknown> {
  return Stream.asyncPush<T, unknown>((emit) => {
    return Effect.acquireRelease(
      Effect.sync(() => {
        return source.subscribe({
          next: (value) => {
            emit.single(value);
          },
          error: (error: unknown) => {
            emit.fail(error);
          },
          complete: () => {
            emit.end();
          },
        });
      }),
      (subscription) => {
        return Effect.sync(() => {
          subscription.unsubscribe();
        });
      },
    );
  });
}

/** One-shot RPC shape: the first value of an Observable port method. */
export function rpc<T>(source: Observable<T>): Effect.Effect<T, unknown> {
  return Effect.async<T, unknown>((resume) => {
    const subscription = source.subscribe({
      next: (value) => {
        subscription.unsubscribe();
        resume(Effect.succeed(value));
      },
      error: (error: unknown) => {
        resume(Effect.fail(error));
      },
      complete: () => {
        resume(Effect.fail(new Error("rpc: source completed without a value")));
      },
    });
    return Effect.sync(() => {
      subscription.unsubscribe();
    });
  });
}
```
If `emit.fail` / `emit.end` are named differently on `EmitOpsPush` in 3.22 (check `node_modules/effect/dist/dts/Stream.d.ts` for `EmitOpsPush`), use the names it declares; the test pins the behaviour, not the method names.

- [ ] **Step 3: Bridge out (test first)**

`src/bridge/out.test.ts`:
```ts
import { Effect, Layer, ManagedRuntime, Stream, SubscriptionRef } from "effect";
import { describe, expect, it } from "vitest";

import { refToStateStream, streamToStream } from "#/bridge/out";

describe("bridge/out", () => {
  const runtime = ManagedRuntime.make(Layer.empty);

  it("streamToStream() forwards emissions and completes", async () => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      streamToStream(runtime, Stream.make(1, 2, 3)).subscribe({
        next: (v) => {
          seen.push(v);
        },
        complete: resolve,
      });
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("streamToStream() interrupts the fiber on unsubscribe", async () => {
    let interrupted = false;
    const never = Stream.fromEffect(Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => {
      interrupted = true;
    }))));
    const sub = streamToStream(runtime, never).subscribe(() => {});
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 0));
    expect(interrupted).toBe(true);
  });

  it("refToStateStream() carries the current value synchronously, then changes", async () => {
    const ref = await runtime.runPromise(SubscriptionRef.make(5));
    const seen: number[] = [];
    const sub = refToStateStream(runtime, ref).subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([5]);
    await runtime.runPromise(SubscriptionRef.set(ref, 6));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });
});
```
`src/bridge/out.ts`:
```ts
import { state } from "@rx-state/core";
import { Cause, Effect, Fiber, type ManagedRuntime, Stream, SubscriptionRef } from "effect";
import { Observable } from "rxjs";

import type { StateStream, Stream as CoreStream } from "@rtc/core-api";

type Runtime = ManagedRuntime.ManagedRuntime<never, never>;

/** Run an Effect Stream under each Observable subscribe as a forked fiber;
 * unsubscribe interrupts it. Typed errors are squashed to one `unknown`
 * at this boundary and nowhere else. */
export function streamToStream<T, E>(runtime: Runtime, stream: Stream.Stream<T, E>): CoreStream<T> {
  return new Observable<T>((subscriber) => {
    const fiber = runtime.runFork(
      Stream.runForEach(stream, (value) => {
        return Effect.sync(() => {
          subscriber.next(value);
        });
      }).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            return Effect.sync(() => {
              if (!Cause.isInterruptedOnly(cause)) {
                subscriber.error(Cause.squash(cause));
              }
            });
          },
          onSuccess: () => {
            return Effect.sync(() => {
              subscriber.complete();
            });
          },
        }),
      ),
    );
    return () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };
  });
}

/** A SubscriptionRef as a warm StateStream: the seed is read synchronously
 * with runSync (the warmth guarantee), then `changes` is bridged. */
export function refToStateStream<S>(runtime: Runtime, ref: SubscriptionRef.SubscriptionRef<S>): StateStream<S> {
  const current = runtime.runSync(SubscriptionRef.get(ref));
  return state(streamToStream(runtime, ref.changes), current);
}
```
Run: `pnpm --filter @rtc/client-core-effect test bridge` — expected: PASS. If `refToStateStream`'s test sees `[5, 5, 6]`, `changes` replays the current value too; add `Stream.drop(ref.changes, 1)` in `refToStateStream` and keep the test.

- [ ] **Step 4: Composition, parity, runner**

`src/composition.ts` — same shape as Task 7 Step 6 but the app owns a `ManagedRuntime` so `dispose()` has something to close from day one:
```ts
import { createApp as createRxjsApp, createMachineFactories as createRxjsMachineFactories } from "@rtc/client-core";
import type { App, AppPorts, CoreFactory, MachineFactories, Presenters } from "@rtc/core-api";
import { Layer, ManagedRuntime } from "effect";

function nativePresenters(_base: Presenters, _runtime: ManagedRuntime.ManagedRuntime<never, never>): Partial<Presenters> {
  return {};
}

export function composeWithBase(ports: AppPorts): { base: App; app: App } {
  const base = createRxjsApp(ports);
  const runtime = ManagedRuntime.make(Layer.empty);
  const app: App = {
    ...base,
    presenters: { ...base.presenters, ...nativePresenters(base.presenters, runtime) },
    dispose: async () => {
      await runtime.dispose();
      await base.dispose();
    },
  };
  return { base, app };
}

export function createApp(ports: AppPorts): App {
  return composeWithBase(ports).app;
}

export function createMachineFactories(presenters: Presenters): MachineFactories {
  return createRxjsMachineFactories(presenters);
}

export const effectCore: CoreFactory = { createApp, createMachineFactories };
```
`src/parity.json`, `src/parity.test.ts`, `src/coreContract.test.ts` (label `"effect"`) and `src/index.ts` (exporting `effectCore`) exactly as Task 7 Step 6 with the package name swapped.

- [ ] **Step 5: Run, gates, commit**

Run: `pnpm install && pnpm --filter @rtc/client-core-effect build && pnpm --filter @rtc/client-core-effect test:coverage && pnpm typecheck && pnpm check:deps && pnpm lint:dead && pnpm check:versions && pnpm check:scripts && pnpm --filter @rtc/tests gates`
Expected: green. `pnpm outdated -r` should show `effect` current.
```bash
git add packages/client-core-effect tsconfig.depcruise.json knip.json pnpm-lock.yaml
git commit -m "feat(client-core-effect): Effect-TS core — Observable<->Stream bridge, ManagedRuntime-owning delegating composition, parity manifest, contract runner"
```

---

### Task 9: `VITE_CORE_IMPL` selection in both web clients

**Files:**
- Create: `packages/client-react/src/app/selectCore.ts`, `packages/client-react/src/app/selectCore.test.ts`; same pair under `packages/client-solid/src/app/`
- Modify: `packages/client-react/src/vite-env.d.ts`, `packages/client-solid/src/vite-env.d.ts`, `packages/client-react/src/AppRoot.tsx:3`, `packages/client-solid/src/AppRoot.tsx` (the `@rtc/client-core` import), both clients' `package.json` (dependencies), `turbo.json`, root `package.json` (scripts), `.github/workflows/deploy.yml`, `.dependency-cruiser.cjs` (client rules), `CLAUDE.md` is Task 12

**Interfaces:**
- Produces: `resolveCoreImpl(raw: string | undefined): CoreImpl` (pure, tested); `activeCore: CoreFactory` (module constant, branch folded at build time).

- [ ] **Step 1: Write the failing test (React; the Solid twin is byte-identical)**

`packages/client-react/src/app/selectCore.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { CORE_IMPLS, resolveCoreImpl } from "#/app/selectCore";

describe("resolveCoreImpl", () => {
  it("defaults to rxjs when unset or empty", () => {
    expect(resolveCoreImpl(undefined)).toBe("rxjs");
    expect(resolveCoreImpl("")).toBe("rxjs");
  });

  it("accepts every known implementation", () => {
    for (const impl of CORE_IMPLS) {
      expect(resolveCoreImpl(impl)).toBe(impl);
    }
  });

  it("fails closed on an unknown value", () => {
    expect(() => resolveCoreImpl("rx")).toThrow(/VITE_CORE_IMPL/);
  });
});
```
Run: `pnpm --filter @rtc/client-react test selectCore` — expected: FAIL.

- [ ] **Step 2: Write `selectCore.ts` and the env typing**

`packages/client-react/src/app/selectCore.ts`:
```ts
import { rxjsCore } from "@rtc/client-core";
import { asyncCore } from "@rtc/client-core-async";
import { effectCore } from "@rtc/client-core-effect";
import type { CoreFactory } from "@rtc/core-api";

export const CORE_IMPLS = ["rxjs", "async", "effect"] as const;
export type CoreImpl = (typeof CORE_IMPLS)[number];

/** Fail closed: a typo would otherwise boot RxJS silently, the same failure
 * mode the deploy guard exists to catch for VITE_SERVER_URL. */
export function resolveCoreImpl(raw: string | undefined): CoreImpl {
  if (raw === undefined || raw === "") {
    return "rxjs";
  }
  if ((CORE_IMPLS as readonly string[]).includes(raw)) {
    return raw as CoreImpl;
  }
  throw new Error(`VITE_CORE_IMPL="${raw}" is not one of ${CORE_IMPLS.join(", ")}`);
}

const IMPL = resolveCoreImpl(import.meta.env.VITE_CORE_IMPL);

/** The application core this build boots. `import.meta.env.VITE_CORE_IMPL`
 * is inlined by Vite, so the two dead branches — and the two unused core
 * packages behind them, which declare `sideEffects: false` — are dropped
 * from the production bundle (`pnpm check:core-bundle` proves it). */
export const activeCore: CoreFactory =
  IMPL === "effect" ? effectCore : IMPL === "async" ? asyncCore : rxjsCore;
```
Both `vite-env.d.ts` files become:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_CORE_IMPL?: string;
}
```
(and the `as string | undefined` casts in `buildBrowserPorts.ts` may now be removed — do it; Biome will flag nothing either way.)

In both `AppRoot.tsx` replace `import { createApp, createMachineFactories } from "@rtc/client-core";` with `import { activeCore } from "#/app/selectCore";` and the two calls with `activeCore.createApp(...)` / `activeCore.createMachineFactories(...)`.

Add `"@rtc/client-core-async": "workspace:*"`, `"@rtc/client-core-effect": "workspace:*"`, `"@rtc/core-api": "workspace:*"` to both clients' `dependencies`. In `.dependency-cruiser.cjs` add the two alt cores and `core-api` wherever a client rule allowlists `client-core` (`clients-never-import-each-other` and any client-scoped `pathNot`).

- [ ] **Step 3: Turbo env, scripts, deploy guard**

`turbo.json`: add `"VITE_CORE_IMPL"` to `build.env` and `dev.env`.

Root `package.json` scripts, after `dev:react:fs` and `dev:solid:fs` respectively:
```json
    "dev:react:async": "VITE_CORE_IMPL=async pnpm --filter @rtc/client-react dev",
    "dev:react:effect": "VITE_CORE_IMPL=effect pnpm --filter @rtc/client-react dev",
    "dev:solid:async": "VITE_CORE_IMPL=async pnpm --filter @rtc/client-solid dev",
    "dev:solid:effect": "VITE_CORE_IMPL=effect pnpm --filter @rtc/client-solid dev",
```

`.github/workflows/deploy.yml`: production must stay on RxJS until parity. Add a guard step directly after each `Guard — server URL was inlined into the client bundle` step:
```yaml
      - name: Guard — production ships the RxJS core only
        run: |
          if grep -rq "effect/Fiber" .vercel/output/static; then
            echo "::error::Effect runtime found in the production bundle — VITE_CORE_IMPL must be unset in the Vercel Production env until a core reaches parity."
            exit 1
          fi
          echo "OK: no alternative core in the production bundle."
```

- [ ] **Step 4: Test, typecheck, boot each core once, commit**

Run: `pnpm --filter @rtc/client-react test selectCore && pnpm --filter @rtc/client-solid test selectCore && pnpm typecheck && pnpm check:deps && pnpm lint:dead`
Then a smoke boot per core: `VITE_CORE_IMPL=effect pnpm --filter @rtc/client-react build` and `VITE_CORE_IMPL=async pnpm --filter @rtc/client-solid build` must succeed (the deploy-shaped check is Task 11). Run the existing UI contract tier once, `pnpm --filter @rtc/client-react test:ui:contract`, to prove the `AppRoot` edit changed nothing the fake ViewModel sees.
```bash
git add packages/client-react packages/client-solid turbo.json package.json .github/workflows/deploy.yml .dependency-cruiser.cjs pnpm-lock.yaml
git commit -m "feat(clients): VITE_CORE_IMPL selects the application core (rxjs|async|effect) in both web clients; dev:*:async/effect scripts; prod guard"
```

---

### Task 10: e2e per core — `RTC_CORE_IMPL` forwarding and the CI matrix

**Files:**
- Modify: `tests/scripts/devServer.ts` (spawn env), `tests/browser/playwright/playwright.config.ts` (report suffix), `turbo.json` (`globalPassThroughEnv`), root `package.json` (scripts), `.github/workflows/ci.yml` (new `e2e-alt-cores` job)
- Test: `tests/scripts/devServer.test.ts` if one exists; otherwise the CI run is the test

**Interfaces:**
- Consumes: `RTC_CORE_IMPL` (env, `rxjs|async|effect`, unset = rxjs). Produces `VITE_CORE_IMPL` on the launched Vite server.

- [ ] **Step 1: Forward the env in the dev-server spawn**

`tests/scripts/devServer.ts` — in `spawnDevServer`'s `env` object add:
```ts
      VITE_CORE_IMPL: process.env.RTC_CORE_IMPL ?? "",
```
and export a helper the report path uses:
```ts
export const CORE_IMPL: string = process.env.RTC_CORE_IMPL ?? "rxjs";
```

`tests/browser/playwright/playwright.config.ts` — extend the suffix so parallel cores never share a report directory:
```ts
const isSolid = process.env.RTC_CLIENT_PKG === "@rtc/client-solid";
const coreImpl = process.env.RTC_CORE_IMPL ?? "rxjs";
const reportSuffix = `${isSolid ? "-solid" : ""}${coreImpl === "rxjs" ? "" : `-${coreImpl}`}`;
```
`turbo.json`: add `"RTC_CORE_IMPL"` to `globalPassThroughEnv` (next to `RTC_CLIENT_PKG`).

Root `package.json`:
```json
    "test:e2e:async": "RTC_CORE_IMPL=async pnpm test:e2e",
    "test:e2e:effect": "RTC_CORE_IMPL=effect pnpm test:e2e",
```

- [ ] **Step 2: Add the CI matrix job without renaming the existing one**

The `main` ruleset's required checks reference the existing job name `e2e (browser · presenter · fullstack)`; renaming it would silently drop the required check. Leave that job untouched (it runs RxJS) and add a sibling:
```yaml
  e2e-alt-cores:
    name: e2e (${{ matrix.core }} core · browser · presenter · fullstack)
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        core: [async, effect]
    env:
      RTC_E2E_MAX_PARALLEL: "2"
      RTC_CORE_IMPL: ${{ matrix.core }}
    steps:
      # identical to the e2e job's steps, verbatim, except:
      - name: e2e suite (Playwright + presenter + fullstack)
        run: RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e
      - name: Upload e2e artifacts on failure
        if: failure()
        uses: actions/upload-artifact@<same pinned sha as the e2e job>
        with:
          name: e2e-report-${{ matrix.core }}
          path: |
            tests/reports/
          if-no-files-found: ignore
          retention-days: 7
```
Copy the checkout / setup-node / corepack / store-path / cache / install / playwright-install steps from the `e2e` job verbatim (same pinned action SHAs). Run `pnpm lint:actions` (actionlint) locally.

Tell the user in the PR description that adding `e2e-alt-cores` to the ruleset's required checks is a repo-settings change they make, not the PR.

- [ ] **Step 3: Run locally once per core, commit**

Run: `RTC_CORE_IMPL=effect RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e` (≈8 min) — expected: same pass count as the RxJS run. Then `pnpm lint:actions`.
```bash
git add tests/scripts/devServer.ts tests/browser/playwright/playwright.config.ts turbo.json package.json .github/workflows/ci.yml
git commit -m "test(e2e): RTC_CORE_IMPL runs the Gherkin/Playwright suites per application core; CI e2e-alt-cores matrix"
```

---

### Task 11: `check:core-bundle` — the tree-shaking gate

**Files:**
- Create: `scripts/check-core-bundle.mjs`
- Modify: root `package.json` (script), `.github/workflows/ci.yml` (`checks` job step after `Build`), `packages/client-core-async/src/composition.ts` (brand constant)

**Interfaces:**
- Produces: `pnpm check:core-bundle` — exit 1 if the `rxjs` build of either client contains `effect/Fiber` or `@rtc/client-core-async:brand`, or if the `async` build contains `effect/Fiber`; prints a gzipped-size table for `{react,solid} × {rxjs,async,effect}`.

- [ ] **Step 1: Give the async core a bundle brand**

In `packages/client-core-async/src/composition.ts` add and reference from `asyncCore` so it survives minification:
```ts
/** Survives minification as a literal; `check:core-bundle` greps for it to
 * prove a build that did not select this core did not ship it. */
export const ASYNC_CORE_BRAND = "@rtc/client-core-async:brand";

export const asyncCore: CoreFactory & { readonly brand: string } = {
  brand: ASYNC_CORE_BRAND,
  createApp,
  createMachineFactories,
};
```
(`CoreFactory & { brand }` is still assignable to `CoreFactory`; `selectCore` is unchanged.)

- [ ] **Step 2: Write the script**

`scripts/check-core-bundle.mjs`:
```js
#!/usr/bin/env node
// Builds each web client once per application core into a temp dir and
// asserts a build that selected core X shipped no other core's runtime.
// Report-only for size; a hard gate for leakage.
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const CLIENTS = ["@rtc/client-react", "@rtc/client-solid"];
const CORES = ["rxjs", "async", "effect"];
const MARKERS = {
  effect: "effect/Fiber",
  async: "@rtc/client-core-async:brand",
};

function listJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...listJs(p));
    } else if (entry.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;
const rows = [];
for (const client of CLIENTS) {
  for (const core of CORES) {
    const outDir = mkdtempSync(join(tmpdir(), "rtc-core-bundle-"));
    execSync(`pnpm --filter ${client} exec vite build --outDir ${outDir} --emptyOutDir`, {
      stdio: "inherit",
      env: { ...process.env, VITE_CORE_IMPL: core },
    });
    const files = listJs(outDir);
    const code = files.map((f) => readFileSync(f, "utf8")).join("\n");
    const gz = files.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
    rows.push({ client, core, gzKB: (gz / 1024).toFixed(1) });
    for (const [other, marker] of Object.entries(MARKERS)) {
      const present = code.includes(marker);
      if (other !== core && present) {
        console.error(`FAIL ${client} [${core}] contains the ${other} core (${marker})`);
        failed = true;
      }
      if (other === core && !present) {
        console.error(`FAIL ${client} [${core}] does not contain its own marker (${marker}) — is selectCore wired?`);
        failed = true;
      }
    }
    rmSync(outDir, { recursive: true, force: true });
  }
}
console.table(rows);
process.exit(failed ? 1 : 0);
```
Root `package.json`: `"check:core-bundle": "node scripts/check-core-bundle.mjs"`.

`.github/workflows/ci.yml` `checks` job, directly after the `Prod /devtools/ bundle check` step:
```yaml
      - name: Core bundle isolation (one application core per build)
        run: pnpm check:core-bundle
```

- [ ] **Step 3: `pnpm core:parity` — the manifest table**

`scripts/core-parity.mjs`:
```js
#!/usr/bin/env node
// Prints both alternative cores' parity manifests as one table, for PR
// descriptions and docs/STATUS.md.
import { readFileSync } from "node:fs";

const CORES = ["client-core-async", "client-core-effect"];
const manifests = CORES.map((dir) => JSON.parse(readFileSync(`packages/${dir}/src/parity.json`, "utf8")));
const rows = [];
for (const section of ["presenters", "machines"]) {
  for (const member of Object.keys(manifests[0][section])) {
    rows.push({
      member: `${section}.${member}`,
      async: manifests[0][section][member],
      effect: manifests[1][section][member],
    });
  }
}
const native = (m) => Object.values({ ...m.presenters, ...m.machines }).filter((v) => v === "native").length;
console.table(rows);
console.log(`native: async ${native(manifests[0])}/${rows.length}, effect ${native(manifests[1])}/${rows.length}`);
```
Root `package.json`: `"core:parity": "node scripts/core-parity.mjs"`. Run it once; expected output ends with `native: async 0/68, effect 0/68`.

- [ ] **Step 4: Run, commit**

Run: `pnpm check:core-bundle` — expected: six builds, a table, exit 0. If the `rxjs` build contains `effect/Fiber`, the `sideEffects: false` flag is missing on the alt core's `package.json` or `selectCore` compares a non-literal; fix that, not the marker.
```bash
git add scripts/check-core-bundle.mjs scripts/core-parity.mjs package.json .github/workflows/ci.yml packages/client-core-async/src/composition.ts
git commit -m "ci: check:core-bundle proves each client build ships exactly one application core; core:parity table"
```

---

### Task 12: Documentation — ADR-006, architecture §22, replaceability row, CLAUDE.md, STATUS, gauntlet mapping, spec amendment

**Files:**
- Create: `docs/adr/ADR-006-pluggable-application-core.md`, `docs/architecture/22-pluggable-application-core.md`
- Modify: `docs/architecture.md` (TOC), `docs/architecture/08-replaceability-matrix.md`, `docs/architecture/14-composition-and-wiring.md` (stale `composition.ts:222` → `:561` line references), `CLAUDE.md`, `docs/STATUS.md`, `.claude/commands/rtc/gauntlet.md`, `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`

- [ ] **Step 1: ADR-006**

`docs/adr/ADR-006-pluggable-application-core.md` — sections, with this content:
- **Status:** Accepted 2026-09-12; slice 0 shipped in this PR.
- **Context:** the RxJS `Observable` boundary decision was recorded only in `10-key-design-decisions.md` §10.1; the React↔Solid experiment proved UI replaceability but the application layer had no seam of its own; the bindings consume three types; the 103 UI contract specs cannot witness a swapped core.
- **Decision 1 — `@rtc/core-api` is the contract.** Types only; `Stream<T>` / `StateStream<S>` aliases; one interface per presenter; `CoreFactory`; `App.dispose`.
- **Decision 2 — `Observable` stays the envelope, behind the aliases.** What it cannot carry (backpressure, typed errors) and why that does not matter at a UI edge. The web-standard `Observable` (Chromium 135+, no Firefox/Safari as of 2026-09; `subscribe()` returns `undefined`, `AbortSignal` cancellation, no multicast, no `Symbol.observable`) is the named follow-up: alias flip + bridge edits + polyfill.
- **Decision 3 — bridge-owns-rxjs.** Dep-cruiser `bridge-owns-rxjs` + grep gate 43. Rationale: an "async core" that uses `shareReplay` is RxJS with extra steps.
- **Decision 4 — strangler with a parity manifest.** `parity.json` + reference-inequality drift test; contract = behaviour, manifest = provenance.
- **Decision 5 — `@rtc/core-contract` is the equivalence witness**, plus the e2e matrix; UI contract specs are left alone (why).
- **Consequences:** three new packages, one `selectCore` per web client, production pinned to RxJS by the deploy guard, `check:core-bundle`, Effect 3.22 pinned (4.0 RC), `@effect/vitest` not used (vitest 4 peer).
- **Follow-ups:** slices 1a–8 per the spec; standard `Observable`; Effect 4; RN.

- [ ] **Step 2: Architecture §22 and TOC**

`docs/architecture/22-pluggable-application-core.md` with the nav line format of the other sections (`[◀ 21. …](21-cross-framework-testing.md) · [Architecture Document](../architecture.md)`), a package diagram in mermaid (≤4 boxes per rank: `core-api` on top; `client-core`, `client-core-async`, `client-core-effect` beneath; `core-contract` beside; bindings + clients below, connected by edges), the selection flow (`VITE_CORE_IMPL` → `selectCore` → `activeCore` → `AppRoot`), the three timing guarantees, the contract tier's registry/pending mechanism, and the parity manifest. Validate the mermaid with `mermaid-cli` before committing (GitHub ignores subgraph `direction`).

`docs/architecture.md` — append the §22 TOC block after §21's, listing the section's headings with `github-slugger`-correct anchors; run `pnpm check:doc-links`.

`08-replaceability-matrix.md` — change the *State streams (RxJS + `@rx-state/core`)* row's cost from "High — swap touches ports, simulators, use cases, presenters, machines together" to "Application layer: **pluggable** (§22) — three cores behind `@rtc/core-api`; domain ports/use cases/simulators still RxJS (very high, unchanged)".

`14-composition-and-wiring.md` — replace the stale `composition.ts:222` citation(s) with `composition.ts:561` (verify with `grep -n "export function createApp" packages/client-core/src/composition.ts` at commit time).

- [ ] **Step 3: CLAUDE.md, STATUS, gauntlet, spec**

`CLAUDE.md`:
- Build Commands block: add the four `dev:*:async|effect` lines after the `dev:solid:fs` line, and a one-line note that `VITE_CORE_IMPL=<core>` composes with any transport mode; add `pnpm check:core-bundle`.
- Package Structure block: add `core-api/`, `core-contract/`, `client-core-async/`, `client-core-effect/` rows in the same format, and amend the `client-core/` row to say it implements `@rtc/core-api`.
- A new **Application core rule** paragraph after the Devtools dependency rule: the bridge-owns-rxjs rule, the types-only rule, the parity manifest, and the pointer to ADR-006 / §22.
- Current Status paragraph: one sentence that the application core is pluggable at slice 0 (delegating alt cores), pointing at STATUS.md for the slice backlog.

`docs/STATUS.md`: move the entry to `## 🟡 In progress` with the note "Slice 0 shipped <PR>; next: slice 1a (connection + theme) — both alt cores port `connection`, `themePreference`, `themeSkinPreference`, `viewModePreference`, `powerSaver`, `reconnect` natively; contract suites already green on RxJS." and link both the spec and this plan. Bump `Last updated`.

`.claude/commands/rtc/gauntlet.md`: the command re-reads `ci.yml`; add the mapping lines so the new steps are not `UNMAPPED`: `Core bundle isolation` → `pnpm check:core-bundle` (full tier only, ~1 min, after build); the alt-core contract runners are already covered by `pnpm test`.

Spec amendment: in `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`, replace "`@effect/vitest` is a devDependency confined to this package." with "Timing tests use `effect`'s own `TestContext` / `TestClock` under plain vitest — `@effect/vitest` 0.30 peers on `vitest ^3.2` and the repo is on 4.1.". (The spec header already links this plan.)

- [ ] **Step 4: Doc gates, commit**

Run: `pnpm check:doc-links && pnpm exec biome ci . && pnpm lint:eslint`
```bash
git add docs CLAUDE.md .claude/commands/rtc/gauntlet.md
git commit -m "docs: ADR-006 pluggable application core, architecture §22, replaceability row, CLAUDE.md package/scripts, STATUS → in progress"
```

---

## Slice 0 exit checklist

- [ ] `pnpm build && pnpm typecheck && pnpm test` green at the root.
- [ ] `/rtc:gauntlet full` green (includes `check:core-bundle`).
- [ ] `RTC_CORE_IMPL=async pnpm test:e2e` and `RTC_CORE_IMPL=effect pnpm test:e2e` pass locally with the same counts as RxJS.
- [ ] `pnpm dev:react:effect` and `pnpm dev:solid:async` boot to the login screen in a browser (manual eyeball, one screenshot each in the PR).
- [ ] `parity.json` in both alt cores lists every member as `delegated`; the drift test passes.
- [ ] The PR description states that `e2e-alt-cores` needs adding to the `main` ruleset's required checks (a repo-settings action for the user).
- [ ] Production build unchanged: `VITE_CORE_IMPL` unset → `rxjs` (deploy guard step present).
