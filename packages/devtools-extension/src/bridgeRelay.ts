import type { RuntimePort } from "#/ports";

/** The structural subset of `BroadcastChannel` the bridge needs, adapted so the
 * relay is testable without a real channel (`onmessage` becomes an explicit
 * listener registration). */
export interface BridgeChannel {
  postMessage(msg: unknown): void;
  addMessageListener(cb: (msg: unknown) => void): void;
  close(): void;
}

/** Relays a same-origin `rtc-devtools` BroadcastChannel (from the app hub) to a
 * `chrome.runtime` port (to the panel, via the background router) and back.
 * When the port disconnects — the panel closed, or the router tore the pair
 * down — the channel is closed so the content script stops listening. Purely a
 * forwarder: it never inspects or mutates messages, and never originates a
 * `hello`, so injecting it does not wake the dormant hub. */
export function createBridgeRelay(deps: {
  channel: BridgeChannel;
  port: RuntimePort;
}): { dispose(): void } {
  const { channel, port } = deps;

  channel.addMessageListener((msg: unknown): void => {
    port.postMessage(msg);
  });

  port.onMessage.addListener((msg: unknown): void => {
    channel.postMessage(msg);
  });

  port.onDisconnect.addListener((): void => {
    channel.close();
  });

  return {
    dispose(): void {
      channel.close();
    },
  };
}
