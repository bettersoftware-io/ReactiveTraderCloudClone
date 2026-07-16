import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { InspectorClient } from "../InspectorClient";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorClient liveness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips to disconnected when no inbound traffic arrives within the window", () => {
    const store = new InspectorStore();
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    const client = new InspectorClient(inspectorSide, store);
    client.start();

    // App answers hello with welcome -> connected.
    appSide.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    expect(store.getSnapshot().connected).toBe(true);

    // No further traffic (app crashed, no bye). After the liveness window, dead.
    vi.advanceTimersByTime(6001);
    expect(store.getSnapshot().connected).toBe(false);

    client.dispose();
  });

  it("stays connected while inbound traffic keeps arriving", () => {
    // Only AppToInspector messages (welcome/snapshot/batch/bye) ever flow this
    // direction — `ping` is InspectorToApp only (the panel's own heartbeat to
    // the app), so a real keep-alive here is an (empty) `batch`, standing in
    // for ordinary stream/machine activity.
    const store = new InspectorStore();
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    const client = new InspectorClient(inspectorSide, store);
    client.start();
    appSide.send({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(2000);
      appSide.send({ kind: "batch", events: [] });
    }

    expect(store.getSnapshot().connected).toBe(true);
    client.dispose();
  });
});
