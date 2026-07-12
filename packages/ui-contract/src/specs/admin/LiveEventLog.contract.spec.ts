/**
 * LiveEventLog contract spec (v2 Parity E Task 3).
 *
 * Verifies that the LiveEventLog component renders events newest-first, maps
 * the lowercase domain Severity to an uppercase data-sev chip (INFO/WARN/
 * ERROR — the prototype LiveEvents chrome), shows the "{n} events" count, and
 * shows the empty placeholder when no events are present.
 *
 * NOTE: row elements carry data-sev on the chip but NOT data-testid="event-row"
 * on the row itself — the page object locates rows via [data-sev]'s parent
 * (reported gap; component not modified per task constraint).
 */

import { LiveEventLog } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("LiveEventLog", () => {
  it("shows the empty placeholder when no events are seeded", () => {
    const log = mount(LiveEventLog, {});
    expect(log.isEmpty()).toBe(true);
    expect(log.rowCount()).toBe(0);
  });

  it("renders one row per seeded event", () => {
    const log = mount(LiveEventLog, {
      admin: {
        eventLog: [
          { t: 3000, severity: "error", service: "pricing", message: "crash" },
          { t: 2000, severity: "warn", service: "blotter", message: "slow" },
          { t: 1000, severity: "info", service: "kernel", message: "started" },
        ],
      },
    });

    expect(log.rowCount()).toBe(3);
  });

  it("renders events in the provided array order", () => {
    // The component renders in array order; the real presenter provides newest-first.
    // Specs provide the array already sorted newest-first to match production behaviour.
    const log = mount(LiveEventLog, {
      admin: {
        eventLog: [
          { t: 3000, severity: "error", service: "pricing", message: "crash" },
          { t: 2000, severity: "warn", service: "blotter", message: "slow" },
          { t: 1000, severity: "info", service: "kernel", message: "started" },
        ],
      },
    });

    expect(log.firstRowSeverity()).toBe("ERROR");
    expect(log.rowSeverity(1)).toBe("WARN");
    expect(log.rowSeverity(2)).toBe("INFO");
  });

  it("reflects an uppercase data-sev on each row's chip", () => {
    const log = mount(LiveEventLog, {
      admin: {
        eventLog: [
          {
            t: 2000,
            severity: "warn",
            service: "execution",
            message: "high latency",
          },
          { t: 1000, severity: "info", service: "analytics", message: "ok" },
        ],
      },
    });

    expect(log.rowSeverity(0)).toBe("WARN");
    expect(log.rowSeverity(1)).toBe("INFO");
  });

  it("re-renders when the eventLog$ subject is updated", () => {
    const log = mount(LiveEventLog, {});

    expect(log.isEmpty()).toBe(true);

    log.setEventLog([
      { t: 1000, severity: "info", service: "kernel", message: "boot" },
      { t: 500, severity: "warn", service: "pricing", message: "degraded" },
    ]);

    expect(log.rowCount()).toBe(2);
    expect(log.firstRowSeverity()).toBe("INFO");
  });

  it("shows three different severities, uppercased, in a single log", () => {
    const log = mount(LiveEventLog, {
      admin: {
        eventLog: [
          {
            t: 3000,
            severity: "error",
            service: "execution",
            message: "timeout",
          },
          { t: 2000, severity: "warn", service: "blotter", message: "slow" },
          { t: 1000, severity: "info", service: "kernel", message: "ok" },
        ],
      },
    });

    const severities = log.rows().map((el) => {
      return el.querySelector("[data-sev]")?.getAttribute("data-sev");
    });
    expect(severities).toEqual(["ERROR", "WARN", "INFO"]);
  });

  it("shows the '{n} events' count in the head", () => {
    const log = mount(LiveEventLog, {
      admin: {
        eventLog: [
          { t: 3000, severity: "error", service: "pricing", message: "crash" },
          { t: 2000, severity: "warn", service: "blotter", message: "slow" },
        ],
      },
    });

    expect(log.countText()).toBe("2 events");
  });

  it("counts zero events in the head when the log is empty", () => {
    const log = mount(LiveEventLog, {});
    expect(log.countText()).toBe("0 events");
  });
});
