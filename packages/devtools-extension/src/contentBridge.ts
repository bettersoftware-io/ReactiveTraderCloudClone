import type { BridgeChannel } from "#/bridgeRelay";
import { createBridgeRelay } from "#/bridgeRelay";
import type { RuntimePort } from "#/ports";

/** Injected into the app tab (same origin as the hub). Opens the same
 * `rtc-devtools` BroadcastChannel the app-side DevtoolsHub listens on, connects
 * a runtime port to the background router, and relays between them. */
const CHANNEL_NAME = "rtc-devtools";

const raw = new BroadcastChannel(CHANNEL_NAME);

const channel: BridgeChannel = {
  postMessage: (msg: unknown): void => {
    raw.postMessage(msg);
  },
  addMessageListener: (cb: (msg: unknown) => void): void => {
    raw.onmessage = (ev: MessageEvent): void => {
      cb(ev.data);
    };
  },
  close: (): void => {
    raw.close();
  },
};

const port = chrome.runtime.connect({ name: "rtc-content" });

createBridgeRelay({ channel, port: port as unknown as RuntimePort });
