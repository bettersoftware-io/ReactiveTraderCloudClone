// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("selects a skin on press", async () => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  await fireEvent.press(screen.getByTestId("appearance-skin-terminal"));
  expect(setSkin).toHaveBeenCalledWith("terminal");
});

test("lists the 3d skins and selects holo3d on press", async () => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  expect(screen.getByTestId("appearance-skin-terminal3d")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("appearance-skin-holo3d"));
  expect(setSkin).toHaveBeenCalledWith("holo3d");
});

test("marks the active skin selected", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByTestId("appearance-skin-holo-active")).toBeTruthy();
});

// The domain's storage order is alphabetical-ish (classic first); the design
// groups skins by family reading left-to-right across a 3x2 grid. This
// asserts the VIEW order (SKIN_DISPLAY_ORDER), not the domain's, and would
// catch a regression back to iterating THEME_SKINS directly.
test("renders all six skins as cards in the design's order", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  const labels = screen.getAllByTestId(/^appearance-skin-.*-label$/);
  expect(labels.map((n) => n.props.children)).toEqual([
    "HOLO HUD",
    "HOLO 3D",
    "TERMINAL",
    "TERMINAL 3D",
    "NEON",
    "CLASSIC",
  ]);
});

test("each card shows three swatches", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getAllByTestId("appearance-skin-holo-swatch")).toHaveLength(3);
});

// A count of three proves the swatches exist, not that they carry the right
// colours — three copies of the same accent would also pass the count-only
// test above. This pins the three swatches to the three distinct semantic
// accent tokens, in order, for the fixed "dark" mode the stub reports.
test("the three swatches are the three distinct semantic accent tokens, not copies of one", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  const swatches = screen.getAllByTestId("appearance-skin-holo-swatch");
  const colors = swatches.map(
    (n) => StyleSheet.flatten(n.props.style as ViewStyle).backgroundColor,
  );
  const holoDark = rnThemeTokens.holo.dark;
  expect(colors).toEqual([
    holoDark.accentPrimary,
    holoDark.accentPositive,
    holoDark.accentNegative,
  ]);
  expect(new Set(colors).size).toBe(3);
});

// P8 (StatusStrip.test.tsx) and the mode-segment invariant below guard a
// geometric assumption the same way after a control silently drifted into an
// unsafe layout with every other test still green. The skin grid has the
// identical trap: `skinCardWrap` is a PERCENTAGE width but `skinGrid`'s `gap`
// is a FIXED pixel amount, so the row's no-wrap margin is a function of
// device width, not a constant — it shrinks as the device narrows and grows
// as `gap` grows. At the values this grid shipped with in review round 1
// (31% / gap 10), a 320pt device cleared the no-wrap floor by 0.16pt —
// noise-level, and invisible to every order/count/colour/press test in this
// file, none of which would fail if the grid silently became 2x3. This test
// derives the ACTUAL no-wrap floor from the real rendered styles (not a
// hardcoded expectation of the constants) and asserts it clears a stated
// minimum device width with real margin.
//
// The repo states no minimum supported device width (checked app.config.ts
// and the RN package for a device-floor constant — none exists). 320pt is a
// CHOSEN assumption here, not a discovered fact: the logical width of the
// smallest iPhone the App Store has ever shipped (iPhone 5/SE 1st gen), used
// as the conservative floor.
test("the skin grid keeps real no-wrap margin on a 320pt device (assumed floor; not stated in the repo)", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  const MIN_SUPPORTED_DEVICE_WIDTH = 320;
  // This file's content container padding (AppearanceScreen.tsx `content:
  // { padding: 16, ... }`) — the grid's row width is the device width minus
  // this on both sides. Not independently readable off a queried node
  // (ScrollView's `contentContainerStyle` isn't exposed as `props.style` on
  // the host node RTL returns), so it is named here explicitly rather than
  // silently assumed; a change to that padding value must update this too.
  const CONTENT_HORIZONTAL_PADDING = 16;

  const grid = screen.getByTestId("appearance-skin-grid");
  const gap = StyleSheet.flatten(grid.props.style as ViewStyle).gap;
  expect(typeof gap).toBe("number");

  const cell = screen.getByTestId("appearance-skin-holo-cell");
  const width = StyleSheet.flatten(cell.props.style as ViewStyle).width;
  const cardWidthFraction = parsePercent(width) / 100;

  // Wrap condition: 3 * cardWidthFraction * C + 2 * gap > C, where C is the
  // row's available content width. No-wrap requires
  // C >= 2 * gap / (1 - 3 * cardWidthFraction).
  const containerFloor = (2 * (gap as number)) / (1 - 3 * cardWidthFraction);
  const deviceWidthFloor = containerFloor + 2 * CONTENT_HORIZONTAL_PADDING;

  expect(deviceWidthFloor).toBeLessThan(MIN_SUPPORTED_DEVICE_WIDTH);
  // Real margin, not sub-pixel: the floor must clear the assumed minimum by
  // at least 50pt, ruling out the kind of 0.16pt "pass" review round 1 shipped.
  expect(MIN_SUPPORTED_DEVICE_WIDTH - deviceWidthFloor).toBeGreaterThanOrEqual(
    50,
  );
});

