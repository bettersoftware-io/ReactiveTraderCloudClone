import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCountdownRing } from "#/ui/credit/rfqTiles/RfqCountdownRing";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders a ring for a live RFQ", async () => {
  await renderRing(30_000);
  expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
});

test("still renders at zero remaining rather than unmounting", async () => {
  await renderRing(0);
  expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
});

test("shows the remaining whole seconds in the ring's centre", async () => {
  await renderRing(30_000);
  expect(screen.getByText("30")).toBeTruthy();
});

test("clamps a negative remaining to a zero readout", async () => {
  await renderRing(-500);
  expect(screen.getByText("0")).toBeTruthy();
});

/** `useShellMotionEnabled` reads `usePowerSaver` off the seam, so even this
 * leaf needs a ViewModel — the theme alone is not enough. */
function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

function renderRing(remainingMs: number, isFreeze = false): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
      <RfqCountdownRing remainingMs={remainingMs} totalMs={60_000} />
    </ViewModelProvider>,
  );
}
