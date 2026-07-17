import {
  type AppToInspector,
  DevtoolsHub,
  type InspectorToApp,
  type WebSocketFactory,
  WsRelayDuplex,
} from "@rtc/devtools-core";

/** Constructs the RN app-side devtools hub and attaches a WsRelayDuplex tagged
 * "app", pointed at the standalone relay. Called only under `__DEV__` from the
 * composition root, so a production RN build never constructs it and never opens
 * a socket. `dev: true` follows from that contract — the hub exists only in a
 * dev build, so it may accept the panel's intent-injection writes (the hub's
 * inbound write path is gated on this flag). `createSocket` is injectable so
 * unit tests assert the wiring without a real WebSocket. */
export function createNativeDevtoolsHub(
  relayUrl: string,
  createSocket?: WebSocketFactory,
): DevtoolsHub {
  const hub = new DevtoolsHub({ appId: "rtc-native", dev: true });
  const transport = new WsRelayDuplex<AppToInspector, InspectorToApp>(
    relayUrl,
    "app",
    createSocket,
  );
  hub.attachTransport(transport);

  return hub;
}
