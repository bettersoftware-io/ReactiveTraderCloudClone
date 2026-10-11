# `@rtc/web-boot` PR 2: the port builder and the devtools hub

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `buildBrowserPorts`, the devtools hub wiring and every test that depends on them out of both web clients into `@rtc/web-boot`, with the build-time values passed in.

**Architecture:** `buildBrowserPorts` and `readDemoAccounts` stop reading `import.meta.env`; they take a `WebBootEnv`. The package also owns the one rule that turns Vite's values into a `WebBootEnv` (`webBootEnvOf`), so a client writes `webBootEnvOf(import.meta.env)` and holds no mapping of its own. The hub wiring becomes `createDevtoolsHub({ appId, dev })`; each client keeps a one-statement singleton that differs only in its app id.

**Tech Stack:** TypeScript 7 (`tsc --build` + `tsc-alias`), Vitest 5 on jsdom, dependency-cruiser, knip, Vite 8 (rolldown).

**Spec:** `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`

## Global Constraints

- No behaviour change, other than the narrator seam note in the spec (its four threshold numbers stay in a production bundle, disabled at run time).
- The package's source never reads `import.meta.env`.
- The package imports no `react`, `react-dom`, `solid-js`, client, bindings, `@rtc/shared` or `@rtc/ui-contract`.
- A core is reached from the package's non-test source only through `import()`. Test files may import a core statically (`web-clients-load-cores-lazily` exempts `*.test.ts` and `__tests__/`).
- A package test imports package code through `#/` or a relative path, never `@rtc/web-boot` (that would read a stale `dist`).
- Coverage gate on the package: statements 95, lines 95, functions 95, branches 85.
- A client test reads `@rtc/web-boot` through its built `dist`: run `pnpm --filter @rtc/web-boot build` before judging a client test.
- Never run two builds in one checkout at once.
- `pnpm-lock.yaml` is committed, since importers change.
- Every command starts with `cd <absolute worktree path>`.
- Fixture factories are named `create*`. A function is named for its effect. One import statement per module.

## Review Focus

1. **A Vite value that no longer reaches the builder in a real build.** The package's tests pass plain objects, so none of them sees a call site that passes the wrong thing. Expected: `pnpm test:e2e` on the final tree passes. Its suites sign in with a demo account (`VITE_DEV_AUTH`), run over the server (`VITE_SERVER_URL`) and drive the narrator seam (`VITE_NARRATOR_TEST_SEAM`).
2. **The narrator seam switched on in a production build made without the variable.** Expected: `webBootEnvOf({ DEV: false })` gives `narratorTestSeam: false` (Task 1 test).
3. **A test case lost in the merge.** Expected: `vitest list` in the package goes from 154 to 212 lines (Task 2 Step 9).
4. **Two hubs on one page.** A second `createDevtoolsHub` call opens a second BroadcastChannel and the inspector lists the app twice. Expected: each client calls it in exactly one module (Task 2 Step 8 greps for it).
5. **A moved test that passes against a stale `dist`.** Expected: no file under `packages/web-boot/src` imports `@rtc/web-boot` (Task 2 Step 8 greps for it).

## Decisions made while planning

- **Decision: the package maps Vite's values, the client only hands them over.** The spec says each client reads its own Vite values and passes a `WebBootEnv`. Written literally, that is a six-line object at three call sites per client (`main.tsx`, `AppRoot.tsx`, one test page), and the rule "the seam is on in dev, or when `VITE_NARRATOR_TEST_SEAM` is `1`" would exist four times. Instead the package exports `webBootEnvOf(values)`, and a client writes `webBootEnvOf(import.meta.env)`. The package still never reads `import.meta.env` and its tests still pass plain objects. Cost: Vite replaces a whole-object `import.meta.env` with a literal that lists every `VITE_*` value, at each of the two source call sites per client. Those values are already in the bundle. Task 1 records this in the spec.
- **Ruling: React's copies of the three `buildBrowserPorts` test files are the union.** Counted with `vitest list`: React 11 / 9 / 14, Solid 9 / 9 / 12, and every Solid title is in React's file. Solid's hybrid file differs in helper names and comments only. Cost if wrong: a Solid-only case is lost; Task 2 Step 2 checks titles before deleting.
- **Ruling: React's `devtoolsHub.test.ts` is rewritten, not moved.** It resets the module registry because the wiring is an import side effect. Against a factory that is unnecessary. Its four cases are kept, and the first gains a real assertion. Cost if wrong: none, the cases are the same.
- **Ruling: `packages/client-react/src/index.ts` becomes an empty module.** It re-exports `buildBrowserPorts` and nothing imports `@rtc/client-react` (the `tests` workspace lists it for build order only). The file stays because `package.json`'s `main` and `knip.json` name it. Cost if wrong: a typecheck error names the importer.
- **Ruling: `envProduction.test.ts` and `popoutPage.test.ts` stay in each client.** PR 3 replaces them, as the PR 1 plan ruled.

---

### Task 1: `WebBootEnv`, `webBootEnvOf` and `createDevtoolsHub`

