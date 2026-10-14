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
import {
  buildBrowserPorts,
  offersRegistration,
  readDemoAccounts,
} from "./buildBrowserPorts";
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
  /** Whether the page has a server to register with: the login screen
   * offers the account flows only then. */
  readonly registrationAvailable: boolean;
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
        registrationAvailable: offersRegistration(env),
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
