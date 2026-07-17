import { describe, expect, it, vi } from "vitest";

import { InspectorStore } from "../InspectorStore";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore synchronous mode", () => {
  it("coalesce:false flushes synchronously even when rAF never fires", () => {
    const rafs: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        rafs.push(cb);

        return rafs.length;
      },
    );

    try {
      const sync = new InspectorStore({ coalesce: false });
      sync.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
      // No rAF has fired, but the non-coalescing store is already fresh.
      expect(sync.getSnapshot().connected).toBe(true);

      const live = new InspectorStore();
      live.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
      // The default (coalescing) store waits for the rAF chain — still stale.
      expect(live.getSnapshot().connected).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("InspectorStore clone", () => {
  it("clone() is an independent copy with an equal snapshot", () => {
    const store = new InspectorStore({ coalesce: false });
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 1 }],
      machines: [],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 2,
          coalesced: 1,
          seq: 1,
          ts: 10,
        },
      ],
    });

    const copy = store.clone();
    expect(copy.getSnapshot()).toEqual(store.getSnapshot());

    // Advancing the copy does not touch the original, and vice versa.
    copy.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 3,
          coalesced: 1,
          seq: 2,
          ts: 20,
        },
      ],
    });
    expect(copy.getSnapshot().streams[0]?.lastValue).toBe(3);
    expect(store.getSnapshot().streams[0]?.lastValue).toBe(2);
  });
});

describe("InspectorStore message tap", () => {
  it("tap() observes every applied message until unsubscribed", () => {
    const store = new InspectorStore({ coalesce: false });
    const seen: string[] = [];
    const untap = store.tap((msg) => {
      seen.push(msg.kind);
    });

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    store.apply({ kind: "bye" });
    untap();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    expect(seen).toEqual(["welcome", "bye"]);
  });
});
