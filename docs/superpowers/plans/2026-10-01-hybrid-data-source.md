# Hybrid Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One deployed web build where demo-roster logins run the in-browser simulators and every other login runs against the real server, choosing the port set at load time and reloading once on a mode change.

**Architecture:** A framework-free routing `AuthPort` in `@rtc/client-core` tries the committed demo roster first (in the browser) and the server second; on a mode change it persists the session and the data-source choice, then relaunches the page. Each web client's `buildBrowserPorts` resolves the data source from `VITE_SERVER_URL`, `VITE_DEMO_AUTH` and the stored choice, and composes either today's simulator branch or today's WS-real branch — no presenter, machine or core changes.

**Tech Stack:** TypeScript, RxJS (adapters only), Vite env files, vitest, Playwright (full-stack e2e), GitHub Actions deploy guard.

**Spec:** [../specs/2026-09-27-public-launch-hardening-design.md](../specs/2026-09-27-public-launch-hardening-design.md) §8 (hybrid), §8.3 (reload dynamics), §8.4 (invariants).

## Global Constraints

- `@rtc/client-core` imports no DOM, React or RN API (CLAUDE.md package rule). `location.reload()` lives in each client's `buildBrowserPorts`, injected as `relaunch`.
- Intra-package imports use the `#/` alias (`#/adapters/dataSource`), never `@/` or deep relative paths across directories.
- Every function is named for its **effect**, never its trigger (`docs/handler-naming.md`); function-typed deps such as `relaunch` are slots and stay as nouns.
- Braces on every control statement (Biome `useBlockStatements`); no inline `style={{}}`; no lint suppressions.
- Fixture factories are `create*`; JSON payloads are object literals + `JSON.stringify`.
- Timer-driven tests use fake timers; nothing here needs a timer.
- Both web clients change identically (`client-react`, `client-solid`), including tests.
- `VITE_DEMO_AUTH` is read from a committed `.env.production` in each web client; `.env.development` is **not** touched, so every dev and e2e flow keeps today's behaviour.
- Storage key: `rtc.dataSource`; values `"sim"` | `"live"`.
- Console line on composition: `[data] composed <sim|live> from <reason>` (plus ` (hybrid)` when hybrid).

## Review Focus

Inputs the spec implies but is silent about. Each has a test pinned in the owning task.

1. **A corrupt stored choice** (`localStorage["rtc.dataSource"] = "banana"`) must read as absent, never throw, and compose `sim` → Task 3/4 store test.
2. **Demo creds on a live-composed page** (after logout) must relaunch into sim, not emit on the live page → Task 2 test "demo match on a live page relaunches".
3. **Server unreachable on a hybrid page** must surface `unavailable` from the live attempt, not a demo "invalid" → Task 2 test "both fail: the live failure wins".
4. **A hybrid page with a pre-hybrid stored session and no choice** must compose live, so a user signed in before this change is not dropped into the simulator with a server token → Task 1 test `session-without-choice`.
5. **`VITE_DEMO_AUTH` malformed JSON** must mean "no demo roster" → today's WS-real behaviour, not a crash → Task 3/4 test "malformed demo roster falls back to live".

---

### Task 1: `resolveDataSource` + the data-source store contract (`@rtc/client-core`)

**Files:**
- Create: `packages/client-core/src/adapters/dataSource.ts`
- Create: `packages/client-core/src/adapters/dataSource.test.ts`
- Create: `packages/client-core/src/adapters/InMemoryDataSourceStore.ts`
- Modify: `packages/client-core/src/index.ts` (two `export *` lines)

**Interfaces:**
- Produces:
  ```ts
  export type DataSource = "sim" | "live";
  export const DATA_SOURCE_STORAGE_KEY = "rtc.dataSource";
  export function isDataSource(value: unknown): value is DataSource;
  export interface DataSourceStore { read(): DataSource | null; write(source: DataSource): void; clear(): void; }
  export type DataSourceReason = "no-server-url" | "no-demo-roster" | "stored" | "session-without-choice" | "default";
  export interface DataSourceDecision { readonly source: DataSource; readonly hybrid: boolean; readonly reason: DataSourceReason; }
  export interface ResolveDataSourceInput { readonly serverUrl: string | undefined; readonly hasDemoRoster: boolean; readonly stored: DataSource | null; readonly hasStoredSession: boolean; }
  export function resolveDataSource(input: ResolveDataSourceInput): DataSourceDecision;
  export function formatDataSourceMessage(decision: DataSourceDecision): string;
  export class InMemoryDataSourceStore implements DataSourceStore { … }
  ```

- [ ] **Step 1: Write the failing tests**

`packages/client-core/src/adapters/dataSource.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  type DataSourceDecision,
  formatDataSourceMessage,
  isDataSource,
  resolveDataSource,
  type ResolveDataSourceInput,
} from "./dataSource";

describe("resolveDataSource", () => {
  it("composes sim when there is no server URL, whatever else is stored", () => {
    expect(
      resolveDataSource(
        createInput({ serverUrl: undefined, stored: "live", hasStoredSession: true }),
      ),
    ).toEqual<DataSourceDecision>({
      source: "sim",
      hybrid: false,
      reason: "no-server-url",
    });
    expect(
      resolveDataSource(createInput({ serverUrl: "" })),
    ).toMatchObject({ source: "sim", reason: "no-server-url" });
  });

  it("composes live when a server URL is set but no demo roster exists (today's WS-real mode)", () => {
    expect(
      resolveDataSource(
        createInput({ hasDemoRoster: false, stored: "sim" }),
      ),
    ).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: false,
      reason: "no-demo-roster",
    });
  });

  it("hybrid: a stored choice wins", () => {
    expect(resolveDataSource(createInput({ stored: "live" }))).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: true,
      reason: "stored",
    });
    expect(
      resolveDataSource(createInput({ stored: "sim", hasStoredSession: true })),
    ).toMatchObject({ source: "sim", reason: "stored" });
  });

  it("hybrid: a stored session with no choice composes live (a pre-hybrid live session)", () => {
    expect(
      resolveDataSource(createInput({ stored: null, hasStoredSession: true })),
    ).toEqual<DataSourceDecision>({
      source: "live",
      hybrid: true,
      reason: "session-without-choice",
    });
  });

  it("hybrid: nothing stored composes sim", () => {
    expect(resolveDataSource(createInput({}))).toEqual<DataSourceDecision>({
      source: "sim",
      hybrid: true,
      reason: "default",
    });
  });
});

describe("isDataSource", () => {
  it("accepts exactly the two sources", () => {
    expect(isDataSource("sim")).toBe(true);
    expect(isDataSource("live")).toBe(true);
    expect(isDataSource("banana")).toBe(false);
    expect(isDataSource(null)).toBe(false);
    expect(isDataSource(undefined)).toBe(false);
  });
});

describe("formatDataSourceMessage", () => {
  it("names the source, the reason and whether the page is hybrid", () => {
    expect(
      formatDataSourceMessage({ source: "sim", hybrid: true, reason: "default" }),
    ).toBe("[data] composed sim from default (hybrid)");
    expect(
      formatDataSourceMessage({
        source: "live",
        hybrid: false,
        reason: "no-demo-roster",
      }),
    ).toBe("[data] composed live from no-demo-roster");
  });
});

function createInput(
  overrides: Partial<ResolveDataSourceInput>,
): ResolveDataSourceInput {
  return {
    serverUrl: "wss://server.example",
    hasDemoRoster: true,
    stored: null,
    hasStoredSession: false,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-core exec vitest run src/adapters/dataSource.test.ts`
