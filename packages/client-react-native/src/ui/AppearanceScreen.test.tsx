// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

// Three near-identical tests here used to assert the same press -> setSkin
// binding separately (terminal, holo3d, neon) — the last was added without
// anyone noticing the first two already covered the binding itself.
// Collapsed to one parameterised test; each skin still gets its own press
// asserted against its own `setSkin` argument, just without three copies of
// the render/fire/expect boilerplate.
test.each<[string, string]>([
  ["terminal", "appearance-skin-terminal"],
  ["holo3d", "appearance-skin-holo3d"],
  ["neon", "appearance-skin-neon"],
])("pressing the %s card calls setSkin with it", async (skin, testId) => {
  const setSkin = jest.fn();
  await renderScreen(fakeViewModel(() => {}, setSkin));
  await fireEvent.press(screen.getByTestId(testId));
  expect(setSkin).toHaveBeenCalledWith(skin);
});

// Asserts something the parameterised test above does not: that the
// terminal3d CARD itself renders at all, not merely that pressing it (were
// it present) would call setSkin. Kept separate rather than folded into the
// "renders all six skins" order test below, which only asserts the six
// LABEL nodes.
test("renders the terminal3d skin card", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByTestId("appearance-skin-terminal3d")).toBeTruthy();
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
  expect(
    labels.map((n) => {
      return n.props.children;
    }),
  ).toEqual([
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
  const colors = swatches.map((n) => {
    return StyleSheet.flatten(n.props.style as ViewStyle).backgroundColor;
  });
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

// A SECOND, independent threshold from the test above — that one proves
// three CARDS fit per row; this one proves three SWATCHES then fit INSIDE
// one of those cards. Both are the same class of trap (a FIXED pixel amount
// against a PERCENTAGE width, so the margin shrinks as the device narrows),
// but they are different geometry: `skinCardWrap`'s outer width vs
// `skinGrid`'s gap (above) says nothing about `skinCard`'s INNER content
// width vs the swatch row's own intrinsic width. Review round 2 found the
// swatch row shipped at 18pt swatches / 6pt gap (66pt needed), whose real
// floor was 332pt — ABOVE the 320pt floor the test above already asserts
// elsewhere in this same grid, so a 320pt device would have silently
// CLIPPED the third swatch, with every order/count/colour/press test in this
// file still green. The design's own 16/8/8 at gap 3 closes that gap;
// this test derives the real floor from live rendered styles, the same way
// the grid-wrap test above does, rather than trusting the constants.
test("the skin card's inner content width keeps real margin over its swatch row's intrinsic width on a 320pt device", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  const MIN_SUPPORTED_DEVICE_WIDTH = 320;
  // Same named constant, same reason it can't be read off a queried node, as
  // the grid-wrap test above (AppearanceScreen.tsx `content: { padding: 16,
  // ... }`).
  const CONTENT_HORIZONTAL_PADDING = 16;

  const cell = screen.getByTestId("appearance-skin-neon-cell");
  const cellWidth = StyleSheet.flatten(cell.props.style as ViewStyle).width;
  const cardWidthFraction = parsePercent(cellWidth) / 100;

  // "neon" is never the stub's active skin (default is "holo"), so this is
  // always the plain `skinCard` style, not `skinCardActive` — both carry the
  // same padding and border width, so either would do, but only one needs
  // querying. The border counts: at `borderWidth: 1.5` it eats 3pt of the
  // card's inner width on top of the padding.
  const card = StyleSheet.flatten(
    screen.getByTestId("appearance-skin-neon").props.style as ViewStyle,
  );
  const cardPadding = card.paddingHorizontal as number;
  expect(typeof cardPadding).toBe("number");
  const cardBorder = card.borderWidth as number;
  expect(typeof cardBorder).toBe("number");

  const swatchRow = screen.getByTestId("appearance-skin-neon-swatch-row");
  const swatchGap = StyleSheet.flatten(swatchRow.props.style as ViewStyle)
    .gap as number;
  expect(typeof swatchGap).toBe("number");

  // The three swatches are NOT the same width (the design's accent swatch is
  // 16 to the two directional ones' 8), so this sums the real rendered widths
  // rather than multiplying the first one by three — that shortcut would
  // over-report the row by 16pt and hide a real overflow behind a false
  // margin.
  const swatchWidths = screen
    .getAllByTestId("appearance-skin-neon-swatch")
    .map((node) => {
      const width = StyleSheet.flatten(node.props.style as ViewStyle).width;
      expect(typeof width).toBe("number");
      return width as number;
    });

  const swatchRowWidth =
    swatchWidths.reduce((sum, width) => {
      return sum + width;
    }, 0) +
    (swatchWidths.length - 1) * swatchGap;

  // Fit condition:
  // cardWidthFraction * C - 2 * (cardPadding + cardBorder) >= swatchRowWidth,
  // where C is the grid row's available content width (device width minus
  // this file's horizontal padding on both sides). Solving for the device
  // width floor:
  const containerFloor =
    (swatchRowWidth + 2 * (cardPadding + cardBorder)) / cardWidthFraction;
  const deviceWidthFloor = containerFloor + 2 * CONTENT_HORIZONTAL_PADDING;

  expect(deviceWidthFloor).toBeLessThan(MIN_SUPPORTED_DEVICE_WIDTH);
  // Real margin, not sub-pixel — the class of near-miss (332pt vs a 320pt
  // floor) that shipped the clip this test guards against.
  expect(MIN_SUPPORTED_DEVICE_WIDTH - deviceWidthFloor).toBeGreaterThanOrEqual(
    15,
  );
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
  await fireEvent.press(screen.getByTestId("appearance-power-freeze"));
  expect(setLevel).toHaveBeenCalledWith("freeze");

  await fireEvent.press(screen.getByTestId("appearance-power-calm"));
  expect(setLevel).toHaveBeenCalledWith("calm");

  await fireEvent.press(screen.getByTestId("appearance-power-off"));
  expect(setLevel).toHaveBeenCalledWith("off");
});

// The web client's PreferencesModal.tsx labels the equivalent PrefSegment
// "Power saver" (packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx).
// Without a heading the three-cell segment reads as unlabelled motion controls
// with no indication of what they select. Uppercase since the fidelity pass:
// the design's own section heads are tracked mono caps (INSTRUMENT /
// DIRECTION / YOUR QUOTES), and this is one of the app-only sections below
// the design's own rows.
test("the power-saver control is labelled 'POWER SAVER'", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByText("POWER SAVER")).toBeTruthy();
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

test("the 3-way mode segment presses light and drives cycle() the right number of steps from the live preference", async () => {
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

test("the 3-way mode segment presses dark and drives cycle() the right number of steps from the live preference", async () => {
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
// still green. The fidelity pass moved the mode pill ONTO the title's row
// (the design puts them there), which reopens exactly that question: three
// intrinsically-sized cells plus a title now compete for one row's width, and
// an overflow here is silent. The invariant that makes it safe is not a
// measured width but WHICH element gives way — the title carries
// `flexShrink: 1` and the pill does not, so the pill's third cell can never
// be pushed off the edge. `ThemeModePill.test.tsx` owns the other half (the
// cells are intrinsic, never `flex: 1`, which would shove the title out).
test("the mode pill shares the title's row, and the title is what gives way", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );

  const header = screen.getByTestId("appearance-mode-section");
  expect(flattenFlexDirection(header.props.style)).toBe("row");
  expect(screen.getByTestId("appearance-mode-pill")).toBeTruthy();

  const title = StyleSheet.flatten(
    screen.getByText("APPEARANCE").props.style as ViewStyle,
  );
  expect(title.flexShrink).toBe(1);
});

// The two full-width segments below the design's own rows (ambient style and
// power saver) share ONE StyleSheet entry by reference, so this covers both:
// `flex: 1` cells divide the row equally and are safe by construction at any
// width, with no wrap or clip threshold to cross silently.
test("the sheet's full-width segment cells are flex:1", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { ambient: { enabled: true, setEnabled: () => {}, toggle: () => {} } },
    ),
  );

  for (const testId of [
    "appearance-power-off",
    "appearance-power-calm",
    "appearance-power-freeze",
    "appearance-ambient-style-aurora",
    "appearance-ambient-style-rays",
  ]) {
    expect(flattenFlex(screen.getByTestId(testId).props.style)).toBe(1);
  }
});

