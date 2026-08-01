import { describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

import {
  buildJarvisTools,
  JARVIS_TOOL_TIMEOUT_MS,
  type JarvisConfirmDetails,
  type JarvisToolDeps,
} from "./index.js";

// Barrel smoke test — proves every export resolves and type-checks; the real
// per-tool behaviour lives in buildJarvisTools.test.ts.
describe("@rtc/agent-tools barrel", () => {
  it("exports buildJarvisTools, JARVIS_TOOL_TIMEOUT_MS, and the contract types", () => {
    expect(JARVIS_TOOL_TIMEOUT_MS).toBe(5_000);

    const details: JarvisConfirmDetails = {
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.085,
      ratePrecision: 4,
    };
    expect(details.symbol).toBe("EURUSD");

    expect(typeof buildJarvisTools).toBe("function");
    const deps: Pick<JarvisToolDeps, "confirmTrade"> = {
      confirmTrade: async () => {
        return true;
      },
    };
    expect(typeof deps.confirmTrade).toBe("function");
  });
});
