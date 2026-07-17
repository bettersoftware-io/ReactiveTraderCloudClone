// packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders nothing when the animated-background preference is off (the mobile default)", async () => {
  await renderAmbient(false);
  expect(screen.queryByTestId("ambient-background")).toBeNull();
});

test("renders the canvas when the animated-background preference is on", async () => {
  await renderAmbient(true);
  expect(await screen.findByTestId("ambient-background")).toBeTruthy();
});

function renderAmbient(enabled: boolean): Promise<unknown> {
  return render(
    <ViewModelProvider viewModel={fakeViewModel(enabled)}>
      <ThemeContext.Provider value={rnThemeTokens.neon.dark}>
        <AmbientBackground />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
}

// Minimal in-test PreferencesPort-shaped stub: only the ViewModel seam
// AmbientBackground actually reads (useAnimatedBackground), mirroring
// AppearanceScreen.test.tsx's fakeViewModel pattern. `enabled` mirrors
// AsyncStoragePreferencesAdapter's `animatedBg` field (mobile default: false).
function fakeViewModel(enabled: boolean): ViewModel {
  return {
    useAnimatedBackground: () => {
      return { enabled, setEnabled: () => {}, toggle: () => {} };
    },
  } as unknown as ViewModel;
}
