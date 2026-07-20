import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { AppToInspector } from "@rtc/devtools-core";
import { InspectorStore, PROTOCOL_VERSION } from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

afterEach(cleanup);

test("connection badge reads disconnected before any welcome arrives", () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  expect(screen.getByTestId("connection-badge").textContent).toBe(
    "disconnected",
  );
});

test("timeline lens, pin/Escape, and the machines/wire lenses — the full journey", () => {
  // jsdom lacks a real WAAPI; StateTreePanel's change-flash calls it.
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;

  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(3);

  // The row itself is a non-interactive container; the pin target is its
  // first child button (covers the time/kind-chip/summary area).
  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  fireEvent.click(screen.getByTestId("context-tab-state"));
  // The pinned row's historical value, marked as differing from live.
  expect(screen.getByTestId("devtools-stream-row").textContent).toContain("1");
  expect(screen.getByText("≠ live")).toBeTruthy();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByTestId("pinned-bar")).toBeNull();

  fireEvent.click(screen.getByTestId("lens-machines"));
  expect(screen.getByRole("columnheader", { name: "ID" })).toBeTruthy();

  fireEvent.click(screen.getByTestId("lens-wire"));
  expect(
    screen.getByText(
      "No wire traffic — the app is running on in-process simulators (no WebSocket).",
    ),
  ).toBeTruthy();
});

function emissionBatches(): readonly AppToInspector[] {
  const frames: AppToInspector[] = [];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq,
          ts: 1000 + seq,
          streamId: "fx.price$",
          value: seq,
          coalesced: 1,
        },
      ],
    });
  }

  return frames;
}
