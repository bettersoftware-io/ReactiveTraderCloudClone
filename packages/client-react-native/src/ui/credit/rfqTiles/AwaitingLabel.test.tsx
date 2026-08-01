import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AwaitingLabel } from "#/ui/credit/rfqTiles/AwaitingLabel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the AWAITING copy", async () => {
  await renderLabel(false);
  expect(screen.getByText("AWAITING")).toBeTruthy();
});

test("keeps the ellipsis visible with motion gated off", async () => {
  await renderLabel(true);
  expect(screen.getByTestId("awaiting-ellipsis")).toBeTruthy();
});

function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

function renderLabel(isFreeze: boolean): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
      <AwaitingLabel />
    </ViewModelProvider>,
  );
}
