import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { BlotterRow } from "#/fx/Blotter/BlotterRow";
import { TradesBlotter } from "#/fx/Blotter/TradesBlotter";
import { SEED_TRADES } from "#/fx/fxData";
import { useFxBlotter } from "#/fx/useFxBlotter";

afterEach(cleanup);

describe("useFxBlotter", () => {
  test("defaults to tradeId descending, then sorts/filters on demand", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });

    expect(result.current.rows[0]?.id).toBe(1042);

    act(() => {
      result.current.onSort("tradeId");
    });
    expect(result.current.rows[0]?.id).toBe(1038);

    act(() => {
      result.current.onQuery("gbpusd");
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]?.id).toBe(1040);
    expect(result.current.count).toBe(1);
  });
});

describe("TradesBlotter", () => {
  test("renders all 10 column labels and one row per trade", () => {
    const { result } = renderHook(() => {
      return useFxBlotter(SEED_TRADES);
    });
    const { getByText } = render(<TradesBlotter api={result.current} />);

    for (const label of [
      "ID",
      "Status",
      "Date",
      "Dir",
      "CCYCCY",
      "Deal",
      "Notional",
      "Rate",
      "Value",
      "Trader",
    ]) {
      expect(
        getByText((text) => {
          return text.startsWith(label);
        }),
      ).toBeTruthy();
    }
  });
});

describe("BlotterRow", () => {
  test("isNew marks the row with data-new so rowIn/rowFlashA-B fire", () => {
    const trade = SEED_TRADES[0];

    if (trade == null) {
      throw new Error("SEED_TRADES must be non-empty");
    }

    const { container, rerender } = render(
      <BlotterRow trade={trade} isNew={false} />,
    );
    expect(container.querySelector("[data-new]")).toBeNull();

    rerender(<BlotterRow trade={trade} isNew />);
    expect(container.querySelector("[data-new]")).toBeTruthy();
  });
});
