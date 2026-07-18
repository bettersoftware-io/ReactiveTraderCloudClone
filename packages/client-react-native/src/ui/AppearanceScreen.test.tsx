// packages/client-react-native/src/ui/AppearanceScreen.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("shows the current mode preference and cycles on press", async () => {
  const cycle = jest.fn();
  await renderScreen(fakeViewModel(cycle, () => {}));
  expect(screen.getByTestId("appearance-mode")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("appearance-mode"));
  expect(cycle).toHaveBeenCalledTimes(1);
});

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

test("shows a power-saver toggle wired to usePowerSaver", async () => {
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
  await fireEvent.press(screen.getByTestId("appearance-powersaver-toggle"));
  expect(setLevel).toHaveBeenCalledWith("calm");
});

test("power-saver caption explains its effect", async () => {
  await renderScreen(
    fakeViewModel(
      () => {},
      () => {},
    ),
  );
  expect(screen.getByText(/reduces motion & re-renders/i)).toBeTruthy();
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
  reboot?: () => void;
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
    useBootGate: () => {
      return {
        visible: false,
        reboot: overrides.reboot ?? (() => {}),
        dismiss: () => {},
      };
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