**Files:**
- Create: `packages/web-boot/src/env.ts`, `packages/web-boot/src/env.test.ts`
- Create: `packages/web-boot/src/devtools/createDevtoolsHub.ts`, `packages/web-boot/src/devtools/createDevtoolsHub.test.ts`
- Modify: `packages/web-boot/src/index.ts`
- Modify: `packages/client-react/src/app/devtools/devtoolsHub.ts`, `packages/client-solid/src/app/devtools/devtoolsHub.ts`
- Delete: `packages/client-react/src/app/devtools/devtoolsHub.test.ts`
- Modify: `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`

**Interfaces:**
- Produces: `WebBootEnv`, `BuildEnvValues`, `webBootEnvOf(values: BuildEnvValues): WebBootEnv`, `DevtoolsHubOptions`, `createDevtoolsHub(options: DevtoolsHubOptions): DevtoolsHub`, all exported from `@rtc/web-boot`.

- [ ] **Step 1: Write the failing test for the env mapping**

`packages/web-boot/src/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { webBootEnvOf } from "#/env";

describe("webBootEnvOf", () => {
  it("carries the four build values across under their own names", () => {
    expect(
      webBootEnvOf({
        DEV: false,
        VITE_SERVER_URL: "wss://example.test",
        VITE_DEMO_AUTH: '{"demo":"pw"}',
        VITE_DEV_AUTH: '{"dev":"pw"}',
        VITE_CORE_IMPL: "effect",
      }),
    ).toEqual({
      serverUrl: "wss://example.test",
      demoAuth: '{"demo":"pw"}',
      devAuth: '{"dev":"pw"}',
      coreImpl: "effect",
      narratorTestSeam: false,
      dev: false,
    });
  });

  it("leaves every value unset for an empty record, with the seam off", () => {
    expect(webBootEnvOf({})).toEqual({
      serverUrl: undefined,
      demoAuth: undefined,
      devAuth: undefined,
      coreImpl: undefined,
      narratorTestSeam: false,
      dev: false,
    });
  });

  it("carries the narrator seam on a dev build", () => {
    const env = webBootEnvOf({ DEV: true });

    expect(env.dev).toBe(true);
    expect(env.narratorTestSeam).toBe(true);
  });

  it("carries the narrator seam on a production build made with the variable", () => {
    const env = webBootEnvOf({ DEV: false, VITE_NARRATOR_TEST_SEAM: "1" });

    expect(env.dev).toBe(false);
    expect(env.narratorTestSeam).toBe(true);
  });

  it("keeps the seam off for any other value of the variable", () => {
    expect(
      webBootEnvOf({ DEV: false, VITE_NARRATOR_TEST_SEAM: "0" })
        .narratorTestSeam,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts`
Expected: FAIL, cannot resolve `#/env`.

- [ ] **Step 3: Write `packages/web-boot/src/env.ts`**

```ts
/** The build-time values the boot code needs. A client's bundler supplies
 * them; this package never reads `import.meta.env` itself, so it stays free
 * of the bundler and its tests pass a plain object. */
export interface WebBootEnv {
  /** `VITE_SERVER_URL`. Unset or empty means simulator mode. */
  readonly serverUrl: string | undefined;
  /** `VITE_DEMO_AUTH`: the demo roster, JSON `{"user":"pass"}`. */
  readonly demoAuth: string | undefined;
  /** `VITE_DEV_AUTH`: the dev-only roster, same format. */
  readonly devAuth: string | undefined;
  /** `VITE_CORE_IMPL`: the build's default application core. */
  readonly coreImpl: string | undefined;
  /** Whether `?narratorThresholds=test` may relax the narrator's detector. */
  readonly narratorTestSeam: boolean;
  /** True on a dev build. */
  readonly dev: boolean;
}

/** The values as a bundler names them: the shape of Vite's `import.meta.env`. */
export interface BuildEnvValues {
  readonly DEV?: boolean;
  readonly VITE_SERVER_URL?: string;
  readonly VITE_DEMO_AUTH?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_CORE_IMPL?: string;
  readonly VITE_NARRATOR_TEST_SEAM?: string;
}

/**
 * A client calls this with `import.meta.env`.
 *
 * The narrator seam is on for a dev build, and for a production build made
 * with `VITE_NARRATOR_TEST_SEAM=1`. Only `tests/scripts/clientServer.ts` sets
 * that variable; no deploy does.
 */
export function webBootEnvOf(values: BuildEnvValues): WebBootEnv {
  const dev = values.DEV === true;

  return {
    serverUrl: values.VITE_SERVER_URL,
    demoAuth: values.VITE_DEMO_AUTH,
    devAuth: values.VITE_DEV_AUTH,
    coreImpl: values.VITE_CORE_IMPL,
    narratorTestSeam: dev || values.VITE_NARRATOR_TEST_SEAM === "1",
    dev,
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing test for the hub factory**

`packages/web-boot/src/devtools/createDevtoolsHub.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDevtoolsHub } from "#/devtools/createDevtoolsHub";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createDevtoolsHub", () => {
  it("attaches a transport on the rtc-devtools channel when the API exists", () => {
    const channels = createStubBroadcastChannel();

    createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(channels).toEqual(["rtc-devtools"]);
  });

  it("disposes the hub on pagehide", () => {
    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });
    const dispose = vi.spyOn(hub, "dispose");

    window.dispatchEvent(new Event("pagehide"));

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("builds a hub with no transport where BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listen = vi.spyOn(window, "addEventListener");

    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });

    // A non-browser runtime must still get a hub, and with no transport there
    // is nothing for a pagehide to say goodbye on.
    expect(typeof hub.dispose).toBe("function");
    expect(listen).not.toHaveBeenCalledWith("pagehide", expect.anything());
  });

  it("builds a hub where window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    const hub = createDevtoolsHub({ appId: "rtc-test", dev: false });

    expect(typeof hub.dispose).toBe("function");
  });
});

