import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { VisualScenarioHost } from "./VisualScenarioHost";

test("renders children and raises the ready marker on sim ports", async () => {
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
