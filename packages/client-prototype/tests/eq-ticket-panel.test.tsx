import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { OrderTicketPanel } from "#/equities/Ticket/OrderTicketPanel";
import type { EqSym } from "#/equities/types";
import { useEqTicket } from "#/equities/useEqTicket";

const RATES = {
  AAPL: 230,
  MSFT: 467,
  NVDA: 131,
  TSLA: 251,
  AMZN: 218,
  GOOGL: 178,
  META: 591,
  SPY: 588,
} as Record<EqSym, number>;

afterEach(cleanup);

describe("OrderTicketPanel", () => {
  test("labels the submit button for the selected symbol and side", () => {
    const { result } = renderHook(() => {
      return useEqTicket("AAPL", RATES);
    });
    const { getByText } = render(
      <OrderTicketPanel api={result.current} sel="AAPL" last={230} />,
    );
    expect(getByText("BUY AAPL")).toBeTruthy();
  });
});
