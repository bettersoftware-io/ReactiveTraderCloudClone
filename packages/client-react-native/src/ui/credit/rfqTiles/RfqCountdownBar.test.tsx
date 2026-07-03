import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { RfqCountdownBar } from "#/ui/credit/rfqTiles/RfqCountdownBar";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("shows the remaining whole seconds", async () => {
  await renderWithTheme(
    <RfqCountdownBar remainingMs={60_000} totalMs={120_000} />,
  );
  expect(screen.getByText("60s remaining")).toBeTruthy();
});

test("fill width is the remaining fraction as a percentage", async () => {
  await renderWithTheme(
    <RfqCountdownBar remainingMs={30_000} totalMs={120_000} />,
  );
  const fill = screen.getByTestId("rfq-countdown-fill");
  expect(fill.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: "25%" })]),
  );
});

test("clamps a negative remaining to 0s and 0% width", async () => {
  await renderWithTheme(
    <RfqCountdownBar remainingMs={-500} totalMs={120_000} />,
  );
  expect(screen.getByText("0s remaining")).toBeTruthy();
  expect(screen.getByTestId("rfq-countdown-fill").props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: "0%" })]),
  );
});
