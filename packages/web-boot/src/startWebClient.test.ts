import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockInstance,
  vi,
} from "vitest";

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

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  history.replaceState(null, "", "/");
  localStorage.clear();
  delete document.documentElement.dataset.coreImpl;
  delete document.documentElement.dataset.powerSaver;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installMatchMedia(false);
});

afterEach(async () => {
  await disposeComposedApps();
  // Disposes the devtools hubs the cases created: each added a `pagehide`
  // listener to the shared jsdom window and opened a channel.
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // jsdom has no `navigator.webdriver`; a case that sets it is undone here.
  Reflect.deleteProperty(navigator, "webdriver");
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
    }).toThrow(/bogus/);
    expect(client.createView).not.toHaveBeenCalled();
  });

  it("boots the default core: logs it, hands the view the page, mounts and publishes", async () => {
    const client = createClient({
      env: { devAuth: JSON.stringify({ astark: "pw" }) },
    });

    await client.start();

    expect(console.info).toHaveBeenCalledWith(
      "[core] booted rxjs from fallback",
    );
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

  it("tells the view the page can register when it has a server URL", async () => {
    const client = createClient({ env: { serverUrl: "ws://x" } });

    await client.start();

    expect(client.page().registrationAvailable).toBe(true);
  });

  it("tells the view the page cannot register without a server URL", async () => {
    const client = createClient({ env: { serverUrl: "" } });

    await client.start();

    expect(client.page().registrationAvailable).toBe(false);
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
    // The real loader hands back the package's own rxjs core, which nothing
    // here wraps: record what it composes so `afterEach` disposes it.
    const createApp = vi.spyOn(rxjsCore, "createApp");
    const client = createClient({ realLoader: true });

    await client.start();
    composedApps.push(...composedBy(createApp));

    expect(createApp).toHaveBeenCalledTimes(1);
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
    const client = createClient({
      appId: "rtc-test-client",
      env: { dev: true },
    });

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

  it("a production build's hub tells the inspector it is not a dev build", async () => {
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
      expect.objectContaining({
        from: expect.objectContaining({ impl: "rxjs", label: "RxJS" }),
        to: expect.objectContaining({ impl: "async", label: "async/await" }),
      }),
      COVER,
    );

    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.view.unmount).toHaveBeenCalledTimes(1);
    expect(endComposition).toHaveBeenCalledTimes(1);
    expect(client.view.mount).toHaveBeenCalledTimes(2);
    expect(client.composition(2).generation).toBe(2);
    expect(client.composition(2).impl).toBe("async");
    // The second composition is instrumented too: its presenters are wrapped.
    expect(client.composition(2).presenters).not.toBe(
      client.composedApps()[1]?.presenters,
    );
    expect(document.documentElement.dataset.coreImpl).toBe("async");
    expect(localStorage.getItem(CORE_CHOICE_KEY)).toBe("async");
    expect(location.search).toBe("?x=1");
    expect(client.infoLines()).toEqual([
      "[core] booted rxjs from url",
      "[core] swapped rxjs to async",
    ]);
    expect(client.view.showOverlay).toHaveBeenLastCalledWith(null, COVER);
    expect(client.rootEl().inert).toBe(false);
  });

  it.each([
    ["power-saver freeze", "freeze", false],
    ["reduced motion", undefined, true],
  ])(
    "under %s the swap's cover is a jump cut",
    async (_name, powerSaver, reducedMotion) => {
      vi.useFakeTimers();
      installMatchMedia(reducedMotion);
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
    },
  );

  it("under webdriver a swap's cover is instant, and the swap still completes", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "webdriver", {
      value: true,
      configurable: true,
    });
    const client = createClient();
    await client.start();

    client.composition(1).coreSelection.select("async");

    expect(client.view.showOverlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "covering" }),
      INSTANT,
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
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[core\] the async core failed to start: /),
    );
    expect(client.rootEl().textContent).toContain(
      "The application core failed to load",
    );
    expect(client.rootEl().inert).toBe(false);
  });
});

interface ClientOptions {
  readonly appId?: string;
  readonly env?: Partial<WebBootEnv>;
  /** Every `load` rejects with this. */
  readonly loadError?: Error;
  /** The view's `mount` throws this. */
  readonly mountError?: Error;
  /** The client's cores compose one app between them, the boot's; every later
   * `createApp`, of either core, throws. */
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

  const createView = vi.fn((_page: WebClientPage): WebClientView => {
    return view;
  });
  // `composedApps` is the one list; this client answers for what it added after
  // this point.
  const composedBefore = composedApps.length;
  let composed = 0;

  function mayCompose(): boolean {
    composed += 1;

    return options.composeOnce !== true || composed === 1;
  }

  const load = vi.fn((impl: CoreImpl): Promise<CoreFactory> => {
    if (options.loadError !== undefined) {
      return Promise.reject(options.loadError);
    }

    const core = CORES[impl];

    if (core === undefined) {
      return Promise.reject(new Error(`no test core for ${impl}`));
    }

    return Promise.resolve(createTrackedCore(core, mayCompose));
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
      return composedApps.slice(composedBefore);
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

/** The same core, recording every app it composes; `mayCompose` is asked for
 * each `createApp`, and a core it refuses throws instead. */
function createTrackedCore(
  core: CoreFactory,
  mayCompose: () => boolean,
): CoreFactory {
  return {
    createApp: (ports: AppPorts): App => {
      if (!mayCompose()) {
        throw new Error("this core composes once");
      }

      const app = core.createApp(ports);
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

/** The apps a spied `createApp` returned. */
function composedBy(createApp: MockInstance<CoreFactory["createApp"]>): App[] {
  return createApp.mock.results.flatMap((result) => {
    return result.type === "return" ? [result.value] : [];
  });
}

/** jsdom has no `matchMedia`. */
function installMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (media: string) => {
    return {
      matches,
      media,
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
    };
  });
}

const COVER = { enterMs: 160, holdMs: 500, exitMs: 200 } as const;

const JUMP_CUT = { enterMs: 0, holdMs: 500, exitMs: 0 } as const;

const INSTANT = { enterMs: 0, holdMs: 0, exitMs: 0 } as const;