/** Replaces BroadcastChannel with an inert stub and returns the channel names
 * it was constructed with. */
function createStubBroadcastChannel(): string[] {
  const names: string[] = [];

  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null;

      constructor(name: string) {
        names.push(name);
      }

      postMessage(): void {}

      close(): void {}

      addEventListener(): void {}

      removeEventListener(): void {}
    },
  );

  return names;
}
```

If `BroadcastChannelDuplex` (in `packages/devtools-core/src`) calls a member the stub lacks, add that member as a no-op. Do not change an assertion.

- [ ] **Step 6: Run it and see it fail**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/devtools/createDevtoolsHub.test.ts`
Expected: FAIL, cannot resolve `#/devtools/createDevtoolsHub`.

- [ ] **Step 7: Write `packages/web-boot/src/devtools/createDevtoolsHub.ts`**

```ts
import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

export interface DevtoolsHubOptions {
  /** The id the inspector labels this app with. */
  readonly appId: string;
  /** True on a dev build: the inspector then offers intent injection. The
   * write surface stays dev-only through the hub's own handler regardless. */
  readonly dev: boolean;
}

/**
 * Builds the app-side devtools hub and wires it to the page. A client calls
 * this once, at module level: the hub's lifetime is the page, not one
 * composition (unlike the connection-intents pair, which
 * `pairConnectionPorts` scopes per composition).
 *
 * The hub is dormant until an inspector handshakes on the rtc-devtools
 * channel and costs nothing per emission until then. BroadcastChannel is
 * same-origin, so the inspector must be served from this origin (the
 * /devtools route, the dev middleware, or the extension's content-script
 * bridge). Both guards keep a non-browser runtime from throwing.
 */
export function createDevtoolsHub(options: DevtoolsHubOptions): DevtoolsHub {
  const hub = new DevtoolsHub(options);

  if (typeof BroadcastChannel !== "undefined") {
    hub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

    // A graceful close, reload or navigation fires pagehide, and dispose()
    // sends `bye`, which flips the inspector panel to "disconnected".
    // `pagehide` (not `beforeunload`) survives bfcache and mobile Safari.
    // dispose() is idempotent and exception-safe, so this is safe even if the
    // hub never went live. An abrupt crash sends nothing: a recorded limit of
    // the devtools design (spec §5).
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => {
        hub.dispose();
      });
    }
  }

  return hub;
}
```

- [ ] **Step 8: Run it and see it pass**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/devtools/createDevtoolsHub.test.ts`
Expected: 4 passed.

- [ ] **Step 9: Export both from `packages/web-boot/src/index.ts`**

Add, keeping the file's alphabetical order by module path:

```ts
export {
  createDevtoolsHub,
  type DevtoolsHubOptions,
} from "#/devtools/createDevtoolsHub";
export { type BuildEnvValues, type WebBootEnv, webBootEnvOf } from "#/env";
```

- [ ] **Step 10: Shrink each client's singleton**

`packages/client-react/src/app/devtools/devtoolsHub.ts`, whole file:

```ts
import { createDevtoolsHub } from "@rtc/web-boot";

/** The React client's devtools hub: one per page. The app id is what tells
 * the inspector this client from the Solid one (`rtc-web-solid`). The `?.`
 * keeps a runtime with no `import.meta.env` from throwing at module load; it
 * reads as a non-dev build. */
export const devtoolsHub = createDevtoolsHub({
  appId: "rtc-web",
  dev: import.meta.env?.DEV === true,
});
```

`packages/client-solid/src/app/devtools/devtoolsHub.ts`, whole file:

```ts
import { createDevtoolsHub } from "@rtc/web-boot";

/** The Solid client's devtools hub: one per page. The app id is what tells
 * the inspector this client from the React one (`rtc-web`). The `?.` keeps a
 * runtime with no `import.meta.env` from throwing at module load; it reads as
 * a non-dev build. */
