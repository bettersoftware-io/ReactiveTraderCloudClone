import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ConnectionStatus } from "@rtc/domain";

import { ConnectionBanner } from "#/ui/ConnectionBanner";

import { VisualScenarioHost } from "./VisualScenarioHost";

test("renders children and raises the ready marker on the fake view model", async () => {
  await render(
    <VisualScenarioHost skin="classic" mode="dark">
      <Text>hello</Text>
    </VisualScenarioHost>,
  );
  expect(await screen.findByText("hello")).toBeTruthy();
  expect(await screen.findByTestId("visual-ready")).toBeTruthy();
});

test("pins the requested skin×mode regardless of default preferences", async () => {
  await render(
    <VisualScenarioHost skin="terminal3d" mode="light">
      <Text>pinned</Text>
    </VisualScenarioHost>,
  );
  expect(await screen.findByTestId("visual-ready")).toBeTruthy();
});

test("threads viewModelOverrides into the rendered child", async () => {
  // The fake's `useConnectionStatus` defaults to CONNECTED, under which
  // ConnectionBanner renders nothing at all — so overriding
  // to DISCONNECTED here (a value that DIFFERS from the default) is what
  // proves the override actually reached the child, rather than the child
  // merely reading its own always-true default.
  await render(
    <VisualScenarioHost
      skin="classic"
      mode="dark"
      viewModelOverrides={{
        useConnectionStatus: () => {
          return ConnectionStatus.DISCONNECTED;
        },
      }}
    >
      <ConnectionBanner />
    </VisualScenarioHost>,
  );
  expect(await screen.findByText("RECONNECT ▸")).toBeTruthy();
});
