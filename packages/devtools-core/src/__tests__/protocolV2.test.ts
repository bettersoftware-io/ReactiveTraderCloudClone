import { describe, expect, it } from "vitest";

import type { AppToInspector, InspectorToApp } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("protocol v2", () => {
  it("bumps PROTOCOL_VERSION to 2", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("accepts an intent:invoke inbound message shape", () => {
    const msg: InspectorToApp = {
      kind: "intent:invoke",
      machineId: "m1",
      name: "submit",
      args: ["EURUSD", 1_000_000],
    };
    expect(msg).toMatchObject({ kind: "intent:invoke", machineId: "m1" });
  });

  it("accepts an optional dev flag on welcome", () => {
    const withDev: AppToInspector = {
      kind: "welcome",
      v: PROTOCOL_VERSION,
      appId: "rtc-web",
      dev: true,
    };
    const withoutDev: AppToInspector = {
      kind: "welcome",
      v: PROTOCOL_VERSION,
      appId: "rtc-web",
    };
    expect(withDev).toMatchObject({ dev: true });
    expect(withoutDev).not.toHaveProperty("dev");
  });
});
