import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

/** App-side devtools hub. Module-level singleton (same precedent as the
 * reconnect$/incident$ seams): infrastructure whose lifetime is the page.
 * Dormant until an inspector handshakes on the rtc-devtools channel; costs
 * nothing per-emission until then. BroadcastChannel is same-origin — the
 * inspector must be served from this origin (/devtools route or dev
 * middleware). Guarded so jsdom/StrictMode double-mounts and non-browser
 * environments never throw. */
// `import.meta.env?.DEV` tells the inspector whether this is a dev build so the
// panel shows the intent-injection affordance only when it will work: true on
// the Vite dev server, false in a production build. The `?.` guard keeps
// non-browser / non-Vite runtimes — e.g. the node fullstack smoke, which
// imports this module via tsx with no `import.meta.env` — from throwing at
// module load; they read as a non-dev build. The write surface stays dev-only
// via the hub's compiled-out handler regardless.
export const devtoolsHub = new DevtoolsHub({
  appId: "rtc-web",
  dev: import.meta.env?.DEV === true,
});

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

  // Graceful close/reload/navigate ⇒ pagehide ⇒ dispose() ⇒ hub sends `bye`,
  // flipping the inspector panel to "disconnected". `pagehide` (not
  // `beforeunload`) survives bfcache and mobile Safari; dispose() is
  // idempotent and exception-safe (goDormant early-returns when not live), so
  // this is safe even if the hub never went live. An abrupt crash (no
  // pagehide) is a documented v1 limitation — see the design spec §5.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      devtoolsHub.dispose();
    });
  }
}
