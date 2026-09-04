import { expect, jest, test } from "@jest/globals";

import { notionalControlPage } from "#tests/pages/NotionalControlPage";

const page = notionalControlPage();

test("steppers halve/double with a 250k floor", async () => {
  const n = makeNotional(1_000_000);
  await page.mount(n, "EUR");

  await page.press("notional-up");
  expect(n.change).toHaveBeenCalledWith("2000000");

  n.change.mockClear();
  await page.press("notional-down");
  expect(n.change).toHaveBeenCalledWith("500000");
});

test("does not go below the 250k floor", async () => {
  const n = makeNotional(250_000);
  await page.mount(n, "EUR");
  await page.press("notional-down");
  expect(n.change).toHaveBeenCalledWith("250000");
});

test("quick chip sets the notional", async () => {
  const n = makeNotional(1_000_000);
  await page.mount(n, "EUR");
  await page.pressText("5M");
  expect(n.change).toHaveBeenCalledWith("5000000");
});

// The prototype's chip states (dc.html L2487: `bg: on ? T.chip :
// 'transparent', c: on ? T.acc : T.faint, bc: on ? T.acc : T.bSub`). The
// selected size is an ACCENT OUTLINE over a faint tint, not a solid accent
// block — it was the latter until the mobile-v1 fidelity pass, which also left
// every unselected chip carrying a `chip` fill the design has as transparent.
// Asserted against the holo/dark cells `renderWithTheme` supplies by default.
test("the selected size chip is accent-outlined and the rest are unfilled", async () => {
  await page.mount(makeNotional(5_000_000), "EUR");

  expect(page.rawParentStyleOfText("5M")).toContainEqual({
    backgroundColor: "rgba(0,224,255,0.12)",
    borderColor: "#00e5ff",
  });
  expect(page.rawStyleOfText("5M")).toContainEqual({
    color: "#00e5ff",
  });

  expect(page.rawParentStyleOfText("1M")).toContainEqual({
    backgroundColor: "transparent",
    borderColor: "rgba(0,224,255,0.12)",
  });
  expect(page.rawStyleOfText("1M")).toContainEqual({
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
