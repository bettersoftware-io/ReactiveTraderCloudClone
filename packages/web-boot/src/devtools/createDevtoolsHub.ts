import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

export interface DevtoolsHubOptions {
  /** The id the inspector labels this app with. */
  readonly appId: string;
  /** True on a dev build: the inspector then offers intent injection. The
   * write surface stays dev-only through the hub's own handler regardless. */
  readonly dev: boolean;
}

/**
 * Builds the app-side devtools hub and wires it to the page. A client calls
 * this once, at module level: the hub's lifetime is the page, not one
 * composition (unlike the connection-intents pair, which
 * `pairConnectionPorts` scopes per composition).
 *
 * The hub is dormant until an inspector handshakes on the rtc-devtools
 * channel and costs nothing per emission until then. BroadcastChannel is
 * same-origin, so the inspector must be served from this origin (the
 * /devtools route, the dev middleware, or the extension's content-script
 * bridge). Both guards keep a non-browser runtime from throwing.
 */
export function createDevtoolsHub(options: DevtoolsHubOptions): DevtoolsHub {
  const hub = new DevtoolsHub(options);

  if (typeof BroadcastChannel !== "undefined") {
    hub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

    // A graceful close, reload or navigation fires pagehide, and dispose()
    // sends `bye`, which flips the inspector panel to "disconnected".
    // `pagehide` (not `beforeunload`) survives bfcache and mobile Safari.
    // dispose() is idempotent and exception-safe, so this is safe even if the
    // hub never went live. An abrupt crash sends nothing: a recorded limit of
    // the devtools design (spec §5).
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => {
        hub.dispose();
      });
    }
  }

  return hub;
}