// Each card previews the skin it OFFERS, not the one in force: the design
// fills a card with that skin's own background and paints its name in that
// skin's own accent/dim. Painting every card in the live theme's panel colour
// (what this screen did before the fidelity pass) still passes every
// order/count/press test in this file while making the grid a row of
// identical grey boxes.
test("each theme card previews its own skin's background, not the live theme's", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );

  const neon = StyleSheet.flatten(
    screen.getByTestId("appearance-skin-neon").props.style as ViewStyle,
  );

  const terminal = StyleSheet.flatten(
    screen.getByTestId("appearance-skin-terminal").props.style as ViewStyle,
  );

  expect(neon.backgroundColor).toBe(rnThemeTokens.neon.dark.bgPrimary);
  expect(terminal.backgroundColor).toBe(rnThemeTokens.terminal.dark.bgPrimary);
  expect(neon.backgroundColor).not.toBe(terminal.backgroundColor);
});

// The picker is the only real branch on this screen: it must be entirely
// absent while ambient is off, not merely unusable. `queryByTestId` returning
// null is a trivially-passing assertion if the container id is wrong (it
// would also pass before the picker ever existed), so this is only trustworthy
// alongside the paired "shown" test below proving the SAME id resolves once
// ambient is on.
test("ambient style picker is HIDDEN when ambient is off", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      { ambient: { enabled: false, setEnabled: () => {}, toggle: () => {} } },
    ),
  );
  expect(screen.queryByTestId("appearance-ambient-style")).toBeNull();
});

