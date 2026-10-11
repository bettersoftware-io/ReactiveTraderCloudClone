# `@rtc/web-boot` PR 3: `startWebClient` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the framework-free part of both web clients' `main.tsx` into one tested function, `startWebClient`, so each entry file keeps only its fonts, its view and one call.

**Architecture:** `startWebClient` is the page's composition root. It binds the real browser globals (console, location, history, storage, timers, `matchMedia`) to the pieces PR 1 and PR 2 moved (`bootCore`, `createCoreHost`, `buildBrowserPorts`, `followCoreSwaps`, `createDevtoolsHub`). A client supplies one factory, `createView(page)`, that returns its framework's four operations: mount, unmount, destroy, show the swap overlay.

**Tech Stack:** TypeScript 7 (`tsc`), vitest 5 on jsdom, React 19, SolidJS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-06-web-boot-package-design.md` (section "`startWebClient` (PR 3)", and the Delivery list's item 3).

## Global Constraints

- No behaviour change. Both clients run the same boot sequence in the same order, with the same console lines, DOM writes and storage writes.
- `packages/web-boot/src` imports no `react`, `react-dom`, `solid-js`, client, bindings, `@rtc/shared` or `@rtc/ui-contract` (`web-boot-stays-framework-free`).
- The package never reads `import.meta.env`. A client reads it, and after this PR only in `main.tsx`.
- A core is reached only through `import()` in `coreSelection.ts`. A test may import a core statically.
- The package's coverage gate stays green: lines 95%, branches 85%.
- Package tests import through `#/` or a relative path, never `@rtc/web-boot`.
- A client test reads `@rtc/web-boot`'s `dist`. Rebuild the package (`pnpm --filter @rtc/web-boot build`) before judging any client test, and never run two builds in one checkout at once.
- Fixture factories are named `create*` and sit below the cases. A function is named for its effect, not its trigger. One import statement per module.
- A test that waits on a timer runs on fake timers (`vi.useFakeTimers()` before composition, `vi.advanceTimersByTimeAsync`).
- Every new test and rule gets a mutant: `node scripts/mutation-check.mts <spec.json> --keep-going`. Each row needs `name`, `file`, `find` (exactly one match in the file), `replace`, `test`.
- Commits end with the two attribution lines in the session's instructions. Never `[skip ci]`.

## Decisions (each departs from the spec's sketch; the spec is amended in Task 3)

The spec sketched `WebClientDeps { rootEl, env, devtoolsHub, tree, mountApp, showOverlay }`. Reading both entry files as they are now gives a smaller and more honest shape.

1. **One view factory instead of `tree` + `mountApp` + `showOverlay(overlayEl, …)`.** Today both entry files create the tree mount and the overlay's root after the first core has loaded. A `tree` passed in up front would create React's root before the load, so a failed load would write the boot-error screen into an element that already has a live root. `createView(page)` is called at the same moment as today and returns all four operations.
2. **`startWebClient` creates the devtools hub** from `appId` and `env.dev`. Each client's `src/app/devtools/devtoolsHub.ts` is deleted. This gives `WebBootEnv.dev` its reader, removes the last file pair that differed only in a string, and removes the untested file from each client's `app` coverage tier. The hub is still created once per page, before the core loads.
3. **`rootId: string` instead of `rootEl`.** The lookup and its "not found" error are the same four lines in both entry files, so they move in. The client names its element.
4. **It returns `Promise<void>`** that settles when the boot composition is mounted or the boot-error screen is shown. It never rejects. A test awaits it; `main.tsx` writes `void startWebClient(…)`. It is not an `async function`: a missing root and an invalid `VITE_CORE_IMPL` still throw synchronously, as today.
5. **`AppRoot` takes `demoAccounts` as a prop.** `startWebClient` computes them once per page and hands them to the view in `page.demoAccounts`. A new grep gate (53) pins that a web client's source reads `import.meta.env` only in `main.tsx`.
6. **One optional seam, `load`.** A client omits it. Tests pass a loader that returns tracked, broken or rejecting cores. Precedent: `BuildBrowserPortsOptions.relaunch`.
7. **The twin tests move to the `tests` workspace** as `tests/scripts/lib/webClientFiles.test.ts`, looping over both clients. It runs in CI's `pnpm --filter @rtc/tests test:report` step and is never turbo-cached. It cannot live in `@rtc/web-boot`: turbo would cache that package's test task without seeing a change to a client's `.env.production`. Cost: these two checks leave `pnpm test`.
8. **Each client's `app` coverage tier stays**, report-only, and now covers the tree mount alone.

## Review Focus

Failure modes the new unit tests cannot see. Each is covered by an existing suite that Task 2 runs.

- A production build boots: `import.meta.env` is substituted in `main.tsx` only, and no core lands in the eager set. `pnpm check:core-bundle`.
- The swap overlay is in the DOM before the host's next step, in both frameworks. The core-swap Playwright suite, both clients.
- React's tree still remounts per composition (`key={composition.generation}` under `StrictMode`). `AppRoot.test.tsx` and the core-swap suite.
- The inspector still attaches to each client under its own app id, and a closed page still says `bye`. `tests/browser/playwright/devtools.spec.ts`, both clients.
- The login screen still lists the demo accounts in simulator mode. Each client's contract suite (the `DemoAccountsHint` cases).

## File Structure

| File | Change |
|---|---|
| `packages/web-boot/src/startWebClient.ts` | Create. The page's composition root. |
| `packages/web-boot/src/startWebClient.test.ts` | Create. |
| `packages/web-boot/src/coverTimings.ts` | Export `INSTANT_COVER`. |
| `packages/web-boot/src/__tests__/recordingBroadcastChannel.ts` | Create: the stub moved out of `createDevtoolsHub.test.ts`, shared by two tests. |
| `packages/web-boot/src/index.ts` | Export the new names. |
| `packages/client-{react,solid}/src/main.tsx` | Rewrite: fonts, view, one call. |
| `packages/client-{react,solid}/src/AppRoot.tsx` | `demoAccounts` prop; no env read. |
| `packages/client-{react,solid}/src/app/devtools/devtoolsHub.ts` | Delete. |
| `packages/client-react/tests/ui/pages/AppRootPage.tsx`, `packages/client-solid/tests/ui/pages/AppPage.tsx` | Own hub; pass `demoAccounts`. |
| `tests/scripts/grep-gates.ts` | Gate 53. |
| `tests/scripts/lib/webClientFiles.test.ts` | Create. Replaces four client tests. |
| `packages/client-{react,solid}/src/app/__tests__/{envProduction,popoutPage}.test.ts` | Delete. |
| Docs, `docs/STATUS.md`, the spec | Task 3. |

---

### Task 1: `startWebClient` in the package

