import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders a positive P&L with a leading plus and USD label", async () => {
  await renderWithTheme(<PnlValue value={1000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD +1,000");
});

test("renders a negative P&L", async () => {
  await renderWithTheme(<PnlValue value={-500} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("USD -500");
});
