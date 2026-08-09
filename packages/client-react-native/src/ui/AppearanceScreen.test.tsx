// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

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