test("pressing a card sets that skin", async () => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  await fireEvent.press(screen.getByTestId("appearance-skin-neon"));
  expect(setSkin).toHaveBeenCalledWith("neon");
});

test("shows an ambient toggle wired to useAnimatedBackground", async () => {
  const setEnabled = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { ambient: { enabled: false, setEnabled, toggle: () => {} } },
    ),
  );
  await fireEvent.press(screen.getByTestId("appearance-ambient-toggle"));
  expect(setEnabled).toHaveBeenCalledWith(true);
});

test("shows a three-level power-saver control wired to usePowerSaver", async () => {
  const setLevel = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      {
        powerSaver: {
          level: "off",
          isCalm: false,
          isFreeze: false,
          setLevel,
          cycle: () => {},
        },
      },
    ),
  );
  // P5: three segments now, not an on/off toggle. Freeze is the one worth
  // asserting — it is the level the old 2-state control could never reach, so
  // a regression to a boolean toggle fails here rather than silently shipping
  // a screen that cannot express the strongest setting.
  await fireEvent.press(screen.getByTestId("appearance-powersaver-freeze"));
  expect(setLevel).toHaveBeenCalledWith("freeze");

  await fireEvent.press(screen.getByTestId("appearance-powersaver-calm"));
  expect(setLevel).toHaveBeenCalledWith("calm");

  await fireEvent.press(screen.getByTestId("appearance-powersaver-off"));
  expect(setLevel).toHaveBeenCalledWith("off");
});

test("the power-saver caption tracks the selected level", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  // The stub reports level "off", so the caption must be the off one — a
  // fixed caption would read as a promise the screen is not keeping.
  expect(screen.getByText(/run normally/i)).toBeTruthy();
});

test("segmented dark/light control presses light and drives cycle() the right number of steps from the live preference", async () => {
  // modePreference defaults to "system" in the stub; the ViewModel exposes no
  // direct mode setter (createViewModel.ts UseThemePreferenceResult is
  // { mode, modePreference, cycle } only), so the segmented control must
  // express "jump to light" as N zero-arg cycle() calls, each of which the
  // real presenter resolves against the true live state (dark→light→system).
  // From "system", reaching "light" is two steps: system→dark→light.
  const cycle = jest.fn();
  await renderScreen(fakeViewModel(cycle, () => {}));
  await fireEvent.press(screen.getByTestId("appearance-mode-light"));
  expect(cycle).toHaveBeenCalledTimes(2);
});

test("segmented dark/light control presses dark and drives cycle() the right number of steps from the live preference", async () => {
  // From "system", reaching "dark" is one step: system→dark.
  const cycle = jest.fn();
  await renderScreen(fakeViewModel(cycle, () => {}));
  await fireEvent.press(screen.getByTestId("appearance-mode-dark"));
  expect(cycle).toHaveBeenCalledTimes(1);
});

test("selecting System advances the cycle the right number of times", async () => {
  // starts at "dark"; dark -> light -> system is 2 cycles
  const cycle = jest.fn();
  await renderScreen(
    fakeViewModel(cycle, () => {}, { modePreference: "dark" }),
  );
  await fireEvent.press(screen.getByTestId("appearance-mode-system"));
  expect(cycle).toHaveBeenCalledTimes(2);
});

test("the redundant tap-to-change row is gone", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.queryByTestId("appearance-mode")).toBeNull();
});

// The zero-cycle case matters most: an off-by-one in cyclesToReach would make
// pressing the ALREADY-ACTIVE cell silently wrap a full lap (3 cycle() calls
// instead of 0), and nothing else here would catch it — every other case in
// this file presses a DIFFERENT cell than the live preference.
test("pressing the already-active mode cell drives cycle() zero times", async () => {
  const cycle = jest.fn();
  await renderScreen(
    fakeViewModel(cycle, () => {}, { modePreference: "system" }),
  );
  await fireEvent.press(screen.getByTestId("appearance-mode-system"));
  expect(cycle).toHaveBeenCalledTimes(0);
});

test("segmented control presses dark from light and drives cycle() the right number of steps", async () => {
  // From "light", reaching "dark" is two steps: light→system→dark.
  const cycle = jest.fn();
  await renderScreen(
    fakeViewModel(cycle, () => {}, { modePreference: "light" }),
  );
  await fireEvent.press(screen.getByTestId("appearance-mode-dark"));
  expect(cycle).toHaveBeenCalledTimes(2);
});

