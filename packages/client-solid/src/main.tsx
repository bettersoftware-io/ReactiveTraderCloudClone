// Solid Devtools runtime: registers this app with the browser extension.
// Static import per the package's own docs — the vite plugin's `apply()` gate
// (see vite.config.ts) resolves this to a real no-op module at build time
// (the package's export map falls back to `index_noop.js` once the plugin
// isn't intercepting the specifier), so it's safe to leave unguarded here.
import "solid-devtools";
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
// The v2 design fonts come from @rtc/web-boot/fonts (the one font manifest both
// web clients and their visual tiers share).
import "@rtc/web-boot/fonts";

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
          <AppRoot
            composition={composition}
            demoAccounts={page.demoAccounts}
            registrationAvailable={page.registrationAvailable}
          >
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
