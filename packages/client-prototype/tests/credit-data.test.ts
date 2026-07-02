import { describe, expect, test } from "vitest";

import {
  DEALERS,
  fmtNum,
  INSTRUMENTS,
  parseNotional,
  RFQ_SEQ_START,
  SEED_RFQS,
  SEED_TRADES,
} from "#/credit/creditData";

describe("creditData seeds", () => {
  test("9 dealers, house dealer id 1 is Adaptive Bank", () => {
    expect(DEALERS).toHaveLength(9);
    expect(DEALERS[0]).toEqual({ id: 1, name: "Adaptive Bank" });
  });

  test("8 instruments with cusip + ref price", () => {
    expect(INSTRUMENTS).toHaveLength(8);
    const msft = INSTRUMENTS.find((i) => {
      return i.ticker === "MSFT 3.3 02/27";
    });
    expect(msft?.cusip).toBe("594918BV5");
    expect(msft?.ref).toBe(99.8);
  });

  test("seeds two RFQs (Closed 238, Cancelled 237) and two trades", () => {
    expect(
      SEED_RFQS.map((r) => {
        return r.state;
      }),
    ).toEqual(["Closed", "Cancelled"]);
    expect(SEED_RFQS[0].id).toBe(238);
    expect(SEED_TRADES).toHaveLength(2);
    expect(RFQ_SEQ_START).toBe(700);
  });

  test("fmtNum groups thousands; parseNotional handles suffixes", () => {
    expect(fmtNum(3500000)).toBe("3,500,000");
    expect(parseNotional("3.5m")).toBe(3_500_000);
    expect(parseNotional("250")).toBe(250);
  });
});
