import { describe, expect, test } from "vitest";

import {
  fmtBarVal,
  fmtPnl,
  PAIR_PNL,
  PNL_AREA,
  PNL_LINE,
} from "#/fx/Analytics/analyticsData";

describe("analyticsData", () => {
  test("fmtPnl formats thousands with a sign and $…k", () => {
    expect(fmtPnl(17120)).toBe("+$17.1k");
    expect(fmtPnl(0)).toBe("+$0.0k");
  });

  test("fmtBarVal signs positive values and leaves negatives bare", () => {
    expect(fmtBarVal(13)).toBe("+13k");
    expect(fmtBarVal(-4)).toBe("-4k");
  });

  test("PAIR_PNL has the six PROTO pairs in order", () => {
    expect(
      PAIR_PNL.map((row) => {
        return row.pair;
      }),
    ).toEqual(["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "EURJPY"]);
  });

  test("sparkline geometry starts at the first point and closes to the baseline", () => {
    expect(PNL_LINE.startsWith("0,92")).toBe(true);
    expect(PNL_AREA.startsWith("M0,92 ")).toBe(true);
    expect(PNL_AREA.endsWith("L300,100 L0,100 Z")).toBe(true);
  });
});
