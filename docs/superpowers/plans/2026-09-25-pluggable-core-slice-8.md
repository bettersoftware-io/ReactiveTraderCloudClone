# Pluggable Application Core — Slice 8 (closing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End the strangler. Both alternative cores stop delegating to the RxJS core and lose their runtime dependency on `@rtc/client-core`. The shared rxjs-free logic moves to a new `@rtc/core-logic` package. `CoreSeams`, `parity.json` and the drift tests are deleted, and the dep-cruiser rules are tightened.

**Architecture:** There are three PRs, each in its own `--ready` worktree.
- **PR A** extracts `@rtc/core-logic` as a pure move with no behaviour change. It moves 34 files and adds 2 split-outs, and `client-core` re-exports the same public names.
- **PR B** puts the last two module-level seams behind ports. `reconnect$`/`incident$` become a required `AppPorts.connectionIntents` port. Auth-gating the transport becomes native in every core, witnessed by a new `transportGate` contract suite. Today it is done only by the base app, off the base's own `auth` presenter.
- **PR C** deletes the delegation (`composeWithBase`, `CoreSeams`, `parity.json`, the drift and seam tests, `pnpm core:parity`). It tightens `portDiscipline` to an absolute "exactly once", adds the bundle and dependency gates, and closes the docs.

**Tech Stack:** TypeScript 7 (`tsc --build` + `tsc-alias`), pnpm workspaces + turbo, vitest, dependency-cruiser, RxJS 7 (the RxJS core and the bridges only), Effect 3.22.x, Playwright/Cucumber e2e.

**Spec:** `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`. The binding section is "Slice 8 — closing": *"Delegation removed; `client-core` runtime dependency dropped from both alternative cores; shared pure reducers moved to `@rtc/core-logic`; dep-cruiser rules tightened."*

## Global Constraints

