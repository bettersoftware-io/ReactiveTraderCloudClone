import { describe, expect, it } from "vitest";

import { createSessionRegistry } from "#/accounts/sessionRegistry";
import { decideConnection } from "#/http/decideConnection";
import type { UpgradeVerdict } from "#/http/upgradeGate";

describe("decideConnection", () => {
  it("closes 1011 when there is no verdict", () => {
    expect(decideConnection(undefined, createSessionRegistry())).toEqual({
      kind: "close",
      code: 1011,
      reason: "internal",
    });
  });

  it("closes 1011 for a verdict with no caller", () => {
    expect(
      decideConnection({ ok: true, status: 200 }, createSessionRegistry()),
    ).toMatchObject({ kind: "close", code: 1011 });
  });

  it("closes 4401 for a session the gate found ended", () => {
    expect(
      decideConnection(
        createAccountVerdict({ sessionEnded: true }),
        createSessionRegistry(),
      ),
    ).toEqual({ kind: "close", code: 4401, reason: "session_ended" });
  });

  it("serves a roster login without an account", () => {
    expect(
      decideConnection(
        {
          ok: true,
          status: 200,
          caller: { username: "demo", accountId: null, issuedAt: null },
        },
        createSessionRegistry(),
      ),
    ).toEqual({ kind: "serve", accountId: null });
  });

  it("serves a live account whose epoch has not moved", () => {
    const registry = createSessionRegistry();
    registry.closeAll("acc-1");

    expect(
      decideConnection(
        createAccountVerdict({ revocationEpoch: registry.epochOf("acc-1") }),
        registry,
      ),
    ).toEqual({ kind: "serve", accountId: "acc-1" });
  });

  it("closes 4401 when the sessions were ended after the gate read the epoch (the race)", () => {
    const registry = createSessionRegistry();
    const captured = registry.epochOf("acc-1");

    // The block lands while the gate's status lookup is in flight: no socket
    // is registered yet, so closeAll closes nothing.
    expect(registry.closeAll("acc-1")).toBe(0);

    expect(
      decideConnection(
        createAccountVerdict({ revocationEpoch: captured }),
        registry,
      ),
    ).toEqual({ kind: "close", code: 4401, reason: "session_ended" });
  });

  it("ignores another account's revocation", () => {
    const registry = createSessionRegistry();
    const captured = registry.epochOf("acc-1");
    registry.closeAll("acc-2");

    expect(
      decideConnection(
        createAccountVerdict({ revocationEpoch: captured }),
        registry,
      ),
    ).toEqual({ kind: "serve", accountId: "acc-1" });
  });
});

function createAccountVerdict(
  overrides: Partial<UpgradeVerdict>,
): UpgradeVerdict {
  return {
    ok: true,
    status: 200,
    caller: { username: "ann", accountId: "acc-1", issuedAt: 5 },
    revocationEpoch: 0,
    ...overrides,
  };
}