Expected: FAIL — cannot resolve `./dataSource`.

- [ ] **Step 3: Implement**

`packages/client-core/src/adapters/dataSource.ts`:

```ts
/**
 * The hybrid data-source decision (hardening spec §8.2): which port set a
 * page composes — the in-browser simulators (`sim`) or the real WebSocket
 * transport (`live`) — chosen ONCE at load, before the login screen, from
 * the build's server URL, whether a demo roster was inlined, and what the
 * last login stored. Framework-free: the clients supply the storage.
 */
export type DataSource = "sim" | "live";

/** `localStorage` key the routing auth port writes on every successful login. */
export const DATA_SOURCE_STORAGE_KEY = "rtc.dataSource";

const DATA_SOURCES: readonly string[] = ["sim", "live"];

export function isDataSource(value: unknown): value is DataSource {
  return typeof value === "string" && DATA_SOURCES.includes(value);
}

/** The client-supplied persistence for the last login's data source. */
export interface DataSourceStore {
  read(): DataSource | null;
  write(source: DataSource): void;
  clear(): void;
}

/** Which rule picked the source — logged at composition so a surprising
 * mode is diagnosable from the console (mirrors `[core] booted … from …`). */
export type DataSourceReason =
  | "no-server-url"
  | "no-demo-roster"
  | "stored"
  | "session-without-choice"
  | "default";

export interface DataSourceDecision {
  readonly source: DataSource;
  /** True only when BOTH a server URL and a demo roster exist — the one
   * shape in which a login can change the composed source. */
  readonly hybrid: boolean;
  readonly reason: DataSourceReason;
}

export interface ResolveDataSourceInput {
  /** `VITE_SERVER_URL`; empty/undefined means there is no server to talk to. */
  readonly serverUrl: string | undefined;
  /** Whether `VITE_DEMO_AUTH` parsed to at least one credential. */
  readonly hasDemoRoster: boolean;
  /** The stored choice, or null when absent/corrupt. */
  readonly stored: DataSource | null;
  /** Whether a session is stored — a pre-hybrid live session has one and no choice. */
  readonly hasStoredSession: boolean;
}

/**
 * Spec §8.2's table. No server URL → sim (today's simulator mode, also the
 * simulator-only fallback build). Server URL without a demo roster → live
 * (today's WS-real mode, byte for byte — every dev/e2e flow lands here).
 * Both → hybrid: the stored choice decides; with no choice, a stored
 * session means a live login that predates the choice, else sim.
 */
export function resolveDataSource(
  input: ResolveDataSourceInput,
): DataSourceDecision {
  if (!input.serverUrl) {
    return { source: "sim", hybrid: false, reason: "no-server-url" };
  }

  if (!input.hasDemoRoster) {
    return { source: "live", hybrid: false, reason: "no-demo-roster" };
  }

  if (input.stored !== null) {
    return { source: input.stored, hybrid: true, reason: "stored" };
  }

  if (input.hasStoredSession) {
    return { source: "live", hybrid: true, reason: "session-without-choice" };
  }

  return { source: "sim", hybrid: true, reason: "default" };
}

export function formatDataSourceMessage(decision: DataSourceDecision): string {
  const suffix = decision.hybrid ? " (hybrid)" : "";
  return `[data] composed ${decision.source} from ${decision.reason}${suffix}`;
}
```

`packages/client-core/src/adapters/InMemoryDataSourceStore.ts`:

```ts
import type { DataSource, DataSourceStore } from "#/adapters/dataSource";

/** Test/in-process `DataSourceStore` (sibling of `InMemorySessionStore`). */
export class InMemoryDataSourceStore implements DataSourceStore {
  private value: DataSource | null = null;

  read(): DataSource | null {
    return this.value;
  }

  write(source: DataSource): void {
    this.value = source;
  }

  clear(): void {
    this.value = null;
  }
}
```

Add to `packages/client-core/src/index.ts`, keeping the alphabetical order of the existing block:

```ts
export * from "#/adapters/dataSource";
export * from "#/adapters/InMemoryDataSourceStore";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-core exec vitest run src/adapters/dataSource.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Prove the tests can fail**

Write `/tmp/mut-datasource.json` (in the scratchpad, not the repo):

```json
[
  { "file": "packages/client-core/src/adapters/dataSource.ts", "find": "if (input.hasStoredSession) {", "replace": "if (false) {", "test": "pnpm --filter @rtc/client-core exec vitest run src/adapters/dataSource.test.ts" },
  { "file": "packages/client-core/src/adapters/dataSource.ts", "find": "if (!input.hasDemoRoster) {", "replace": "if (false) {", "test": "pnpm --filter @rtc/client-core exec vitest run src/adapters/dataSource.test.ts" }
]
```

Run: `pnpm mutation-check <that file>` — expected: both rows RED (killed). Check `scripts/mutation-check.mjs` for the exact spec shape before writing it.

- [ ] **Step 6: Commit**

```bash
git add packages/client-core/src/adapters/dataSource.ts packages/client-core/src/adapters/dataSource.test.ts packages/client-core/src/adapters/InMemoryDataSourceStore.ts packages/client-core/src/index.ts
git commit -m "feat(client-core): resolveDataSource — the hybrid sim/live decision + store contract"
```

---

### Task 2: `createRoutingAuthPort` (`@rtc/client-core`)

**Files:**
- Create: `packages/client-core/src/adapters/RoutingAuthPort.ts`
- Create: `packages/client-core/src/adapters/RoutingAuthPort.test.ts`
- Modify: `packages/client-core/src/index.ts` (one `export *` line)

**Interfaces:**
- Consumes: `DataSource`, `DataSourceStore` from Task 1; `SessionStore`, `StoredSession` from `#/adapters/sessionStore`; `AuthOutcome`, `AuthPort` from `@rtc/domain`.
- Produces:
  ```ts
  export interface RoutingAuthPortDeps {
    readonly demo: AuthPort;          // AuthSimulator over the demo roster
    readonly live: AuthPort;          // HttpAuthAdapter
    readonly composed: DataSource;    // what THIS page composed
    readonly sessionStore: SessionStore;
    readonly dataSourceStore: DataSourceStore;
    readonly relaunch: () => void;    // slot: the client passes () => location.reload()
  }
  export function createRoutingAuthPort(deps: RoutingAuthPortDeps): AuthPort;
  ```

