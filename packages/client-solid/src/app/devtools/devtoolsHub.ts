import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

/** App-side devtools hub for the Solid client. Module-level singleton whose
 * lifetime is the page. Dormant until an inspector handshakes on the
 * rtc-devtools channel; costs nothing per-emission until then. BroadcastChannel
 * is same-origin — the inspector must be served from this origin (/devtools
 * route or the MV3 extension's content-script bridge). Guarded so
 * jsdom/non-browser environments never throw. Mirrors client-react's
 * devtoolsHub.ts verbatim except appId (rtc-web-solid vs rtc-web) so the
 * inspector labels the two apps distinctly. */
export const devtoolsHub = new DevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env?.DEV === true,
});

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

  // Graceful close/reload/navigate ⇒ pagehide ⇒ dispose() ⇒ hub sends `bye`,
  // flipping the inspector panel to "disconnected". dispose() is idempotent and
  // exception-safe (goDormant early-returns when not live).
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      devtoolsHub.dispose();
    });
  }
}
