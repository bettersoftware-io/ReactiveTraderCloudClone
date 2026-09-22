import { describe, expect, it, vi } from "vitest";

import { METRIC_WINDOW, type SessionInfo } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

/** `sessionsKpi` (ruling 3 + ruling 4): a warm FOLD over `SessionsPort
 * .sessions$()`, sampled at the CLOCK the emission lands on (`t: Date.now
 * ()`, `value: sessions.length`) — synchronous `[]` seed,
 * append-and-truncate to `METRIC_WINDOW`, retained across a full
 * unsubscribe (`refCount: false`). Run under `withFakeClock` so `t` can be
 * pinned against the fake clock rather than a real wall-clock read. */
export function describeSessionsKpiContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("seeds an empty series synchronously, before any port emission", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.sessionsKpi.countSeries$);
          expect(c.values).toEqual([[]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("samples the fake clock at each emission, not construction time", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(1_000);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.sessionsKpi.countSeries$);
          h.driver.emitSessions(createSessionRoster(2));
          await clock.settle();
          expect(c.values.at(-1)).toEqual([{ t: 1_000, value: 2 }]);
          await clock.advance(500);
          h.driver.emitSessions(createSessionRoster(1));
          await clock.settle();
          expect(c.values.at(-1)).toEqual([
            { t: 1_000, value: 2 },
            { t: 1_500, value: 1 },
          ]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it(`truncates a burst to the newest ${METRIC_WINDOW} samples`, async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(1_000);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.sessionsKpi.countSeries$);

          for (let count = 1; count <= METRIC_WINDOW + 1; count += 1) {
            h.driver.emitSessions(createSessionRoster(count));
          }

          await clock.settle();
          const last = c.values.at(-1);
          expect(last).toHaveLength(METRIC_WINDOW);
          expect(last?.[0]?.value).toBe(2);
          expect(last?.at(-1)?.value).toBe(METRIC_WINDOW + 1);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("retains the series across a full unsubscribe for a late subscriber", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(1_000);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.sessionsKpi.countSeries$);
          h.driver.emitSessions(createSessionRoster(2));
          await clock.settle();
          c.unsubscribe();
          const late = collect(h.app.presenters.sessionsKpi.countSeries$);
          expect(late.values).toEqual([[{ t: 1_000, value: 2 }]]);
          late.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}

function createSessionRoster(count: number): readonly SessionInfo[] {
  return Array.from({ length: count }, (_, index) => {
    return {
      id: `s${index}`,
      user: `trader${index}`,
      region: "us-east",
      lat: 40,
      lon: -74,
    };
  });
}
