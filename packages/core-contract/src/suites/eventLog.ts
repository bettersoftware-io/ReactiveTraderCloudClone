import { describe, expect, it } from "vitest";

import { type LogEvent, MAX_LOG_ROWS } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `eventLog` (ruling 3): a warm FOLD over `EventLogPort.events$()` —
 * synchronous `[]` seed, PREPEND-and-truncate to `MAX_LOG_ROWS` (newest
 * first), retained across a full unsubscribe (`refCount: false`). */
export function describeEventLogContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("seeds an empty log synchronously, before any port emission", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eventLog.events$);
        expect(c.values).toEqual([[]]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("prepends each event, newest first, settled between", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eventLog.events$);
        const e1 = createLogEvent("first");
        const e2 = createLogEvent("second");
        h.driver.emitLogEvent(e1);
        await settle();
        h.driver.emitLogEvent(e2);
        await settle();
        expect(c.values.at(-1)).toEqual([e2, e1]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it(`truncates a burst to the newest ${MAX_LOG_ROWS} rows, newest at [0]`, async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eventLog.events$);
        const events = createLogEventBurst(MAX_LOG_ROWS + 1);

        for (const event of events) {
          h.driver.emitLogEvent(event);
        }

        await settle();
        const last = c.values.at(-1);
        expect(last).toHaveLength(MAX_LOG_ROWS);
        expect(last?.[0]).toEqual(events.at(-1));
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("retains the log across a full unsubscribe for a late subscriber", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eventLog.events$);
        const e1 = createLogEvent("first");
        h.driver.emitLogEvent(e1);
        await settle();
        c.unsubscribe();
        const late = collect(h.app.presenters.eventLog.events$);
        expect(late.values).toEqual([[e1]]);
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function createLogEvent(message: string, t = 0): LogEvent {
  return { t, severity: "info", service: "pricing", message };
}

function createLogEventBurst(count: number): readonly LogEvent[] {
  return Array.from({ length: count }, (_, index) => {
    return createLogEvent(`event ${index}`, index);
  });
}
