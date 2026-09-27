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
import { createRoot } from "react-dom/client";

import { AppRoot } from "./AppRoot";
import { bootCore, renderBootError } from "./app/bootApp";
import {
  clearCoreChoice,
  createCoreSelection,
  loadCore,
  safeLocalStorage,
  urlWithoutCoreParam,
} from "./app/coreSelection";
import { App } from "./ui/App";

import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

const storage = safeLocalStorage();

bootCore({
  href: location.href,
  storage,
  buildDefault: import.meta.env.VITE_CORE_IMPL,
  warn: (message: string): void => {
    console.warn(`[core] ${message}`);
  },
  load: loadCore,
}).then(
  ({ impl, core }) => {
    document.documentElement.dataset.coreImpl = impl;
    const coreSelection = createCoreSelection({
      current: impl,
      storage,
      href: () => {
        return location.href;
      },
      navigate: (href: string): void => {
        location.assign(href);
      },
    });

    createRoot(rootEl).render(
      <StrictMode>
        <AppRoot core={core} coreSelection={coreSelection}>
          <App />
        </AppRoot>
      </StrictMode>,
    );
  },
  (error: unknown) => {
    renderBootError(rootEl, error, () => {
      clearCoreChoice(storage);
      location.assign(urlWithoutCoreParam(location.href));
    });
  },
);
