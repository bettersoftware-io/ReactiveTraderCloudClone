import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, createMachineFactories } from "@rtc/client-core";
import {
  type AppToInspector,
  createInMemoryDuplexPair,
  DevtoolsHub,
  InspectorClient,
  InspectorStore,
  type InspectorToApp,
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

/** The InspectorStore coalesces its snapshot rebuild + notify into a
 * requestAnimationFrame flush, throttled to FRAMES_PER_FLUSH (4) frames. Under
 * vitest fake timers (which fake rAF at jsdom's ~16 ms/frame) that is ~64 ms,
 * so each `advanceTimersByTime` must clear a comfortable margin past it for the
 * applied messages to reach the public snapshot. */
const FLUSH_ADVANCE_MS = 200;

/** End-to-end proof that the composition-root wiring (createApp →
 * instrumentPresenters → instrumentMachineFactories, exactly as AppRoot does)
 * feeds a real DevtoolsHub, and that an InspectorStore driven by an
 * InspectorClient over an in-memory duplex pair observes the app's streams and
 * machines. A FRESH local hub is used (never the module singleton) so each
 * test stays isolated. jsdom + the simulator port branch (no VITE_SERVER_URL),
 * mirroring composition.incident.test.ts. */
describe("devtools integration — composition root ↔ inspector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function wireAppToInspector(): WiredHarness {
    const hub = new DevtoolsHub({ appId: "rtc-web-test" });
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    hub.attachTransport(appSide);

    const { presenters } = createApp(buildBrowserPorts());
    const instrumented = instrumentPresenters(
      presenters,
      PRESENTER_MANIFEST,
      hub,
    );
    const factories = instrumentMachineFactories(
      createMachineFactories(instrumented),
      hub,
    );

    const store = new InspectorStore();
    const client = new InspectorClient(inspectorSide, store);

    return { hub, store, client, factories };
  }

  it("streams the app's manifest-registered props to the inspector after handshake", () => {
    const { hub, store, client } = wireAppToInspector();

    client.start();
    vi.advanceTimersByTime(FLUSH_ADVANCE_MS);

    const snapshot = store.getSnapshot();
    expect(snapshot.connected).toBe(true);

    const streamIds = snapshot.streams.map((s) => {
      return s.streamId;
    });
    expect(streamIds).toContain("blotter.trades$");
    expect(streamIds).toContain("connection.status$");

    client.dispose();
    hub.dispose();
  });

  it("surfaces a machine created via the instrumented factories, records its intent, and flips disposed", () => {
    const { hub, store, client, factories } = wireAppToInspector();

    client.start();
    vi.advanceTimersByTime(FLUSH_ADVANCE_MS);

    // Create a per-mount notional machine through the instrumented factory.
    const machine = factories.notional(1_000_000);
    vi.advanceTimersByTime(FLUSH_ADVANCE_MS);

    const created = store.getSnapshot().machines.find((m) => {
      return m.machineKind === "notional";
    });
    expect(created).toBeDefined();
    expect(created?.disposed).toBe(false);

    // Fire the real notional intent (`change`, per NotionalMachine.ts — not the
    // plan's placeholder `setValue`) and confirm it is logged as an intent row.
    machine.intents.change("2000000");
    vi.advanceTimersByTime(FLUSH_ADVANCE_MS);

    const afterIntent = store.getSnapshot().machines.find((m) => {
      return m.machineKind === "notional";
    });
    expect(
      afterIntent?.intents.map((intent) => {
        return intent.name;
      }),
    ).toContain("change");

    // Disposing through the instrumented factory flips the row's disposed flag.
    machine.dispose();
    vi.advanceTimersByTime(FLUSH_ADVANCE_MS);

    const afterDispose = store.getSnapshot().machines.find((m) => {
      return m.machineKind === "notional";
    });
    expect(afterDispose?.disposed).toBe(true);

    client.dispose();
    hub.dispose();
  });
});

interface WiredHarness {
  hub: DevtoolsHub;
  store: InspectorStore;
  client: InspectorClient;
  factories: ReturnType<typeof createMachineFactories>;
}
