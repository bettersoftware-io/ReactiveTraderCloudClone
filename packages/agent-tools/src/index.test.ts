import { describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

import type {
  JarvisConfirmDetails,
  JarvisToolDefinition,
  JarvisToolDeps,
} from "./index.js";

// Placeholder — proves the barrel exports resolve and type-check. Task 2
// replaces this with the real tool-definition test suite.
describe("@rtc/agent-tools barrel", () => {
  it("exports the JarvisToolDefinition contract types", () => {
    const details: JarvisConfirmDetails = {
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.085,
      ratePrecision: 4,
    };

    async function confirmTrade(): Promise<boolean> {
      return true;
    }

    const tool: JarvisToolDefinition = {
      name: "placeholder",
      description: "placeholder tool",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      run: async () => {
        return "ok";
      },
    };

    expect(tool.name).toBe("placeholder");
    expect(details.symbol).toBe("EURUSD");
    const deps: Pick<JarvisToolDeps, "confirmTrade"> = { confirmTrade };
    expect(typeof deps.confirmTrade).toBe("function");
  });
});
