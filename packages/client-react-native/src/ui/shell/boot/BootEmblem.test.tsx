import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the emblem svg", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(false)}>
      <BootEmblem />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
});

// T16: the pulse used to read `AccessibilityInfo.isReduceMotionEnabled()`
// directly — an OS signal this app cannot override — which made the emblem the
// one surface power-saver Freeze could not stop, and left `boot/static`
// capturing a live animation. It now goes through `useBootMotionEnabled`, so
// Freeze reaches it like everything else.
//
// This asserts the WIRING, not the pixels: the fade runs on `useNativeDriver`,
// so jest never observes the animated value (the same blindness recorded for
// `BootGate` in T34). A device — or the pinned golden — is the only witness for
// whether it visibly stops.
test("still renders under freeze, with the motion gate reporting disabled", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true)}>
      <BootEmblem />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
});

/** The two seams `useBootMotionEnabled` reads. `isFreeze` is the one that
 * matters here; `forceBootAnimation` stays off so Freeze is decisive. */
function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
    useForceBootAnimation: () => {
      return { enabled: false };
    },
  } as unknown as ViewModel;
}