**Files:**
- Create: `packages/web-boot/src/startWebClient.ts`
- Create: `packages/web-boot/src/startWebClient.test.ts`
- Create: `packages/web-boot/src/__tests__/recordingBroadcastChannel.ts`
- Modify: `packages/web-boot/src/coverTimings.ts`, `packages/web-boot/src/devtools/createDevtoolsHub.test.ts`, `packages/web-boot/src/index.ts`

**Interfaces:**
- Consumes: everything already in the package (`bootCore`, `runBoot`, `renderBootError`, `formatBootedMessage`, `buildBrowserPorts`, `readDemoAccounts`, `createCoreHost`, `followCoreSwaps`, `createDevtoolsHub`, `PRESENTER_MANIFEST`, the `coreSelection` helpers, `chooseCoverTimings`).
- Produces, exported from `@rtc/web-boot`:

```ts
export const INSTANT_COVER: CoverTimings; // { enterMs: 0, holdMs: 0, exitMs: 0 }

export interface WebClientPage {
  readonly rootEl: HTMLElement;
  readonly overlayEl: HTMLElement;
  readonly demoAccounts: readonly DemoAccount[];
}

export interface WebClientView {
  mount(composition: Composition): void;
  unmount(): void;
  destroy(): void;
  showOverlay(swap: CoreSwapView | null, fade: CoverTimings): void;
}

export interface WebClientOptions {
  readonly appId: string;
  readonly rootId: string;
  readonly env: WebBootEnv;
  readonly createView: (page: WebClientPage) => WebClientView;
  readonly load?: (impl: CoreImpl) => Promise<CoreFactory>;
}

export function startWebClient(options: WebClientOptions): Promise<void>;
```

- [ ] **Step 1: Record the baseline.** Run `pnpm --filter @rtc/web-boot test` and note the case count N. Run `pnpm --filter @rtc/web-boot test:coverage` and note the four percentages.

- [ ] **Step 2: Export `INSTANT_COVER`.** In `coverTimings.ts`, add below `COVER` and use it in the webdriver branch:

```ts
/** No fade and no hold: under webdriver, and before a page's first swap. */
export const INSTANT_COVER: CoverTimings = { enterMs: 0, holdMs: 0, exitMs: 0 };
```

```ts
  if (motion.webdriver) {
    return INSTANT_COVER;
  }
```

Run `pnpm --filter @rtc/web-boot exec vitest run src/coverTimings.test.ts`. Expected: PASS, unchanged count.

- [ ] **Step 3: Share the channel stub.** Move `RecordingChannel` and `createRecordingBroadcastChannel` out of `src/devtools/createDevtoolsHub.test.ts` into `src/__tests__/recordingBroadcastChannel.ts`, exported, body unchanged. Import it in the hub test. Run that test. Expected: PASS, 6 cases.

- [ ] **Step 4: Write the failing tests.** Create `src/startWebClient.test.ts`. The cases, in order. Assertions are fixed; where jsdom or a core disagrees with the plumbing below, change the plumbing, keep the assertion's meaning, and say so in the report.

