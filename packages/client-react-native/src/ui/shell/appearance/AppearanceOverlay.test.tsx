import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

// `@gorhom/bottom-sheet` is replaced package-wide by the manual mock at
// `__mocks__/@gorhom/bottom-sheet.tsx` (picked up automatically by jest, no
// `jest.mock` call needed here). That double gates its `children` behind the
// imperative `.present()`/`.dismiss()` handle rather than always rendering
// them, matching the real component's own `mount` contract — so
// `getByTestId("appearance-sheet")` below is proof `.present()` was actually
// invoked, not just that the tree contains a `BottomSheetView`.

test("renders the sheet with a grab handle and no CLOSE affordance", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open onClose={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("appearance-sheet")).toBeTruthy();
  expect(screen.queryByTestId("appearance-close")).toBeNull();
});

test("renders nothing when closed", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <AppearanceOverlay open={false} onClose={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("appearance-sheet")).toBeNull();
});

// Guards the effect-deps bug found in review: an empty-deps mount effect
// only ever calls `.present()` once, at `AppearanceOverlay`'s own mount —
// almost always while still closed, since it stays mounted for the app's
// whole lifetime and only `open` toggles. First-mount-already-open (the test
// above) can't catch that; only a later false -> true transition on an
// already-mounted instance can.
test("presents the sheet on a later open, not just at first mount", async () => {
  // `renderWithTheme` doesn't expose `rerender` re-wrapped in its own
  // `ThemeContext.Provider` — `rerender` replaces the whole previous tree, so
  // the wrapper has to be reapplied by hand on each call, matching what
  // `renderWithTheme` does internally (`rnThemeTokens.holo.dark`, its own
  // default).
  const { rerender } = await render(wrapped(false));
  expect(screen.queryByTestId("appearance-sheet")).toBeNull();

  await rerender(wrapped(true));
  expect(screen.getByTestId("appearance-sheet")).toBeTruthy();
});

function wrapped(open: boolean): ReactElement {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider viewModel={vm()}>
        <AppearanceOverlay open={open} onClose={(): void => {}} />
      </ViewModelProvider>
    </ThemeContext.Provider>
  );
}

function vm(): ViewModel {
  return {
    useThemePreference: () => {
      return { mode: "dark", modePreference: "dark", cycle: (): void => {} };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin: (): void => {} };
    },
    useAnimatedBackground: () => {
      return {
        enabled: false,
        setEnabled: (): void => {},
        toggle: (): void => {},
      };
    },
    usePowerSaver: () => {
      return {
        level: "off",
        isCalm: false,
        isFreeze: false,
        setLevel: (): void => {},
        cycle: (): void => {},
      };
    },
    useAmbientStyle: () => {
      return { style: "aurora", setStyle: (): void => {} };
    },
    useBootGate: () => {
      return {
        visible: false,
        reboot: (): void => {},
        dismiss: (): void => {},
      };
    },
    // Required since P7 put `LogoutButton` in the sheet (via `AppearanceScreen`).
    useAuth: () => {
      return { logout: (): void => {} };
    },
  } as unknown as ViewModel;
}
