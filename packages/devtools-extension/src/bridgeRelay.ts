import type { RuntimePort } from "#/ports";

/** The structural subset of `BroadcastChannel` the bridge needs, adapted so the
 * relay is testable without a real channel (`onmessage` becomes an explicit
 * listener registration). */
export interface BridgeChannel {
  postMessage(msg: unknown): void;
  addMessageListener(cb: (msg: unknown) => void): void;
  close(): void;
}

interface BridgeRelayDeps {
  channel: BridgeChannel;
  port: RuntimePort;
  /** Invoked when the runtime port disconnects (e.g. the MV3 service worker
   * was cycled). The content bridge uses this to reconnect a fresh port while
   * keeping the same BroadcastChannel open; if omitted, a disconnect is a
   * no-op (the channel stays open and is only closed by dispose()). */
  onPortDisconnect?: () => void;
}

interface BridgeRelayHandle {
  dispose(): void;
}

/** Relays a same-origin `rtc-devtools` BroadcastChannel (from the app hub) to a
 * `chrome.runtime` port (to the panel, via the background router) and back.
 * The channel is never closed on port disconnect — only `dispose()` closes it
 * (or the page unloading tears it down) — so a caller can reconnect a fresh
 * port via `onPortDisconnect` and keep relaying on the same channel. Purely a
 * forwarder: it never inspects or mutates messages, and never originates a
 * `hello`, so injecting it does not wake the dormant hub. */
export function createBridgeRelay(deps: BridgeRelayDeps): BridgeRelayHandle {
  const { channel, port, onPortDisconnect } = deps;

  channel.addMessageListener((msg: unknown): void => {
    port.postMessage(msg);
  });

  port.onMessage.addListener((msg: unknown): void => {
    channel.postMessage(msg);
  });

  port.onDisconnect.addListener((): void => {
    onPortDisconnect?.();
  });

  return {
    dispose(): void {
      channel.close();
    },
  };
}