export const devtoolsHub = createDevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env?.DEV === true,
});
```

Delete `packages/client-react/src/app/devtools/devtoolsHub.test.ts`.

- [ ] **Step 11: Record the decision in the spec**

In `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`, section "Build-time values are passed in", after the `WebBootEnv` code block, add:

```markdown
**Amended 2026-10-10 (PR 2).** The package also exports
`webBootEnvOf(values)`, which turns a record shaped like Vite's
`import.meta.env` into a `WebBootEnv`. A client writes
`webBootEnvOf(import.meta.env)` at each call site and holds no mapping of its
own, so the rule for the narrator seam exists once. The package still never
reads `import.meta.env`. Cost: Vite replaces a whole-object `import.meta.env`
with a literal listing every `VITE_*` value at each call site; those values
are in the bundle already.
```

- [ ] **Step 12: Build, then run both clients' affected tests**

```bash
pnpm --filter @rtc/web-boot build
pnpm --filter @rtc/web-boot test
pnpm --filter @rtc/client-react exec vitest run src/app
pnpm --filter @rtc/client-solid exec vitest run src/app
pnpm typecheck
```

Expected: all pass. The package reports 9 more cases than before.

- [ ] **Step 13: Mutation check**

Write `mutants-task1.json` in the SDD workspace and run `node scripts/mutation-check.mts <path> --keep-going` from the worktree root:

```json
[
  { "file": "packages/web-boot/src/env.ts", "find": "dev || values.VITE_NARRATOR_TEST_SEAM === \"1\"", "replace": "dev", "test": "pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts" },
  { "file": "packages/web-boot/src/env.ts", "find": "dev || values.VITE_NARRATOR_TEST_SEAM === \"1\"", "replace": "values.VITE_NARRATOR_TEST_SEAM === \"1\"", "test": "pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts" },
  { "file": "packages/web-boot/src/env.ts", "find": "=== \"1\"", "replace": "!== undefined", "test": "pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts" },
  { "file": "packages/web-boot/src/env.ts", "find": "devAuth: values.VITE_DEV_AUTH", "replace": "devAuth: values.VITE_DEMO_AUTH", "test": "pnpm --filter @rtc/web-boot exec vitest run src/env.test.ts" },
  { "file": "packages/web-boot/src/devtools/createDevtoolsHub.ts", "find": "\"rtc-devtools\"", "replace": "\"rtc-other\"", "test": "pnpm --filter @rtc/web-boot exec vitest run src/devtools/createDevtoolsHub.test.ts" },
  { "file": "packages/web-boot/src/devtools/createDevtoolsHub.ts", "find": "hub.dispose();", "replace": "", "test": "pnpm --filter @rtc/web-boot exec vitest run src/devtools/createDevtoolsHub.test.ts" },
  { "file": "packages/web-boot/src/devtools/createDevtoolsHub.ts", "find": "if (typeof BroadcastChannel !== \"undefined\") {", "replace": "{", "test": "pnpm --filter @rtc/web-boot exec vitest run src/devtools/createDevtoolsHub.test.ts" }
]
```

The script also requires a `name` on every row: add one, a short phrase saying what the mutant breaks (for example `"the seam ignores the variable"`). A `find` must match exactly once in its file. Expected: every row KILLED. A SURVIVED row is a finding about the test: strengthen the test, do not drop the mutant.

- [ ] **Step 14: Commit**

```bash
git add -A packages/web-boot packages/client-react/src/app/devtools packages/client-solid/src/app/devtools docs/superpowers/specs/2026-10-06-web-boot-package-design.md
git commit -m "feat(web-boot): the env mapping and the devtools hub factory"
```

---

### Task 2: Move `buildBrowserPorts` and the tests that depend on it

**Files:**
- Move: `packages/client-react/src/app/buildBrowserPorts.ts` → `packages/web-boot/src/buildBrowserPorts.ts`
- Move (from `packages/client-react/src/app/`, to `packages/web-boot/src/`, same relative path): `__tests__/buildBrowserPorts.test.ts`, `__tests__/buildBrowserPorts.hybrid.test.ts`, `__tests__/buildBrowserPorts.wsBranch.test.ts`, `__tests__/readDemoAccounts.test.ts`, `__tests__/devtoolsIntegration.test.ts`, `__tests__/idleReconnect.test.ts`, `composition.incident.test.ts`, `coreHost.swap.test.ts`
- Delete: the same nine paths under `packages/client-solid/src/app/`
- Create: `packages/web-boot/src/__tests__/createPortsOptions.ts`
- Modify: `packages/web-boot/src/index.ts`, `packages/web-boot/package.json`, `packages/web-boot/tsconfig.json`, `.dependency-cruiser.mts`
- Modify: `packages/client-react/src/main.tsx`, `src/AppRoot.tsx`, `src/index.ts`, `tests/ui/pages/AppRootPage.tsx`
- Modify: `packages/client-solid/src/main.tsx`, `src/AppRoot.tsx`, `tests/ui/pages/AppPage.tsx`
- Modify: both clients' `package.json` if knip reports a dependency unused; `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `WebBootEnv`, `webBootEnvOf`, `createDevtoolsHub` (Task 1).
- Produces, exported from `@rtc/web-boot`:

```ts
export interface BuildBrowserPortsOptions {
  /** The build-time values: `webBootEnvOf(import.meta.env)` in a client. */
  readonly env: WebBootEnv;
  /** The page's devtools hub: the WS transport is mirrored to it. */
  readonly devtoolsHub: DevtoolsHub;
  /** Slot: how a mode-change login reloads the page (hardening spec §8.3
   * step 3). Defaults to `location.reload()`; tests inject a spy. */
  readonly relaunch?: () => void;
}
export function buildBrowserPorts(options: BuildBrowserPortsOptions): AppPorts;
export function readDemoAccounts(env: WebBootEnv): readonly DemoAccount[];
```

- [ ] **Step 1: Record the baseline**

```bash
(cd packages/web-boot && pnpm exec vitest list | wc -l)                     # expect 163 after Task 1
(cd packages/client-react && pnpm exec vitest list src/app | sed -E 's/ > .*//' | sort | uniq -c)
(cd packages/client-solid && pnpm exec vitest list src/app | sed -E 's/ > .*//' | sort | uniq -c)
```

