import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

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
