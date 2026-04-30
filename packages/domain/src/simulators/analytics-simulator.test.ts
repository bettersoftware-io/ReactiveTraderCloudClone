import { describe, it, expect } from "vitest";
import { AnalyticsSimulator } from "./analytics-simulator.js";

describe("AnalyticsSimulator", () => {
  it("emits 90 history points initially", async () => {
    const engine = new AnalyticsSimulator();

    for await (const update of engine.getAnalytics("USD")) {
      expect(update.history).toHaveLength(90);
      break;
    }
  });

  it("history is in chronological order", async () => {
    const engine = new AnalyticsSimulator();

    for await (const update of engine.getAnalytics("USD")) {
      for (let i = 1; i < update.history.length; i++) {
        const prev = new Date(update.history[i - 1].timestamp).getTime();
        const curr = new Date(update.history[i].timestamp).getTime();
        expect(curr).toBeGreaterThan(prev);
      }
      break;
    }
  });

  it("emits static positions for 9 pairs", async () => {
    const engine = new AnalyticsSimulator();

    for await (const update of engine.getAnalytics("USD")) {
      expect(update.currentPositions).toHaveLength(9);

      const eurusd = update.currentPositions.find((p) => p.symbol === "EURUSD");
      expect(eurusd).toBeDefined();
      expect(eurusd!.basePnl).toBe(564.97);

      const usdjpy = update.currentPositions.find((p) => p.symbol === "USDJPY");
      expect(usdjpy!.basePnl).toBe(1382.31);

      const gbpusd = update.currentPositions.find((p) => p.symbol === "GBPUSD");
      expect(gbpusd!.basePnl).toBe(-1656.82);

      // Zero positions
      const gbpjpy = update.currentPositions.find((p) => p.symbol === "GBPJPY");
      expect(gbpjpy!.basePnl).toBe(0);
      expect(gbpjpy!.baseTradedAmount).toBe(0);
      break;
    }
  });
});
