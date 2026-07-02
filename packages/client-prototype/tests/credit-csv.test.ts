import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SEED_TRADES } from "#/credit/creditData";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { downloadCsv } from "#/csvExport";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("credit CSV export", () => {
  test("onExport writes credit-trades.csv with headers and rows in the fixed 10-column order", () => {
    // A huge tick interval keeps the background now-sweep from firing mid-test.
    const { result } = renderHook(() => {
      return useCreditRfqs({ nowIntervalMs: 1_000_000 });
    });

    act(() => {
      result.current.onExport();
    });

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const call = vi.mocked(downloadCsv).mock.calls[0];
    expect(call?.[0]).toBe("credit-trades.csv");

    const lines = String(call?.[1]).split("\n");
    expect(lines[0]).toBe(
      '"Trade ID","Status","Trade Date","Direction","Counterparty","CUSIP","Security","Quantity","Order Type","Unit Price"',
    );
    // Seed trade #238 written independently in header order — a reorder of
    // CSV_HEADERS relative to the row mapping would break this assertion.
    const seed = SEED_TRADES[0];
    expect(lines[1]).toBe(
      `"238","Done","${seed?.date}","Buy","Citi","594918BV5","MSFT 3.3 02/27","3,500,000","AON","$99.8"`,
    );
  });
});

// Keep the real `toCsv` (so the produced string is genuine) but capture the
// download so we can assert the exact CSV content, guarding the hand-ordered
// 10-column header↔row mapping in useCreditRfqs.onExport (spec §5).
vi.mock("#/csvExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/csvExport")>();
  return { ...actual, downloadCsv: vi.fn() };
});
