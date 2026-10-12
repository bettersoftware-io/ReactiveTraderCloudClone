import { afterEach, expect, jest, test } from "@jest/globals";

import { appRootPage } from "#tests/pages/AppRootPage";

afterEach(() => {
  return page.unmountAll();
});

// The simulator branch owns no socket, so its `dispose` is a no-op — mounting
// then unmounting exercises the effect's deferred-teardown path without any
// network. We assert the child mounts, then that unmount resolves without
// throwing (a throw during teardown would reject). The real-WS branch's
// `ws.dispose()` can't be exercised here without a live connection; the sim
// no-op unit test + buildNativePorts test + review cover it.
test("mount then unmount of simulator AppRoot does not throw", async () => {
  await page.mountChild("child");
  expect(page.hasText("child")).toBeTruthy();
  await expect(page.unmount()).resolves.toBeUndefined();
});

// AppRoot no longer auto-logs-in on mount — the app is now gated behind
// AuthGate/LoginScreen (wired in _layout.tsx), so the composition boots with
// no credential submitted and the auth presenter stays "unauthenticated"
// until the operator signs in.
test("does not auto-login on mount; auth state stays unauthenticated", async () => {
  await page.mountAuthProbe();
  expect(page.authStatus()).toBe("unauthenticated");
});

// The UI may not read `process.env` (grep gate 32), so the stamp reaches the
// status strip and the sign-in screen only if AppRoot hands it down. Without
// this the two would silently print nothing on a published build.
test("hands the build stamp it read down to the UI", async () => {
  await page.mountBuildStampProbe();
  expect(page.buildStampText()).toBe("f0482c5|2026-10-04T15:20Z");
});

// The sign-in screen's hint reads the list through the ViewModel; a
// simulator composition that handed none down would show an empty hint.
test("a simulator composition offers the roster as demo accounts", async () => {
  await page.mountDemoAccountsProbe();
  expect(page.demoAccountsText()).toBe("astark,nromanoff,tchalla,demo");
});

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

const page = appRootPage();

jest.mock("#/app/readBuildStamp", () => {
  return {
    BUILD_STAMP: { commit: "f0482c5", builtAt: "2026-10-04T15:20Z" },
  };
});
