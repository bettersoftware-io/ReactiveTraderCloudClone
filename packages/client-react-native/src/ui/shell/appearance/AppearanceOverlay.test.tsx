import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

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

// The package-wide manual mock (`__mocks__/@gorhom/bottom-sheet.tsx`, picked
// up automatically by jest with no `jest.mock` call needed) renders
// `BottomSheetView` as a bare `<View>` — it drops every prop but `children`,
// built for `TradeTicketSheet`'s needs, which never asserts on a testID
// inside the sheet. This component's contract pins its own `testID`
// (`appearance-sheet`, carried on `BottomSheetView` since the real
// `BottomSheetModalProps` — unlike `BottomSheetViewProps` — has no `testID`
// of its own) through to the caller (`tests/visual/scenarios.tsx` selects the
// open sheet by it), so this override — scoped to this file only, the shared
// double is untouched — forwards `testID` instead of dropping it, and keeps
// the same imperative present/dismiss handle shape as the shared double.
jest.mock("@gorhom/bottom-sheet", () => {
  const react = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");

  const BottomSheetModal = react.forwardRef<
    BottomSheetModalMockHandle,
    BottomSheetModalMockProps
  >(function BottomSheetModal({ children }, ref) {
    react.useImperativeHandle(ref, () => {
      return { present: (): void => {}, dismiss: (): void => {} };
    });
    return <View>{children}</View>;
  });

  function BottomSheetView({
    children,
    testID,
  }: BottomSheetViewMockProps): unknown {
    return <View testID={testID}>{children}</View>;
  }

  function BottomSheetBackdrop(): null {
    return null;
  }

  return { BottomSheetModal, BottomSheetView, BottomSheetBackdrop };
});

interface BottomSheetModalMockHandle {
  present: () => void;
  dismiss: () => void;
}

interface BottomSheetModalMockProps {
  children?: ReactNode;
}

interface BottomSheetViewMockProps {
  children?: ReactNode;
  testID?: string;
}