// P8 (StatusStrip.test.tsx) guarded a geometric invariant the same way after
// a control silently drifted into an unsafe layout with every other test
// still green. Guards two things a later edit could reintroduce without any
// functional test noticing: (1) a fixed-width cell that could clip a label
// at some device width, and (2) the segment sharing a row with the title
// again — the very re-measurement question Step 4 exists to avoid guessing
// about. `flex: 1` cells in a non-row-sharing container are safe by
// construction at any width, which is why this asserts the construction
// rather than one measured number.
test("mode segment cells are flex:1 and the segment does not share a row with the title", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  for (const target of ["dark", "light", "system"]) {
    const cell = screen.getByTestId(`appearance-mode-${target}`);
    expect(flattenFlex(cell.props.style)).toBe(1);
  }
  const section = screen.getByTestId("appearance-mode-section");
  expect(flattenFlexDirection(section.props.style)).not.toBe("row");
});

function flattenFlex(style: unknown): number | undefined {
  return StyleSheet.flatten(style as ViewStyle)?.flex;
}

function flattenFlexDirection(style: unknown): string | undefined {
  return StyleSheet.flatten(style as ViewStyle)?.flexDirection;
}

/** RN's `width: "30%"`-style percentage values are plain strings ending in
 * `%` — this strips it and parses the number, throwing loudly rather than
 * returning NaN if a future edit switches the card to a fixed pixel width
 * (which would silently defeat the no-wrap-margin test that consumes this). */
function parsePercent(value: unknown): number {
  if (typeof value !== "string" || !value.endsWith("%")) {
    throw new Error(
      `expected a percentage width string, got ${JSON.stringify(value)}`,
    );
  }

  return Number.parseFloat(value);
}

test("shows an ambient style segmented control wired to useAmbientStyle", async () => {
  const setStyle = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { ambientStyle: { style: "aurora", setStyle } },
    ),
  );
  expect(screen.getByTestId("appearance-ambient-aurora")).toBeTruthy();
  expect(screen.getByTestId("appearance-ambient-rays")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("appearance-ambient-rays"));
  expect(setStyle).toHaveBeenCalledWith("rays");
});

test("replay-boot triggers the boot-replay seam (useBootGate().reboot())", async () => {
  const reboot = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { reboot },
    ),
  );
  await fireEvent.press(screen.getByTestId("appearance-replay-boot"));
  expect(reboot).toHaveBeenCalledTimes(1);
});

// P7 moved sign-out here from the HUD header. Asserted on the SHEET rather
// than only in `LogoutButton.test.tsx`, which renders the button directly and
// would still pass if this screen stopped mounting it — leaving the app with
// no way to sign out at all. The header's own test cannot catch that either:
// it no longer knows the control exists.
test("sign-out is on the sheet and drives useAuth().logout()", async () => {
  const logout = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { logout },
    ),
  );
  await fireEvent.press(screen.getByTestId("logout-button"));
  expect(logout).toHaveBeenCalledTimes(1);
});

interface FakeViewModelOverrides {
  modePreference?: "dark" | "light" | "system";
  ambient?: {
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    toggle: () => void;
  };
  powerSaver?: {
    level: "off" | "calm" | "freeze";
    isCalm: boolean;
    isFreeze: boolean;
    setLevel: (level: "off" | "calm" | "freeze") => void;
    cycle: () => void;
  };
  ambientStyle?: {
    style: "aurora" | "rays";
    setStyle: (s: "aurora" | "rays") => void;
  };
  reboot?: () => void;
  logout?: () => void;
}

function fakeViewModel(
  cycle: () => void,
  setSkin: (s: string) => void,
  overrides: FakeViewModelOverrides = {},
): ViewModel {
  return {
    useThemePreference: () => {
      return {
        mode: "dark",
        modePreference: overrides.modePreference ?? "system",
        cycle,
      };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin };
    },
    useAnimatedBackground: () => {
      return (
        overrides.ambient ?? {
          enabled: false,
          setEnabled: () => {},
          toggle: () => {},
        }
      );
    },
    usePowerSaver: () => {
      return (
        overrides.powerSaver ?? {
          level: "off",
          isCalm: false,
          isFreeze: false,
          setLevel: () => {},
          cycle: () => {},
        }
      );
    },
    useAmbientStyle: () => {
      return overrides.ambientStyle ?? { style: "aurora", setStyle: () => {} };
    },
    useBootGate: () => {
      return {
        visible: false,
        reboot: overrides.reboot ?? (() => {}),
        dismiss: () => {},
      };
    },
    // Required since P7 moved `LogoutButton` into this screen's last section.
    // The screen itself never touches auth — the seam is here purely because
    // it now renders a child that does, which is the honest cost of the sheet
    // owning account actions.
    useAuth: () => {
      return { logout: overrides.logout ?? (() => {}) };
    },
  } as unknown as ViewModel;
}

function renderScreen(vm: ViewModel): Promise<unknown> {
  return render(
    <ViewModelProvider viewModel={vm}>
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <AppearanceScreen />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
}