- [ ] **Step 1: Write the failing tests**

`packages/client-core/src/adapters/RoutingAuthPort.test.ts`:

```ts
import { lastValueFrom, type Observable, of, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { AuthOutcome, AuthPort, SessionUser } from "@rtc/domain";

import { InMemoryDataSourceStore } from "./InMemoryDataSourceStore";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createRoutingAuthPort, type RoutingAuthPortDeps } from "./RoutingAuthPort";

describe("createRoutingAuthPort", () => {
  it("a demo match on a sim page emits the outcome, records sim, and never calls the server", async () => {
    const harness = createHarness({ composed: "sim", demo: okFor("demo") });

    const outcomes = await collect(harness.port.login("demo", "mcdc2026"));

    expect(outcomes).toEqual([okFor("demo")]);
    expect(harness.live.login).not.toHaveBeenCalled();
    expect(harness.dataSourceStore.read()).toBe("sim");
    expect(harness.relaunch).not.toHaveBeenCalled();
  });

  it("a live match on a sim page writes the session and the choice, relaunches, and emits nothing", async () => {
    const harness = createHarness({
      composed: "sim",
      demo: invalid(),
      live: okFor("ada"),
    });

    const outcomes = await collect(harness.port.login("ada", "hunter2"));

    expect(outcomes).toEqual([]);
    expect(harness.dataSourceStore.read()).toBe("live");
    expect(harness.sessionStore.read()).toEqual({
      token: "tok-ada",
      user: createUser("ada"),
      username: "ada",
      exp: 1_800_000_000,
    });
    expect(harness.relaunch).toHaveBeenCalledTimes(1);
  });

  it("writes the session BEFORE relaunching", async () => {
    const order: string[] = [];
    const harness = createHarness({
      composed: "sim",
      demo: invalid(),
      live: okFor("ada"),
      relaunch: vi.fn(() => {
        order.push(`relaunch:${harness.sessionStore.read()?.username ?? "<none>"}`);
      }),
    });

    await collect(harness.port.login("ada", "hunter2"));

    // A relaunch that ran first would reload into a page with no session to resume.
    expect(order).toEqual(["relaunch:ada"]);
  });

  it("a live match on a live page emits the outcome and does not relaunch", async () => {
    const harness = createHarness({
      composed: "live",
      demo: invalid(),
      live: okFor("ada"),
    });

    const outcomes = await collect(harness.port.login("ada", "hunter2"));

    expect(outcomes).toEqual([okFor("ada")]);
    expect(harness.dataSourceStore.read()).toBe("live");
    expect(harness.relaunch).not.toHaveBeenCalled();
  });

  it("a demo match on a live page relaunches into sim (the post-logout path)", async () => {
    const harness = createHarness({ composed: "live", demo: okFor("demo") });

    const outcomes = await collect(harness.port.login("demo", "mcdc2026"));

    expect(outcomes).toEqual([]);
    expect(harness.dataSourceStore.read()).toBe("sim");
    expect(harness.sessionStore.read()?.username).toBe("demo");
    expect(harness.relaunch).toHaveBeenCalledTimes(1);
  });

  it("when both fail, the live failure is what the user sees", async () => {
    const unavailable = createHarness({
      composed: "sim",
      demo: invalid(),
      live: failing("unavailable"),
    });
    const wrongPassword = createHarness({
      composed: "sim",
      demo: invalid(),
      live: failing("invalid"),
    });

    expect(await collect(unavailable.port.login("ada", "x"))).toEqual([
      { ok: false, reason: "unavailable" },
    ]);
    expect(await collect(wrongPassword.port.login("ada", "x"))).toEqual([
      { ok: false, reason: "invalid" },
    ]);
    expect(unavailable.dataSourceStore.read()).toBeNull();
    expect(unavailable.relaunch).not.toHaveBeenCalled();
  });

  it("forwards the typed username and password to both ports unchanged", async () => {
    const harness = createHarness({ composed: "sim", demo: invalid(), live: okFor("ada") });

    await collect(harness.port.login("Ada ", "p@ss word"));

    expect(harness.demo.login).toHaveBeenCalledWith("Ada ", "p@ss word");
    expect(harness.live.login).toHaveBeenCalledWith("Ada ", "p@ss word");
  });
});

interface HarnessOverrides {
  readonly composed: RoutingAuthPortDeps["composed"];
  readonly demo?: AuthOutcome;
  readonly live?: AuthOutcome;
  readonly relaunch?: () => void;
}

interface Harness {
  readonly port: AuthPort;
  readonly demo: { login: ReturnType<typeof vi.fn> };
  readonly live: { login: ReturnType<typeof vi.fn> };
  readonly sessionStore: InMemorySessionStore;
  readonly dataSourceStore: InMemoryDataSourceStore;
  readonly relaunch: ReturnType<typeof vi.fn>;
}

function collect(source: Observable<AuthOutcome>): Promise<AuthOutcome[]> {
  return lastValueFrom(source.pipe(toArray()));
}

function createPort(outcome: AuthOutcome): { login: ReturnType<typeof vi.fn> } {
  return {
    login: vi.fn((): Observable<AuthOutcome> => {
      return of(outcome);
    }),
  };
}

function createHarness(overrides: HarnessOverrides): Harness {
  const demo = createPort(overrides.demo ?? invalid());
  const live = createPort(overrides.live ?? invalid());
  const sessionStore = new InMemorySessionStore();
  const dataSourceStore = new InMemoryDataSourceStore();
  const relaunch = vi.fn(overrides.relaunch ?? ((): void => {}));
  const port = createRoutingAuthPort({
    demo,
    live,
    composed: overrides.composed,
    sessionStore,
    dataSourceStore,
    relaunch,
  });
  return { port, demo, live, sessionStore, dataSourceStore, relaunch };
}

function createUser(username: string): SessionUser {
  return {
    name: username,
    initials: username.slice(0, 2).toUpperCase(),
    role: "trader",
    id: `id-${username}`,
    email: `${username}@example.com`,
    desk: "FX",
    clearance: "standard",
  };
}

function okFor(username: string): AuthOutcome {
  return {
    ok: true,
    token: `tok-${username}`,
    user: createUser(username),
    exp: 1_800_000_000,
  };
}

function invalid(): AuthOutcome {
  return { ok: false, reason: "invalid" };
}

function failing(reason: "invalid" | "unavailable"): AuthOutcome {
  return { ok: false, reason };
}
```

