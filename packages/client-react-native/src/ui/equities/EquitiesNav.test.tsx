import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { EquitiesNav } from "#/ui/equities/EquitiesNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the three segments with the design's labels", async () => {
  await renderWithTheme(
    <EquitiesNav view="markets" onChange={(): void => {}} />,
  );
  expect(screen.getByTestId("equities-nav")).toBeTruthy();
  expect(screen.getByTestId("equities-tab-markets")).toHaveTextContent(
    "MARKETS",
  );
  expect(screen.getByTestId("equities-tab-trade")).toHaveTextContent("TRADE");
  expect(screen.getByTestId("equities-tab-blotters")).toHaveTextContent(
    "BLOTTER",
  );
});

test("reports a change", async () => {
  const onChange = jest.fn();
  await renderWithTheme(<EquitiesNav view="markets" onChange={onChange} />);
  await fireEvent.press(screen.getByTestId("equities-tab-trade"));
  expect(onChange).toHaveBeenCalledWith("trade");
});