Expected for the eight moving files, React: hybrid 9, `buildBrowserPorts.test` 11, wsBranch 14, devtoolsIntegration 2, idleReconnect 2, readDemoAccounts 4, composition.incident 1, coreHost.swap 6. That is 49. Write the three outputs to the report.

- [ ] **Step 2: Prove React's copies are the union**

For each of the eight files, list the case titles in both clients and confirm Solid has none React lacks:

```bash
for f in __tests__/buildBrowserPorts.test.ts __tests__/buildBrowserPorts.hybrid.test.ts __tests__/buildBrowserPorts.wsBranch.test.ts __tests__/readDemoAccounts.test.ts __tests__/devtoolsIntegration.test.ts __tests__/idleReconnect.test.ts composition.incident.test.ts coreHost.swap.test.ts; do
  comm -13 <(cd packages/client-react && pnpm exec vitest list "src/app/$f" | sort) <(cd packages/client-solid && pnpm exec vitest list "src/app/$f" | sort)
done
```

Expected: no output. If a line prints, STOP and report it: that case must be added to the kept copy.

- [ ] **Step 3: Move the source file and give it its new signature**

```bash
git mv packages/client-react/src/app/buildBrowserPorts.ts packages/web-boot/src/buildBrowserPorts.ts
git rm packages/client-solid/src/app/buildBrowserPorts.ts
```

Then edit `packages/web-boot/src/buildBrowserPorts.ts`. These are the only changes:

1. Imports. The seven names imported from `"@rtc/web-boot"` come from their own modules under `#/` (see `src/index.ts` for each path). Remove `import { devtoolsHub } from "#/app/devtools/devtoolsHub";`. Add `type DevtoolsHub` to the `@rtc/devtools-core` import and `import type { WebBootEnv } from "#/env";`.
2. `BuildBrowserPortsOptions` becomes the interface in the Interfaces block above.
3. `buildBrowserPorts(options: BuildBrowserPortsOptions = {})` loses its default and reads `const { env, devtoolsHub } = options;` as its first statement. In its body, `import.meta.env.VITE_SERVER_URL` becomes `env.serverUrl`, `import.meta.env.VITE_DEMO_AUTH` becomes `env.demoAuth`, `seamNarratorConfig()` becomes `seamNarratorConfig(env)`, and `readSimulatorCredentials(demoRoster)` becomes `readSimulatorCredentials(env, demoRoster)`.
4. `seamNarratorConfig(env: WebBootEnv)` opens with:

```ts
  if (!env.narratorTestSeam) {
    return undefined;
  }
```

   Replace the first bullet of its doc comment ("The bundle carries the seam at all…") with:

```ts
 * - The build allows it: `env.narratorTestSeam`, which `webBootEnvOf` sets
 *   on a dev build and on a production build made with
 *   `VITE_NARRATOR_TEST_SEAM=1`. Only `tests/scripts/clientServer.ts` sets
 *   that variable; no deploy does. The relaxed thresholds are in every
 *   bundle; without the flag nothing can switch them on.
```

5. `readDemoAccounts(env: WebBootEnv)`: `parseDevAuth(env.demoAuth)`, `if (env.serverUrl)`, `readSimulatorCredentials(env, demoRoster)`.
6. `readSimulatorCredentials(env: WebBootEnv, demoRoster: Record<string, string>)` returns `{ ...parseDevAuth(env.devAuth), ...demoRoster }`.
7. `parseDevAuth`'s doc comment takes Solid's wording: "Parses `VITE_DEV_AUTH` / `VITE_DEMO_AUTH` (a JSON object of username -> password, verified in the browser by an `AuthSimulator`) — tolerant of missing/malformed values, returning `{}` rather than throwing so a bad/absent value degrades to "no local logins work" instead of a boot crash. Never logs the raw value (it's credentials)."
8. Above `const decision = resolveDataSource({`, add Solid's comment:

```ts
  // Which port set this page composes (hardening spec §8.2): no server URL →
  // sim; server URL without a demo roster → live (today's WS-real mode, byte
  // for byte); both → hybrid, where the last login's stored choice decides.
```

After the edit, `grep -n "import.meta" packages/web-boot/src/buildBrowserPorts.ts` prints nothing.

Export from `packages/web-boot/src/index.ts`:

```ts
export {
  type BuildBrowserPortsOptions,
  buildBrowserPorts,
  readDemoAccounts,
} from "#/buildBrowserPorts";
```

- [ ] **Step 4: Give the package its new dependency**

`buildBrowserPorts.ts` imports `shouldPlayBootSplash` from `@rtc/boot-splash`.

- `packages/web-boot/package.json` `dependencies`: add `"@rtc/boot-splash": "workspace:*"`, in alphabetical order.
- `packages/web-boot/tsconfig.json` `references`: add `{ "path": "../boot-splash" }`, in alphabetical order.
- `.dependency-cruiser.mts`, rule `web-boot-stays-inner`: the `pathNot` becomes `"^packages/(web-boot|boot-splash|client-adapters|client-core-(rxjs|async|effect)|core-api|devtools-core|domain)/"`, and the comment's list gains "boot-splash".
- Run `pnpm install` and keep the `pnpm-lock.yaml` change.

- [ ] **Step 5: Write the test helper**

`packages/web-boot/src/__tests__/createPortsOptions.ts`:

```ts
import { DevtoolsHub } from "@rtc/devtools-core";

import type { BuildBrowserPortsOptions } from "#/buildBrowserPorts";
import type { WebBootEnv } from "#/env";

/** A `WebBootEnv` as a client's own test run supplies it: a dev build with
 * no server and no roster. Pass what the case is about. */
export function createWebBootEnv(overrides: Partial<WebBootEnv> = {}): WebBootEnv {
  return {
    serverUrl: undefined,
    demoAuth: undefined,
    devAuth: undefined,
    coreImpl: undefined,
    narratorTestSeam: true,
    dev: true,
    ...overrides,
  };
}

/** Options for one `buildBrowserPorts` call: the env above with `env`
 * applied, and a hub with no transport unless the case passes its own. */
export function createPortsOptions(
  env: Partial<WebBootEnv> = {},
  rest: Partial<Omit<BuildBrowserPortsOptions, "env">> = {},
): BuildBrowserPortsOptions {
  return {
    env: createWebBootEnv(env),
    devtoolsHub: new DevtoolsHub({ appId: "rtc-test", dev: true }),
    ...rest,
  };
}
```

- [ ] **Step 6: Move the eight test files and convert them**

```bash
for f in __tests__/buildBrowserPorts.test.ts __tests__/buildBrowserPorts.hybrid.test.ts __tests__/buildBrowserPorts.wsBranch.test.ts __tests__/readDemoAccounts.test.ts __tests__/devtoolsIntegration.test.ts __tests__/idleReconnect.test.ts composition.incident.test.ts coreHost.swap.test.ts; do
  git mv "packages/client-react/src/app/$f" "packages/web-boot/src/$f"
  git rm "packages/client-solid/src/app/$f"
done
```

Before editing, save each file's assertion lines: `grep -n "expect(" <file> | sed 's/^[0-9]*://' > <workspace>/expect-before-<name>.txt`.

Convert each moved file by these rules and no others:

| Before | After |
|---|---|
| `from "#/app/buildBrowserPorts"` or `from "./buildBrowserPorts"` | `from "#/buildBrowserPorts"` |
| a name imported from `"@rtc/web-boot"` | the same name from its own module under `#/` (one import statement per module) |
| `vi.stubEnv("VITE_SERVER_URL", X)` | the case passes `{ serverUrl: X }` |
| `vi.stubEnv("VITE_DEMO_AUTH", X)` | `{ demoAuth: X }` |
| `vi.stubEnv("VITE_DEV_AUTH", X)` | `{ devAuth: X }` |
| `vi.stubEnv("DEV", false)` | `{ dev: false, narratorTestSeam: false }` |
| `vi.stubEnv("DEV", false)` with `vi.stubEnv("VITE_NARRATOR_TEST_SEAM", "1")` | `{ dev: false, narratorTestSeam: true }` |
| `buildBrowserPorts()` | `buildBrowserPorts(createPortsOptions(env))` |
| `buildBrowserPorts({ relaunch })` | `buildBrowserPorts(createPortsOptions(env, { relaunch }))` |
| `readDemoAccounts()` | `readDemoAccounts(createWebBootEnv(env))` |
| the client's `devtoolsHub` singleton, where a test reads it | a hub the test builds with `new DevtoolsHub({ appId: "rtc-test", dev: true })` and passes as `createPortsOptions(env, { devtoolsHub: hub })` |

