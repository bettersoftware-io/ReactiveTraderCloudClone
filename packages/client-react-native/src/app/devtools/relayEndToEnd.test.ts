import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "@rtc/client-core";
import {
  type AppToInspector,
  type DevtoolsHub,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
  instrumentPresenters,
  WsRelayDuplex,
} from "@rtc/devtools-core";
import { createRelayServer, type RelayServer } from "@rtc/devtools-relay";

import { buildNativePorts } from "#/app/buildNativePorts";
import { createNativeDevtoolsHub } from "#/app/devtools/nativeDevtoolsHub";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

describe("RN inspection end-to-end over the relay", () => {
  let relay: RelayServer | null = null;
  let hub: DevtoolsHub | null = null;
  let client: InspectorClient | null = null;
  let channel: WsRelayDuplex<InspectorToApp, AppToInspector> | null = null;

  afterEach(async () => {
    client?.dispose();
    channel?.dispose();
    hub?.dispose();
    await relay?.close();
    client = null;
    channel = null;
    hub = null;
    relay = null;
  });

  it("delivers the RN app's manifest streams to the panel store and advertises a dev build", async () => {
    relay = createRelayServer({
      port: 0,
      log: () => {},
    });
    const port = await relay.whenReady;
    const url = `ws://127.0.0.1:${port}`;

    // App side — exactly what AppRoot builds under __DEV__ (dev:true hub +
    // app-tagged relay transport), via the real factory.
    hub = createNativeDevtoolsHub(url);
    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );
    instrumentPresenters(presenters, NATIVE_PRESENTER_MANIFEST, hub);

    // Panel side — exactly what createRelayInspectorSession builds.
    const store = new InspectorStore();
    channel = new WsRelayDuplex<InspectorToApp, AppToInspector>(url, "panel");
    client = new InspectorClient(channel, store);
    client.start();

    await vi.waitFor(
      () => {
        const snapshot = store.getSnapshot();
        expect(snapshot.connected).toBe(true);
        // dev:true from the native hub reaches the panel via welcome.dev — this
        // is the flag that opens the hub's inbound intent-injection gate and
        // enables the panel's injection affordance (RN write-parity with web).
        expect(snapshot.dev).toBe(true);
        expect(
          snapshot.streams.map((s) => {
            return s.streamId;
          }),
        ).toContain("connection.status$");
      },
      { timeout: 5000, interval: 25 },
    );
  });
});

// expo-constants has no runtime `expoConfig` under vitest-node; stub it so
// buildNativePorts imports cleanly (simulator branch never reads serverUrl).
vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
});

// buildNativePorts wires an AppearanceColorSchemeAdapter that reads
// react-native's `Appearance` at import time; react-native's Flow entry point
// does not parse under vitest's node transform, so stub the sliver used here.
vi.mock("react-native", () => {
  return {
    Appearance: {
      getColorScheme: () => {
        return null;
      },
      addChangeListener: () => {
        return { remove: () => {} };
      },
    },
  };
});
