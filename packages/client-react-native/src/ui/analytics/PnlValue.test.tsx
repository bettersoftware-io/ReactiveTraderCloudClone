import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// The MOBILE prototype's headline (dc.html L975) is a grouped whole-dollar
// figure — "+$29,672" — not the web design's thousands shorthand. RN rendered
// the shared `formatPnlHeadline` ("+$9.7k"), which is right for the web
// clients and wrong here; `formatSignedDollars` is the mobile rule and lives
// beside this screen. The previous comment here cited "dc.html L1299", which
// is boot-canvas telemetry and never had anything to do with this format.

test("renders the headline as a grouped whole-dollar figure", async () => {
  await renderWithTheme(<PnlValue value={29_672} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$29,672");
});

test("renders a loss with the design's U+2212 minus", async () => {
  await renderWithTheme(<PnlValue value={-4000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("−$4,000");
});

// The web renders the headline bare. Keeping RN's old "USD " prefix would read
// "USD +$29,672" once the dollar sign arrived with the new formatter.
test("carries no currency prefix — the format already includes the dollar sign", async () => {
  await renderWithTheme(<PnlValue value={1000} />);
  expect(screen.getByTestId("pnl-value")).not.toHaveTextContent("USD");
});

test("carries no thousands shorthand — the whole figure is shown", async () => {
  await renderWithTheme(<PnlValue value={5000} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$5,000");
});

test("treats zero as non-negative, matching the prototype's sign test", async () => {
  await renderWithTheme(<PnlValue value={0} />);
  expect(screen.getByTestId("pnl-value")).toHaveTextContent("+$0");
});
