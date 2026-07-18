import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type { DevtoolsEvent } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore identity-stable rows", () => {
  it("reuses a stream row object when its fields are unchanged, new object when they change", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
    store.apply({
      kind: "batch",
      events: [
        evt(
          "stream:emission",
          { streamId: "a.x$", value: 1, seq: 1, coalesced: 1, ts: 1 },
          1,
        ),
        evt(
          "stream:emission",
          { streamId: "b.y$", value: 1, seq: 1, coalesced: 1, ts: 1 },
          2,
        ),
      ],
    });

    const first = store.getSnapshot().streams;
    const ax1 = first.find((s) => {
      return s.streamId === "a.x$";
    });

    const by1 = first.find((s) => {
      return s.streamId === "b.y$";
    });

    // Only b.y$ emits again.
    store.apply({
      kind: "batch",
      events: [
        evt(
          "stream:emission",
          { streamId: "b.y$", value: 2, seq: 2, coalesced: 1, ts: 2 },
          3,
        ),
      ],
    });

    const second = store.getSnapshot().streams;
    const ax2 = second.find((s) => {
      return s.streamId === "a.x$";
    });

    const by2 = second.find((s) => {
      return s.streamId === "b.y$";
    });

    expect(ax2).toBe(ax1); // unchanged → same reference
    expect(by2).not.toBe(by1); // changed → new reference
  });
});

function evt(
  kind: string,
  extra: Record<string, unknown>,
  seq: number,
): DevtoolsEvent {
  return { kind, seq, ts: seq, ...extra } as unknown as DevtoolsEvent;
}
