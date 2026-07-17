import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { AppRoot } from "#/app/AppRoot";

// AsyncStorage has no native module under jest, so importing the real one
// throws at require time. Stub the two methods the preferences adapter uses
// (getItem/setItem) so the simulator composition builds without a native host.
jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    __esModule: true,
    default: {
      getItem: (): Promise<null> => {
        return Promise.resolve(null);
      },
      setItem: (): Promise<void> => {
        return Promise.resolve();
      },
    },
  };
});

// __DEV__ is true under jest; stub the relay-backed hub so mounting opens no
// socket. Every hub method is a no-op (machineCreated returns an id string),
// so buildViewModelInputs' decorators run harmlessly and unmount's
// hub.dispose() is a no-op.
jest.mock("#/app/devtools/nativeDevtoolsHub", () => {
  const noopHub = new Proxy(
    {},
    {
      get: (_target: object, prop: string | symbol): unknown => {
        if (prop === "machineCreated") {
          return (): string => {
            return "m0";
          };
        }

        return (): void => {};
      },
    },
  );

  return {
    createNativeDevtoolsHub: (): unknown => {
      return noopHub;
    },
  };
});

// The simulator branch owns no socket, so its `dispose` is a no-op — mounting
// then unmounting exercises the effect's deferred-teardown path without any
// network. We assert the child mounts, then that unmount resolves without
// throwing (a throw during teardown would reject). The real-WS branch's
// `ws.dispose()` can't be exercised here without a live connection; the sim
// no-op unit test + buildNativePorts test + review cover it.
test("mount then unmount of simulator AppRoot does not throw", async () => {
  const view = await render(
    <AppRoot simulator>
      <Text>child</Text>
    </AppRoot>,
  );
  expect(screen.getByText("child")).toBeTruthy();
  await expect(view.unmount()).resolves.toBeUndefined();
});

// AppRoot no longer auto-logs-in on mount — the app is now gated behind
// AuthGate/LoginScreen (wired in _layout.tsx), so the composition boots with
// no credential submitted and the auth presenter stays "unauthenticated"
// until the operator signs in.
test("does not auto-login on mount; auth state stays unauthenticated", async () => {
  await renderAuthProbe();
  expect(screen.getByTestId("auth-status").props.children).toBe(
    "unauthenticated",
  );
});

// Probe lives nested inside the helper (not at module scope) so the file has
// no unexported top-level component — mirrors ThemeProvider.test.tsx and
// satisfies Biome's useComponentExportOnlyModules.
function renderAuthProbe(): Promise<unknown> {
  function AuthProbe(): React.JSX.Element {
    const { useAuth } = useViewModel();
    const { state } = useAuth();
    return <Text testID="auth-status">{state.status}</Text>;
  }

  return render(
    <AppRoot simulator>
      <AuthProbe />
    </AppRoot>,
  );
}
