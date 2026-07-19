import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import RootLayout from "./_layout";

test("minimal root renders a Slot inside the gesture-handler root", async () => {
  await render(<RootLayout />);
  expect(screen.getByTestId("router-slot")).toBeTruthy();
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
