import {
  type AppToInspector,
  BroadcastChannelDuplex,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";

export interface InspectorSession {
  store: InspectorStore;
  invokeIntent(machineId: string, name: string, args: readonly unknown[]): void;
  dispose(): void;
}

// The channel name the app-side hub (Task 11) listens on. BroadcastChannel is
// same-origin only, so this only ever pairs the inspector with a hub served
// from the same origin — a standalone `pnpm dev` (port 5280) has no hub to
// pair with and stays disconnected by design.
const CHANNEL_NAME = "rtc-devtools";

/** Wires the inspector-side session: an `InspectorStore` plus, when
 * BroadcastChannel exists, a live `InspectorClient` piping hub messages into
 * it. jsdom (unit tests) has no BroadcastChannel, so the store-only fallback
 * keeps the shell testable without a real channel. */
export function createInspectorSession(): InspectorSession {
  const store = new InspectorStore();

  if (typeof BroadcastChannel === "undefined") {
    return { store, invokeIntent: (): void => {}, dispose: (): void => {} };
  }

  const channel = new BroadcastChannelDuplex<InspectorToApp, AppToInspector>(
    CHANNEL_NAME,
  );
  const client = new InspectorClient(channel, store);
  client.start();

  return {
    store,
    invokeIntent: (
      machineId: string,
      name: string,
      args: readonly unknown[],
    ): void => {
      client.invokeIntent(machineId, name, args);
    },
    dispose: (): void => {
      client.dispose();
      channel.dispose();
    },
  };
}
