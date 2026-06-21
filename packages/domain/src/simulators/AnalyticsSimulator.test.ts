import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("emits static positions for 9 pairs", async () => {
    const engine = new AnalyticsSimulator();
    const update = await firstValueFrom(engine.getAnalytics("USD"));
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
