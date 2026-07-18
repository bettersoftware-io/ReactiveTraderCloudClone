import { describe, expect, test } from "vitest";

import { EXPOSURE } from "#/fx/Positions/positionsData";

describe("positionsData", () => {
  test("has the seven PROTO currencies in order", () => {
    expect(
      EXPOSURE.map((e) => {
        return e.ccy;
      }),
    ).toEqual(["EUR", "USD", "JPY", "GBP", "AUD", "CAD", "NZD"]);
  });

  test("derives bubble size from sqrt of exposure and flags large bubbles", () => {
    const eur = EXPOSURE.find((e) => {
      return e.ccy === "EUR";
    });

    const nzd = EXPOSURE.find((e) => {
      return e.ccy === "NZD";
    });
    expect(eur?.size).toBe(83);
    expect(eur?.large).toBe(true);
    expect(nzd?.size).toBe(56);
    expect(nzd?.large).toBe(false);
  });

  test("formats the amount with sign and M suffix", () => {
    const usd = EXPOSURE.find((e) => {
      return e.ccy === "USD";
    });
    expect(usd?.amt).toBe("-22.8M");
  });
});
