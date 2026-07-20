import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { RateFilterBar } from "./RateFilterBar";
import type { RateFilter } from "./ratesFilter";

test("renders every prototype filter and reports selection", async () => {
  const onSelect = jest.fn<(f: RateFilter) => void>();
  await renderWithTheme(<RateFilterBar selected="ALL" onSelect={onSelect} />);

  expect(screen.getByText("ALL")).toBeTruthy();
  expect(screen.getByText("JPY")).toBeTruthy();

  await fireEvent.press(screen.getByText("EUR"));
  expect(onSelect).toHaveBeenCalledWith("EUR");
});
