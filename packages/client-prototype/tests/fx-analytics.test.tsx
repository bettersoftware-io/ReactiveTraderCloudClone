import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { AnalyticsView } from "#/fx/Analytics/AnalyticsView";

afterEach(cleanup);

describe("AnalyticsView", () => {
  test("renders the P&L header with a formatted pnl", () => {
    const { getByText } = render(<AnalyticsView pnl={17120} />);
    expect(getByText(/Profit & Loss · Today/)).toBeTruthy();
    expect(getByText("+$17.1k")).toBeTruthy();
  });

  test("renders all six currency-pair bars with values", () => {
    const { getByText } = render(<AnalyticsView pnl={0} />);

    for (const pair of ["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "EURJPY"]) {
      expect(getByText(pair)).toBeTruthy();
    }

    expect(getByText("+13k")).toBeTruthy();
    expect(getByText("-4k")).toBeTruthy();
  });
});
