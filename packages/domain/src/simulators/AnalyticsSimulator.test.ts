import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";

import { netExposureByCurrency } from "../analytics/netExposure.js";
import type { PositionUpdates } from "../analytics/position.js";
import { AnalyticsSimulator } from "./AnalyticsSimulator.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("AnalyticsSimulator", () => {
  it("emits 90 history points initially", async () => {
    const engine = new AnalyticsSimulator();
    const update = await firstValueFrom(engine.getAnalytics("USD"));
    expect(update.history).toHaveLength(90);
  });

  it("history is in chronological order", async () => {
    const engine = new AnalyticsSimulator();
    const update = await firstValueFrom(engine.getAnalytics("USD"));

    for (let i = 1; i < update.history.length; i++) {
      const prev = new Date(update.history[i - 1].timestamp).getTime();
      const curr = new Date(update.history[i].timestamp).getTime();
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("emits 9 static positions with PROTO-scale PnL", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    expect(update.currentPositions).toHaveLength(9);
    const bySymbol = new Map(
      update.currentPositions.map((p) => {
        return [p.symbol, p.basePnl];
      }),
    );
    expect(bySymbol.get("EURUSD")).toBe(13_000);
    expect(bySymbol.get("USDJPY")).toBe(-4_000);
    expect(bySymbol.get("GBPUSD")).toBe(9_000);
    expect(bySymbol.get("AUDUSD")).toBe(6_000);
    expect(bySymbol.get("EURCAD")).toBe(-2_000);
    expect(bySymbol.get("EURJPY")).toBe(5_000);
  });

  it("static positions aggregate to the PROTO net-exposure targets", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    const exposure = netExposureByCurrency(update.currentPositions);
    expect(exposure).toEqual([
      { currency: "EUR", amountMillions: 15.2 },
      { currency: "USD", amountMillions: -22.8 },
      { currency: "JPY", amountMillions: 8.4 },
      { currency: "GBP", amountMillions: -6.1 },
      { currency: "AUD", amountMillions: 4.7 },
      { currency: "NZD", amountMillions: 2.1 },
      { currency: "CAD", amountMillions: -3.2 },
    ]);
  });

  it("PnL history starts near the PROTO seed of 17120", async () => {
    const sim = new AnalyticsSimulator();
    const update = await firstValueFrom(sim.getAnalytics("USD"));
    const latest = update.history[update.history.length - 1];
    // 90 random-walk steps of ±0.5% each can drift at most ~(1.005)^90 ≈ 1.57×.
    expect(latest.usdPnl).toBeGreaterThan(17_120 / 1.6);
    expect(latest.usdPnl).toBeLessThan(17_120 * 1.6);
  });

  it("emits initial snapshot then updates every 10s, capped at 90 entries", async () => {
    vi.useFakeTimers();
    const engine = new AnalyticsSimulator();
    const promise = firstValueFrom(
      engine.getAnalytics("USD").pipe(take(3), toArray()),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const snapshots: PositionUpdates[] = await promise;

    expect(snapshots).toHaveLength(3);
    // Initial snapshot is at the cap (constructor pre-populates 90 backdated points)
    expect(snapshots[0].history).toHaveLength(90);
    // After each interval tick, history stays capped at 90
    expect(snapshots[1].history).toHaveLength(90);
    expect(snapshots[2].history).toHaveLength(90);

    // Newest entry is at the end and should differ between snapshots (random walk)
    const last0 = snapshots[0].history[snapshots[0].history.length - 1];
    const last1 = snapshots[1].history[snapshots[1].history.length - 1];
    const last2 = snapshots[2].history[snapshots[2].history.length - 1];
    expect(new Date(last1.timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(last0.timestamp).getTime(),
    );
    expect(new Date(last2.timestamp).getTime()).toBeGreaterThanOrEqual(
      new Date(last1.timestamp).getTime(),
    );
  });

  it("history stays bounded at 90 entries after many update intervals", async () => {
    vi.useFakeTimers();
    const engine = new AnalyticsSimulator();
    // Take well past HISTORY_SIZE updates so the cap (shift) is exercised on every tick.
    const ticks = 95;
    const promise = firstValueFrom(
      engine.getAnalytics("USD").pipe(take(ticks + 1), toArray()),
    );
    await vi.advanceTimersByTimeAsync(10_000 * (ticks + 1));
    const snapshots: PositionUpdates[] = await promise;

    // Every emitted snapshot — initial and all post-cap updates — stays at the cap.
    for (const snapshot of snapshots) {
      expect(snapshot.history).toHaveLength(90);
    }

    // The buffer did not grow unbounded across many more intervals than its size.
    expect(snapshots[snapshots.length - 1].history).toHaveLength(90);
  });

  it("random walk produces values within reasonable per-step bound", async () => {
    vi.useFakeTimers();
    const engine = new AnalyticsSimulator();
    const promise = firstValueFrom(
      engine.getAnalytics("USD").pipe(take(2), toArray()),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const snapshots: PositionUpdates[] = await promise;

    const before = snapshots[0].history[snapshots[0].history.length - 1].usdPnl;
    const after = snapshots[1].history[snapshots[1].history.length - 1].usdPnl;
    // randomWalkStep multiplies by (1 + (rand - 0.5) / 100) → max |pct change| ≤ 0.5%
    expect(Math.abs(after - before)).toBeLessThanOrEqual(
      Math.abs(before) * 0.005 + 1e-9,
    );
  });
});
