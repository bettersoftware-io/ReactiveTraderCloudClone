import { afterEach, expect, jest, test } from "@jest/globals";

import { statusStripPage } from "#tests/pages/StatusStripPage";

import { ActiveModuleContext } from "./ActiveModuleContext";
import { DOCK_FAB_SIZE } from "./dockMetrics";
import { MODULE_ROUTES } from "./moduleRoutes";

const mockPathname = jest.fn<() => string>();
const page = statusStripPage();

afterEach(() => {
  page.unmountAll();
});

test("shows the BLOTTER module label on the /blotter route", async () => {
  mockPathname.mockReturnValue("/blotter");
  await page.mount();
  expect(page.hasTextContent("hud-module-label", "BLOTTER")).toBe(true);
});

test("shows RATES on the index route", async () => {
  mockPathname.mockReturnValue("/");
  await page.mount();
  expect(page.hasTextContent("hud-module-label", "RATES")).toBe(true);
});

// The visual harness mounts every scenario under `/__visual/<id>`, which the
// pathname resolver can only read as RATES; a framed `credit/*` golden must be
// able to say CREDIT without a route change.
test("a module pinned through ActiveModuleContext overrides the pathname", async () => {
  mockPathname.mockReturnValue("/");
  const credit = MODULE_ROUTES.find((m) => {
    return m.key === "credit";
  });
  await page.mount((children) => {
    return (
      <ActiveModuleContext.Provider value={credit ?? null}>
        {children}
      </ActiveModuleContext.Provider>
    );
  });
  expect(page.hasTextContent("hud-module-label", "CREDIT")).toBe(true);
});

// P8: the dock's FAB is painted over this strip by construction, so the
// telemetry row must keep its centre clear or the cell under the hex is
// invisible on every screen (`60FPS` was, at rest, in every golden ever taken).
// Asserted as ">= the FAB's own width" rather than "== the clearance constant"
// so the test states the INVARIANT the user can see, and still fails if either
// number drifts toward a collision.
test("telemetry row reserves at least the FAB's width down its centre", async () => {
  mockPathname.mockReturnValue("/");
  await page.mount();
  expect(page.clearanceWidth()).toBeGreaterThanOrEqual(DOCK_FAB_SIZE);
});

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
