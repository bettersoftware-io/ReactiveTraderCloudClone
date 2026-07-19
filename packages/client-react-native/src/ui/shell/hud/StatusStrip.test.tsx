import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";

const mockPathname = jest.fn<() => string>();
// Imported after the mocks are registered.
const { StatusStrip } = require("./StatusStrip") as StatusStripModule;

test("shows the BLOTTER module label on the /blotter route", async () => {
  mockPathname.mockReturnValue("/blotter");
  await render(<StatusStrip />);
  expect(screen.getByTestId("hud-module-label")).toHaveTextContent("BLOTTER");
});

test("shows RATES on the index route", async () => {
  mockPathname.mockReturnValue("/");
  await render(<StatusStrip />);
  expect(screen.getByTestId("hud-module-label")).toHaveTextContent("RATES");
});

interface StatusStripModule {
  StatusStrip: () => JSX.Element;
}

jest.mock("expo-router", () => {
  return {
    usePathname: (): string => {
      return mockPathname();
    },
  };
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        useConnectionStatus: () => {
          return "CONNECTED";
        },
      };
    },
  };
});

jest.mock("./useShellTelemetry", () => {
  return {
    useShellTelemetry: () => {
      return {
        fps: 60,
        fpsTone: "positive",
        latencyMs: 12,
        clock: "09:47:03",
        build: "V2.0-RN",
      };
    },
  };
});

jest.mock("@rtc/domain", () => {
  return { ConnectionStatus: { CONNECTED: "CONNECTED" } };
});

jest.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: (): unknown => {
      return { top: 47, bottom: 34, left: 0, right: 0 };
    },
  };
});

jest.mock("#/ui/theme/useTheme", () => {
  return {
    useTheme: () => {
      return {
        bgHeader: "#0A0E14",
        borderSubtle: "#1C2230",
        border: "#242B3B",
        accentPositive: "#00E5A0",
        textMuted: "#7A8699",
        fontMono: "IBMPlexMono",
        accentPrimary: "#00E5FF",
        textSecondary: "#C5CBD6",
      };
    },
  };
});
