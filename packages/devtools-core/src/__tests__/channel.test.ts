import { describe, expect, it } from "vitest";

import { BroadcastChannelDuplex, createInMemoryDuplexPair } from "../channel";

describe("createInMemoryDuplexPair", () => {
  it("delivers a→b and b→a, and stops after dispose", () => {
    const [a, b] = createInMemoryDuplexPair<string, number>();
    const gotB: string[] = [];
    const gotA: number[] = [];
    b.inbound$.subscribe((m) => {
      gotB.push(m);
    });
    a.inbound$.subscribe((m) => {
      gotA.push(m);
    });
    a.send("hi");
    b.send(7);
    expect(gotB).toEqual(["hi"]);
    expect(gotA).toEqual([7]);
    a.dispose();
    b.send(8);
    expect(gotA).toEqual([7]);
  });
});

describe("BroadcastChannelDuplex", () => {
  it.skipIf(typeof BroadcastChannel === "undefined")(
    "round-trips between two duplexes on the same channel name",
    async () => {
      const a = new BroadcastChannelDuplex<XPayload, XPayload>("t-chan");
      const b = new BroadcastChannelDuplex<XPayload, XPayload>("t-chan");
      const got = new Promise<XPayload>((resolve) => {
        const sub = b.inbound$.subscribe((m) => {
          sub.unsubscribe();
          resolve(m);
        });
      });
      a.send({ x: 1 });
      expect(await got).toEqual({ x: 1 });
      a.dispose();
      b.dispose();
    },
  );
});

interface XPayload {
  x: number;
}
