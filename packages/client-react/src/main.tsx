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
// The v2 design fonts come from @rtc/web-boot/fonts (the one font manifest both
// web clients and their visual tiers share).
import "@rtc/web-boot/fonts";

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
            registrationAvailable={page.registrationAvailable}
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
