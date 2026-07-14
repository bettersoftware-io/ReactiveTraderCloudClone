import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

/** App-side devtools hub. Module-level singleton (same precedent as the
 * reconnect$/incident$ seams): infrastructure whose lifetime is the page.
 * Dormant until an inspector handshakes on the rtc-devtools channel; costs
 * nothing per-emission until then. BroadcastChannel is same-origin — the
 * inspector must be served from this origin (/devtools route or dev
 * middleware). Guarded so jsdom/StrictMode double-mounts and non-browser
 * environments never throw. */
export const devtoolsHub = new DevtoolsHub({ appId: "rtc-web" });

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));
}
