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
import { render } from "solid-js/web";

import { AppRoot } from "./AppRoot";
import { App } from "./ui/App";

import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element #root not found in DOM");
}

render(() => {
  return (
    <AppRoot>
      <App />
    </AppRoot>
  );
}, rootEl);
