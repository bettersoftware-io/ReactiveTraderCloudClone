import { describe, expect, test } from "vitest";

import { downloadCsv, toCsv } from "#/fx/csvExport";

describe("csvExport", () => {
  test("toCsv quotes every field and doubles embedded quotes (PROTO 1159)", () => {
    expect(toCsv(["A", "B"], [[1, 'x"y']])).toBe('"A","B"\n"1","x""y"');
  });

  test("toCsv joins multiple rows with newlines", () => {
    const csv = toCsv(
      ["Trade ID", "Symbol"],
      [
        [1042, "EURUSD"],
        [1041, "USDJPY"],
      ],
    );

    expect(csv).toBe('"Trade ID","Symbol"\n"1042","EURUSD"\n"1041","USDJPY"');
  });

  test("downloadCsv does not throw in jsdom (no real URL.createObjectURL)", () => {
    expect(() => {
      downloadCsv("fx-trades.csv", '"A"\n"1"');
    }).not.toThrow();
  });
});
