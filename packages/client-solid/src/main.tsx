// v2 design fonts (PROTO L23): Chakra Petch 400/500/600/700, JetBrains Mono 400/500/700,
// IBM Plex Sans 400/500/600, IBM Plex Mono 400/500/600, Orbitron 700/800
// (wordmark, P&L amount, lock-screen fallback, prefs-dialog title chrome).
// Mirrors client-react's main.tsx font manifest verbatim (see that file).
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
// Solid Devtools runtime: registers this app with the browser extension.
// Static import per the package's own docs — the vite plugin's `apply()` gate
// (see vite.config.ts) resolves this to a real no-op module at build time
// (the package's export map falls back to `index_noop.js` once the plugin
// isn't intercepting the specifier), so it's safe to leave unguarded here.
import "solid-devtools";

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
import {
  type Composition,
  type CoverTimings,
  createCoreHost,
} from "./app/coreHost";
import {
  clearCoreChoice,
  defaultCoreResetHref,
  loadCore,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./app/coreSelection";
import { devtoolsHub } from "./app/devtools/devtoolsHub";
import { PRESENTER_MANIFEST } from "./app/devtools/presenterManifest";
import { createSolidTreeMount } from "./app/solidTreeMount";
import { App } from "./ui/App";

import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

const storage = safeLocalStorage();

/** No swap overlay yet: a swap covers, holds and reveals in zero time. */
const NO_COVER: CoverTimings = { enterMs: 0, holdMs: 0, exitMs: 0 };

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
    // A tree that fails its first render is disposed before `mount` throws,
    // so a swap onto a core whose UI cannot render leaks no reactive root.
    const tree = createSolidTreeMount(rootEl);

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
        tree.mount(() => {
          return (
            <AppRoot composition={composition}>
              <App />
            </AppRoot>
          );
        });
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
      cover: NO_COVER,
      sleep,
      nextMacrotask: waitForNextMacrotask,
    });

    host.start();
  },
  (error: unknown) => {
    renderBootError(rootEl, error, reloadOntoDefaultCore);
  },
);