Note for the implementer: `InMemorySessionStore` is an existing export — check its constructor (it may take an initial session) and adjust `new InMemorySessionStore()` accordingly. If the `relaunch` test's closure over `harness` before assignment trips the linter, hoist `sessionStore` out of the harness for that one test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-core exec vitest run src/adapters/RoutingAuthPort.test.ts`
Expected: FAIL — cannot resolve `./RoutingAuthPort`.

- [ ] **Step 3: Implement**

`packages/client-core/src/adapters/RoutingAuthPort.ts`:

```ts
import { EMPTY, type Observable, of, switchMap } from "rxjs";

import type { AuthOutcome, AuthPort } from "@rtc/domain";

import type { DataSource, DataSourceStore } from "#/adapters/dataSource";
import type { SessionStore, StoredSession } from "#/adapters/sessionStore";

export interface RoutingAuthPortDeps {
  /** Verifies the committed demo roster IN THE BROWSER (an `AuthSimulator`). */
  readonly demo: AuthPort;
  /** The server's `/login` (an `HttpAuthAdapter`). Tried only after `demo` says no. */
  readonly live: AuthPort;
  /** The data source THIS page composed — a login that resolves to the other
   * one cannot be served in place (ports are composed once, before login). */
  readonly composed: DataSource;
  readonly sessionStore: SessionStore;
  readonly dataSourceStore: DataSourceStore;
  /** Slot: reloads the page so the next composition reads the stored choice. */
  readonly relaunch: () => void;
}

type Authenticated = Extract<AuthOutcome, { ok: true }>;

/**
 * The hybrid login (hardening spec §8). Demo credentials never leave the
 * browser: the server is only asked once the local roster has rejected them,
 * and a credential MATCH (username and password) is what routes locally, so a
 * demo username with another password is an ordinary server login.
 *
 * Same-mode success: record the choice, emit the outcome — the presenter
 * writes the session and the app renders. Cross-mode success: write the
 * session ourselves (the presenter never sees this outcome), record the
 * choice, relaunch, and NEVER EMIT — the login screen stays in
 * its authenticating state for the milliseconds until the page unloads, and
 * the reloaded page resumes the stored session into the right composition
 * (spec §8.3). The session is written before `relaunch()` on purpose: a page
 * that reloaded first would find nothing to resume.
 */
export function createRoutingAuthPort(deps: RoutingAuthPortDeps): AuthPort {
  function settle(
    username: string,
    target: DataSource,
    outcome: Authenticated,
  ): Observable<AuthOutcome> {
    deps.dataSourceStore.write(target);

    if (target === deps.composed) {
      return of(outcome);
    }

    const session: StoredSession = {
      token: outcome.token,
      user: outcome.user,
      username,
      exp: outcome.exp,
    };
    deps.sessionStore.write(session);
    deps.relaunch();
    return EMPTY;
  }

  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      return deps.demo.login(username, password).pipe(
        switchMap((local): Observable<AuthOutcome> => {
          if (local.ok) {
            return settle(username, "sim", local);
          }

          return deps.live.login(username, password).pipe(
            switchMap((remote): Observable<AuthOutcome> => {
              return remote.ok ? settle(username, "live", remote) : of(remote);
            }),
          );
        }),
      );
    },
  };
}
```

Add `export * from "#/adapters/RoutingAuthPort";` to `packages/client-core/src/index.ts` in alphabetical position.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-core exec vitest run src/adapters/RoutingAuthPort.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Prove the tests can fail**

Mutation spec rows (same shape as Task 1):
- `find: "if (target === deps.composed) {"` → `replace: "if (true) {"` — must kill ("live match on a sim page … relaunches").
- `find: "deps.sessionStore.write(session);\n    deps.relaunch();"` → `replace: "deps.relaunch();\n    deps.sessionStore.write(session);"` — must kill ("writes the session BEFORE relaunching").
- `find: "if (local.ok) {"` → `replace: "if (false) {"` — must kill ("never calls the server").

Run `pnpm mutation-check <spec>`; all three RED.

- [ ] **Step 6: Build the package and run its full suite**

Run: `pnpm --filter @rtc/client-core build && pnpm --filter @rtc/client-core test`
Expected: build OK (check-dist passes), all tests green. The build matters: Tasks 3–6 resolve `@rtc/client-core` through `dist/`.

- [ ] **Step 7: Commit**

```bash
git add packages/client-core/src/adapters/RoutingAuthPort.ts packages/client-core/src/adapters/RoutingAuthPort.test.ts packages/client-core/src/index.ts
git commit -m "feat(client-core): createRoutingAuthPort — demo roster locally, server second, relaunch on a mode change"
```

---

### Task 3: Hybrid composition in `@rtc/client-react`

**Files:**
- Create: `packages/client-react/src/app/adapters/LocalStorageDataSourceStore.ts`
- Create: `packages/client-react/src/app/adapters/LocalStorageDataSourceStore.test.ts`
- Create: `packages/client-react/.env.production`
- Create: `packages/client-react/src/app/__tests__/buildBrowserPorts.hybrid.test.ts`
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts`
- Modify: `packages/client-react/src/vite-env.d.ts` (add `readonly VITE_DEMO_AUTH?: string;`)
- Modify: `packages/client-react/.env.example` (document `VITE_DEMO_AUTH`)

**Interfaces:**
- Consumes (Task 1/2, via `@rtc/client-core`): `resolveDataSource`, `formatDataSourceMessage`, `isDataSource`, `DATA_SOURCE_STORAGE_KEY`, `DataSource`, `DataSourceStore`, `createRoutingAuthPort`; existing `HttpAuthAdapter`, `wsUrlToHttpBase`, `AuthSimulator` (`@rtc/domain`).
- Produces: `buildBrowserPorts(options?: BuildBrowserPortsOptions): AppPorts` with
  ```ts
  export interface BuildBrowserPortsOptions {
    /** Slot: how a mode-change login reloads the page. Defaults to `location.reload()`. */
    readonly relaunch?: () => void;
  }
  ```
  Existing callers (`AppRoot.tsx`, `index.ts` re-export, tests) pass nothing and are unaffected.

- [ ] **Step 1: Write the failing store test**

`packages/client-react/src/app/adapters/LocalStorageDataSourceStore.test.ts` — mirror the structure of the sibling `LocalStorageSessionStore.test.ts` (read it first for the storage setup it uses):

```ts
import { afterEach, describe, expect, it } from "vitest";

import { DATA_SOURCE_STORAGE_KEY } from "@rtc/client-core";

import { LocalStorageDataSourceStore } from "#/app/adapters/LocalStorageDataSourceStore";

afterEach(() => {
  localStorage.clear();
});

