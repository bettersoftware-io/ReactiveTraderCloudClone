import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// The prototype's headline format (dc.html L1299) is a signed dollar figure in
// thousands — "+$17.1k" — which `formatPnlHeadline` implements and both web
// clients already use. RN was on the older `formatPnlValue` ("+17,120") behind
// a "USD " label, so the two clients disagreed on the same number.

test("renders a positive P&L in the prototype's signed-thousands format", async () => {
  await renderWithTheme(<PnlValue value={17_120} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$17.1k");
});

test("renders a negative P&L with its own sign, not a bare minus", async () => {
  await renderWithTheme(<PnlValue value={-4000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("-$4.0k");
});

// The web renders the headline bare. Keeping RN's old "USD " prefix would read
// "USD +$17.1k" once the dollar sign arrived with the new formatter.
test("carries no currency prefix — the format already includes the dollar sign", async () => {
  await renderWithTheme(<PnlValue value={1000} />);
  expect(screen.getByTestId("pnl-value")).not.toHaveTextContent("USD");
});

test("keeps one decimal place even on a round figure", async () => {
  await renderWithTheme(<PnlValue value={5000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$5.0k");
});

test("treats zero as non-negative, matching the shared formatter", async () => {
  await renderWithTheme(<PnlValue value={0} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$0.0k");
});
