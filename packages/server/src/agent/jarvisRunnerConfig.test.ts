import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { buildJarvisTools, type JarvisToolDeps } from "@rtc/agent-tools";
import {
  type AnalyticsPort,
  ExecutionSimulator,
  type PositionUpdates,
  PricingSimulator,
  ReferenceDataSimulator,
  ServiceTopologySimulator,
  TradeStoreSimulator,
} from "@rtc/domain";

import {
  JARVIS_EFFORT,
  JARVIS_EFFORT_CAPABLE_BRAINS,
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TURNS_PER_SESSION,
  JARVIS_TOOL_FRIENDLY_NAMES,
} from "./jarvisRunnerConfig.js";

describe("jarvisRunnerConfig", () => {
  it("pins the per-turn token cap", () => {
    expect(JARVIS_MAX_TOKENS_PER_TURN).toBe(4_096);
  });

  it("pins the reasoning effort", () => {
    expect(JARVIS_EFFORT).toBe("medium");
  });

  it("marks sonnet and opus, but not haiku or scripted, as effort-capable", () => {
    expect(JARVIS_EFFORT_CAPABLE_BRAINS.has("claude-sonnet-5")).toBe(true);
    expect(JARVIS_EFFORT_CAPABLE_BRAINS.has("claude-opus-5")).toBe(true);
    expect(JARVIS_EFFORT_CAPABLE_BRAINS.has("claude-haiku-4-5")).toBe(false);
    expect(JARVIS_EFFORT_CAPABLE_BRAINS.has("scripted")).toBe(false);
  });

  it("pins the per-session turn cap", () => {
    expect(JARVIS_MAX_TURNS_PER_SESSION).toBe(40);
  });

  it("pins the history replay cap", () => {
    expect(JARVIS_HISTORY_MAX_MESSAGES).toBe(30);
  });

  it("maps every real Jarvis tool name to a friendly chip label", () => {
    // Deliberately imports the REAL buildJarvisTools rather than pinning the
    // seven names as literals — a Task 2 rename of a tool breaks this test
    // instead of silently drifting the map out of sync with the UI.
    const deps = buildToolDeps();
    const realToolNames = buildJarvisTools(deps).map((tool) => {
      return tool.name;
    });

    expect(realToolNames).toHaveLength(7);
    expect(Object.keys(JARVIS_TOOL_FRIENDLY_NAMES).sort()).toEqual(
      [...realToolNames].sort(),
    );

    for (const name of realToolNames) {
      expect(JARVIS_TOOL_FRIENDLY_NAMES[name]).toBeTruthy();
    }
  });

  it("pins the exact chip label for each tool", () => {
    expect(JARVIS_TOOL_FRIENDLY_NAMES).toEqual({
      get_price: "quote",
      get_price_history: "history",
      get_blotter: "desk",
      get_analytics: "desk",
      list_currency_pairs: "refdata",
      get_service_health: "health",
      execute_trade: "trade",
    });
  });
});

/** Builds the exact `JarvisToolDeps` shape `buildJarvisTools` needs — none
 * of its tools are actually called here, so simulators + a no-op confirm
 * gate are enough; this exists solely to derive the real seven tool names
 * from the real package (see the friendly-name coverage test above). */
function buildToolDeps(): JarvisToolDeps {
  const execution = new ExecutionSimulator();
  const analytics: AnalyticsPort = {
    getAnalytics: () => {
      return of<PositionUpdates>({ currentPositions: [], history: [] });
    },
  };

  return {
    referenceData: new ReferenceDataSimulator(),
    pricing: new PricingSimulator(),
    blotter: new TradeStoreSimulator(execution),
    analytics,
    execution,
    serviceHealth: new ServiceTopologySimulator(),
    confirmTrade: vi.fn(async () => {
      return true;
    }),
  };
}
