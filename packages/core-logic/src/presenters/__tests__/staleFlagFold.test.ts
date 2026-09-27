import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import {
  createStaleFlagAcc,
  reduceStaleFlag,
} from "#/presenters/staleFlagFold";

describe("staleFlagFold", () => {
  it("goes stale on reconnect after a disconnect and clears on a NEW value reference", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    let acc = createStaleFlagAcc<typeof a>();
    acc = reduceStaleFlag(acc, {
      kind: "status",
      status: ConnectionStatus.CONNECTED,
    });
    acc = reduceStaleFlag(acc, { kind: "value", value: a });
    expect(acc.stale).toBe(false);
    acc = reduceStaleFlag(acc, {
      kind: "status",
      status: ConnectionStatus.DISCONNECTED,
    });
    acc = reduceStaleFlag(acc, {
      kind: "status",
      status: ConnectionStatus.CONNECTED,
    });
    expect(acc.stale).toBe(true);
    acc = reduceStaleFlag(acc, { kind: "value", value: a });
    expect(acc.stale).toBe(true);
    acc = reduceStaleFlag(acc, { kind: "value", value: b });
    expect(acc.stale).toBe(false);
  });

  it("never goes stale while connected throughout", () => {
    let acc = createStaleFlagAcc<number>();
    acc = reduceStaleFlag(acc, {
      kind: "status",
      status: ConnectionStatus.CONNECTED,
    });
    acc = reduceStaleFlag(acc, { kind: "value", value: 1 });
    acc = reduceStaleFlag(acc, {
      kind: "status",
      status: ConnectionStatus.CONNECTED,
    });
    expect(acc.stale).toBe(false);
  });
});
