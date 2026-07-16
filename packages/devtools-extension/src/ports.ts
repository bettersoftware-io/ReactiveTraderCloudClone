/** The structural subset of `chrome.runtime.Port` this package uses. Declaring
 * it ourselves (rather than leaning on the `chrome.*` global) lets the pure
 * router/duplex/bridge cores be unit-tested with plain fakes in node. */
export interface RuntimePort {
  name: string;
  postMessage(msg: unknown): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

/** Opens a fresh port. Injected everywhere a real `chrome.runtime.connect` would
 * be called, so reconnection is testable. */
export type ConnectFn = () => RuntimePort;