```ts
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { asyncCore } from "@rtc/client-core-async";
import { rxjsCore } from "@rtc/client-core-rxjs";
import type { App, AppPorts, CoreFactory, CoreImpl } from "@rtc/core-api";
import { DevtoolsHub, PROTOCOL_VERSION } from "@rtc/devtools-core";

import type { Composition, CoverTimings } from "#/coreHost";
import { CORE_CHOICE_KEY } from "#/coreSelection";
import type { CoreSwapView } from "#/coreSwapView";
import type { WebBootEnv } from "#/env";
import {
  startWebClient,
  type WebClientPage,
  type WebClientView,
} from "#/startWebClient";

import { bootErrorPage } from "./__tests__/BootErrorPage";
import { createWebBootEnv } from "./__tests__/createPortsOptions";
import { createRecordingBroadcastChannel } from "./__tests__/recordingBroadcastChannel";

const COVER = { enterMs: 160, holdMs: 500, exitMs: 200 } as const;
const JUMP_CUT = { enterMs: 0, holdMs: 500, exitMs: 0 } as const;
const INSTANT = { enterMs: 0, holdMs: 0, exitMs: 0 } as const;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  history.replaceState(null, "", "/");
  localStorage.clear();
  delete document.documentElement.dataset.coreImpl;
  delete document.documentElement.dataset.powerSaver;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  stubMatchMedia(false);
});

afterEach(async () => {
  await disposeComposedApps();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startWebClient", () => {
  it("throws at once when the page has no root element", () => {
    document.body.innerHTML = "";
    const client = createClient();

    expect(() => {
      void client.start();
    }).toThrow("Root element #root not found in DOM");
  });

  it("throws at once on a build default that names no core", () => {
    const client = createClient({ env: { coreImpl: "bogus" } });

    expect(() => {
      void client.start();
    }).toThrow();
    expect(client.createView).not.toHaveBeenCalled();
  });

  it("boots the default core: logs it, hands the view the page, mounts and publishes", async () => {
    const client = createClient({
      env: { devAuth: JSON.stringify({ astark: "pw" }) },
    });

    await client.start();

    expect(console.info).toHaveBeenCalledWith("[core] booted rxjs from fallback");
    expect(client.createView).toHaveBeenCalledTimes(1);
    const page = client.page();
    expect(page.rootEl).toBe(document.getElementById("root"));
    expect(page.overlayEl.id).toBe("core-swap-overlay");
    expect(page.overlayEl.parentElement).toBe(document.body);
    expect(
      page.demoAccounts.map((account) => {
        return account.username;
      }),
    ).toEqual(["astark"]);
    expect(client.view.mount).toHaveBeenCalledTimes(1);
    expect(client.composition(1).generation).toBe(1);
    expect(client.composition(1).impl).toBe("rxjs");
    expect(document.documentElement.dataset.coreImpl).toBe("rxjs");
  });

  it("shows no overlay, with no fade, before it mounts the boot composition", async () => {
    const client = createClient();

    await client.start();

    expect(client.view.showOverlay).toHaveBeenCalledTimes(1);
    expect(client.view.showOverlay).toHaveBeenCalledWith(null, INSTANT);
    expect(client.view.showOverlay.mock.invocationCallOrder[0]).toBeLessThan(
      client.view.mount.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("boots the build's default core", async () => {
    const client = createClient({ env: { coreImpl: "async" } });

    await client.start();

    expect(client.load).toHaveBeenCalledWith("async");
    expect(console.info).toHaveBeenCalledWith("[core] booted async from build");
  });

  it("boots through the real loader when the client gives none", async () => {
    vi.useFakeTimers();
    const client = createClient({ realLoader: true });

    await client.start();

    expect(client.composition(1).impl).toBe("rxjs");
    expect(document.documentElement.dataset.coreImpl).toBe("rxjs");
  });

  it("warns about an unknown ?core= value under the [core] prefix", async () => {
    history.replaceState(null, "", "/?core=bogus");
    const client = createClient();

    await client.start();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[core\] .*bogus/),
    );
  });

  it("instruments each composition into a hub that carries the client's app id and dev flag", async () => {
    const channel = createRecordingBroadcastChannel();
    const client = createClient({ appId: "rtc-test-client", env: { dev: true } });

    await client.start();
    channel.deliver({ kind: "hello", v: PROTOCOL_VERSION });

    expect(channel.posted).toContainEqual(
      expect.objectContaining({ appId: "rtc-test-client", dev: true }),
    );
    // The decorators answer with wrapped presenters, never the core's own.
    expect(client.composition(1).presenters).not.toBe(
      client.composedApps()[0]?.presenters,
    );
  });

  it("a production build's hub does not offer intent injection", async () => {
    const channel = createRecordingBroadcastChannel();
    const client = createClient({ env: { dev: false } });

    await client.start();
    channel.deliver({ kind: "hello", v: PROTOCOL_VERSION });

    expect(channel.posted).toContainEqual(
      expect.objectContaining({ dev: false }),
    );
  });

  it("a core that fails to load shows the boot-error screen and builds no view", async () => {
    const client = createClient({ loadError: new Error("chunk gone") });

    await client.start();

    expect(client.rootEl().textContent).toContain(
      "The application core failed to load: chunk gone",
    );
    expect(client.createView).not.toHaveBeenCalled();
  });

  it("the boot-error screen's reset clears the stored choice and reloads onto the default core", async () => {
    localStorage.setItem(CORE_CHOICE_KEY, "effect");
    const assign = vi.fn();
    vi.stubGlobal("location", { href: "http://localhost:3000/?x=1", assign });
    const client = createClient({ loadError: new Error("chunk gone") });

    await client.start();
    bootErrorPage().clickReset(client.rootEl());

    expect(localStorage.getItem(CORE_CHOICE_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith("http://localhost:3000/?x=1&core=rxjs");
  });

  it("a first mount that throws destroys the view and shows the boot-error screen", async () => {
    const client = createClient({ mountError: new Error("render failed") });

    await client.start();

    expect(client.view.destroy).toHaveBeenCalledTimes(1);
    expect(client.rootEl().textContent).toContain("render failed");
  });

  it("a swap covers the inert tree, then mounts, publishes, saves and strips ?core=", async () => {
    vi.useFakeTimers();
    history.replaceState(null, "", "/?core=rxjs&x=1");
    const endComposition = vi.spyOn(DevtoolsHub.prototype, "endComposition");
    const client = createClient();
    await client.start();

    client.composition(1).coreSelection.select("async");

    expect(client.rootEl().inert).toBe(true);
    expect(client.view.showOverlay).toHaveBeenLastCalledWith(
      expect.anything(),
      COVER,
    );

    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.view.unmount).toHaveBeenCalledTimes(1);
    expect(endComposition).toHaveBeenCalledTimes(1);
    expect(client.view.mount).toHaveBeenCalledTimes(2);
    expect(client.composition(2).generation).toBe(2);
    expect(client.composition(2).impl).toBe("async");
    expect(document.documentElement.dataset.coreImpl).toBe("async");
    expect(localStorage.getItem(CORE_CHOICE_KEY)).toBe("async");
    expect(location.search).toBe("?x=1");
    expect(client.infoLines()).toHaveLength(2);
    expect(client.view.showOverlay).toHaveBeenLastCalledWith(null, COVER);
    expect(client.rootEl().inert).toBe(false);
  });

  it.each([
    ["power-saver freeze", "freeze", false],
    ["reduced motion", undefined, true],
  ])("under %s the swap's cover is a jump cut", async (_name, powerSaver, reducedMotion) => {
    vi.useFakeTimers();
    stubMatchMedia(reducedMotion);
    const client = createClient();
    await client.start();

    if (powerSaver !== undefined) {
      document.documentElement.dataset.powerSaver = powerSaver;
    }

    client.composition(1).coreSelection.select("async");

    expect(client.view.showOverlay).toHaveBeenLastCalledWith(
      expect.anything(),
      JUMP_CUT,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.composition(2).impl).toBe("async");
  });

  it("a swap that can compose neither core destroys the view and shows the boot-error screen", async () => {
    vi.useFakeTimers();
    const client = createClient({ composeOnce: true });
    await client.start();

    client.composition(1).coreSelection.select("async");
    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.view.destroy).toHaveBeenCalledTimes(1);
    expect(client.rootEl().textContent).toContain(
      "The application core failed to load",
    );
    expect(client.rootEl().inert).toBe(false);
  });
});
```

The fixtures, below the cases:

```ts
interface ClientOptions {
  readonly appId?: string;
  readonly env?: Partial<WebBootEnv>;
  /** Every `load` rejects with this. */
  readonly loadError?: Error;
  /** The view's `mount` throws this. */
  readonly mountError?: Error;
  /** Each core composes once; every later `createApp` throws. */
  readonly composeOnce?: boolean;
  /** Pass no `load`, so the package's own loader runs. */
  readonly realLoader?: boolean;
}

interface RecordingView {
  readonly mount: Mock<(composition: Composition) => void>;
  readonly unmount: Mock<() => void>;
  readonly destroy: Mock<() => void>;
  readonly showOverlay: Mock<
    (swap: CoreSwapView | null, fade: CoverTimings) => void
  >;
}

interface Client {
  start(): Promise<void>;
  readonly view: RecordingView;
  readonly createView: Mock<(page: WebClientPage) => WebClientView>;
  readonly load: Mock<(impl: CoreImpl) => Promise<CoreFactory>>;
  /** The page the view was built over. */
  page(): WebClientPage;
  /** The nth composition the view mounted, from 1. */
  composition(nth: number): Composition;
  /** Every app a core composed for this client, in order. */
  composedApps(): readonly App[];
  rootEl(): HTMLElement;
  /** The `[core]` lines sent to `console.info`. */
  infoLines(): string[];
}

/** Every app any client composed, disposed in `afterEach`. */
const composedApps: App[] = [];

const CORES: Readonly<Partial<Record<CoreImpl, CoreFactory>>> = {
  rxjs: rxjsCore,
  async: asyncCore,
};

function createClient(options: ClientOptions = {}): Client {
  const view: RecordingView = {
    mount: vi.fn((): void => {
      if (options.mountError !== undefined) {
        throw options.mountError;
      }
    }),
    unmount: vi.fn(),
    destroy: vi.fn(),
    showOverlay: vi.fn(),
  };
  const createView = vi.fn((): WebClientView => {
    return view;
  });
  const own: App[] = [];
  const load = vi.fn((impl: CoreImpl): Promise<CoreFactory> => {
    if (options.loadError !== undefined) {
      return Promise.reject(options.loadError);
    }

    const core = CORES[impl];

    if (core === undefined) {
      return Promise.reject(new Error(`no test core for ${impl}`));
    }

    return Promise.resolve(
      createTrackedCore(core, own, options.composeOnce === true),
    );
  });

  return {
    start: (): Promise<void> => {
      return startWebClient({
        appId: options.appId ?? "rtc-test",
        rootId: "root",
        env: createWebBootEnv(options.env),
        createView,
        ...(options.realLoader === true ? {} : { load }),
      });
    },
    view,
    createView,
    load,
    page: (): WebClientPage => {
      const page = createView.mock.calls[0]?.[0];

      if (page === undefined) {
        throw new Error("no view was built");
      }

      return page;
    },
    composition: (nth: number): Composition => {
      const composition = view.mount.mock.calls[nth - 1]?.[0];

      if (composition === undefined) {
        throw new Error(`composition ${String(nth)} was never mounted`);
      }

      return composition;
    },
    composedApps: (): readonly App[] => {
      return own;
    },
    rootEl: (): HTMLElement => {
      const rootEl = document.getElementById("root");

      if (rootEl === null) {
        throw new Error("the page has no #root");
      }

      return rootEl;
    },
    infoLines: (): string[] => {
      return vi
        .mocked(console.info)
        .mock.calls.map(([line]) => {
          return String(line);
        })
        .filter((line) => {
          return line.startsWith("[core] ");
        });
    },
  };
}

/** The same core, recording every app it composes; with `once`, it composes
 * one app and throws for every later one. */
function createTrackedCore(
  core: CoreFactory,
  own: App[],
  once: boolean,
): CoreFactory {
  let composed = 0;

  return {
    createApp: (ports: AppPorts): App => {
      composed += 1;

      if (once && composed > 1) {
        throw new Error("this core composes once");
      }

      const app = core.createApp(ports);
      own.push(app);
      composedApps.push(app);
      return app;
    },
    createMachineFactories: core.createMachineFactories,
  };
}

async function disposeComposedApps(): Promise<void> {
  for (const app of composedApps.splice(0)) {
    await app.dispose();
  }
}

/** jsdom has no `matchMedia`. */
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (media: string) => {
    return {
      matches,
      media,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
    };
  });
}
```

