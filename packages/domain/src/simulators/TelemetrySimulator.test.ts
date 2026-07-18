import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricSample } from "../telemetry/metrics.js";
import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import { LatencySimulator } from "./LatencySimulator.js";
import { METRIC_HISTORY_LEN } from "./metricWalk.js";
import { TelemetrySimulator } from "./TelemetrySimulator.js";
import { ThroughputSimulator } from "./ThroughputSimulator.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describe("TelemetrySimulator throughput walk (final-review I-2)", () => {
  it("pre-seeds a full 60-sample history synchronously on subscribe, backdated 1s apart", () => {
    const { telemetry } = makeTelemetry();
    const collected: MetricSample[] = [];
    const sub = telemetry.throughput$().subscribe((s) => {
      collected.push(s);
    });
    sub.unsubscribe();

    expect(collected).toHaveLength(METRIC_HISTORY_LEN);

    for (let i = 1; i < collected.length; i += 1) {
      expect(collected[i].t - collected[i - 1].t).toBe(1_000);
    }

    expect(collected[collected.length - 1].t).toBe(Date.now());
  });

  it("ticks at a 1s cadence after the pre-seeded history", async () => {
    const { telemetry } = makeTelemetry();
    const collected: number[] = [];
    const sub = telemetry.throughput$().subscribe((s) => {
      collected.push(s.value);
    });
    expect(collected).toHaveLength(METRIC_HISTORY_LEN);

    await vi.advanceTimersByTimeAsync(5_000);
    sub.unsubscribe();
    expect(collected).toHaveLength(METRIC_HISTORY_LEN + 5);
  });

  it("walks: successive samples differ instead of a flat constant line", async () => {
    const { telemetry } = makeTelemetry();
    const p = firstValueFrom(telemetry.throughput$().pipe(take(5), toArray()));
    await vi.advanceTimersByTimeAsync(8_000);
    const values = (await p).map((s) => {
      return s.value;
    });

    const unique = new Set(
      values.map((v) => {
        return Math.round(v * 1000);
      }),
    );
    expect(unique.size).toBeGreaterThan(1);
  });

  it("stays within the clamped +-25% band around the setpoint", async () => {
    const { telemetry } = makeTelemetry();
    const p = firstValueFrom(telemetry.throughput$().pipe(take(30), toArray()));
    await vi.advanceTimersByTimeAsync(60_000);
    const values = (await p).map((s) => {
      return s.value;
    });

    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(100 * 0.75);
      expect(v).toBeLessThanOrEqual(100 * 1.25);
    }
  });

  it("recenters the walk when the admin slider changes the setpoint", async () => {
    const { telemetry, admin } = makeTelemetry();
    const p1 = firstValueFrom(telemetry.throughput$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(4_000);
    await p1;

    await firstValueFrom(admin.setThroughput(500));

    const p2 = firstValueFrom(telemetry.throughput$().pipe(take(1), toArray()));
    await vi.advanceTimersByTimeAsync(0);
    const [afterChange] = await p2;
    // The very next sample after a setpoint change recenters exactly on it.
    expect(afterChange?.value).toBe(500);

    const p3 = firstValueFrom(
      telemetry.throughput$().pipe(take(10), toArray()),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    const followUp = await p3;

    for (const s of followUp) {
      expect(s.value).toBeGreaterThanOrEqual(500 * 0.75);
      expect(s.value).toBeLessThanOrEqual(500 * 1.25);
    }
  });

  it("is deterministic for a fixed seed", async () => {
    const a = makeTelemetry(7).telemetry;
    const b = makeTelemetry(7).telemetry;

    const pa = firstValueFrom(a.throughput$().pipe(take(6), toArray()));
    const pb = firstValueFrom(b.throughput$().pipe(take(6), toArray()));
    await vi.advanceTimersByTimeAsync(10_000);

    const valuesA = (await pa).map((s) => {
      return s.value;
    });

    const valuesB = (await pb).map((s) => {
      return s.value;
    });
    expect(valuesA).toEqual(valuesB);
  });

  it("existing incident perturbations on latency/errorRate keep working unperturbed by the throughput walk", async () => {
    const admin = new ThroughputSimulator();
    const latency = new LatencySimulator(1);
    const errorRate = new ErrorRateSimulator(2);
    const telemetry = new TelemetrySimulator(admin, latency, errorRate);

    latency.perturb("latencySpike");
    errorRate.perturb("errorBurst");

    const latencyP = firstValueFrom(
      telemetry.latency$().pipe(take(2), toArray()),
    );

    const errorP = firstValueFrom(
      telemetry.errorRate$().pipe(take(2), toArray()),
    );
    await vi.advanceTimersByTimeAsync(3_000);

    const latencyVals = (await latencyP).map((s) => {
      return s.value;
    });

    const errorVals = (await errorP).map((s) => {
      return s.value;
    });
    expect(Math.max(...latencyVals)).toBeGreaterThan(200);
    expect(Math.max(...errorVals)).toBeGreaterThan(8);
  });
});

interface TelemetryHarness {
  telemetry: TelemetrySimulator;
  admin: ThroughputSimulator;
}

function makeTelemetry(seed?: number): TelemetryHarness {
  const admin = new ThroughputSimulator();
  const telemetry =
    seed === undefined
      ? new TelemetrySimulator(
          admin,
          new LatencySimulator(1),
          new ErrorRateSimulator(2),
        )
      : new TelemetrySimulator(
          admin,
          new LatencySimulator(1),
          new ErrorRateSimulator(2),
          seed,
        );
  return { telemetry, admin };
}
