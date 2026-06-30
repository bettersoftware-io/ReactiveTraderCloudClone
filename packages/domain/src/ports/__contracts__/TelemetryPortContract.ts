import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { MetricSample } from "#/telemetry/metrics.js";

import type { TelemetryPort } from "../telemetryPort.js";

export interface TelemetryHarness {
  port: TelemetryPort;
  /** Advance the simulator clock by `ms` (vi.advanceTimersByTimeAsync). */
  advance: (ms: number) => Promise<void>;
  teardown: () => void;
}

export function describeTelemetryPortContract(
  label: string,
  makeHarness: () => TelemetryHarness,
): void {
  describe(`${label} :: TelemetryPort contract`, () => {
    it("throughput$ emits a non-negative MetricSample on subscribe", async () => {
      const { port, teardown } = makeHarness();

      try {
        const first = await firstValueFrom(port.throughput$());
        expect(first.value).toBeGreaterThanOrEqual(0);
        expect(typeof first.t).toBe("number");
      } finally {
        teardown();
      }
    });

    it("latency$ keeps emitting on the simulator cadence", async () => {
      const { port, advance, teardown } = makeHarness();

      try {
        const collected: MetricSample[] = [];
        const sub = port.latency$().subscribe((s) => {
          return collected.push(s);
        });
        await advance(5_000);
        sub.unsubscribe();
        expect(collected.length).toBeGreaterThan(1);
      } finally {
        teardown();
      }
    });

    it("errorRate$ emits a non-negative MetricSample on subscribe", async () => {
      const { port, teardown } = makeHarness();

      try {
        const first = await firstValueFrom(port.errorRate$());
        expect(first.value).toBeGreaterThanOrEqual(0);
        expect(typeof first.t).toBe("number");
      } finally {
        teardown();
      }
    });
  });
}
