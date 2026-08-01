import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AcceptPulse } from "#/ui/credit/rfqTiles/AcceptPulse";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the ripple when motion is enabled", async () => {
  await renderPulse(false);
  expect(screen.getByTestId("accept-pulse")).toBeTruthy();
});

test("renders nothing when motion is disabled", async () => {
  const { toJSON } = await renderPulse(true);
  expect(screen.queryByTestId("accept-pulse")).toBeNull();
  expect(toJSON()).toBeNull();
});

function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

function renderPulse(isFreeze: boolean): ReturnType<typeof renderWithTheme> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
      <AcceptPulse />
    </ViewModelProvider>,
  );
}
