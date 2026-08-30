import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { NotionalControl } from "./NotionalControl";

test("steppers halve/double with a 250k floor", async () => {
  const n = makeNotional(1_000_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);

  await fireEvent.press(screen.getByTestId("notional-up"));
  expect(n.change).toHaveBeenCalledWith("2000000");

  n.change.mockClear();
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("500000");
});

test("does not go below the 250k floor", async () => {
  const n = makeNotional(250_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByTestId("notional-down"));
  expect(n.change).toHaveBeenCalledWith("250000");
});

test("quick chip sets the notional", async () => {
  const n = makeNotional(1_000_000);
  await renderWithTheme(<NotionalControl notional={n} base="EUR" />);
  await fireEvent.press(screen.getByText("5M"));
  expect(n.change).toHaveBeenCalledWith("5000000");
});

// The prototype's chip states (dc.html L2487: `bg: on ? T.chip :
// 'transparent', c: on ? T.acc : T.faint, bc: on ? T.acc : T.bSub`). The
// selected size is an ACCENT OUTLINE over a faint tint, not a solid accent
// block — it was the latter until the mobile-v1 fidelity pass, which also left
// every unselected chip carrying a `chip` fill the design has as transparent.
// Asserted against the holo/dark cells `renderWithTheme` supplies by default.
test("the selected size chip is accent-outlined and the rest are unfilled", async () => {
  await renderWithTheme(
    <NotionalControl notional={makeNotional(5_000_000)} base="EUR" />,
  );

  expect(screen.getByText("5M").parent?.props.style).toContainEqual({
    backgroundColor: "rgba(0,224,255,0.12)",
    borderColor: "#00e5ff",
  });
  expect(screen.getByText("5M").props.style).toContainEqual({
    color: "#00e5ff",
  });

  expect(screen.getByText("1M").parent?.props.style).toContainEqual({
    backgroundColor: "transparent",
    borderColor: "rgba(0,224,255,0.12)",
  });
  expect(screen.getByText("1M").props.style).toContainEqual({
    color: "rgba(120,190,210,0.42)",
  });
});

interface FakeNotional {
  state: { displayValue: string; numericValue: number; error: string | null };
  change: jest.Mock;
  reset: jest.Mock;
}

function makeNotional(numericValue: number): FakeNotional {
  return {
    state: {
      displayValue: numericValue.toLocaleString("en-US"),
      numericValue,
      error: null,
    },
    change: jest.fn(),
    reset: jest.fn(),
  };
}
