import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CreditBlotterPanel } from "#/credit/Blotter/CreditBlotterPanel";
import { SEED_TRADES } from "#/credit/creditData";

afterEach(cleanup);

describe("CreditBlotterPanel", () => {
  test("renders the seed trades and the column header", () => {
    const { getByText, getAllByText } = render(
      <CreditBlotterPanel
        trades={SEED_TRADES}
        count="2 trades"
        newCreditId={null}
        onExport={vi.fn()}
      />,
    );
    expect(getByText("Counterparty")).toBeTruthy();
    expect(getByText("2 trades")).toBeTruthy();
    expect(getAllByText("Citi").length).toBeGreaterThan(0);
  });

  test("clicking CSV calls onExport", () => {
    const onExport = vi.fn();
    const { getByText } = render(
      <CreditBlotterPanel
        trades={SEED_TRADES}
        count="2 trades"
        newCreditId={null}
        onExport={onExport}
      />,
    );
    fireEvent.click(getByText(/CSV/));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
