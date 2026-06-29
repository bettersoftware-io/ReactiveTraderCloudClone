import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Severity } from "#/telemetry/log.js";

import type { EventLogPort } from "../eventLogPort.js";

export interface EventLogHarness {
  port: EventLogPort;
  /** Advance the simulator clock by `ms` (vi.advanceTimersByTimeAsync). */
  advance: (ms: number) => Promise<void>;
  teardown: () => void;
}

const VALID_SEVERITIES: readonly Severity[] = ["info", "warn", "error"];

export function describeEventLogPortContract(
  label: string,
  makeHarness: () => EventLogHarness,
): void {
  describe(`${label} :: EventLogPort contract`, () => {
    it("events$ emits a LogEvent with a valid severity", async () => {
      const { port, teardown } = makeHarness();
      try {
        const event = await firstValueFrom(port.events$());
        expect(VALID_SEVERITIES).toContain(event.severity);
        expect(typeof event.t).toBe("number");
        expect(typeof event.message).toBe("string");
      } finally {
        teardown();
      }
    });

    it("events$ keeps emitting on the simulator cadence", async () => {
      const { port, advance, teardown } = makeHarness();
      try {
        let count = 0;
        const sub = port.events$().subscribe(() => {
          count++;
        });
        await advance(5_000);
        sub.unsubscribe();
        expect(count).toBeGreaterThan(1);
      } finally {
        teardown();
      }
    });
  });
}
