import { expect, jest, test } from "@jest/globals";
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

// iOS resolves a <Text>'s fontFamily when the node is CREATED and never
// re-resolves it, so a child mounted before the fonts load is captured in the
// system font no matter how long the driver waits afterwards. The harness has
// to withhold the child, exactly as `app/(app)/_layout.tsx` withholds first
// paint — waiting is not a substitute.
test("withholds children until the bundled fonts have loaded", async () => {
  mockFontsLoaded = false;

  try {
    await render(
      <VisualScenarioHost skin="classic" mode="dark">
        <Text>too early</Text>
      </VisualScenarioHost>,
    );

    expect(screen.queryByText("too early")).toBeNull();
    // ...and the driver is told so, rather than being handed a ready marker
    // over an empty surface.
    expect(screen.queryByTestId("visual-ready")).toBeNull();
    expect(await screen.findByTestId("visual-pending")).toBeTruthy();
  } finally {
    mockFontsLoaded = true;
  }
});

test("paints children once the bundled fonts report loaded", async () => {
  mockFontsLoaded = true;
  await render(
    <VisualScenarioHost skin="classic" mode="dark">
      <Text>in the real face</Text>
    </VisualScenarioHost>,
  );
  expect(await screen.findByText("in the real face")).toBeTruthy();
  expect(await screen.findByTestId("visual-ready")).toBeTruthy();
});

/** Drives the gate under test. True by default so every OTHER case in this
 * file sees the loaded-fonts path; the gated case flips it and restores it. */
let mockFontsLoaded = true;

jest.mock("#/ui/theme/fonts", () => {
  return {
    useAppFonts: (): boolean => {
      return mockFontsLoaded;
    },
  };
});
