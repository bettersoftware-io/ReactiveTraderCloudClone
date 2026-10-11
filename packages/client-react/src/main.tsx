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
