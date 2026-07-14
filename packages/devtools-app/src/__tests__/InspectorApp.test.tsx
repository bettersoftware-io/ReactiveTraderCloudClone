import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { InspectorStore, PROTOCOL_VERSION } from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

afterEach(cleanup);

test("shows disconnected and the four tabs before any welcome arrives", () => {
  const store = new InspectorStore();
  render(<InspectorApp store={store} />);

  expect(screen.getByTestId("connection-badge").textContent).toBe(
    "disconnected",
  );
  expect(screen.getByRole("button", { name: "State" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Machines" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Log" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Wire" })).toBeTruthy();
});

test("shows the connected app id once the store applies a welcome", () => {
  const store = new InspectorStore();
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
  });

  expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");
});