test("ambient style picker is SHOWN and selectable when ambient is on", async () => {
  const setStyle = jest.fn();
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
      {
        ambient: { enabled: true, setEnabled: () => {}, toggle: () => {} },
        ambientStyle: { style: "aurora", setStyle },
      },
    ),
  );
  expect(screen.getByTestId("appearance-ambient-style")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("appearance-ambient-style-rays"));
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

// Task 6: the splash renders BEHIND this sheet (an opaque full-screen
// overlay), so a host that never learns the boot was re-triggered has no way
// to get out of its way — replaying the sequence would play, and finish,
// unseen. `onReplayBoot` is the seam that raises the splash above the sheet.
// This also pins the CALL ORDER (reboot() before onReplayBoot(), not the
// reverse) by recording both calls into one shared log: the sheet dismissing
// before the reboot is triggered would be the "never worked" bug again, just
// moved one call earlier.
test("replay boot reboots then notifies onReplayBoot, in that order", async () => {
  const calls: string[] = [];
  const reboot = jest.fn(() => {
    calls.push("reboot");
  });

  const onReplayBoot = jest.fn(() => {
    calls.push("onReplayBoot");
  });
  await render(
    <ViewModelProvider
      viewModel={fakeViewModel(
        () => {},
        () => {},
        { reboot },
      )}
    >
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <AppearanceScreen onReplayBoot={onReplayBoot} />
      </ThemeContext.Provider>
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("appearance-replay-boot"));
  expect(reboot).toHaveBeenCalledTimes(1);
  expect(onReplayBoot).toHaveBeenCalledTimes(1);
  expect(calls).toEqual(["reboot", "onReplayBoot"]);
});

// The design's dev-handoff HTML spells this "▸ REPLAY BOOT SEQUENCE" verbatim
// (docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader
// Mobile.dc.html) — a bare `\uXXXX` escape renders as the literal escape
// sequence in this codebase's JSX (a real shipped defect class here), so this
// asserts the exact string, not a substring or regex that a mangled glyph
// could still satisfy.
test("replay boot button is labelled with the literal ▸ glyph, verbatim", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByText("▸ REPLAY BOOT SEQUENCE")).toBeTruthy();
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
