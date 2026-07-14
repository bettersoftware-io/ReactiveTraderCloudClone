import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

test("shows the connected app id once the store applies a welcome", async () => {
  const store = new InspectorStore();
  render(<InspectorApp store={store} />);

  // In a real browser (and jsdom, which provides requestAnimationFrame) the
  // store coalesces its snapshot rebuild + subscriber notification into a
  // throttled rAF flush, so the badge updates a few frames later rather than
  // synchronously on apply. waitFor drives jsdom's frame clock and wraps the
  // resulting React update in act(); the node-env devtools-core tests hit the
  // synchronous fallback instead and assert immediately.
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });

  await waitFor(() => {
    expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");
  });
});
