import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { CreditNav } from "#/ui/credit/CreditNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three sub-view tabs", async () => {
  await renderWithTheme(<CreditNav view="tiles" onChange={(): void => {}} />);
  expect(screen.getByTestId("credit-tab-tiles")).toBeTruthy();
  expect(screen.getByTestId("credit-tab-new-rfq")).toBeTruthy();
  expect(screen.getByTestId("credit-tab-sell-side")).toBeTruthy();
});

test("pressing a tab reports the new view", async () => {
  const onChange = jest.fn<(v: string) => void>();
  await renderWithTheme(<CreditNav view="tiles" onChange={onChange} />);
  void fireEvent.press(screen.getByTestId("credit-tab-new-rfq"));
  expect(onChange).toHaveBeenCalledWith("new-rfq");
});
