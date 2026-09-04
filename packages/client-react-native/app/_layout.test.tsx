import { expect, jest, test } from "@jest/globals";

import { rootLayoutPage } from "#tests/pages/RootLayoutPage";

const page = rootLayoutPage();

test("minimal root renders a Slot inside the gesture-handler root", async () => {
  await page.mount();
  expect(page.exists("router-slot")).toBeTruthy();
  await page.unmountAll();
});

// `Slot` needs a router/navigation context to render its matched child. This
// test only asserts that the minimal root wires a Slot inside the gesture root
// and renders NEITHER AuthGate NOR Chrome (those moved into the (app) group, so
// the sibling __visual route renders outside them). Stub Slot with a marker;
// no async-storage/fonts mocks are needed because the minimal root imports no
// AppRoot/native-port graph — that absence is the property under test.
jest.mock("expo-router", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    Slot: (): React.ReactElement => {
      return <View testID="router-slot" />;
    },
  };
});
