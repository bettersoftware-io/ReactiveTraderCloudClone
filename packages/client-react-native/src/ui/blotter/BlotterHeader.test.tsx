import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BlotterHeader } from "./BlotterHeader";

test("renders all four column labels", async () => {
  await renderWithTheme(<BlotterHeader />);

  expect(screen.getByText("PAIR · DIR")).toBeTruthy();
  expect(screen.getByText("NOTIONAL")).toBeTruthy();
  expect(screen.getByText("RATE")).toBeTruthy();
  expect(screen.getByText("STATUS")).toBeTruthy();
});
