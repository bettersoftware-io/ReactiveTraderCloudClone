// packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx
import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { AmbientStyle } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AmbientBackground } from "#/ui/ambient/AmbientBackground";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders nothing when the animated-background preference is off (the mobile default)", async () => {
  await renderAmbient({ animatedBackground: false });
  expect(screen.queryByTestId("ambient-background")).toBeNull();
});

test("renders the canvas when the animated-background preference is on", async () => {
  await renderAmbient({ animatedBackground: true });
  expect(await screen.findByTestId("ambient-background")).toBeTruthy();
});

test("draws the aurora curtain group when ambientStyle is aurora and ambient is enabled", async () => {
  await renderAmbient({ animatedBackground: true, ambientStyle: "aurora" });
  expect(await screen.findByTestId("ambient-aurora-curtains")).toBeTruthy();
  expect(screen.queryByTestId("ambient-rays-blobs")).toBeNull();
});

test("draws the rays blobs group when ambientStyle is rays and ambient is enabled", async () => {
  await renderAmbient({ animatedBackground: true, ambientStyle: "rays" });
  expect(await screen.findByTestId("ambient-rays-blobs")).toBeTruthy();
  expect(screen.queryByTestId("ambient-aurora-curtains")).toBeNull();
});

interface RenderAmbientOptions {
  readonly animatedBackground: boolean;
  /** Defaults to "rays" — irrelevant to the first two (enable-gate) tests. */
  readonly ambientStyle?: AmbientStyle;
}

function renderAmbient(options: RenderAmbientOptions): Promise<unknown> {
  return render(
    <ViewModelProvider viewModel={fakeViewModel(options)}>
      <ThemeContext.Provider value={rnThemeTokens.neon.dark}>
        <AmbientBackground />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
}

// Minimal in-test PreferencesPort-shaped stub: only the ViewModel seams
// AmbientBackground actually reads (useAnimatedBackground, useAmbientStyle),
// mirroring AppearanceScreen.test.tsx's fakeViewModel pattern. `enabled`
// mirrors AsyncStoragePreferencesAdapter's `animatedBg` field (mobile
// default: false).
function fakeViewModel({
  animatedBackground,
  ambientStyle = "rays",
}: RenderAmbientOptions): ViewModel {
  return {
    useAnimatedBackground: () => {
      return {
        enabled: animatedBackground,
        setEnabled: () => {},
        toggle: () => {},
      };
    },
    useAmbientStyle: () => {
      return { style: ambientStyle, setStyle: () => {} };
    },
  } as unknown as ViewModel;
}
