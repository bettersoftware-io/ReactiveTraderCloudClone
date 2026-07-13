import { describe, expect, it } from "vitest";

import { formatSpotDate } from "./formatSpotDate";

describe("formatSpotDate", () => {
  it("formats T+2 spot date as 'DD MMM'", () => {
    expect(formatSpotDate(new Date("2026-07-02T09:00:00Z"), 2)).toBe("04 Jul");
  });

  it("rolls over into the next month", () => {
    expect(formatSpotDate(new Date("2026-01-30T00:00:00Z"), 2)).toBe("01 Feb");
  });

  it("rolls over into the next year", () => {
    expect(formatSpotDate(new Date("2026-12-31T00:00:00Z"), 2)).toBe("02 Jan");
  });

  it("returns the same date for a zero offset", () => {
    expect(formatSpotDate(new Date("2026-07-02T09:00:00Z"), 0)).toBe("02 Jul");
  });
});
