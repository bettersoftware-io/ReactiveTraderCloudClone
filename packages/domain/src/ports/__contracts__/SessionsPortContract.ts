import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { SessionsPort } from "../sessionsPort.js";

export interface SessionsHarness {
  port: SessionsPort;
  /** Advance the simulator clock by `ms` (vi.advanceTimersByTimeAsync). */
  advance: (ms: number) => Promise<void>;
  teardown: () => void;
}

export function describeSessionsPortContract(
  label: string,
  makeHarness: () => SessionsHarness,
): void {
  describe(`${label} :: SessionsPort contract`, () => {
    it("sessions$ emits a non-empty readonly SessionInfo[]", async () => {
      const { port, teardown } = makeHarness();
      try {
        const sessions = await firstValueFrom(port.sessions$());
        expect(sessions.length).toBeGreaterThan(0);
        const first = sessions[0];
        expect(typeof first.id).toBe("string");
        expect(typeof first.user).toBe("string");
        expect(typeof first.region).toBe("string");
      } finally {
        teardown();
      }
    });

    it("sessions$ keeps emitting on the simulator cadence", async () => {
      const { port, advance, teardown } = makeHarness();
      try {
        let count = 0;
        const sub = port.sessions$().subscribe(() => {
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
