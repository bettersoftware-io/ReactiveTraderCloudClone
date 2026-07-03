import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { EquitiesNav } from "#/ui/equities/EquitiesNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three segments and reports a change", async () => {
  const onChange = jest.fn();
  await renderWithTheme(<EquitiesNav view="markets" onChange={onChange} />);
  expect(screen.getByTestId("equities-tab-markets")).toBeTruthy();
  expect(screen.getByTestId("equities-tab-trade")).toBeTruthy();
  expect(screen.getByTestId("equities-tab-blotters")).toBeTruthy();
  void fireEvent.press(screen.getByTestId("equities-tab-trade"));
  expect(onChange).toHaveBeenCalledWith("trade");
});