Notes for the implementer:

- `composeOnce` gives each loaded core one app. The boot composes rxjs (its one). The swap's `load("async")` returns a fresh tracked core, which composes its one. To make BOTH fail, the async core must throw on its first `createApp` and rxjs on its second: track the count per impl across `load` calls, or give `load("async")` a core that always throws. Pick the smaller change; the assertion (destroy once, boot-error text, tree not inert) does not move.
- `afterEach` disposes real apps. Under fake timers follow the order `coreHost.swap.test.ts` uses in its own `afterEach`, so a `dispose()` that waits on a timer is not left pending.
- Verified on 2026-10-11 in this package's jsdom: `vi.stubGlobal("location", …)` is what a bare `location` reads; `history.replaceState` moves `location.href`; `matchMedia` and `navigator.webdriver` are both absent.

- [ ] **Step 5: Run the tests to see them fail.**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/startWebClient.test.ts`
Expected: FAIL, cannot resolve `#/startWebClient`.

- [ ] **Step 6: Write `startWebClient.ts`.**

```ts
import type { App, CoreFactory, CoreImpl } from "@rtc/core-api";
import {
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";
import type { DemoAccount } from "@rtc/domain";

import {
  bootCore,
  formatBootedMessage,
  renderBootError,
  runBoot,
} from "./bootApp";
import { buildBrowserPorts, readDemoAccounts } from "./buildBrowserPorts";
import {
  type Composition,
  type CoverTimings,
  createCoreHost,
} from "./coreHost";
import {
  CORE_OPTIONS,
  clearCoreChoice,
  defaultCoreResetHref,
  loadCore,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./coreSelection";
import { followCoreSwaps } from "./coreSwapCover";
import type { CoreSwapView } from "./coreSwapView";
import {
  chooseCoverTimings,
  INSTANT_COVER,
  type MotionSettings,
} from "./coverTimings";
import { createDevtoolsHub } from "./devtools/createDevtoolsHub";
import { PRESENTER_MANIFEST } from "./devtools/presenterManifest";
import type { WebBootEnv } from "./env";

/** What the page hands a client's view: once, after the first core loaded. */
export interface WebClientPage {
  /** The element the app tree mounts in. */
  readonly rootEl: HTMLElement;
  /** The element the swap overlay renders in. It is outside the app tree:
   * that tree is unmounted and mounted again while the overlay covers it. */
  readonly overlayEl: HTMLElement;
  /** The sign-ins the login screen lists as a click-to-fill hint. */
  readonly demoAccounts: readonly DemoAccount[];
}

/** A client's framework part: its app tree and its swap overlay. */
export interface WebClientView {
  /** Mounts the app tree over one composition. Synchronous: the tree is in
   * the DOM when it returns. Throws the error of a tree that fails its first
   * render. */
  mount(composition: Composition): void;
  /** Synchronous: the tree is gone when it returns. */
  unmount(): void;
  /** Drops whatever the root still holds, for good: the boot-error screen
   * takes its element next. */
  destroy(): void;
  /** Renders the swap overlay, synchronously, so the cover is in the DOM
   * before the host's next step; a null `swap` removes it. `fade` is the
   * timings of the swap under way. */
  showOverlay(swap: CoreSwapView | null, fade: CoverTimings): void;
}

export interface WebClientOptions {
  /** The id the inspector labels this client with. */
  readonly appId: string;
  /** The id of the element the app mounts in. */
  readonly rootId: string;
  /** The build-time values: `webBootEnvOf(import.meta.env)` in a client. */
  readonly env: WebBootEnv;
  /** Builds the client's view. Called once, after the first core loaded. */
  readonly createView: (page: WebClientPage) => WebClientView;
  /** Slot: how a core is loaded. Defaults to the package's three `import()`
   * calls; tests inject cores they can track or break. */
  readonly load?: (impl: CoreImpl) => Promise<CoreFactory>;
}

/**
 * Starts a web client: the page's composition root, one copy for both
 * clients. It resolves which core to boot and loads it, builds the ports
 * once, hands them to the core host, and keeps the page in step with every
 * swap. The client supplies only its framework's view.
 *
 * The promise settles when the boot composition is mounted or the boot-error
 * screen is shown, and never rejects: `runBoot` routes a failed load and a
 * failed first composition to that screen.
 *
 * Deliberately NOT an `async function`: a missing root element and an
 * invalid `VITE_CORE_IMPL` are developer errors, and both throw out of this
 * call synchronously, as uncaught module-init errors of the entry file.
 */
export function startWebClient(options: WebClientOptions): Promise<void> {
  const { env } = options;
  const rootEl = document.getElementById(options.rootId);

  if (!rootEl) {
    throw new Error(`Root element #${options.rootId} not found in DOM`);
  }

  // One hub per page, built before any core loads: its lifetime is the page,
  // not one composition.
  const devtoolsHub = createDevtoolsHub({ appId: options.appId, dev: env.dev });
  const storage = safeLocalStorage();
  const load = options.load ?? loadCore;

  /** Clears the stored choice and reloads onto the RxJS core: the boot-error
   * screen's "Load the default core" action. */
  function reloadOntoDefaultCore(): void {
    clearCoreChoice(storage, warnCore);
    location.assign(defaultCoreResetHref(location.href));
  }

  /** Applies the devtools decorators to one composition (the core host calls
   * this once per `createApp`). */
  function instrumentComposition(
    core: CoreFactory,
    app: App,
  ): Pick<Composition, "presenters" | "machineFactories"> {
    const presenters = instrumentPresenters(
      app.presenters,
      PRESENTER_MANIFEST,
      devtoolsHub,
    );

    return {
      presenters,
      machineFactories: instrumentMachineFactories(
        core.createMachineFactories(presenters),
        devtoolsHub,
      ),
    };
  }

  return runBoot(
    bootCore({
      href: location.href,
      storage,
      buildDefault: env.coreImpl,
      warn: warnCore,
      load,
    }),
    ({ impl, core, source }) => {
      console.info(formatBootedMessage(impl, source));

      const overlayEl = document.createElement("div");
      overlayEl.id = "core-swap-overlay";
      document.body.append(overlayEl);

      const view = options.createView({
        rootEl,
        overlayEl,
        demoAccounts: readDemoAccounts(env),
      });
      // The timings of the swap under way: the host asks for them as each
      // swap starts, and the overlay's two fades take the same numbers.
      // Instant until the first swap: nothing is shown before then.
      let cover: CoverTimings = INSTANT_COVER;

      // The host owns the ports (built once per page) and every composition;
      // a Preferences core choice swaps the core in place, with no reload.
      const host = createCoreHost({
        ports: buildBrowserPorts({ env, devtoolsHub }),
        initial: { impl, core },
        load,
        instrument: instrumentComposition,
        endComposition: () => {
          devtoolsHub.endComposition();
        },
        mount: (composition: Composition): void => {
          view.mount(composition);
        },
        unmount: () => {
          view.unmount();
        },
        publish: (next: CoreImpl): void => {
          document.documentElement.dataset.coreImpl = next;
        },
        persist: (next: CoreImpl): boolean => {
          return saveCoreChoice(storage, next, warnCore);
        },
        stripCoreParam: () => {
          history.replaceState(
            history.state,
            "",
            urlWithoutCoreParam(location.href),
          );
        },
        info: (message: string): void => {
          console.info(message);
        },
        warn: (message: string): void => {
          console.warn(message);
        },
        onFatal: (error: unknown): void => {
          // No core is composed: drop whatever the root still holds, then
          // show the boot-error screen in its place.
          view.destroy();
          renderBootError(rootEl, error, reloadOntoDefaultCore);
        },
        cover: () => {
          cover = chooseCoverTimings(readMotionSettings());
          return cover;
        },
        sleep,
        nextMacrotask: waitForNextMacrotask,
        startTimer,
      });

      // While a swap is under way the overlay is shown and the app tree is
      // inert. Followed before `start()`: a boot that fails leaves the host
      // `fatal`, which shows no cover over the boot-error screen.
      followCoreSwaps(host.state$, {
        rootEl,
        options: CORE_OPTIONS,
        show: (swap: CoreSwapView | null): void => {
          view.showOverlay(swap, cover);
        },
      });

      try {
        host.start();
      } catch (error) {
        // The boot composition could not be mounted, and the host has
        // disposed it: drop the root too, as `onFatal` does, before
        // `runBoot` shows the boot-error screen in its place.
        view.destroy();
        throw error;
      }
    },
    (error: unknown) => {
      renderBootError(rootEl, error, reloadOntoDefaultCore);
    },
  );
}

