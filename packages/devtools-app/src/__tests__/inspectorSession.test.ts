import { afterEach, expect, test, vi } from "vitest";

import { createInspectorSession } from "#/inspectorSession";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("wires a live BroadcastChannel-backed client that actually posts invokeIntent frames on the channel", async () => {
  const session = createInspectorSession();

  // The live path starts an `InspectorClient` over a real `BroadcastChannel`,
  // which never connects to a peer in this test, so the snapshot stays
  // disconnected — this only distinguishes "wired up" from "wired up AND
  // paired", not a peer handshake.
  expect(session.store.getSnapshot().connected).toBe(false);

  // A second listener on the same channel name proves invokeIntent really
  // posts a frame over BroadcastChannel, rather than being a silent no-op
  // like the BroadcastChannel-less fallback.
  const listener = new BroadcastChannel("rtc-devtools");
  const received = new Promise<unknown>((resolve) => {
    listener.onmessage = (event: MessageEvent): void => {
      resolve(event.data);
    };
  });

  session.invokeIntent("m1", "submit", ["arg"]);

  await expect(received).resolves.toMatchObject({
    kind: "intent:invoke",
    machineId: "m1",
    name: "submit",
    args: ["arg"],
  });

  listener.close();
  session.dispose();
});

test("falls back to a store-only no-op session when BroadcastChannel is unavailable", () => {
  vi.stubGlobal("BroadcastChannel", undefined);

  const session = createInspectorSession();
  const before = session.store.getSnapshot();

  session.invokeIntent("m1", "submit", []);

  // The fallback's invokeIntent has no channel to send over, so the store
  // snapshot is unchanged by the call (the live path would instead have
  // dispatched a wire frame through InspectorClient).
  expect(session.store.getSnapshot()).toEqual(before);
  expect(session.store.getSnapshot().connected).toBe(false);

  expect(() => {
    session.dispose();
  }).not.toThrow();
});
