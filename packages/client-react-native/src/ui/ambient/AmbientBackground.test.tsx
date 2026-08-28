// packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";

import type { AmbientStyle, PowerSaverLevel } from "@rtc/domain";
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

// The drift loop is the one piece of ambient motion Freeze did not reach
// before: `useAmbientEnabled` reads only the preference and OS reduced-motion.
// Asserted on `withRepeat` itself — the loop is a UI-thread worklet the render
// tree cannot show, and the mock's shared values would resolve instantly
// either way.
test("does not start the drift loop under power-saver Freeze, but still paints the canvas", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await renderAmbient({ animatedBackground: true, powerSaverLevel: "freeze" });
  expect(await screen.findByTestId("ambient-background")).toBeTruthy();
  expect(withRepeat).not.toHaveBeenCalled();
});

test("starts the drift loop when power-saver is off", async () => {
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  await renderAmbient({ animatedBackground: true, powerSaverLevel: "off" });
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  jest.restoreAllMocks();
});

interface RenderAmbientOptions {
  readonly animatedBackground: boolean;
  /** Defaults to "rays" — irrelevant to the first two (enable-gate) tests. */
  readonly ambientStyle?: AmbientStyle;
  /** Defaults to "off", production's default. */
  readonly powerSaverLevel?: PowerSaverLevel;
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
// AmbientBackground actually reads (useAnimatedBackground, useAmbientStyle,
// and usePowerSaver through useShellMotionEnabled),
// mirroring AppearanceScreen.test.tsx's fakeViewModel pattern. `enabled`
// mirrors AsyncStoragePreferencesAdapter's `animatedBg` field (mobile
// default: false).
function fakeViewModel({
  animatedBackground,
  ambientStyle = "rays",
  powerSaverLevel = "off",
}: RenderAmbientOptions): ViewModel {
  return {
    usePowerSaver: () => {
      return {
        level: powerSaverLevel,
        isCalm: powerSaverLevel !== "off",
        isFreeze: powerSaverLevel === "freeze",
        setLevel: () => {},
        cycle: () => {},
      };
    },
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