- `@rtc/core-api` stays types-only (grep gate 42). It exports no runtime value.
- Outside `bridge/`, an alternative core imports `rxjs`/`@rx-state/core` as types only (`bridge-owns-rxjs`, grep gate 43).
- `@rtc/core-logic` has NO runtime `rxjs`/`@rx-state/core` import anywhere (a new rule). Its runtime deps are `@rtc/domain` and `@rtc/shared` only; it takes `@rtc/core-api` for types. It is shared by all three cores, so an rxjs operator there would put RxJS inside the alternative cores.
- "Runtime dependency dropped" means `@rtc/client-core` moves from `dependencies` to `devDependencies` in both alternative cores. Their tests keep `createSimulatorPorts` / `InMemorySessionStore`. Splitting the adapters out of `client-core` is the spec's named follow-up 5 and is out of scope.
- Production `VITE_CORE_IMPL` stays unset. The RxJS core is still the shipping default.
- Effect stays pinned at `^3.22.2`.
- Behaviour is unchanged except for the one fix PR B's `transportGate` suite measures, and only if it measures red.
- Never edit the primary checkout. Never use bare `git stash`. Never run two builds in one checkout. On `pnpm-lock.yaml` drift, `git checkout` it back.
- Never pipe or filter a Playwright run being judged. Judge it by exit code.
- Every new test is mutation-checked (`pnpm mutation-check <spec.json>`). A survivor is fixed or ledgered.
- Record gauntlet exit codes as `bash -c "$c" > log; e=$?`. Never read `$?` after a `$(…)` substitution (slice 7's false-green trap).
- Review Minors are fixed in the same PR, not deferred (the user's standing instruction).

## Review Focus

1. **WS-real mode on an alternative core.** Signing in through the native `auth` presenter must open the socket. A resumed session must connect at composition. Signing out must close it. Today only the base app gates the transport, off its own `auth`, so this may already be broken. It is pinned by the `transportGate` suite (Task 5).
2. **Reconnect and incident after the port move.** One `commands.reconnect()` must reach `connectionEvents` exactly once in every core. A double merge (harness plus client Subject) or a missed wire both break the connection banner. Pinned in Task 4, Step 1.
3. **`dispose()` after the base is gone.** Each alternative core must now release every port subscription itself. Previously part of that was `base.dispose()`. Pinned by the live-subscription case in Tasks 6/7.
4. **`@rtc/client-core`'s public runtime API is unchanged by the move.** The clients, bindings, ui-contract and devtools import these names from it. Pinned by the export-name snapshot in Task 2.
5. **Bundle isolation.** An async or effect build must no longer carry the RxJS core's composition. Pinned by the new marker in `check:core-bundle` (Task 8).

---

## File Structure

**New package `packages/core-logic/`.** It is laid out like `packages/core-api/`:
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `src/index.ts`.
- `src/layout/…`, `src/presenters/…` and `src/adapters/…`, keeping each moved file's relative path from `packages/client-core/src/`.

**Moved by `git mv`, 33 files plus their co-located `*.test.ts` (and `adapters/authDeps.ts`, the 34th, moved then edited):**

```
adapters/  InMemoryDockLayoutStore.ts InMemoryLayoutPresetStore.ts dockLayoutStore.ts layoutPresetStore.ts
layout/    defaultLayoutPort.ts dockColumn.ts layoutPort.ts layoutPresetCodec.ts layoutPresetsController.ts
           layoutReducer.ts panelInstances.ts workspaceDock.ts workspaceLayoutPersistence.ts workspaceLayoutWrite.ts
presenters/ adminFolds.ts blotterFolds.ts candleStitch.ts eqDrawingsFold.ts eqWorkspaceFold.ts jarvisController.ts
           jarvisDemoScript.ts jarvisDriveCommands.ts jarvisGuideCatalog.ts jarvisPanelsFolds.ts machine.ts
           narratorGate.ts notionalView.ts orderTicketFold.ts panelFrames.ts shallowArrayEquals.ts shellFolds.ts
           staleFlagFold.ts tileExecutionState.ts
```

**Split out of rxjs-mixed files.** The pure half moves and the rxjs half stays in `client-core`:
- `presenters/IncidentMachine.ts` → new `core-logic/src/presenters/incidentFold.ts` (`IncidentEvent`, `reduceIncident`, `incidentConnectionEvent`).
- `presenters/composePanelStream.ts` → new `core-logic/src/presenters/panelStreamDeps.ts` (`PanelStreamDeps`).
- `adapters/authDeps.ts` → `core-logic/src/adapters/authDeps.ts` (`AuthDeps`, `AuthDepsPrimitives`, `createAuthDeps(ports, primitives)`). Its rxjs pieces (`withLoginDelay`, `readPreferenceNow`) stay in `client-core` and are passed in.

This inventory was measured on 2026-09-25 by walking the transitive local imports of every name the alternative cores import from `@rtc/client-core`. Re-run the walk in Task 2 Step 1 before moving anything, in case `main` has moved.

**Deleted in PR C:**
- `packages/client-core-{async,effect}/src/{parity.json,parity.test.ts,composition.seams.test.ts}`
- `packages/client-core/src/__tests__/composition.seams.test.ts`
- `scripts/core-parity.mjs`
- the `core:parity` script
- `CoreSeams` in `packages/client-core/src/composition.ts`

---

# PR A — `@rtc/core-logic` (pure move)

Worktree: `./scripts/new-worktree.sh core-slice-8-a --ready`. PR A also carries this plan and the rulings file `docs/superpowers/plans/2026-09-25-pluggable-core-slice-8-rulings.md`.

### Task 1: Scaffold `@rtc/core-logic` and its gates

**Files:**
- Create: `packages/core-logic/{package.json,tsconfig.json,vitest.config.ts,README.md,src/index.ts,src/index.test.ts}`
- Modify: `.dependency-cruiser.cjs` (new rule `core-logic-stays-pure`), `tests/scripts/grep-gates.ts` (extend gate 43's no-rxjs-value scan to `packages/core-logic/src`), `knip` config if it lists workspaces explicitly, `pnpm-workspace.yaml` only if it enumerates packages
- Test: `packages/core-logic/src/index.test.ts`

**Interfaces:**
- Produces: the workspace package `@rtc/core-logic`. Its `exports` "." → `./dist/index.js`; its `imports` `#/*` → `./src/*`.

- [ ] **Step 1: Copy the manifest shape from `packages/core-api`**

`packages/core-logic/package.json`:

```json
{
  "name": "@rtc/core-logic",
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
    "build": "tsc --build && tsc-alias -p tsconfig.json && node ../../scripts/check-dist.mjs",
    "typecheck": "tsc --noEmit --tsBuildInfoFile .turbo/typecheck.tsbuildinfo",
    "test": "vitest run",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports coverage 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "dependencies": {
    "@rtc/core-api": "workspace:*",
    "@rtc/domain": "workspace:*",
    "@rtc/shared": "workspace:*"
  },
  "devDependencies": {
    "tsc-alias": "1.9.5",
    "vitest": "^4.1.10"
  }
}
```

Copy `tsconfig.json` and `vitest.config.ts` from `packages/core-api/` verbatim. Then add project `references` to `../core-api`, `../domain` and `../shared`, matching how `core-api`'s tsconfig references its own deps. Put a one-paragraph `README.md` stating the purity rule.

- [ ] **Step 2: Write the failing smoke test**

`packages/core-logic/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as coreLogic from "#/index";

describe("@rtc/core-logic", () => {
  it("exports the shared runtime logic every core composes over", () => {
    expect(Object.keys(coreLogic).length).toBeGreaterThan(0);
  });
});
```

Run: `pnpm --filter @rtc/core-logic test`
Expected: FAIL. `src/index.ts` has no exports yet, so the length is 0.

- [ ] **Step 3: Seed `src/index.ts` with the first moved file, `shallowArrayEquals.ts`**

```bash
git mv packages/client-core/src/presenters/shallowArrayEquals.ts packages/core-logic/src/presenters/shallowArrayEquals.ts
git mv packages/client-core/src/presenters/shallowArrayEquals.test.ts packages/core-logic/src/presenters/shallowArrayEquals.test.ts 2>/dev/null || true
```

`src/index.ts`:

```ts
export {
  createShallowArrayMemo,
  shallowArrayEquals,
} from "#/presenters/shallowArrayEquals";
```

In `packages/client-core/package.json`, add `"@rtc/core-logic": "workspace:*"` to `dependencies`. Add a tsconfig reference too. Then point client-core's internal imports of `#/presenters/shallowArrayEquals` at `@rtc/core-logic`, and add a re-export in `packages/client-core/src/index.ts` in the place the old export stood.

Run: `pnpm install --offline && pnpm --filter @rtc/core-logic build && pnpm --filter @rtc/core-logic test`
Expected: PASS.

- [ ] **Step 4: Add the purity rule and its grep twin**

In `.dependency-cruiser.cjs`, next to `bridge-owns-rxjs`:

```js
    {
      name: "core-logic-stays-pure",
      severity: "error",
      comment:
        "@rtc/core-logic is shared by all three application cores: a runtime rxjs import here would put RxJS inside the alternative cores. Types only; its runtime deps are @rtc/domain and @rtc/shared (+ @rtc/core-api for types).",
      from: { path: "^packages/core-logic/src", pathNot: "\\.test\\.ts$" },
      to: {
        path: "node_modules/(rxjs|@rx-state)/|^packages/(client-|react-|solid-|server|devtools|ui-contract|core-contract|agent-tools|ws-effects)",
        dependencyTypesNot: ["type-only"],
      },
    },
```

In `tests/scripts/grep-gates.ts`, find gate 43 (search the file for `43`). Add `packages/core-logic/src` to its scanned roots, and give that root no `bridge/` exemption.

- [ ] **Step 5: Prove both gates bite**

```bash
printf 'import { map } from "rxjs";\nexport const probe = map;\n' > packages/core-logic/src/probe.ts
pnpm check:deps; echo "deps=$?"; pnpm --filter @rtc/tests gates; echo "gates=$?"
rm packages/core-logic/src/probe.ts
pnpm check:deps; echo "deps=$?"; pnpm --filter @rtc/tests gates; echo "gates=$?"
```

Expected: the first pair is non-zero and names `core-logic-stays-pure` and gate 43. The second pair is `0`.

- [ ] **Step 6: Wire the package to every gate**

Run: `pnpm check:scripts && pnpm lint:dead && pnpm typecheck`
Expected: all exit 0. If `check:scripts` names a missing script or turbo wiring, add it and re-run. Every package is wired to every gate.

- [ ] **Step 7: Commit**

```bash
git add packages/core-logic packages/client-core .dependency-cruiser.cjs tests/scripts/grep-gates.ts pnpm-lock.yaml
git commit -m "feat(core-logic): scaffold @rtc/core-logic with its purity gates"
```

Only commit `pnpm-lock.yaml` if the new workspace package's own importer entry changed. Any other lockfile drift gets `git checkout pnpm-lock.yaml`.

### Task 2: Move the shared logic into `@rtc/core-logic`

**Files:**
- Move: the 32 files listed under File Structure that Task 1 did not move, plus `adapters/authDeps.ts`, with their co-located tests
- Create: `packages/core-logic/src/presenters/incidentFold.ts`, `packages/core-logic/src/presenters/panelStreamDeps.ts`
- Modify: `packages/core-logic/src/adapters/authDeps.ts` (after the move), `packages/client-core/src/presenters/IncidentMachine.ts`, `packages/client-core/src/presenters/composePanelStream.ts`, `packages/client-core/src/composition.ts`, `packages/client-core/src/index.ts`, and every `client-core` file importing a moved module
- Test: `packages/client-core/src/publicApi.test.ts` (new), plus the moved tests, unedited except import paths

**Interfaces:**
- Produces:
  - `@rtc/core-logic` exports every name `client-core` exported from the moved files. `client-core/src/index.ts` re-exports those same names, so its public API is unchanged.
  - `export interface AuthDepsPrimitives { readNow<T>(source: Stream<T>, fallback: T): T; delayAuth(auth: AuthPort, delayMs: () => number): AuthPort }`
  - `export function createAuthDeps(ports: AppPorts, primitives: AuthDepsPrimitives): AuthDeps`

- [ ] **Step 1: Pin `client-core`'s runtime API before touching it**

`packages/client-core/src/publicApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as clientCore from "#/index";

/** The move to @rtc/core-logic must not change what @rtc/client-core
 * exports at runtime: the clients, bindings, ui-contract and devtools all
 * import these names from it. Type exports are covered by their typecheck. */
describe("@rtc/client-core public runtime API", () => {
  it("is unchanged by the core-logic extraction", () => {
    expect(Object.keys(clientCore).sort()).toMatchSnapshot();
  });
});
```

Run: `pnpm --filter @rtc/client-core exec vitest run src/publicApi.test.ts`
Expected: PASS, writing the snapshot. Commit the snapshot before any move: `git add packages/client-core/src/publicApi.test.ts packages/client-core/src/__snapshots__ && git commit -m "test(client-core): pin the public runtime API before the core-logic move"`.

Then re-run the transitive-import walk that produced the File Structure list. It lives in the session scratchpad as `closure.cjs`, and is easy to recreate: start from every name `packages/client-core-{async,effect}/src/**/*.ts` (non-test) imports from `@rtc/client-core`, find the defining file, and follow the local imports. If the list differs from File Structure, ledger the difference as a ruling.

- [ ] **Step 2: Split the three rxjs-mixed files**

Create `packages/core-logic/src/presenters/incidentFold.ts`. Move the `IncidentEvent` type, `reduceIncident` and `incidentConnectionEvent` verbatim, with their imports, out of `client-core/src/presenters/IncidentMachine.ts`. `IncidentMachine.ts` then imports and re-exports them:

```ts
import {
  type IncidentEvent,
  incidentConnectionEvent,
  reduceIncident,
} from "@rtc/core-logic";

export type { IncidentEvent };
export { incidentConnectionEvent, reduceIncident };
```

Create `packages/core-logic/src/presenters/panelStreamDeps.ts` holding `PanelStreamDeps` verbatim. It takes the four domain port types from `@rtc/domain`. `composePanelStream.ts` imports it from `@rtc/core-logic` and re-exports it with `export type { PanelStreamDeps }`.

Move `adapters/authDeps.ts` with `git mv`. Then replace its two rxjs imports with an injected primitives bag:

```ts
import type { AppPorts, LoginWaitCycle, SessionStore, Stream } from "@rtc/core-api";
import {
  type AuthPort,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  LOGIN_WAIT_DELAY_MS,
  type LoginWaitStyle,
  type LoginWaitVariant,
} from "@rtc/domain";

/** What an `auth` presenter is built from, in every core. */
export interface AuthDeps {
  readonly auth: AuthPort;
  readonly store: SessionStore;
  readonly cycle: LoginWaitCycle;
}

/** The two stream operations the auth wiring needs, supplied by each core
 * from the place it keeps its stream code (the RxJS core's adapters, an
 * alternative core's `bridge/`), so this rule stays rxjs-free. */
export interface AuthDepsPrimitives {
  /** A replay-current preference stream's value now, or `fallback`. */
  readNow<T>(source: Stream<T>, fallback: T): T;
  /** `auth`, with each outcome held back by `delayMs()` (read per attempt). */
  delayAuth(auth: AuthPort, delayMs: () => number): AuthPort;
}
```

Keep the body of `createAuthDeps` and its long doc comment verbatim. Make only two changes: the signature becomes `createAuthDeps(ports: AppPorts, primitives: AuthDepsPrimitives): AuthDeps`, and each `readPreferenceNow(` / `withLoginDelay(` call becomes `primitives.readNow(` / `primitives.delayAuth(`. In `client-core/src/composition.ts`, the call becomes:

```ts
const authDeps = createAuthDeps(ports, {
  readNow: readPreferenceNow,
  delayAuth: withLoginDelay,
});
```

- [ ] **Step 3: Move the rest with `git mv`, then fix imports**

For each of the remaining 32 files, and each co-located `*.test.ts` that exists:

```bash
f=layout/workspaceDock.ts   # repeat per file
git mv packages/client-core/src/$f packages/core-logic/src/$f
t=${f%.ts}.test.ts; [ -f packages/client-core/src/$t ] && git mv packages/client-core/src/$t packages/core-logic/src/$t
```

Inside `core-logic`, the `#/…` paths stay valid, because the relative layout is preserved. Inside `client-core`, rewrite each `#/<moved path>` import to `@rtc/core-logic`. Add each moved export to `core-logic/src/index.ts`. Change `client-core/src/index.ts` to re-export the same names from `@rtc/core-logic`, keeping its section comments.

Run: `pnpm --filter @rtc/core-logic build && pnpm --filter @rtc/core-logic test && pnpm --filter @rtc/client-core typecheck && pnpm --filter @rtc/client-core exec vitest run`
Expected: PASS, including `publicApi.test.ts` against its committed snapshot. A snapshot diff means a name was dropped or added: fix the re-export and never update the snapshot.

- [ ] **Step 4: Prove the snapshot bites**

Delete one re-exported value name, e.g. `reduceIncident`, from `client-core/src/index.ts` and run `publicApi.test.ts`. Expected: FAIL. Then restore it.

- [ ] **Step 5: Full gauntlet for the move**

Run the fast `/rtc:gauntlet` gates, plus `pnpm typecheck`, `pnpm test` and `pnpm build`, recording each exit as `bash -c "$c" > log; e=$?`.
Expected: every exit is 0. knip may flag a now-unused `client-core` re-export: keep it only if the snapshot lists it, otherwise remove it and re-pin.

- [ ] **Step 6: Commit**

```bash
git add -A packages/core-logic packages/client-core
git commit -m "refactor(core-logic): move the shared rxjs-free logic out of client-core"
```

### Task 3: Point the alternative cores at `@rtc/core-logic`

**Files:**
- Modify: every non-test file under `packages/client-core-{async,effect}/src` that imports a moved name from `@rtc/client-core`; both cores' `package.json` (add `@rtc/core-logic`); both cores' `bridge/` (add `authDepsPrimitives`); both `composition.ts` (`createAuthDeps(ports, authDepsPrimitives)`)
- Test: `packages/client-core-{async,effect}/src/bridge/authDepsPrimitives.test.ts` (new)

**Interfaces:**
- Consumes: `AuthDepsPrimitives`, `createAuthDeps(ports, primitives)` from Task 2
- Produces: `export const authDepsPrimitives: AuthDepsPrimitives` in each core's `bridge/`. After this task, the ONLY `@rtc/client-core` imports left in non-test alt-core source are `createApp`, `createMachineFactories`, `CoreSeams`, `reconnect$` and `incident$`.

- [ ] **Step 1: Write the failing primitives test (async; the Effect one is the same file with its own import)**

`packages/client-core-async/src/bridge/authDepsPrimitives.test.ts`:

```ts
import { BehaviorSubject, firstValueFrom, NEVER, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { AuthOutcome, AuthPort } from "@rtc/domain";

import { authDepsPrimitives } from "#/bridge/authDepsPrimitives";

describe("authDepsPrimitives", () => {
  it("readNow returns a replay-current stream's value synchronously", () => {
    expect(authDepsPrimitives.readNow(new BehaviorSubject("pinned"), "fallback")).toBe("pinned");
  });

  it("readNow falls back when the stream has no current value", () => {
    expect(authDepsPrimitives.readNow(NEVER, "fallback")).toBe("fallback");
  });

  it("delayAuth holds the outcome back by the delay read per attempt", async () => {
    vi.useFakeTimers();
    const outcome: AuthOutcome = { status: "rejected", reason: "bad-credentials" };
    const auth = createFakeAuth(outcome);
    let delayMs = 800;
    const delayed = authDepsPrimitives.delayAuth(auth, () => delayMs);
    const settled = vi.fn();
    void firstValueFrom(delayed.login("u", "p")).then(settled);
    await vi.advanceTimersByTimeAsync(799);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(outcome);
    delayMs = 0;
    expect(await firstValueFrom(delayed.login("u", "p"))).toBe(outcome);
    vi.useRealTimers();
  });
});

function createFakeAuth(outcome: AuthOutcome): AuthPort {
  return { ...stubAuthPort(), login: () => of(outcome) };
}
```

Before writing `stubAuthPort` and the outcome literal, read `AuthPort` and `AuthOutcome` in `packages/domain/src` and `withLoginDelay` in `client-core/src/adapters/delayedAuthPort.ts`. Then match the real method names and the real "delay 0 passes through" behaviour. If they differ from the sketch above, rule on it and ledger it.

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/bridge/authDepsPrimitives.test.ts`
Expected: FAIL: cannot resolve `#/bridge/authDepsPrimitives`.

- [ ] **Step 2: Implement the primitives in each bridge**

`packages/client-core-async/src/bridge/authDepsPrimitives.ts` (the Effect twin imports `peek` from `#/bridge/peek`):

```ts
import type { AuthDepsPrimitives } from "@rtc/core-logic";

import { peek } from "#/bridge/in";
import { withLoginDelay } from "#/bridge/loginDelay";

/** The auth wiring's two stream operations, from this core's bridge (the only
 * place it may use rxjs at runtime). */
export const authDepsPrimitives: AuthDepsPrimitives = {
  readNow: peek,
  delayAuth: withLoginDelay,
};
```

`bridge/loginDelay.ts` in each core holds a verbatim copy of `client-core/src/adapters/delayedAuthPort.ts`'s `withLoginDelay` (50 lines of rxjs). A bridge may use rxjs; `core-logic` may not. Ledger the copy as a ruling. The follow-up that would share it is the adapters split (spec follow-up 5).

Run the Step 1 test in both cores. Expected: PASS.

- [ ] **Step 3: Rewrite the alt-core imports**

In every non-test file of both cores, move each moved name from `@rtc/client-core` to `@rtc/core-logic`. `composition.ts` calls `createAuthDeps(ports, authDepsPrimitives)`. Add `"@rtc/core-logic": "workspace:*"` to both `package.json` `dependencies`, plus tsconfig references.

Verify with the inventory script from Task 2 Step 1:

Run: `node <scratchpad>/inv.cjs src`
Expected: VALUE imports are exactly `createApp createMachineFactories incident$ reconnect$`, and TYPE-only is exactly `CoreSeams`.

- [ ] **Step 4: Mutation-check the new tests**

`<scratchpad>/m-3.json`:

```json
[
  {"file": "packages/client-core-async/src/bridge/authDepsPrimitives.ts", "find": "readNow: peek,", "replace": "readNow: (_s, fallback) => fallback,", "test": "pnpm --filter @rtc/client-core-async exec vitest run src/bridge/authDepsPrimitives.test.ts"},
  {"file": "packages/client-core-async/src/bridge/authDepsPrimitives.ts", "find": "delayAuth: withLoginDelay,", "replace": "delayAuth: (auth) => auth,", "test": "pnpm --filter @rtc/client-core-async exec vitest run src/bridge/authDepsPrimitives.test.ts"},
  {"file": "packages/client-core-effect/src/bridge/authDepsPrimitives.ts", "find": "readNow: peek,", "replace": "readNow: (_s, fallback) => fallback,", "test": "pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/authDepsPrimitives.test.ts"},
  {"file": "packages/client-core-effect/src/bridge/authDepsPrimitives.ts", "find": "delayAuth: withLoginDelay,", "replace": "delayAuth: (auth) => auth,", "test": "pnpm --filter @rtc/client-core-effect exec vitest run src/bridge/authDepsPrimitives.test.ts"}
]
```

Run: `pnpm mutation-check <scratchpad>/m-3.json`
Expected: 4/4 KILLED.

- [ ] **Step 5: The PR A gate: full gauntlet plus e2e on all three cores**

Run `/rtc:gauntlet full`, then `pnpm test:e2e`, `pnpm test:e2e:async` and `pnpm test:e2e:effect`, one at a time and unpiped.
Expected: every exit is 0. The runners report the same case counts as on `main` (`coreContract.test.ts` in each core).

- [ ] **Step 6: Commit, open PR A, ship**

```bash
git add -A packages/client-core-async packages/client-core-effect pnpm-lock.yaml
git commit -m "refactor(core-async,core-effect): import the shared logic from @rtc/core-logic"
```

Add the plan and a rulings file started from the ledger. Open the PR, dispatch ONE independent reviewer (read-only, foreground-only brief), fix every finding including the Minors, and ship with the standing flow: CI green on the head SHA, CodeQL 0 open alerts, `gh pr merge --merge --subject "Merge PR #N: …"`, the ancestor check, worktree and branch removal, then a fast-forward of the primary checkout.

---

# PR B — the last seams become ports

Worktree: `./scripts/new-worktree.sh core-slice-8-b --ready`, cut from `main` after PR A merges.

### Task 4: `AppPorts.connectionIntents` replaces the `reconnect$` / `incident$` imports

**Files:**
- Modify: `packages/core-api/src/app.ts` (new `ConnectionIntentsPort`; required `AppPorts.connectionIntents`), `packages/core-api/src/index.ts`
- Modify: `packages/client-core/src/composition.ts` (export `connectionIntentsPort`; `commands.reconnect` and `incident` call `ports.connectionIntents`), `packages/client-core/src/adapters/portFactory.ts` (or wherever `createSimulatorPorts` is built; it supplies `connectionIntents: connectionIntentsPort`)
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts`, `packages/client-solid/src/app/buildBrowserPorts.ts`, `packages/client-react-native/src/app/buildNativePorts.ts`, `tests/presenter/scenarios/_buildApp.ts` (each supplies `connectionIntents: connectionIntentsPort`)
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts` (a recording port that feeds `connection$`), both alt cores' `bridge/out.ts` (delete `pushReconnectIntent` / `pushIncidentEvent`), both cores' `commands.ts` and `incident` machine
- Test: `packages/core-contract/src/harness/scriptedPorts.test.ts` (new cases), the existing reconnect/incident contract suites

**Interfaces:**
- Produces:
  ```ts
  /** The user's and the admin console's pushes into the connection-event
   * stream. The client builds it and merges what it carries into
   * `connectionEvents`, so a core never imports a module-level Subject. */
  export interface ConnectionIntentsPort {
    reconnect(): void;
    injectIncident(event: ConnectionEvent): void;
  }
  ```
  - `AppPorts.connectionIntents: ConnectionIntentsPort` (required).
  - `client-core` exports `connectionIntentsPort: ConnectionIntentsPort`, backed by the existing module `reconnect$` / `incident$`. Those Subjects stay in `client-core` as adapters, because the clients still merge them.
  - Harness: `driver.connectionIntentCalls(): { reconnect: number; injectIncident: number }`.

- [ ] **Step 1: Write the failing harness test: exactly one event per intent**

Append to `packages/core-contract/src/harness/scriptedPorts.test.ts`:

```ts
describe("connectionIntents", () => {
  it("delivers one reconnect event per reconnect() on the merged stream", () => {
    const { ports, driver } = createScriptedFixture();
    const seen: ConnectionEvent[] = [];
    const sub = driver.connectionEvents$().subscribe((e) => {
      seen.push(e);
    });
    ports.connectionIntents.reconnect();
    expect(seen).toEqual([{ type: "reconnect" }]);
    expect(driver.connectionIntentCalls()).toEqual({ reconnect: 1, injectIncident: 0 });
    sub.unsubscribe();
  });

  it("delivers an injected incident event verbatim, once", () => {
    const { ports, driver } = createScriptedFixture();
    const seen: ConnectionEvent[] = [];
    const sub = driver.connectionEvents$().subscribe((e) => {
      seen.push(e);
    });
    const event: ConnectionEvent = { type: "gatewayDisconnected" };
    ports.connectionIntents.injectIncident(event);
    expect(seen).toEqual([event]);
    sub.unsubscribe();
  });
});
```

`createScriptedFixture` is whatever factory the file already uses to build `scriptPorts(base)`. Reuse it, and add a `create*` factory below the cases if none exists. Take the `ConnectionEvent` variants from `@rtc/domain`, using the variant names that actually exist.

Run: `pnpm --filter @rtc/core-contract exec vitest run src/harness/scriptedPorts.test.ts`
Expected: FAIL. `connectionIntents` is not on `AppPorts`, so this is a type error at build time or `undefined` at runtime.

- [ ] **Step 2: Add the port type and the harness implementation**

Add `ConnectionIntentsPort` to `core-api/src/app.ts` with the doc above, and `connectionIntents: ConnectionIntentsPort;` to `AppPorts` directly after `connectionEvents`. In `scriptPorts`, override it with a recorder:

```ts
  const intentCalls = { reconnect: 0, injectIncident: 0 };
  const connectionIntents: ConnectionIntentsPort = {
    reconnect: () => {
      intentCalls.reconnect += 1;
      connection$.next({ type: "reconnect" });
    },
    injectIncident: (event: ConnectionEvent) => {
      intentCalls.injectIncident += 1;
      connection$.next(event);
    },
  };
```

Put it in the returned ports, and add `connectionIntentCalls: () => ({ ...intentCalls })` to the driver. The harness now OWNS the merge. Replace the comment about "the RxJS core's `reconnect$`" in `ScriptedDriver.connectionEvents$`'s doc accordingly.

Run the Step 1 test. Expected: PASS.

- [ ] **Step 3: Wire every core and every port builder**

- **`client-core`:** export `const connectionIntentsPort: ConnectionIntentsPort = { reconnect: () => reconnect$.next({ type: "reconnect" }), injectIncident: (e) => incident$.next(e) };`. `commands.reconnect` calls `ports.connectionIntents.reconnect()`. The incident machine's `pushConnectionEvent` calls `ports.connectionIntents.injectIncident`. `createSimulatorPorts` supplies `connectionIntents: connectionIntentsPort`.
- **Alternative cores:** replace `pushReconnectIntent()` / `pushIncidentEvent(e)` with `ports.connectionIntents.reconnect()` / `.injectIncident(e)`. Pass `ports` or the port into `commands.ts` and the incident machine. Delete both functions and their tests from `bridge/out.ts`. This drops the last `reconnect$` / `incident$` imports.
- **Port builders:** run `pnpm typecheck`. Every `AppPorts` literal missing the member is a compile error. Add `connectionIntents: connectionIntentsPort` to `buildBrowserPorts` (both clients), `buildNativePorts` and `_buildApp.ts`, and to any other builder the typecheck names. Builders that spread `createSimulatorPorts()` inherit it.

Run: `pnpm typecheck && pnpm test`
Expected: exit 0. The reconnect and incident contract suites stay green in all three runners, and now observe through the port.

- [ ] **Step 4: Mutation-check**

`<scratchpad>/m-4.json` holds 4 rows. In each core's `commands.ts`, and in the RxJS `composition.ts`, one row replaces the `connectionIntents.reconnect()` call with a no-op; the test is that core's `coreContract.test.ts` (or `composition.coreContract.test.ts`). One further row mutates the harness's `connection$.next({ type: "reconnect" })` to push nothing; its test is `scriptedPorts.test.ts`.

Run: `pnpm mutation-check <scratchpad>/m-4.json`
Expected: 4/4 KILLED. If a core's reconnect mutant survives, its contract suite does not observe the reconnect event, so strengthen the suite in `core-contract` in this task.

- [ ] **Step 5: Verify, then commit**

Run: `node <scratchpad>/inv.cjs src`
Expected: VALUE imports are `createApp createMachineFactories` only.

```bash
git add -A && git commit -m "feat(core-api): AppPorts.connectionIntents replaces the reconnect\$/incident\$ imports"
```

### Task 5: `transportGate`, a new cross-member contract suite; native in every core

**Files:**
- Create: `packages/core-contract/src/suites/transportGate.ts`
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts` (scripted `transport` + `driver.transportCalls()`), the cross-member suite list the three runners iterate (where `portDiscipline` is registered)
- Modify: `packages/client-core-{async,effect}/src/composition.ts` (native gate over the native `auth`; the base receives `{ ...ports, transport: undefined }`), each core's `bridge/` (the gate subscription)
- Test: the suite itself, run by all three runners

**Interfaces:**
- Consumes: `AuthGatedTransport { connect(): void; disconnect(): void }` (core-api `adapters.ts`), `AppPorts.transport?`
- Produces: `driver.transportCalls(): readonly ("connect" | "disconnect")[]`. `makeHarness({ transport: true, resumedSession?: boolean })` seeds.

- [ ] **Step 1: Script the transport in the harness**

When `makeHarness` is called with `transport: true`, `scriptPorts` supplies:

```ts
  const transportLog: ("connect" | "disconnect")[] = [];
  const transport: AuthGatedTransport = {
    connect: () => {
      transportLog.push("connect");
    },
    disconnect: () => {
      transportLog.push("disconnect");
    },
  };
```

and `driver.transportCalls = () => [...transportLog]`. For `resumedSession: true`, the harness seeds the session store with a valid stored session before composition. Use the same mechanism the existing `auth` suite uses for its resumed case; read that suite first.

- [ ] **Step 2: Write the suite**

`packages/core-contract/src/suites/transportGate.ts` follows `portDiscipline`'s registration shape and has these cases:

1. **No stored session:** nothing connects at composition. `transportCalls()` is `[]`.
2. **A resumed session connects at composition, synchronously:** `["connect"]` right after `makeHarness`.
3. **Signing in through `app.presenters.auth` connects once:** drive a successful login with the existing auth driver verbs, `settle()`, and expect `["connect"]`.
4. **Signing out disconnects:** after case 3, log out, and expect `["connect", "disconnect"]`.
5. **A repeated authenticated state does not reconnect:** after case 3, any further `auth` state change that stays authenticated leaves the log at `["connect"]`. Use lock/unlock only if the auth suite shows it stays "authenticated". Otherwise use the existing verb that re-emits an authenticated state, and ledger which one.

Run: `pnpm --filter @rtc/client-core exec vitest run src/composition.coreContract.test.ts -t transportGate`
Expected: PASS on the RxJS core, which is the reference.

Run the same `-t transportGate` filter in both alternative cores' `coreContract.test.ts`.
Expected: MEASURE. Two measurements count as evidence of the latent bug: case 3 fails, because the base's `auth` never sees a native login, or case 2 double-connects. Ledger the exact outcome either way.

- [ ] **Step 3: Gate natively in each alternative core**

In each alternative core's bridge, add the twin of `gateTransportOnAuth`. It subscribes to the NATIVE `auth.state$`, maps to `status === "authenticated"`, keeps distinct values, and calls `connect`/`disconnect`. It is released by the core's lifetime (async: the `AbortSignal`; Effect: the host scope). In `composition.ts`, call it after the native presenters exist, and hand the base `{ ...ports, transport: undefined }` so exactly one gate exists until PR C deletes the base.

Run the three `-t transportGate` commands. Expected: all PASS.

- [ ] **Step 4: Mutation-check**

`<scratchpad>/m-5.json` holds one row per alternative core per mutant:
- drop `distinctUntilChanged` (or its equivalent), which case 5 must kill;
- swap `connect`↔`disconnect`, which cases 2–4 must kill;
- restore `transport` to the base's ports (`transport: undefined` → `transport: ports.transport`), which case 2 must kill by double-connecting.

Run: `pnpm mutation-check <scratchpad>/m-5.json`
Expected: all KILLED. A survivor gets a new case or a ledgered ruling.

- [ ] **Step 5: The PR B gate, then ship**

Run `/rtc:gauntlet full` and the three e2e legs, unpiped and one at a time. Also run one manual WS smoke per alternative core: `VITE_CORE_IMPL=async pnpm dev:react:fs`, sign in as `demo` / `mcdc2026`, and check that live prices stream. Then repeat with `effect`. Report what was seen.

```bash
git add -A && git commit -m "feat(core-contract): transportGate suite; the alternative cores gate the transport on their native auth"
```

Update the rulings file, open PR B, one reviewer, fix every finding, and ship with the standing flow.

---

# PR C — delegation removed

Worktree: `./scripts/new-worktree.sh core-slice-8-c --ready`, cut from `main` after PR B merges.

### Task 6: The async core stands alone

**Files:**
- Modify: `packages/client-core-async/src/composition.ts`, `packages/client-core-async/src/index.ts`, `packages/client-core-async/package.json`
- Delete: `packages/client-core-async/src/{parity.json,parity.test.ts,composition.seams.test.ts}`
- Modify: `packages/client-core-async/src/composition.dispose.test.ts`, `composition.machineFactories.test.ts`
- Test: `packages/client-core-async/src/composition.dispose.test.ts` (new case)

**Interfaces:**
- Produces: `createApp(ports: AppPorts): App` and `createMachineFactories(presenters: Presenters): MachineFactories`, both built only from native members. `composeWithBase` and `ComposedApp` no longer exist.

- [ ] **Step 1: Write the failing dispose case**

Add to `composition.dispose.test.ts`:

```ts
it("releases every port subscription it holds on dispose, with no base app behind it", async () => {
  const counted = createCountingSimulatorPorts();
  const app = createApp(counted.ports);
  const sub = app.presenters.priceStream.price$("EURUSD").subscribe(() => {});
  sub.unsubscribe();
  await app.dispose();
  expect(counted.liveSubscriptions()).toBe(0);
});
```

`createCountingSimulatorPorts` wraps `createSimulatorPorts()` and counts live subscriptions per port stream. Reuse the shared `countSubscriptions` helper the seam witnesses already use: find it with `grep -rn countSubscriptions packages/client-core-async/src`. It moves here from the deleted `composition.seams.test.ts` if that is its only home.

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/composition.dispose.test.ts`
Expected: FAIL today. The base app's own presenters hold port subscriptions that `app.dispose()` releases only through `base.dispose()`, and they are counted here. If it PASSES instead, keep it as the regression pin and ledger that the base held nothing.

- [ ] **Step 2: Delete the delegation**

In `composition.ts`:
- delete the `createRxjsApp` / `createRxjsMachineFactories` imports, `ComposedApp`, `composeWithBase`, the `seams` literal and the `{ ...ports, transport: undefined }` hand-off;
- `createApp` builds `native` and `family` and returns `{ presenters: { ...native, ...family.workspace.presenters, jarvis, jarvisDriver, jarvisDemo, jarvisUsage }, ports, commands, dispose }`, where `dispose` calls `family.jarvis.dispose()` then `lifetime.abort()`;
- `createMachineFactories(presenters)` returns `nativeMachines(presenters)`.

`App.presenters: Presenters` makes the typecheck the completeness witness: a member that was only ever supplied by `...base.presenters` is a compile error.

Delete `parity.json`, `parity.test.ts` and `composition.seams.test.ts`. In `package.json`, move `@rtc/client-core` from `dependencies` to `devDependencies`.

Run: `pnpm --filter @rtc/client-core-async typecheck && pnpm --filter @rtc/client-core-async test`
Expected: PASS, including Step 1's case and the full contract runner.

- [ ] **Step 3: Mutation-check Step 1's case**

Mutant: `dispose`'s `lifetime.abort();` → `` (removed). Expected: KILLED.

- [ ] **Step 4: Commit**

```bash
git add -A packages/client-core-async && git commit -m "feat(core-async): the async core stands alone — no base app, no parity manifest"
```

### Task 7: The Effect core stands alone

**Files:**
- Modify: `packages/client-core-effect/src/composition.ts`, `packages/client-core-effect/src/index.ts`, `packages/client-core-effect/package.json`, `packages/client-core-effect/src/layers.ts` if it reads the base
- Delete: `packages/client-core-effect/src/{parity.json,parity.test.ts,composition.seams.test.ts}`
- Test: `packages/client-core-effect/src/composition.dispose.test.ts` (the same new case as Task 6)

**Interfaces:**
- Produces: the same two factories as Task 6. `app.dispose()` disposes the `ManagedRuntime` and the child hosts only.

- [ ] **Step 1: Write the failing dispose case**

Write Task 6 Step 1's test verbatim against `#/composition`.

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/composition.dispose.test.ts`
Expected: FAIL, or PASS-and-ledger, exactly as in Task 6.

- [ ] **Step 2: Delete the delegation**

This is the same edit as Task 6 Step 2 over the Effect composition. The native presenters come from the one `runSync` over the Layer graph, and the Jarvis family and workspace from their child hosts. `dispose` closes the child hosts, then `runtime.dispose()`. Delete the three files. Move `@rtc/client-core` to `devDependencies`.

Run: `pnpm --filter @rtc/client-core-effect typecheck && pnpm --filter @rtc/client-core-effect test`
Expected: PASS.

- [ ] **Step 3: Mutation-check**

Mutant: remove the `runtime.dispose()` call (or the call that closes the root scope). Expected: KILLED.

- [ ] **Step 4: Commit**

```bash
git add -A packages/client-core-effect && git commit -m "feat(core-effect): the Effect core stands alone — no base app, no parity manifest"
```

### Task 8: `CoreSeams` deleted; the gates tightened

**Files:**
- Modify: `packages/client-core/src/composition.ts` (delete `CoreSeams`, every `seams.x ??` fallback, the `nativeJarvis` stand-down branches, and the `createApp` second parameter), `packages/client-core/src/index.ts`
- Delete: `packages/client-core/src/__tests__/composition.seams.test.ts`, `scripts/core-parity.mjs`, the `core:parity` script in `package.json`
- Modify: `packages/core-contract/src/suites/portDiscipline.ts` (absolute counts), `.dependency-cruiser.cjs` (new rule `alt-cores-no-client-core-at-runtime`), `scripts/check-core-bundle.mjs` (an rxjs-core marker whose absence is asserted), `packages/client-core/src/composition.ts` (the marker string)

**Interfaces:**
- Produces: `createApp(ports: AppPorts): App` in `client-core`.

- [ ] **Step 1: Tighten `portDiscipline` first (RED on nothing, GREEN everywhere)**

`portDiscipline` currently asserts CONSTANCY, because a strangler core constructed each port twice. Change each case's assertion to the absolute count: exactly `1` call per construction-time port method after `makeHarness`, with the constancy checks kept.

Run the three runners with `-t portDiscipline`. Expected: PASS in all three, because Tasks 6/7 removed the second construction. A `2` names a member that is still double-built, and it must be fixed, not loosened.

Mutation: in the async core, construct one native presenter twice (e.g. `createConnectionPresenter(ports…)` called a second time into an unused const). Expected: KILLED by the absolute count.

- [ ] **Step 2: Delete `CoreSeams`**

Remove the type, the parameter, every `seams.*` read (each becomes its own local value), both `if (!seams.nativeJarvis)` guards (the body always runs), the `workspaceIsNative` branches (the RxJS core's own workspace is always live), and the export. Delete `__tests__/composition.seams.test.ts`. Its non-seam cases, if any, move to the matching `composition.*.test.ts`.

Run: `pnpm --filter @rtc/client-core typecheck && pnpm --filter @rtc/client-core test`
Expected: PASS.

- [ ] **Step 3: The runtime-dependency rule**

```js
    {
      name: "alt-cores-no-client-core-at-runtime",
      severity: "error",
      comment:
        "Slice 8: an alternative core composes from @rtc/core-logic and its own members only. @rtc/client-core is a devDependency for test adapters (createSimulatorPorts), never a runtime import.",
      from: { path: "^packages/client-core-(async|effect)/src", pathNot: "\\.test\\.ts$" },
      to: { path: "^packages/client-core/" },
    },
```

Prove it bites: add `import { createApp } from "@rtc/client-core"; void createApp;` to `client-core-async/src/index.ts` and run `pnpm check:deps`, expecting non-zero and the rule named. Remove the probe and re-run, expecting 0.

- [ ] **Step 4: One application core per build, now in both directions**

In `client-core/src/composition.ts`, add `export const RXJS_CORE_BRAND = "@rtc/client-core:brand";` and reference it from `createApp` so it survives minification (copy how `@rtc/client-core-async:brand` is kept alive in the async core). In `scripts/check-core-bundle.mjs`, add `rxjs: "@rtc/client-core:brand"` to `MARKERS` and `rxjs: "client-core"` to `PACKAGE_DIRS`. The existing loop then asserts each build carries only its own core.

Run: `pnpm build && pnpm check:core-bundle`
Expected: exit 0. MEASURE first: if the async or effect build still contains the rxjs brand, find the client import that keeps `createApp` reachable (likely `selectCore`'s default branch) and make that branch compile-time dead under `VITE_CORE_IMPL`. If that proves impossible without a client restructure, rule on it, ledger it, and ship the marker as report-only.

- [ ] **Step 5: Delete `pnpm core:parity`**

Delete `scripts/core-parity.mjs` and the `core:parity` script. Run `grep -rn "core:parity\|parity.json" --exclude-dir=node_modules .`: every hit outside `docs/superpowers/plans/` and the spec is fixed in Task 9 or here.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(client-core): delete CoreSeams; absolute portDiscipline; no-client-core-at-runtime rule; bundle brand both ways"
```

### Task 9: Close the workstream's docs

**Files:**
- Modify: `docs/adr/ADR-006-pluggable-application-core.md` (a "Decided in slice 8 — closing" section), `docs/architecture/22-pluggable-application-core.md` (drop strangler/`CoreSeams`/parity material; add `@rtc/core-logic` and the two new rules; §22 counts), `docs/architecture/06-package-dependencies.md` (graph gains `core-logic`), `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md` (slice 8 receipt), `docs/STATUS.md` (the workstream entry closes; keep only the named follow-ups, via the `tracking-workstream-status` skill), `CLAUDE.md` (package count 24→25, the `core-logic` row, the alt-core rows, the "Application core rule" paragraph rewritten without the strangler, `dev:watch`'s library list), both alt cores' `README.md`, the new `packages/core-logic/README.md`
- Modify: the stale `slice 8` comments in code (`grep -rn "slice 8" packages/*/src`)

- [ ] **Step 1: Write the docs.** Each fact is taken from the merged PRs A–C and the rulings file, never from memory.
- [ ] **Step 2: Check.** Run `pnpm check:doc-links && grep -rn "slice 8" packages/*/src`. Expected: exit 0 and no remaining code comment promising slice 8.
- [ ] **Step 3: The PR C gate.** Run `/rtc:gauntlet full` and the three e2e legs, unpiped and one at a time. Repeat the WS smoke from Task 5 Step 5 on both alternative cores. Expected: every exit is 0, and live prices are seen on both.
- [ ] **Step 4: Commit and ship.** Commit the rulings file's final section. Open PR C, run one reviewer, fix every finding, and ship with the standing flow. Update memory: the workstream is CLOSED, plus its lessons.

```bash
git add -A && git commit -m "docs(pluggable-core): slice 8 closes the workstream — ADR-006, §22, STATUS, CLAUDE.md"
```
