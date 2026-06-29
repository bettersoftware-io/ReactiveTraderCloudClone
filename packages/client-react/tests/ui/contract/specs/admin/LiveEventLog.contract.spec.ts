/**
 * LiveEventLog contract spec (Phase 5 Task 8).
 *
 * Verifies that the LiveEventLog component renders events newest-first,
 * reflects data-severity correctly, and shows the empty placeholder when
 * no events are present.
 *
 * NOTE: LiveEventLog <li> elements carry data-severity but NOT
 * data-testid="event-row" — the page object uses li[data-severity] selectors
 * instead (reported gap; component not modified per task constraint).
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

  it("renders events in the provided (newest-first) order", () => {
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

    expect(log.firstRowSeverity()).toBe("error");
    expect(log.rowSeverity(1)).toBe("warn");
    expect(log.rowSeverity(2)).toBe("info");
  });

  it("reflects data-severity on each row", () => {
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

    expect(log.rowSeverity(0)).toBe("warn");
    expect(log.rowSeverity(1)).toBe("info");
  });

  it("re-renders when the eventLog$ subject is updated", () => {
    const log = mount(LiveEventLog, {});

    expect(log.isEmpty()).toBe(true);

    log.setEventLog([
      { t: 1000, severity: "info", service: "kernel", message: "boot" },
      { t: 500, severity: "warn", service: "pricing", message: "degraded" },
    ]);

    expect(log.rowCount()).toBe(2);
    expect(log.firstRowSeverity()).toBe("info");
  });

  it("shows three different severities in a single log", () => {
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
      return el.getAttribute("data-severity");
    });
    expect(severities).toEqual(["error", "warn", "info"]);
  });
});
