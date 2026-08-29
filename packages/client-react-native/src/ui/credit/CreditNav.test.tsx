import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { CreditNav } from "#/ui/credit/CreditNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three sub-view segments with the design's labels", async () => {
  await renderWithTheme(<CreditNav view="tiles" onChange={(): void => {}} />);
  expect(screen.getByTestId("credit-nav")).toBeTruthy();
  expect(screen.getByTestId("credit-tab-tiles")).toHaveTextContent("RFQS");
  expect(screen.getByTestId("credit-tab-new-rfq")).toHaveTextContent("NEW RFQ");
  expect(screen.getByTestId("credit-tab-sell-side")).toHaveTextContent(
    "SELL-SIDE",
  );
});

test("pressing a segment reports the new view", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await renderWithTheme(<CreditNav view="tiles" onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("credit-tab-new-rfq"));
  expect(onChange).toHaveBeenCalledWith("new-rfq");
});