describe("LocalStorageDataSourceStore", () => {
  it("reads null when nothing is stored", () => {
    expect(new LocalStorageDataSourceStore().read()).toBeNull();
  });

  it("round-trips a choice under the shared key", () => {
    const store = new LocalStorageDataSourceStore();
    store.write("live");
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("live");
    expect(new LocalStorageDataSourceStore().read()).toBe("live");
  });

  it("reads a corrupt value as absent rather than throwing", () => {
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "banana");
    expect(new LocalStorageDataSourceStore().read()).toBeNull();
  });

  it("clear removes the key", () => {
    const store = new LocalStorageDataSourceStore();
    store.write("sim");
    store.clear();
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app/adapters/LocalStorageDataSourceStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

`packages/client-react/src/app/adapters/LocalStorageDataSourceStore.ts` — copy the try/catch posture of `LocalStorageSessionStore.ts` exactly (best-effort, never throws, never logs the value):

```ts
import {
  DATA_SOURCE_STORAGE_KEY,
  type DataSource,
  type DataSourceStore,
  isDataSource,
} from "@rtc/client-core";

/**
 * localStorage-backed `DataSourceStore` (hardening spec §8.2) — the last
 * login's sim/live choice, read once at composition by `buildBrowserPorts`.
 * Modelled on `LocalStorageSessionStore`: tolerant of missing, corrupt or
 * denied storage (private mode, hand-edited devtools values) by reading as
 * absent rather than throwing.
 */
export class LocalStorageDataSourceStore implements DataSourceStore {
  read(): DataSource | null {
    try {
      const raw = localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
      return isDataSource(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  write(source: DataSource): void {
    try {
      localStorage.setItem(DATA_SOURCE_STORAGE_KEY, source);
    } catch {
      // Best-effort persistence: a denied write only costs an extra relaunch
      // decision on the next login, which falls back to the default rule.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(DATA_SOURCE_STORAGE_KEY);
    } catch {
      // Same best-effort posture as write().
    }
  }
}
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app/adapters/LocalStorageDataSourceStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing composition tests**

`packages/client-react/src/app/__tests__/buildBrowserPorts.hybrid.test.ts`. Read the sibling `buildBrowserPorts.wsBranch.test.ts` first and reuse its helpers verbatim where it already has them (`WS_URL`, `seedSession`, `createStubWebSocket`); copy them if they are file-local.

```ts
import { firstValueFrom, type Observable, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATA_SOURCE_STORAGE_KEY, WsAdapter } from "@rtc/client-core";
import type { AuthOutcome } from "@rtc/domain";

import { SESSION_STORAGE_KEY } from "#/app/adapters/LocalStorageSessionStore";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

const WS_URL = "wss://server.example";
const DEMO_ROSTER = JSON.stringify({ demo: "mcdc2026" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("buildBrowserPorts (hybrid: server URL + demo roster)", () => {
  it("composes the simulator branch when nothing is stored", () => {
    stubHybridEnv();

    const ports = buildBrowserPorts();

    expect(ports.transport).toBeUndefined();
  });

  it("composes the ws-real branch when the stored choice is live", () => {
    stubHybridEnv();
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "live");

    expect(buildBrowserPorts().transport).toBeInstanceOf(WsAdapter);
  });

  it("composes the ws-real branch for a stored session with no choice (pre-hybrid live session)", () => {
    stubHybridEnv();
    seedSession("tok-old");

    expect(buildBrowserPorts().transport).toBeInstanceOf(WsAdapter);
  });

  it("a demo login on the sim page resolves in the browser: no fetch, choice recorded, no relaunch", async () => {
    stubHybridEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("sim");
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("a server login on the sim page stores the session + live choice and relaunches without emitting", async () => {
    stubHybridEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createLoginResponse());
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const outcomes = await collect(ports.auth.login("ada", "hunter2"));

    expect(outcomes).toEqual([]);
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("live");
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null")).toMatchObject({
      username: "ada",
      token: "tok-ada",
    });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("a server login on the live page emits normally and does not relaunch", async () => {
    stubHybridEnv();
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "live");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createLoginResponse());
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const outcome = await firstValueFrom(ports.auth.login("ada", "hunter2"));

    expect(outcome.ok).toBe(true);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("a malformed demo roster means no roster: today's ws-real mode, plain HTTP auth", async () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);
    vi.stubEnv("VITE_DEMO_AUTH", "{not json");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const ports = buildBrowserPorts();
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(ports.transport).toBeInstanceOf(WsAdapter);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, reason: "invalid" });
  });

  it("a demo roster without a server URL is a simulator build whose roster signs in", async () => {
    vi.stubEnv("VITE_DEMO_AUTH", DEMO_ROSTER);

    const ports = buildBrowserPorts();
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(ports.transport).toBeUndefined();
    expect(outcome.ok).toBe(true);
  });
});

function stubHybridEnv(): void {
  vi.stubEnv("VITE_SERVER_URL", WS_URL);
  vi.stubEnv("VITE_DEMO_AUTH", DEMO_ROSTER);
}

function collect(source: Observable<AuthOutcome>): Promise<AuthOutcome[]> {
  return firstValueFrom(source.pipe(toArray()));
}

function seedSession(token: string): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token,
      username: "demo",
      exp: Date.now() + 60_000,
      user: {
        name: "Demo Operator",
        initials: "DO",
        role: "Read-Only Guest",
        id: "TRD-0000",
        email: "demo@reactivetrader.io",
        desk: "Demo · Cloud",
        clearance: "LEVEL 1 · VIEW",
      },
    }),
  );
}

