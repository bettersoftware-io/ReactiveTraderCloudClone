import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "@rtc/client-core";
import {
  type AppToInspector,
  createInMemoryDuplexPair,
  DevtoolsHub,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
} from "@rtc/devtools-core";

import { buildNativePorts } from "#/app/buildNativePorts";
import { buildViewModelInputs } from "#/app/devtools/buildViewModelInputs";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

describe("buildViewModelInputs", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }

    cleanups.length = 0;
  });

  it("returns presenters untouched and plain factories when devtools is null", () => {
    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );

    const inputs = buildViewModelInputs(presenters, null);

    expect(inputs.presenters).toBe(presenters);
    expect(typeof inputs.factories.tileExecution).toBe("function");
  });

  it("applies the decorators so the panel store observes a registered stream", () => {
    const hub = new DevtoolsHub({ appId: "rtc-native-test" });
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    hub.attachTransport(appSide);

    const { presenters } = createApp(
      buildNativePorts({ simulator: true }).ports,
    );

    const inputs = buildViewModelInputs(presenters, {
      hub,
      manifest: NATIVE_PRESENTER_MANIFEST,
    });

    // instrumentPresenters returns an instrumented COPY, not the raw object.
    expect(inputs.presenters).not.toBe(presenters);
    expect(typeof inputs.factories.tileExecution).toBe("function");

    const store = new InspectorStore();
    const client = new InspectorClient(inspectorSide, store);
    cleanups.push(() => {
      client.dispose();
      hub.dispose();
    });

    // In node env the store flushes synchronously, and the hub answers hello
    // with welcome + snapshot synchronously over the in-memory pair.
    client.start();

    const snapshot = store.getSnapshot();
    expect(snapshot.connected).toBe(true);
    expect(
      snapshot.streams.map((s) => {
        return s.streamId;
      }),
    ).toContain("connection.status$");
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
