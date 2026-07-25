import { describe, expect, it } from "vitest";

import { createConnectionLog } from "./connectionLog.js";

describe("createConnectionLog", () => {
  it("counts active + total across connect/disconnect and emits a line each", () => {
    const lines: string[] = [];
    const log = createConnectionLog((l) => {
      return lines.push(l);
    }, fixedClock());

    log.onConnect();
    log.onConnect();
    log.onDisconnect();

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("connect");
    expect(lines[0]).toContain("active=1 total=1");
    expect(lines[1]).toContain("active=2 total=2");
    expect(lines[2]).toContain("disconnect");
    expect(lines[2]).toContain("active=1 total=2");
  });

  it("never lets active go negative on an unmatched disconnect", () => {
    const lines: string[] = [];
    const log = createConnectionLog((l) => {
      return lines.push(l);
    }, fixedClock());

    log.onDisconnect();

    expect(lines[0]).toContain("active=0 total=0");
  });

  it("logs a rejected upgrade by reason and never the token", () => {
    const lines: string[] = [];
    const log = createConnectionLog((l) => {
      return lines.push(l);
    }, fixedClock());

    log.onRejectedUpgrade("no-token");
    log.onRejectedUpgrade("invalid-token");

    expect(lines[0]).toContain("upgrade-reject reason=no-token");
    expect(lines[1]).toContain("upgrade-reject reason=invalid-token");
    // A rejected upgrade emits only its own line — no connect/disconnect.
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("connect");
  });

  it("stamps each line with an ISO timestamp from the injected clock", () => {
    const lines: string[] = [];
    const log = createConnectionLog((l) => {
      return lines.push(l);
    }, fixedClock());

    log.onConnect();

    expect(lines[0]).toContain("2026-07-25T00:00:00.000Z");
  });
});

function fixedClock(): () => number {
  return () => {
    return Date.parse("2026-07-25T00:00:00.000Z");
  };
}