A helper that stubbed several values (`seedHybridEnv()`, `readDemoAccounts.test.ts`'s seed function, the `beforeEach` in `coreHost.swap.test.ts` that stubs `VITE_DEV_AUTH`) becomes a `create*` factory, declared below the cases, that returns the `Partial<WebBootEnv>`. Where one case built the ports twice with a value changed in between (the last narrator case), each call takes its own env object. Remove `vi.unstubAllEnvs()` calls that have nothing left to undo. Keep every comment that explains a case.

Worked example, from `buildBrowserPorts.wsBranch.test.ts`:

```ts
// before
  it("treats an empty VITE_SERVER_URL as simulator mode", () => {
    vi.stubEnv("VITE_SERVER_URL", "");

    expect(buildBrowserPorts().transport).toBeUndefined();
  });

// after
  it("treats an empty VITE_SERVER_URL as simulator mode", () => {
    expect(
      buildBrowserPorts(createPortsOptions({ serverUrl: "" })).transport,
    ).toBeUndefined();
  });
```

Then prove no assertion moved: for each file, save the assertion lines again and compare with whitespace collapsed:

```bash
diff <(tr -s ' \n' ' ' < <workspace>/expect-before-<name>.txt) <(grep "expect(" <file> | tr -s ' \n' ' ')
```

Expected: differences only where an `expect(` line itself contained `buildBrowserPorts()` or `readDemoAccounts()`. List each such line in the report.

- [ ] **Step 7: Point the clients at the package**

Both `main.tsx` files: delete `import { buildBrowserPorts } from "./app/buildBrowserPorts";`, add `buildBrowserPorts` and `webBootEnvOf` to the existing `@rtc/web-boot` import, and add near the top of the module body, after `rootEl` is resolved:

```ts
// The build-time values, read here because only the client's own source is
// where the bundler substitutes them.
const env = webBootEnvOf(import.meta.env);
```

Then `buildDefault: import.meta.env.VITE_CORE_IMPL` becomes `buildDefault: env.coreImpl`, and `ports: buildBrowserPorts()` becomes `ports: buildBrowserPorts({ env, devtoolsHub })`.

Both `AppRoot.tsx` files: `readDemoAccounts` and `webBootEnvOf` join the `@rtc/web-boot` import (in React's file `Composition` is a type there already: `import { type Composition, readDemoAccounts, webBootEnvOf } from "@rtc/web-boot";`), the `#/app/buildBrowserPorts` import goes, and the call becomes `demoAccounts: readDemoAccounts(webBootEnvOf(import.meta.env))`.

`packages/client-react/tests/ui/pages/AppRootPage.tsx` and `packages/client-solid/tests/ui/pages/AppPage.tsx`: import `buildBrowserPorts` and `webBootEnvOf` from `@rtc/web-boot` and `devtoolsHub` from `#/app/devtools/devtoolsHub`; the call becomes `buildBrowserPorts({ env: webBootEnvOf(import.meta.env), devtoolsHub })`. In Solid's file the comment "Uninstrumented: no devtools here." becomes "Uninstrumented: the hub is passed for the transport's wire tap only."

`packages/client-react/src/index.ts`, whole file:

```ts
// @rtc/client-react is an application, not a library: it exports nothing.
// This file exists because package.json's `main` names it; the `tests`
// workspace lists the package for build order only.
export {};
```

- [ ] **Step 8: Check the two structural promises**

```bash
grep -rn "@rtc/web-boot\"" packages/web-boot/src            # expect: no output
grep -rn "import.meta" packages/web-boot/src --include='*.ts' | grep -v "^\S*:\d*:\s*\(//\|\*\|/\*\)"   # expect: comments only
grep -rln "createDevtoolsHub(" packages/client-react packages/client-solid --include='*.ts' --include='*.tsx' | grep -v node_modules
```

Expected for the last: exactly `packages/client-react/src/app/devtools/devtoolsHub.ts` and `packages/client-solid/src/app/devtools/devtoolsHub.ts`.

- [ ] **Step 9: Build and run everything this touched**

```bash
pnpm --filter @rtc/web-boot build
pnpm --filter @rtc/web-boot test:coverage
(cd packages/web-boot && pnpm exec vitest list | wc -l)      # expect 212 = 163 + 49
pnpm --filter @rtc/client-react test
pnpm --filter @rtc/client-solid test
pnpm typecheck
pnpm check:deps
pnpm lint:dead
pnpm lint:eslint
pnpm exec biome ci --error-on-warnings .
```

Expected: all pass, coverage above 95 / 95 / 95 / 85. If knip reports a dependency unused in a client's `package.json`, remove it, run `pnpm install`, and name it in the report. If knip reports `createWebBootEnv` or another new export unused, remove the `export` keyword rather than the code.

- [ ] **Step 10: Mutation check**

`mutants-task2.json`, same format as Task 1's:

```json
[
  { "file": "packages/web-boot/src/buildBrowserPorts.ts", "find": "const url = env.serverUrl;", "replace": "const url = undefined as string | undefined;", "test": "pnpm --filter @rtc/web-boot exec vitest run src/__tests__/buildBrowserPorts.wsBranch.test.ts" },
  { "file": "packages/web-boot/src/buildBrowserPorts.ts", "find": "if (!env.narratorTestSeam) {", "replace": "if (env.narratorTestSeam) {", "test": "pnpm --filter @rtc/web-boot exec vitest run src/__tests__/buildBrowserPorts.test.ts" },
  { "file": "packages/web-boot/src/buildBrowserPorts.ts", "find": "const demoRoster = parseDevAuth(env.demoAuth);\n  const narratorConfig", "replace": "const demoRoster = parseDevAuth(env.devAuth);\n  const narratorConfig", "test": "pnpm --filter @rtc/web-boot exec vitest run src/__tests__/buildBrowserPorts.hybrid.test.ts" },
  { "file": "packages/web-boot/src/buildBrowserPorts.ts", "find": "...parseDevAuth(env.devAuth), ...demoRoster", "replace": "...demoRoster", "test": "pnpm --filter @rtc/web-boot exec vitest run src/__tests__/readDemoAccounts.test.ts" },
  { "file": "packages/web-boot/src/buildBrowserPorts.ts", "find": "if (env.serverUrl) {", "replace": "if (!env.serverUrl) {", "test": "pnpm --filter @rtc/web-boot exec vitest run src/__tests__/readDemoAccounts.test.ts" },
  { "file": ".dependency-cruiser.mts", "find": "(web-boot|boot-splash|client-adapters|", "replace": "(web-boot|client-adapters|", "test": "pnpm check:deps" }
]
```

Adjust a `find` string to the exact text you wrote if it differs. Expected: every row KILLED.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(web-boot): buildBrowserPorts moves in, with the build values passed in"
```

---

### Task 3: The documents and comments that name the old paths

**Files (each names `buildBrowserPorts` or a client's `devtoolsHub.ts`; edit only the stale statements):**
- `CLAUDE.md`: the dev-matrix paragraph ("the **web** clients from `VITE_SERVER_URL` (`packages/client-*/src/app/buildBrowserPorts.ts`)"), the demo-accounts paragraph ("the identical `parseDevAuth` helper in each client's `buildBrowserPorts.ts`"), and the `web-boot/` row of the package table (add `buildBrowserPorts`, `webBootEnvOf`, `createDevtoolsHub` and the `boot-splash` dependency; its last sentence becomes "`main.tsx` still lives in each client (see `docs/STATUS.md`).")
- `docs/STATUS.md` line 16, and the `**Last updated**` line
- `docs/architecture/01-overview.md`, `02-c4-model.md`, `03-uml-class-diagrams.md`, `07-communication-patterns.md`, `11-key-files-reference.md`, `13-codebase-map.md`, `14-composition-and-wiring.md`, `15-flows.md`, `17-web-client-up-close.md`, `20-devtools.md`, `21-cross-framework-testing.md`, and `06-package-dependencies.md` (web-boot gains the boot-splash edge)
- `docs/adr/ADR-006-pluggable-application-core.md`, `docs/authentication.md`, `docs/DEPLOY.md`, `docs/env-files.md`, `docs/dependency-cruiser.md`, `tests/STRATEGY.md`
- `packages/web-boot/README.md`, `packages/client-react/README.md`, `packages/client-solid/README.md`, `packages/client-adapters/README.md`, `packages/devtools-core/README.md`, `packages/client-react-native/README.md`
- Source comments: `packages/client-adapters/src/adapters/connectionIntents.ts`, `routeIdleLifecycle.ts`, `packages/client-core-rxjs/src/composition.ts`, `src/presenters/NarratorMachine.ts`, `packages/client-react-native/src/app/buildNativePorts.ts`, `nativeAuthConfig.ts`, `packages/core-api/src/app.ts`, `packages/core-contract/src/harness/scriptedPorts.ts`, `packages/web-boot/src/adapters/LocalStorageDataSourceStore.ts`, `tests/browser/page-objects/contracts/Workspace.ts`, `tests/browser/playwright/devtools.spec.ts`, `tests/presenter/scenarios/_buildApp.ts`, `tests/scripts/clientServer.ts`
- Leave as they are: `CHANGELOG.md`, everything under `docs/superpowers/`, and the four history notes that describe a past coverage gap in the Solid client (`tests/scripts/coverage-report.ts`, `coverage-report.smoke.test.ts`, `.github/workflows/coverage-report.yml`, `packages/client-solid/vitest.app.coverage.config.ts`, `.claude/commands/rtc/backfill-test-coverage.md`). They record what happened.

- [ ] **Step 1: List every mention**

```bash
grep -rnE "buildBrowserPorts|devtoolsHub\.ts|parseDevAuth" --include='*.md' --include='*.ts' --include='*.tsx' --include='*.mts' . | grep -vE "node_modules|/dist/|/reports/|\.claude/worktrees|docs/superpowers/|CHANGELOG|^./packages/web-boot/src/(buildBrowserPorts|__tests__|coreHost.swap|composition.incident)"
```

- [ ] **Step 2: Fix each stale statement**

A statement is stale when it gives a path under `packages/client-*/src/app/` for `buildBrowserPorts.ts`, says each client has its own copy, says the file reads `import.meta.env`, or says the hub wiring lives in a client. The new facts:

- `buildBrowserPorts` and `readDemoAccounts` live in `packages/web-boot/src/buildBrowserPorts.ts` and take the build values as a `WebBootEnv`.
- A client hands the values over with `webBootEnvOf(import.meta.env)` in `main.tsx` and `AppRoot.tsx`.
- `createDevtoolsHub` lives in `packages/web-boot/src/devtools/createDevtoolsHub.ts`; each client's `src/app/devtools/devtoolsHub.ts` calls it once with its app id.
- `@rtc/web-boot` depends on `@rtc/boot-splash`.
- Each client's `src/app` now holds its tree mount with its test and probes, `devtools/devtoolsHub.ts`, and the `envProduction` and `popoutPage` tests.

Write plainly: short sentences, no em-dashes added, no arrows. Do not rewrite a paragraph that is still true.

`docs/STATUS.md` line 16 becomes:

```markdown
- **Web boot deduplication (`@rtc/web-boot`)** — PR 1 moved the identical boot files out of both web clients' `src/app`; PR 2 moved `buildBrowserPorts` (with the build-time values passed in), the devtools hub factory and the tests that depend on them. Left: PR 3 (the shared part of `main.tsx` as `startWebClient`, and one test replacing the two clients' identical `envProduction` / `popoutPage` tests). Spec: [superpowers/specs/2026-10-06-web-boot-package-design.md](superpowers/specs/2026-10-06-web-boot-package-design.md)
```

- [ ] **Step 3: Check and commit**

```bash
pnpm check:doc-links
pnpm exec biome ci --error-on-warnings .
pnpm lint:eslint
git add -A
git commit -m "docs: buildBrowserPorts and the devtools hub factory live in @rtc/web-boot"
```

Expected: all pass.

---

## After the last task (the controller, not a subagent)

1. Final whole-branch review on the most capable model, with the Review Focus section and the ledger's rulings.
2. The full gauntlet on the final tree, then `pnpm check:core-bundle` and `pnpm test:e2e` (unfiltered output).
3. Ship by the standing flow: PR, CI green on the head SHA, zero open CodeQL alerts with an analysis present for that SHA, merge commit, clean up. No deploy.
