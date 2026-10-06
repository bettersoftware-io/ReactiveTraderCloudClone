// v2 design fonts (PROTO L23): Chakra Petch 400/500/600/700, JetBrains Mono 400/500/700,
// IBM Plex Sans 400/500/600, IBM Plex Mono 400/500/600, Orbitron 700/800
// (wordmark, P&L amount, lock-screen fallback, prefs-dialog title chrome).
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { App as CoreApp, CoreFactory, CoreImpl } from "@rtc/core-api";
import {
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";

import { AppRoot } from "./AppRoot";
import {
  bootCore,
  formatBootedMessage,
  renderBootError,
  runBoot,
} from "./app/bootApp";
import { buildBrowserPorts } from "./app/buildBrowserPorts";
import { type Composition, createCoreHost } from "./app/coreHost";
import {
  CORE_OPTIONS,
  clearCoreChoice,
  defaultCoreResetHref,
  loadCore,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./app/coreSelection";
import { coreSwapOf } from "./app/coreSwapView";
import { chooseCoverTimings, type MotionSettings } from "./app/coverTimings";
import { devtoolsHub } from "./app/devtools/devtoolsHub";
import { PRESENTER_MANIFEST } from "./app/devtools/presenterManifest";
import { createReactTreeMount } from "./app/reactTreeMount";
import { App } from "./ui/App";
import { CoreSwapOverlay } from "./ui/shell/core/CoreSwapOverlay";

import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

const storage = safeLocalStorage();

/** Logs a caught, non-fatal core-selection issue (an unknown `?core=`/stored
 * value, or a storage read/write/clear failure) so it's diagnosable from the
 * console rather than silently swallowed. */
function warnCore(message: string): void {
  console.warn(`[core] ${message}`);
}

/** Clears the stored choice and reloads onto the RxJS core — the boot-error
 * screen's "Load the default core" action. */
function reloadOntoDefaultCore(): void {
  clearCoreChoice(storage, warnCore);
  location.assign(defaultCoreResetHref(location.href));
}

/** Applies the devtools decorators to one composition (the core host calls
 * this once per `createApp`). */
function instrumentComposition(
  core: CoreFactory,
  app: CoreApp,
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

function waitForNextMacrotask(): Promise<void> {
  return sleep(0);
}

// Fire-and-forget by design: runBoot routes every rejection (core load or
// the host's first composition) to renderBootError, so there is nothing left
// to handle here.
void runBoot(
  bootCore({
    href: location.href,
    storage,
    buildDefault: import.meta.env.VITE_CORE_IMPL,
    warn: warnCore,
    load: loadCore,
  }),
  ({ impl, core, source }) => {
    console.info(formatBootedMessage(impl, source));
    // A tree that fails its first render makes `mount` throw (React 19 does
    // not), so a swap onto a core whose UI cannot render ends in `onFatal`.
    const tree = createReactTreeMount(rootEl);

    // The swap overlay gets a root of its own, outside the app tree: that
    // tree is unmounted and mounted again while the overlay covers it.
    const overlayEl = document.createElement("div");
    overlayEl.id = "core-swap-overlay";
    document.body.append(overlayEl);
    const overlayRoot = createRoot(overlayEl);
    // The timings of the swap under way: the host asks for them as each swap
    // starts, and the overlay's two fades take the same numbers.
    let cover = chooseCoverTimings(readMotionSettings());

    // The host owns the ports (built once per page) and every composition;
    // a Preferences core choice swaps the core in place, with no reload.
    const host = createCoreHost({
      ports: buildBrowserPorts(),
      initial: { impl, core },
      load: loadCore,
      instrument: instrumentComposition,
      endComposition: () => {
        devtoolsHub.endComposition();
      },
      mount: (composition: Composition): void => {
        tree.mount(
          <StrictMode>
            <AppRoot key={composition.generation} composition={composition}>
              <App />
            </AppRoot>
          </StrictMode>,
        );
      },
      unmount: tree.unmount,
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
        // No core is composed: drop whatever the root still holds, then show
        // the boot-error screen in its place.
        tree.destroy();
        renderBootError(rootEl, error, reloadOntoDefaultCore);
      },
      cover: () => {
        cover = chooseCoverTimings(readMotionSettings());
        return cover;
      },
      sleep,
      nextMacrotask: waitForNextMacrotask,
    });

    // Synchronous, so the cover is in the DOM before the host's next step.
    // Subscribed before `start()`: a boot that fails leaves the host `fatal`,
    // which renders nothing over the boot-error screen.
    host.state$.subscribe((state) => {
      flushSync(() => {
        overlayRoot.render(
          <CoreSwapOverlay
            swap={coreSwapOf(state, CORE_OPTIONS)}
            fade={cover}
          />,
        );
      });
    });

    try {
      host.start();
    } catch (error) {
      // The boot composition could not be mounted, and the host has disposed
      // it: drop the root too, as `onFatal` does, before `runBoot` shows the
      // boot-error screen in its place.
      tree.destroy();
      throw error;
    }
  },
  (error: unknown) => {
    renderBootError(rootEl, error, reloadOntoDefaultCore);
  },
);
