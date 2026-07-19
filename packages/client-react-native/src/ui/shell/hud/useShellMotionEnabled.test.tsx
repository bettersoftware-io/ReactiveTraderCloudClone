import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReducedMotion = jest.fn<() => boolean>();
const mockPowerSaver = jest.fn<() => MockPowerSaverResult>();

jest.mock("react-native-reanimated", () => {
  return {
    useReducedMotion: (): boolean => {
      return mockReducedMotion();
    },
  };
});
jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePowerSaver: () => {
          return mockPowerSaver();
        },
      };
    },
  };
});

// Imported after the mocks are registered.
const { useShellMotionEnabled } =
  require("./useShellMotionEnabled") as ShellMotionModule;

test("motion runs when reduced-motion is off and not freezing", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  await renderProbe();
  expect(screen.getByText("on")).toBeTruthy();
});

test("reduced motion stills the shell", async () => {
  mockReducedMotion.mockReturnValue(true);
  mockPowerSaver.mockReturnValue({ isCalm: false, isFreeze: false });
  await renderProbe();
  expect(screen.getByText("off")).toBeTruthy();
});

test("power-saver Freeze stills the shell", async () => {
  mockReducedMotion.mockReturnValue(false);
  mockPowerSaver.mockReturnValue({ isCalm: true, isFreeze: true });
  await renderProbe();
  expect(screen.getByText("off")).toBeTruthy();
});

interface MockPowerSaverResult {
  isCalm: boolean;
  isFreeze: boolean;
}

interface ShellMotionModule {
  useShellMotionEnabled: () => boolean;
}

// Probe lives nested inside the helper (not at module scope) so the file has
// no unexported top-level component — mirrors ThemeProvider.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
function renderProbe(): Promise<unknown> {
  function Probe(): React.JSX.Element {
    return <Text>{useShellMotionEnabled() ? "on" : "off"}</Text>;
  }

  return render(<Probe />);
}
