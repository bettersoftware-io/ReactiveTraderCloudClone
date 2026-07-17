import { describe, expect, it } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { InspectorClient } from "../InspectorClient";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, InspectorToApp } from "../protocol";

describe("InspectorClient.invokeIntent", () => {
  it("sends a well-shaped intent:invoke message on the channel", () => {
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    const received: InspectorToApp[] = [];
    appSide.inbound$.subscribe((m) => {
      received.push(m);
    });

    const client = new InspectorClient(inspectorSide, new InspectorStore());
    client.invokeIntent("m1", "submit", ["EURUSD", 1_000_000]);

    expect(received).toContainEqual({
      kind: "intent:invoke",
      machineId: "m1",
      name: "submit",
      args: ["EURUSD", 1_000_000],
    });
  });
});
