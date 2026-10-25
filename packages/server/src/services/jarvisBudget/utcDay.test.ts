import { describe, expect, it } from "vitest";

import { nextUtcMidnightMs, utcDayOf } from "./utcDay.js";

describe("utcDayOf", () => {
  it("names the UTC calendar day of an instant", () => {
    expect(utcDayOf(Date.UTC(2026, 9, 25, 23, 59, 59, 999))).toBe("2026-10-25");
  });

  it("rolls over at exactly 00:00 UTC", () => {
    expect(utcDayOf(Date.UTC(2026, 9, 26))).toBe("2026-10-26");
  });
});

describe("nextUtcMidnightMs", () => {
  it("is the coming 00:00 UTC", () => {
    expect(nextUtcMidnightMs(Date.UTC(2026, 9, 25, 13))).toBe(
      Date.UTC(2026, 9, 26),
    );
  });

  it("moves to the following midnight when the instant is exactly midnight", () => {
    expect(nextUtcMidnightMs(Date.UTC(2026, 9, 26))).toBe(
      Date.UTC(2026, 9, 27),
    );
  });
});
