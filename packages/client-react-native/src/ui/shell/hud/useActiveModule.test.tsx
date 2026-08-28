import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

import { ActiveModuleContext } from "./ActiveModuleContext";
import { MODULE_ROUTES, type ModuleRoute } from "./moduleRoutes";

const mockPathname = jest.fn<() => string>();
// Imported after the mock is registered.
const { useActiveModule } = require("./useActiveModule") as HookModule;

test("derives the module from the pathname when nothing is pinned", async () => {
  mockPathname.mockReturnValue("/credit");
  await renderProbe(undefined);
  expect(screen.getByTestId("probe")).toHaveTextContent("CREDIT");
});

test("a pinned module wins over the pathname", async () => {
  mockPathname.mockReturnValue("/credit");
  const equities = MODULE_ROUTES.find((m) => {
    return m.key === "equities";
  });
  await renderProbe(equities ?? null);
  expect(screen.getByTestId("probe")).toHaveTextContent("EQUITIES");
});

test("an explicit null provider falls back to the pathname, not to RATES", async () => {
  mockPathname.mockReturnValue("/analytics");
  await renderProbe(null);
  expect(screen.getByTestId("probe")).toHaveTextContent("ANALYTICS");
});

// `undefined` mounts the probe with no provider at all; `null` mounts an
// explicit null provider. Component defined inside the helper so the module
// exports no unexported component (Biome useComponentExportOnlyModules) —
// mirrors useShellMotionEnabled.test.tsx.
function renderProbe(pinned: ModuleRoute | null | undefined): Promise<unknown> {
  function Probe(): JSX.Element {
    const active = useActiveModule();
    return <Text testID="probe">{active.label}</Text>;
  }

  if (pinned === undefined) {
    return render(<Probe />);
  }

  return render(
    <ActiveModuleContext.Provider value={pinned}>
      <Probe />
    </ActiveModuleContext.Provider>,
  );
}

interface HookModule {
  useActiveModule: () => ModuleRoute;
}

jest.mock("expo-router", () => {
  return {
    usePathname: (): string => {
      return mockPathname();
    },
  };
});
