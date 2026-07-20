import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BlotterFilterBar } from "./BlotterFilterBar";
import type { BlotterFilter } from "./blotterFilter";

test("renders chips + summary and reports selection", async () => {
  const onSelect = jest.fn<(f: BlotterFilter) => void>();
  await renderWithTheme(
    <BlotterFilterBar
      selected="ALL"
      onSelect={onSelect}
      summary={{ fills: 4, buys: 3, sells: 1 }}
    />,
  );

  expect(screen.getByText("REJECTED")).toBeTruthy();
  expect(screen.getByText(/4 FILLS/)).toBeTruthy();

  await fireEvent.press(screen.getByText("DONE"));
  expect(onSelect).toHaveBeenCalledWith("DONE");
});
