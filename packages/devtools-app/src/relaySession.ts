import {
  type AppToInspector,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
  type WebSocketFactory,
  WsRelayDuplex,
} from "@rtc/devtools-core";

import type { InspectorSession } from "#/inspectorSession";

/** Panel-side session pointed at the standalone WebSocket relay (React Native
 * inspection): the browser `devtools-app`, served from anywhere, constructs a
 * `WsRelayDuplex` tagged "panel" instead of a same-origin
 * `BroadcastChannelDuplex`. The `InspectorStore` + `InspectorClient` and the
 * four panels are byte-identical to the BroadcastChannel path — only the
 * transport differs. `createSocket` is injectable so tests drive a fake socket
 * without a real relay. */
export function createRelayInspectorSession(
  relayUrl: string,
  createSocket?: WebSocketFactory,
): InspectorSession {
  const store = new InspectorStore();
  const channel = new WsRelayDuplex<InspectorToApp, AppToInspector>(
    relayUrl,
    "panel",
    createSocket,
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