/** Logs a caught, non-fatal core-selection issue (an unknown `?core=` or
 * stored value, or a storage read, write or clear failure), so it can be
 * diagnosed from the console. */
function warnCore(message: string): void {
  console.warn(`[core] ${message}`);
}

/** What decides how a swap's cover moves, as it is right now. The
 * power-saver level is read from `<html>`, where `PowerSaverRoot` writes it:
 * no ViewModel is reachable from out here. */
function readMotionSettings(): MotionSettings {
  return {
    webdriver: navigator.webdriver,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    freeze: document.documentElement.dataset.powerSaver === "freeze",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startTimer(ms: number, onExpired: () => void): () => void {
  const timer = setTimeout(onExpired, ms);

  return (): void => {
    clearTimeout(timer);
  };
}

function waitForNextMacrotask(): Promise<void> {
  return sleep(0);
}
```

Add to `src/index.ts`: `INSTANT_COVER` on the `#/coverTimings` line, and

```ts
export {
  startWebClient,
  type WebClientOptions,
  type WebClientPage,
  type WebClientView,
} from "#/startWebClient";
```

- [ ] **Step 7: Run the tests to see them pass.**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/startWebClient.test.ts`
Expected: PASS, 16 cases (14 `it` plus one `it.each` of 2).

Then the whole package: `pnpm --filter @rtc/web-boot test`. Expected: N + 16.

- [ ] **Step 8: Mutation check.** Write a spec JSON in the scratch directory, every row with `test` = `pnpm --filter @rtc/web-boot exec vitest run src/startWebClient.test.ts` and `file` = `packages/web-boot/src/startWebClient.ts`. One row per line below; adjust a `find` until it matches exactly once.

| name | find | replace |
|---|---|---|
| root check | `if (!rootEl) {` | `if (rootEl === undefined) {` |
| sync throw | `export function startWebClient(` | `export async function startWebClient(` |
| hub app id | `appId: options.appId` | `appId: "rtc-web"` |
| hub dev flag | `dev: env.dev` | `dev: !env.dev` |
| build default | `buildDefault: env.coreImpl` | `buildDefault: undefined` |
| warn prefix | `` console.warn(`[core] ${message}`) `` | `console.warn(message)` |
| booted line | `console.info(formatBootedMessage(impl, source));` | `void source;` |
| overlay id | `overlayEl.id = "core-swap-overlay";` | `overlayEl.id = "overlay";` |
| overlay attached | `document.body.append(overlayEl);` | `void overlayEl;` |
| demo accounts | `demoAccounts: readDemoAccounts(env),` | `demoAccounts: [],` |
| instrumented | `machineFactories: instrumentMachineFactories(` plus the presenters line | return `app.presenters` unwrapped |
| end composition | `devtoolsHub.endComposition();` | `void devtoolsHub;` |
| publish | `document.documentElement.dataset.coreImpl = next;` | `void next;` |
| persist | `return saveCoreChoice(storage, next, warnCore);` | `return true;` |
| strip param | `urlWithoutCoreParam(location.href),` | `location.href,` |
| swap info line | `console.info(message);` | `void message;` |
| fatal destroys | `view.destroy();\n          renderBootError` | `renderBootError` |
| failed boot destroys | `view.destroy();\n        throw error;` | `throw error;` |
| cover from settings | `cover = chooseCoverTimings(readMotionSettings());` | `cover = INSTANT_COVER;` |
| overlay fade | `view.showOverlay(swap, cover);` | `view.showOverlay(swap, INSTANT_COVER);` |
| freeze read | `document.documentElement.dataset.powerSaver === "freeze"` | `false` |
| reduced motion read | `matchMedia("(prefers-reduced-motion: reduce)").matches` | `false` |
| reset clears choice | `clearCoreChoice(storage, warnCore);` | `void storage;` |
| reset href | `location.assign(defaultCoreResetHref(location.href));` | `location.assign(location.href);` |
| default loader | `options.load ?? loadCore` | `options.load ?? rejectLoad` with a local `rejectLoad` that rejects |

Run: `node scripts/mutation-check.mts <spec.json> --keep-going`
Expected: every row KILLED. A SURVIVED row is a finding about the test: fix the test, not the row.

- [ ] **Step 9: Gates for the package.**

```bash
pnpm --filter @rtc/web-boot build
pnpm --filter @rtc/web-boot typecheck
pnpm --filter @rtc/web-boot test:coverage
pnpm exec biome ci --error-on-warnings packages/web-boot
pnpm exec eslint packages/web-boot
pnpm check:deps
```

Expected: all green; coverage at or above the Step 1 numbers, and `startWebClient.ts` itself at 100% lines.

- [ ] **Step 10: Commit.**

```bash
git add packages/web-boot
git commit -m "feat(web-boot): startWebClient, the page's composition root, with tests"
```

---

### Task 2: both clients call `startWebClient`

**Files:**
- Modify: `packages/client-react/src/main.tsx`, `packages/client-solid/src/main.tsx`
- Modify: `packages/client-react/src/AppRoot.tsx`, `packages/client-solid/src/AppRoot.tsx`
- Modify: `packages/client-react/tests/ui/pages/AppRootPage.tsx`, `packages/client-solid/tests/ui/pages/AppPage.tsx`
- Delete: `packages/client-react/src/app/devtools/devtoolsHub.ts`, `packages/client-solid/src/app/devtools/devtoolsHub.ts`
- Modify: both `vitest.app.coverage.config.ts` (the comment), `tests/browser/playwright/devtools.spec.ts` (two comments), `tests/scripts/grep-gates.ts`
- Possibly: both clients' `package.json` and `pnpm-lock.yaml`

**Interfaces:**
- Consumes from Task 1: `startWebClient`, `WebClientPage`, `WebClientView`, `INSTANT_COVER`, and the existing `Composition`, `CoreSwapView`, `CoverTimings`, `webBootEnvOf`, `readDemoAccounts`, `createDevtoolsHub`, `buildBrowserPorts`.
- Produces: `AppRoot` with a required `demoAccounts: readonly DemoAccount[]` prop in both clients.

- [ ] **Step 1: Rebuild the package and record the baselines.** `pnpm --filter @rtc/web-boot build`. Then note the case counts of `pnpm --filter @rtc/client-react test` and `pnpm --filter @rtc/client-solid test`.

- [ ] **Step 2: `AppRoot` takes the accounts (React).** In `packages/client-react/src/AppRoot.tsx`: drop the `readDemoAccounts` and `webBootEnvOf` imports, import `type DemoAccount` from `@rtc/domain`, add the prop, and pass it through.

```tsx
export function AppRoot({
  composition,
  demoAccounts,
  children,
}: AppRootProps): ReactElement {
```

```tsx
        coreSelection: composition.coreSelection,
        demoAccounts,
```

```tsx
interface AppRootProps {
  composition: Composition;
  /** The sign-ins the login screen lists as a hint: the page's, not one
   * composition's. */
  demoAccounts: readonly DemoAccount[];
  children: ReactNode;
}
```

- [ ] **Step 3: `AppRoot` takes the accounts (Solid).** In `packages/client-solid/src/AppRoot.tsx`, same imports change. Read both props once, as `composition` is read today:

```tsx
  // Neither prop changes within one mount: a swap renders a new tree rather
  // than re-valuing this component, so one `untrack`ed read is correct.
  const { composition, demoAccounts } = untrack(() => {
    return {
      composition: props.composition,
      demoAccounts: props.demoAccounts,
    };
  });
```

```tsx
      coreSelection: composition.coreSelection,
      demoAccounts,
```

Add `demoAccounts: readonly DemoAccount[];` to `AppRootProps` with the same doc comment.

- [ ] **Step 4: The test pages.** In `AppRootPage.tsx` and `AppPage.tsx`: replace the `#/app/devtools/devtoolsHub` import with a module-level hub and env, and pass the accounts to every `<AppRoot>`.

```tsx
/** The build-time values of the test run, and a hub of this page's own: the
 * client's is created inside `startWebClient`, which a test does not call. */
const env = webBootEnvOf(import.meta.env);
const devtoolsHub = createDevtoolsHub({ appId: "rtc-web", dev: env.dev });
const demoAccounts = readDemoAccounts(env);
```

Solid's uses `appId: "rtc-web-solid"`. Each `buildBrowserPorts({ env: webBootEnvOf(import.meta.env), devtoolsHub })` becomes `buildBrowserPorts({ env, devtoolsHub })`, and each `<AppRoot composition={…}>` gains `demoAccounts={demoAccounts}`. Update the two comments that describe the chain `AppRoot → readDemoAccounts()` (`packages/client-react/src/AppRoot.test.tsx:6`, `packages/client-solid/src/ui/App.test.tsx:76`).

- [ ] **Step 5: React's `main.tsx`.** Keep the font block and `import "./index.css"` exactly. Replace everything else with:

```tsx
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import {
  type Composition,
  type CoreSwapView,
  type CoverTimings,
  startWebClient,
  type WebClientPage,
  type WebClientView,
  webBootEnvOf,
} from "@rtc/web-boot";

import { AppRoot } from "./AppRoot";
import { createReactTreeMount } from "./app/reactTreeMount";
import { App } from "./ui/App";
import { CoreSwapOverlay } from "./ui/shell/core/CoreSwapOverlay";

import "./index.css";

// Fire-and-forget by design: `startWebClient` shows the boot-error screen
// itself, and its promise never rejects.
void startWebClient({
  appId: "rtc-web",
  rootId: "root",
  // Read here because only the client's own source is where the bundler
  // substitutes the build-time values.
  env: webBootEnvOf(import.meta.env),
  createView: createReactView,
});

/** The React part of the page: the app tree and the swap overlay, each on a
 * root of its own. */
function createReactView(page: WebClientPage): WebClientView {
  // A tree that fails its first render makes `mount` throw (React 19 does
  // not), so a swap onto a core whose UI cannot render ends in the host's
  // `onFatal`.
  const tree = createReactTreeMount(page.rootEl);
  const overlayRoot = createRoot(page.overlayEl);

  return {
    mount: (composition: Composition): void => {
      tree.mount(
        <StrictMode>
          <AppRoot
            key={composition.generation}
            composition={composition}
            demoAccounts={page.demoAccounts}
          >
            <App />
          </AppRoot>
        </StrictMode>,
      );
    },
    unmount: tree.unmount,
    destroy: tree.destroy,
    showOverlay: (swap: CoreSwapView | null, fade: CoverTimings): void => {
      // Synchronous, so the cover is in the DOM before the host's next step.
      flushSync(() => {
        overlayRoot.render(<CoreSwapOverlay swap={swap} fade={fade} />);
      });
    },
  };
}
```

- [ ] **Step 6: Solid's `main.tsx`.** Keep the font block, the `solid-devtools` import with its comment, and `import "./index.css"`. Replace the rest with:

```tsx
import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import {
  type Composition,
  type CoreSwapView,
  type CoverTimings,
  INSTANT_COVER,
  startWebClient,
  type WebClientPage,
  type WebClientView,
  webBootEnvOf,
} from "@rtc/web-boot";

import { AppRoot } from "./AppRoot";
import { createSolidTreeMount } from "./app/solidTreeMount";
import { App } from "./ui/App";
import {
  CoreSwapOverlay,
  type CoreSwapOverlayProps,
} from "./ui/shell/core/CoreSwapOverlay";

import "./index.css";

// Fire-and-forget by design: `startWebClient` shows the boot-error screen
// itself, and its promise never rejects.
void startWebClient({
  appId: "rtc-web-solid",
  rootId: "root",
  // Read here because only the client's own source is where the bundler
  // substitutes the build-time values.
  env: webBootEnvOf(import.meta.env),
  createView: createSolidView,
});

/** The Solid part of the page: the app tree and the swap overlay, each a
 * reactive root of its own. */
function createSolidView(page: WebClientPage): WebClientView {
  // A tree that fails its first render is disposed before `mount` throws,
  // so a swap onto a core whose UI cannot render leaks no reactive root.
  const tree = createSolidTreeMount(page.rootEl);
  const [overlay, setOverlay] = createSignal<CoreSwapOverlayProps>({
    swap: null,
    fade: INSTANT_COVER,
  });
  render(() => {
    return <CoreSwapOverlay swap={overlay().swap} fade={overlay().fade} />;
  }, page.overlayEl);

  return {
    mount: (composition: Composition): void => {
      tree.mount(() => {
        return (
          <AppRoot composition={composition} demoAccounts={page.demoAccounts}>
            <App />
          </AppRoot>
        );
      });
    },
    unmount: tree.unmount,
    destroy: tree.destroy,
    showOverlay: (swap: CoreSwapView | null, fade: CoverTimings): void => {
      // A signal write renders synchronously, so the cover is in the DOM
      // before the host's next step.
      setOverlay({ swap, fade });
    },
  };
}
```

If ESLint's order rule wants the function above the call, follow ESLint.

- [ ] **Step 7: Delete the hub files and prune.** `git rm` both `src/app/devtools/devtoolsHub.ts`. Run `pnpm lint:dead`. If knip reports `@rtc/devtools-core` (or any other dependency) unused in a client, remove it from that `package.json`, run `pnpm install`, and commit the `pnpm-lock.yaml` importer change. If knip reports `createDevtoolsHub`'s or another export as unused, stop and report it: the test pages should be using it.

Update each `vitest.app.coverage.config.ts` comment: the tier now covers the tree mount alone. Update the two comments in `tests/browser/playwright/devtools.spec.ts` that name `devtoolsHub.ts`: the app id is now the `appId` each client's `main.tsx` passes to `startWebClient`.

- [ ] **Step 8: Gate 53.** In `tests/scripts/grep-gates.ts`, after gate 52, mirroring gate 36's shape:

```ts
  {
    name: "53. A web client reads import.meta.env only in main.tsx (the entry hands the values to @rtc/web-boot)",
    pattern: "import\\.meta\\.env",
    paths: ["../packages/client-react/src/", "../packages/client-solid/src/"],
    excludes: ["/node_modules/", "/src/main.tsx", ".test.", ".spec."],
  },
```

Run `pnpm --filter @rtc/tests gates`. Expected: 53 gates, all green. Search the docs for a stated gate count (`grep -rn "52 gates\|52 grep" docs CLAUDE.md tests`) and update any.

Mutation rows (test = `pnpm --filter @rtc/tests gates`): add a line `const dev = import.meta.env.DEV;` to each client's `AppRoot.tsx` (two rows, each a `find` on a unique existing line with the new line appended in `replace`). Expected: both KILLED.

- [ ] **Step 9: Run both clients.**

```bash
pnpm --filter @rtc/client-react typecheck
pnpm --filter @rtc/client-solid typecheck
pnpm --filter @rtc/client-react test
pnpm --filter @rtc/client-solid test
pnpm --filter @rtc/client-react test:ui:contract
pnpm --filter @rtc/client-solid test:ui:contract
```

Expected: green. Unit counts equal the Step 1 baselines (no test added or removed in this task).

Mutation rows for the prop (find the contract case that asserts the demo-accounts hint in each client and use it as `test`): in each `AppRoot.tsx`, replace the `demoAccounts,` line inside the `createViewModel` call with `demoAccounts: [],`. Expected: both KILLED.

- [ ] **Step 10: The production build and the browser.**

```bash
pnpm build
pnpm check:core-bundle
pnpm test:e2e
```

Run each alone, never two at once, and never pipe or filter the e2e run. Expected: each core in exactly one lazy chunk and none in the eager set, for both clients; all e2e suites green. These three are this task's Review Focus witnesses.

- [ ] **Step 11: Lint and commit.**

```bash
pnpm exec biome ci --error-on-warnings .
pnpm lint:eslint
pnpm check:deps
git add -A
git commit -m "refactor(clients): each main.tsx is its fonts, its view and one startWebClient call"
```

---

### Task 3: one test for the two deployed-file checks; docs; close the workstream

**Files:**
- Create: `tests/scripts/lib/webClientFiles.test.ts`
- Delete: `packages/client-{react,solid}/src/app/__tests__/envProduction.test.ts`, `packages/client-{react,solid}/src/app/__tests__/popoutPage.test.ts`
- Modify: `CLAUDE.md`, `docs/STATUS.md`, `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`, `docs/architecture/20-devtools.md`, `packages/devtools-core/README.md`, `packages/web-boot/README.md`, and every other doc or comment the greps below find

**Interfaces:**
- Consumes: nothing from Tasks 1 and 2 in code. The docs describe their result.
- Produces: nothing a later task uses.

- [ ] **Step 1: Write the test.** `tests/scripts/lib/webClientFiles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ROSTER } from "@rtc/domain";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

const WEB_CLIENTS = ["client-react", "client-solid"] as const;

describe.each(WEB_CLIENTS)("%s: the files its deployed build depends on", (client) => {
  /**
   * The deploy guard only greps the built bundle for the demo PASSWORD string
   * (`deploy.yml`), so a committed `.env.production` whose `VITE_DEMO_AUTH` is
   * malformed JSON would still pass it: `parseDevAuth` would then yield an
   * empty roster at runtime and the deployed build would silently stop being
   * hybrid (every login, demo accounts included, posted to the server). This
   * pins the file itself: valid JSON, exactly the roster's usernames, every
   * password a non-empty string.
   */
  it(".env.production's VITE_DEMO_AUTH parses to the roster's usernames with non-empty passwords", () => {
    const parsed: unknown = JSON.parse(readDemoAuthLine(client));

    expect(parsed).toBeTypeOf("object");
    const roster = parsed as Record<string, unknown>;
    expect(Object.keys(roster).sort()).toEqual(
      ROSTER.map((entry) => {
        return entry.username;
      }).sort(),
    );

    for (const password of Object.values(roster)) {
      expect(typeof password).toBe("string");
      expect((password as string).length).toBeGreaterThan(0);
    }
  });

  // Dockview's pop-out machinery loads `/popout.html` in the child window,
  // waits for `load`, appends its own container to the body and copies every
  // parent stylesheet across (popoutWindow.js). Without a real file at that
  // path the dev server's SPA fallback boots the ENTIRE app inside the child
  // (its own header under dockview's container) and the deployed site 404s,
  // so the page must exist as a genuine root-level build input. Vercel needs
  // no config change: routing is filesystem-first, so a real dist/popout.html
  // wins over the SPA rewrite.
  it("popout.html is a real empty-body page and a build input", () => {
    const page = readClientFile(client, "popout.html");
    expect(page).toContain("<body></body>");

    const config = readClientFile(client, "vite.config.ts");
    expect(config).toContain("popout.html");
  });
});

function readClientFile(client: string, file: string): string {
  return readFileSync(resolve(REPO, "packages", client, file), "utf8");
}

function readDemoAuthLine(client: string): string {
  const line = readClientFile(client, ".env.production")
    .split("\n")
    .find((candidate) => {
      return candidate.startsWith("VITE_DEMO_AUTH=");
    });

  if (line === undefined) {
    throw new Error(`${client}/.env.production has no VITE_DEMO_AUTH line`);
  }

  return line.slice("VITE_DEMO_AUTH=".length);
}
```

If `packageSurfaces.test.ts` in the same folder already names the repo root, reuse its way of finding it.

- [ ] **Step 2: Run it.**

Run: `pnpm --filter @rtc/tests exec vitest run scripts/lib/webClientFiles.test.ts`
Expected: PASS, 4 cases.

- [ ] **Step 3: Prove each case can fail.** Mutation rows, `test` as in Step 2:

| name | file | find | replace |
|---|---|---|---|
| react roster | `packages/client-react/.env.production` | `VITE_DEMO_AUTH=` | `VITE_DEMO_AUTH=x` |
| solid roster | `packages/client-solid/.env.production` | `VITE_DEMO_AUTH=` | `VITE_DEMO_AUTH=x` |
| react popout | `packages/client-react/popout.html` | `<body></body>` | `<body><p></p></body>` |
| solid popout | `packages/client-solid/popout.html` | `<body></body>` | `<body><p></p></body>` |

Expected: four KILLED.

- [ ] **Step 4: Delete the four client tests.** `git rm` them. Run `pnpm --filter @rtc/client-react test` and `pnpm --filter @rtc/client-solid test`. Expected: each two cases below its Task 2 count. Run `pnpm --filter @rtc/tests test:report`. Expected: four cases above its count before this task.

- [ ] **Step 5: Docs.** Find every statement this PR made false:

```bash
grep -rn "devtoolsHub\.ts\|app/devtools\|envProduction\|popoutPage" --include='*.md' --include='*.ts' --include='*.tsx' --include='*.mts' . | grep -v node_modules | grep -v /dist/ | grep -v docs/superpowers/plans | grep -v CHANGELOG
grep -rn "main\.tsx" CLAUDE.md docs/architecture docs/architecture.md packages/*/README.md packages/web-boot/src tests/browser | grep -v node_modules
```

Rewrite each to the present state, in present tense, with no "previously" notes. At least:

- `CLAUDE.md`: the `web-boot/` row (it now lists `startWebClient`; drop "`main.tsx` still lives in each client (see `docs/STATUS.md`)" in favour of what a client's `main.tsx` holds); both client rows if a dependency left in Task 2; the "Demo accounts & auth env" paragraph's `readDemoAccounts()` chain.
- `docs/architecture/20-devtools.md` near line 364 and `packages/devtools-core/README.md` near line 73: the hub is created by `startWebClient` from the `appId` a client passes.
- `packages/web-boot/README.md`: add `startWebClient` and the view contract.
- Comments in `packages/web-boot/src` and `tests/browser` that say "`main.tsx` does X" where `startWebClient` now does it.
- The coverage-report prose, if it says what each `app` tier covers.

- [ ] **Step 6: The spec.** In `docs/superpowers/specs/2026-10-06-web-boot-package-design.md`: set the status line to implemented, and add under the `startWebClient` section an "Amended 2026-10-11 (PR 3)" paragraph that states this plan's eight decisions as the design that was built, with the final `WebClientOptions` / `WebClientPage` / `WebClientView` signatures. Correct "What stays in each client" (no `devtoolsHub.ts`).

- [ ] **Step 7: STATUS.** The workstream is complete: delete the "Web boot deduplication" entry from `docs/STATUS.md` and bump the `Last updated` line to 2026-10-11.

- [ ] **Step 8: Gates and commit.**

```bash
pnpm check:doc-links
pnpm exec biome ci --error-on-warnings .
pnpm lint:eslint
pnpm lint:dead
git add -A
git commit -m "test: one test for both clients' deployed files; docs: startWebClient closes the web-boot workstream"
```

---

## After the last task

1. Final whole-branch review on the most capable model, with this plan's Review Focus and the ledger's rulings.
2. Full local gauntlet on the final tree (all `checks`-job gates), then `pnpm --filter @rtc/tests test:report`, the two `test:ui:styles`, and `pnpm test:e2e`, each alone.
3. Push, open the PR, CI green on the head commit, CodeQL analysis present for that commit with zero open alerts, then merge with a merge commit. Nothing is deployed.
