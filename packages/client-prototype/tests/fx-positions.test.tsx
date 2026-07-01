import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { PositionsView } from "#/fx/Positions/PositionsView";

afterEach(cleanup);

describe("PositionsView", () => {
  test("renders the Net Exposure heading", () => {
    const { getByText } = render(<PositionsView />);
    expect(getByText("Net Exposure")).toBeTruthy();
  });

  test("renders a bubble and a row for each of the seven currencies", () => {
    const { getAllByText } = render(<PositionsView />);

    for (const ccy of ["EUR", "USD", "JPY", "GBP", "AUD", "CAD", "NZD"]) {
      // one instance in the bubble cluster, one in the list below
      expect(getAllByText(ccy).length).toBe(2);
    }
  });
});
