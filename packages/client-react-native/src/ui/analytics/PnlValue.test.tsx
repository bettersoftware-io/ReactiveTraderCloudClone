import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";

test("renders a positive P&L with a leading plus and USD label", async () => {
  await render(<PnlValue value={1000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD +1,000");
});

test("renders a negative P&L", async () => {
  await render(<PnlValue value={-500} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD -500");
});