function createLoginResponse(): Response {
  return new Response(
    JSON.stringify({
      token: "tok-ada",
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        role: "trader",
        id: "u1",
        email: "ada@example.com",
        desk: "FX",
        clearance: "standard",
      },
      exp: Date.now() + 60_000,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
```

Note: `ports.auth.login` is the RAW port here — `withLoginDelay` is applied later by the core's `createAuthDeps`, so no fake timers are needed.

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app/__tests__/buildBrowserPorts.hybrid.test.ts`
Expected: FAIL — `buildBrowserPorts` ignores `VITE_DEMO_AUTH` and the options argument.

- [ ] **Step 7: Implement the composition**

In `packages/client-react/src/app/buildBrowserPorts.ts`:

1. Add imports: `createRoutingAuthPort`, `formatDataSourceMessage`, `resolveDataSource` from `@rtc/client-core`; `LocalStorageDataSourceStore` from `#/app/adapters/LocalStorageDataSourceStore`; `AuthPort` type from `@rtc/domain`.
2. Add `vite-env.d.ts`: `readonly VITE_DEMO_AUTH?: string;`.
3. Add the options type and rewrite the body's branch selection. Keep both existing branches' internals unchanged; only the `auth` construction and the branch predicate move:

```ts
export interface BuildBrowserPortsOptions {
  /** Slot: how a mode-change login reloads the page (hardening spec §8.3
   * step 3). Defaults to `location.reload()`; tests inject a spy. */
  readonly relaunch?: () => void;
}

function reloadPage(): void {
  location.reload();
}

export function buildBrowserPorts(
  options: BuildBrowserPortsOptions = {},
): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL;
  const demoRoster = parseDevAuth(import.meta.env.VITE_DEMO_AUTH);
  const narratorConfig = devNarratorConfig();
  const browser = new BrowserConnectionEventsAdapter();
  const preferences = new LocalStoragePreferencesAdapter();
  const sessionStore = new LocalStorageSessionStore();
  const dataSourceStore = new LocalStorageDataSourceStore();
  // … (colorScheme, dockLayoutStore, layoutPresetStore, bootSplash as today)

  const decision = resolveDataSource({
    serverUrl: url,
    hasDemoRoster: Object.keys(demoRoster).length > 0,
    stored: dataSourceStore.read(),
    hasStoredSession: sessionStore.read() !== null,
  });
  console.info(formatDataSourceMessage(decision));

  // Simulator roster: the dev file's accounts (dev builds only — Vite loads
  // .env.development in dev) plus the committed demo roster (.env.production),
  // so a production simulator build has working demo logins too.
  const simulatorAuth = new AuthSimulator({
    ...parseDevAuth(import.meta.env.VITE_DEV_AUTH),
    ...demoRoster,
  });

  /** The page's auth port. Non-hybrid pages keep today's single adapter;
   * a hybrid page routes demo credentials locally and everything else to
   * the server, relaunching when the login lands in the other mode. */
  function buildAuth(live: AuthPort | null): AuthPort {
    if (!decision.hybrid || live === null) {
      return live ?? simulatorAuth;
    }

    return createRoutingAuthPort({
      demo: new AuthSimulator(demoRoster),
      live,
      composed: decision.source,
      sessionStore,
      dataSourceStore,
      relaunch: options.relaunch ?? reloadPage,
    });
  }

  if (decision.source === "live" && url) {
    const auth = buildAuth(new HttpAuthAdapter(wsUrlToHttpBase(url)));
    // … existing ws-real branch body, unchanged, using `auth`
  }

  const auth = buildAuth(decision.hybrid && url ? new HttpAuthAdapter(wsUrlToHttpBase(url)) : null);
  // … existing simulator branch body, unchanged, using `auth`
}
```

`url` is already narrowed by `resolveDataSource` (no URL → never `live`), but TypeScript cannot see that, hence the `&& url` guards. Keep the existing comments; add one line above `buildAuth` pointing at spec §8.

4. Create `packages/client-react/.env.production`:

```bash
# Demo roster for PRODUCTION builds of @rtc/client-react (hardening spec §8).
#
# Vite loads this file for `vite build` (mode=production) only — never in `pnpm dev`,
# which reads .env.development instead. With VITE_SERVER_URL also set, the build is
# HYBRID: these credentials are verified in the browser and run the simulators; any
# other credentials go to the server's /login. Without VITE_SERVER_URL this is the
# simulator-only build, and these are its logins.
#
# Same demo accounts as .env.development (packages/domain/src/auth/roster.ts). A
# credential MATCH routes locally — a demo username with another password is a
# server login, which is how full-stack dev/e2e (server roster demo:demo) stays live.
VITE_DEMO_AUTH={"astark":"mcdc2026","nromanoff":"mcdc2026","tchalla":"mcdc2026","demo":"mcdc2026"}
```

5. Append to `packages/client-react/.env.example`:

```bash
# Production-build demo roster (hybrid mode when VITE_SERVER_URL is also set). The
# committed .env.production already carries the demo accounts; override here only
# to ship a different roster.
VITE_DEMO_AUTH={"demo":"mcdc2026"}
```

- [ ] **Step 8: Run the new tests, then every composition-root test**

Run: `pnpm --filter @rtc/client-react exec vitest run src/app`
Expected: PASS, including the pre-existing `buildBrowserPorts.test.ts` and `buildBrowserPorts.wsBranch.test.ts` (today's behaviour must be byte-for-byte intact: no `VITE_DEMO_AUTH` in vitest → `no-server-url` / `no-demo-roster`).

- [ ] **Step 9: Typecheck and lint the package**

Run: `pnpm --filter @rtc/client-react typecheck && pnpm exec biome check packages/client-react && pnpm exec eslint packages/client-react/src/app`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add packages/client-react/src/app/adapters/LocalStorageDataSourceStore.ts packages/client-react/src/app/adapters/LocalStorageDataSourceStore.test.ts packages/client-react/src/app/__tests__/buildBrowserPorts.hybrid.test.ts packages/client-react/src/app/buildBrowserPorts.ts packages/client-react/src/vite-env.d.ts packages/client-react/.env.production packages/client-react/.env.example
git commit -m "feat(client-react): hybrid data source — demo roster local, server otherwise, relaunch on mode change"
```

---

### Task 4: Hybrid composition in `@rtc/client-solid`

Identical to Task 3 with `client-react` → `client-solid` in every path. The Solid `buildBrowserPorts.ts` differs from React's only in comments (verified by diff on 2026-10-01), so the same edit applies; its `__tests__/buildBrowserPorts.wsBranch.test.ts` and `adapters/LocalStorageSessionStore.test.ts` are the siblings to mirror. Files:

- Create: `packages/client-solid/src/app/adapters/LocalStorageDataSourceStore.ts` (+ `.test.ts`)
- Create: `packages/client-solid/.env.production` (same content; "client-solid" in the header)
- Create: `packages/client-solid/src/app/__tests__/buildBrowserPorts.hybrid.test.ts` (same tests)
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts`, `packages/client-solid/src/vite-env.d.ts`

Steps 1–10 as in Task 3 with the package name swapped. Solid has no `.env.example`; skip that step. Commit message: `feat(client-solid): hybrid data source — parity with client-react`.

---

### Task 5: Build env, deploy guard and operator docs

**Files:**
- Modify: `turbo.json` (`build.env` and `dev.env`: add `"VITE_DEMO_AUTH"`)
- Modify: `.github/workflows/deploy.yml` (one new guard step per web-client job, after "Guard — server URL was inlined")
- Modify: `CLAUDE.md` ("Demo accounts & auth env" paragraph)
- Modify: `docs/authentication.md` (new section "6. Hybrid data source" + the §5 committed/secret paragraph)
- Modify: `docs/env-files.md` (`VITE_DEMO_AUTH` row; `.env.production` in the inventory)
- Modify: `docs/DEPLOY.md` (how the deployed client decides sim vs live; the new guard)

**Interfaces:** none (configuration and prose).

- [ ] **Step 1: turbo env**

In `turbo.json`, both `"env"` arrays that list `VITE_SERVER_URL` gain `"VITE_DEMO_AUTH"` (strict env mode would otherwise strip a process-level override; the committed `.env.production` is a file and needs no declaration, but the declaration keeps an explicit override possible and visible).

- [ ] **Step 2: Deploy guard**

After the existing "Guard — server URL was inlined into the client bundle" step in BOTH the `client-react → vercel` and `client-solid → vercel` jobs:

```yaml
      # The hybrid (spec §8) only exists if the demo roster was inlined next to
      # the server URL; a build that lost .env.production would silently send
      # every login — demo accounts included — to the server.
      - name: Guard — demo roster was inlined (hybrid build)
        run: |
          if ! grep -rq '"astark"' .vercel/output/static; then
            echo "::error::VITE_DEMO_AUTH absent from build output — the client would send demo logins to the server instead of running the simulator. Check packages/client-*/.env.production."
            exit 1
          fi
          echo "OK: demo roster is present in the built client bundle (hybrid)."
```

Run `pnpm exec actionlint .github/workflows/deploy.yml` (or the repo's `check:workflows` script if one exists — look in `package.json`) and `pnpm exec zizmor .github/workflows/deploy.yml` if available locally; both must pass.

- [ ] **Step 3: CLAUDE.md**

In the "Demo accounts & auth env" paragraph, after the sentence ending "…Vite loads it dev-only, never in a production build)", insert:

> A **production** build reads the same roster from each client's committed `.env.production` (`VITE_DEMO_AUTH`, same JSON format). With `VITE_SERVER_URL` also set that build is **hybrid** (hardening spec §8): credentials matching the demo roster are verified in the browser and run the simulators, anything else is posted to the server's `/login`, and a login that lands in the other mode stores its session plus `localStorage["rtc.dataSource"]` and reloads once. No `VITE_DEMO_AUTH` + a server URL is today's WS-real mode unchanged — which is every `dev:*:fs` / `dev:*:ws:*` and e2e flow, since `.env.development` carries no `VITE_DEMO_AUTH`. The console line `[data] composed <sim|live> from <reason>` says which rule won.

- [ ] **Step 4: docs/authentication.md**

Add a section `## 6. Hybrid data source (one deployment, two modes)` after §5 containing: the credential-match rule, the three-row composition table from spec §8.2, the seven-step reload timeline from spec §8.3 (copy, do not paraphrase), the two consequences (cut-short cinematic wait; why not swap without reload), and a link to the spec. Update §5's "What's committed" paragraph to mention `.env.production` / `VITE_DEMO_AUTH`. Run `pnpm check:doc-links`.

- [ ] **Step 5: docs/env-files.md and docs/DEPLOY.md**

`env-files.md`: add `.env.production` (both web clients, committed) to the inventory and a `VITE_DEMO_AUTH` row to the variables table: "committed `.env.production`; JSON username → password; production builds only; with `VITE_SERVER_URL` → hybrid, without → simulator-only build's logins".

`DEPLOY.md`: in the client bullet list, replace the sentence about the login screen POSTing to `/login` with the hybrid rule (demo roster local, others `/login`), and add the new guard to the deploy-workflow description next to the server-URL guard.

- [ ] **Step 6: Gates**

Run: `pnpm check:doc-links && pnpm exec biome ci . && pnpm check:scripts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add turbo.json .github/workflows/deploy.yml CLAUDE.md docs/authentication.md docs/env-files.md docs/DEPLOY.md
git commit -m "chore(hybrid): VITE_DEMO_AUTH in turbo env, deploy guard for the inlined roster, operator docs"
```

---

### Task 6: Full-stack e2e witness — demo credentials never reach the server

**Files:**
- Modify: `tests/fullstack/_orchestration.ts` (`startClient` gains `extraEnv: Record<string, string> = {}` merged into `env`, like `startServer`)
- Create: `tests/fullstack/hybrid-smoke.ts` (launcher; copy of `browser-smoke.ts` with ports 4125/3101, client env `VITE_DEMO_AUTH='{"demo":"mcdc2026"}'`, config `fullstack/hybrid/playwright.config.ts`, log prefix `hybrid smoke (browser)`)
- Create: `tests/fullstack/hybrid/playwright.config.ts` (copy of `fullstack/browser/playwright.config.ts`; `FULLSTACK_CLIENT_PORT ?? 3101`; report folders `../../reports/fullstack/hybrid/…`)
- Create: `tests/fullstack/hybrid/hybrid.spec.ts`
- Modify: `tests/package.json` (`"test:fullstack:hybrid": "tsx fullstack/hybrid-smoke.ts"`, `":headed"` twin)
- Modify: `tests/scripts/run-all.ts` (add `{ script: "test:fullstack:hybrid" }` right after `test:fullstack:browser`)

**Interfaces:**
- Consumes: the server's e2e roster `demo:demo` (set by `startServer`), the bundle's demo entry `demo:mcdc2026` (set by the launcher), `TESTIDS.auth.*` from `tests/browser/page-objects/contracts/testids.ts`, `DATA_SOURCE_STORAGE_KEY` value `"rtc.dataSource"`.

- [ ] **Step 1: Read the login test ids and the existing login scenario**

Read `tests/browser/page-objects/contracts/testids.ts` (the `auth` group) and `tests/browser/scenarios/login.ts` to learn the username / password / submit test ids and how the login screen's disappearance is asserted. Use those ids below in place of the placeholders `TESTIDS.auth.username`, `TESTIDS.auth.password`, `TESTIDS.auth.submit`, `TESTIDS.auth.loginScreen` if they are named differently.

- [ ] **Step 2: Write the spec (it fails until Tasks 3 and 6's launcher exist)**

`tests/fullstack/hybrid/hybrid.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";

import { TESTIDS } from "#/browser/page-objects/contracts/testids.js";

const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4125);
const SERVER_ORIGIN = `127.0.0.1:${SERVER_PORT}`;
const DATA_SOURCE_KEY = "rtc.dataSource";

/**
 * The hybrid build's one security property (hardening spec §8.4): demo
 * credentials are verified in the browser and never reach the server. The
 * launcher starts the server with the e2e roster `demo:demo` and the client
 * with `VITE_DEMO_AUTH={"demo":"mcdc2026"}`, so the SAME username has one
 * local and one server password — which is exactly what credential-match
 * routing must tell apart.
 */
test.describe("hybrid data source", () => {
  test("demo credentials sign in locally: no request to the server, no reload, choice = sim", async ({ page }) => {
    const serverHits: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(SERVER_ORIGIN)) {
        serverHits.push(request.url());
      }
    });
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navigations += 1;
      }
    });

    await page.goto("/");
    const navigationsAfterLoad = navigations;
    await signIn(page, "demo", "mcdc2026");

    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({ timeout: 20_000 });
    expect(serverHits).toEqual([]);
    expect(navigations).toBe(navigationsAfterLoad);
    await expect
      .poll(() => {
        return page.evaluate((key) => {
          return localStorage.getItem(key);
        }, DATA_SOURCE_KEY);
      })
      .toBe("sim");
  });

  test("server credentials reload once into the live composition and open a WebSocket", async ({ page }) => {
    const sockets: string[] = [];
    page.on("websocket", (ws) => {
      sockets.push(ws.url());
    });

    await page.goto("/");
    const reloaded = page.waitForEvent("framenavigated", (frame) => {
      return frame === page.mainFrame();
    });
    await signIn(page, "demo", "demo");
    await reloaded;

    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({ timeout: 20_000 });
    await expect
      .poll(() => {
        return sockets.some((url) => {
          return url.includes(SERVER_ORIGIN);
        });
      }, { timeout: 20_000 })
      .toBe(true);
    expect(
      await page.evaluate((key) => {
        return localStorage.getItem(key);
      }, DATA_SOURCE_KEY),
    ).toBe("live");
  });

  test("a second visit with a stored live choice boots live without a reload", async ({ page }) => {
    await page.goto("/");
    const reloaded = page.waitForEvent("framenavigated", (frame) => {
      return frame === page.mainFrame();
    });
    await signIn(page, "demo", "demo");
    await reloaded;
    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({ timeout: 20_000 });

    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navigations += 1;
      }
    });
    await page.goto("/");
    const afterLoad = navigations;

    // Session restored, live composed, no login screen and no further navigation.
    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({ timeout: 20_000 });
    expect(navigations).toBe(afterLoad);
  });
});

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(TESTIDS.auth.username).fill(username);
  await page.getByTestId(TESTIDS.auth.password).fill(password);
  await page.getByTestId(TESTIDS.auth.submit).click();
}
```

Adjust the test ids to the real names from Step 1. If the login screen plays the cinematic wait with a delay preference, the 20 s timeouts cover it. Playwright contexts are fresh per test, so `localStorage` starts empty each time.

- [ ] **Step 3: Launcher, config and scripts**

`tests/fullstack/_orchestration.ts`: change `startClient` to

```ts
export function startClient(
  clientPort: number,
  serverUrl: string,
  extraEnv: Record<string, string> = {},
): ChildProcess {
  return spawn("pnpm", ["--filter", "@rtc/client-react", "dev"], {
    cwd: MONOREPO_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      PORT: String(clientPort),
      VITE_SERVER_URL: serverUrl,
      NODE_OPTIONS: "",
      ...extraEnv,
    },
  });
}
```

`tests/fullstack/hybrid-smoke.ts`: copy `browser-smoke.ts`; set `SERVER_PORT` default `4125`, `CLIENT_PORT` default `3101`, config path `fullstack/hybrid/playwright.config.ts`, and

```ts
const client = startClient(CLIENT_PORT, `ws://${HOST}:${SERVER_PORT}`, {
  VITE_DEMO_AUTH: JSON.stringify({ demo: "mcdc2026" }),
});
```

with the log lines reading `hybrid smoke (browser): …`. Add to `tests/package.json`:

```json
"test:fullstack:hybrid": "tsx fullstack/hybrid-smoke.ts",
"test:fullstack:hybrid:headed": "FULLSTACK_HEADED=1 tsx fullstack/hybrid-smoke.ts",
```

and in `tests/scripts/run-all.ts` insert `{ script: "test:fullstack:hybrid" },` immediately after `{ script: "test:fullstack:browser" },`. Check the file's port-allocation comments: if suites get `RTC_DEV_PORT`s from an index, confirm the new entry does not collide with the browser suites' ports (the launcher's own defaults 4125/3101 are what matter).

- [ ] **Step 4: Run the suite alone**

Run (from the worktree root, after Task 3 is merged into the branch and `pnpm --filter @rtc/client-core build` has run): `pnpm --filter @rtc/tests test:fullstack:hybrid`
Expected: `hybrid smoke (browser): PASS`, 3 passed. Read the FULL Playwright summary, never a filtered tail.

- [ ] **Step 5: Prove the first test can fail**

Temporarily change the launcher's `VITE_DEMO_AUTH` to `{"demo":"demo"}` (so the local roster matches the SERVER password and… still routes locally — that is not the mutant). The real mutant: in `tests/fullstack/hybrid-smoke.ts` drop the `extraEnv` argument so the client has no demo roster. Run the suite: test 1 must FAIL (`serverHits` non-empty, a reload happens). Restore and re-run green. Record the result in the commit message.

- [ ] **Step 6: Lint**

Run: `pnpm exec biome check tests && pnpm exec eslint tests/fullstack`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add tests/fullstack/_orchestration.ts tests/fullstack/hybrid-smoke.ts tests/fullstack/hybrid/playwright.config.ts tests/fullstack/hybrid/hybrid.spec.ts tests/package.json tests/scripts/run-all.ts
git commit -m "test(e2e): hybrid full-stack witness — demo creds never reach the server, server creds reload once into live"
```

---

### Task 7: Backlog entry and closing gates

**Files:**
- Modify: `docs/STATUS.md` (the "Public launch hardening" entry)

- [ ] **Step 1: Update the STATUS entry**

Rewrite the entry's Track A / Track B description to the revised order (spec §6): hybrid composition BUILT in this PR (both web clients, deploy guard, e2e witness); Step 0 still the user's; next B1 (13 findings + the in-app ban layer, spec §9.2), B2, B3 (with BYO keys, spec §10), B4. List the follow-ups left open: D8 splash suppression on the mode-change reload, D9 login-screen demo hint (golden round), server-side reservation of demo usernames (B2), D7 RN. Bump `Last updated`.

- [ ] **Step 2: Full gates**

Run `/rtc:gauntlet full`, then `pnpm test:e2e` (all cores' e2e run in CI; locally the default is enough). Both must be green. Fix forward on the branch; do not weaken a test.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): hybrid data source built; Track B order and follow-ups"
```

---

## Execution notes

- **Phases.** Task 1 → Task 2 (sequential, same package, ~20 min). Then Tasks 3, 4, 5, 6 in parallel (disjoint files; 6 can be written in parallel but only RUN after 3 lands on the branch and client-core is built). Then Task 7.
- **Reviews.** One reviewer after Tasks 1–2 (the semantics everything else inherits), one after 3–6, one whole-branch review before the closing batch.
- **Outward steps** (push, PR create, merge) happen once, at the end, each as its own Bash call.
