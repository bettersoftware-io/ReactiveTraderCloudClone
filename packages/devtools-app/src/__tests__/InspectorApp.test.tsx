import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { AppToInspector, Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  PROTOCOL_VERSION,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

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

test("pinned selection resets when the datasource swaps (import lands, Back to live)", async () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  const rows = screen.getAllByTestId("timeline-row");
  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  const file = new File([serializeRecording(sampleRecording())], "r.json", {
    type: "application/json",
  });

  fireEvent.change(screen.getByTestId("import"), {
    target: { files: [file] },
  });

  await waitFor(() => {
    expect(screen.getByTestId("recording-banner")).toBeTruthy();
  });
  // Importing swapped the datasource out from under the old pin — it must
  // not silently survive onto the imported timeline. The banner landing
  // only proves `imported` state committed; the reset effect that clears
  // the pin runs as a passive effect on a later tick, so this needs its
  // own wait rather than an assertion immediately following the banner's.
  await waitFor(() => {
    expect(screen.queryByTestId("pinned-bar")).toBeNull();
  });

  fireEvent.click(screen.getByTestId("back-to-live"));
  await waitFor(() => {
    expect(screen.queryByTestId("recording-banner")).toBeNull();
  });
  // Back to live is itself a datasource swap — still following, not stuck
  // on whatever seq the import last had pinned. Same passive-effect gap as
  // above, so wait rather than assert immediately.
  await waitFor(() => {
    expect(screen.queryByTestId("pinned-bar")).toBeNull();
  });
});

test("liveHistory seeds pre-mount store state — a pinned row reconstructs a machine that only ever existed before mount", () => {
  const store = new InspectorStore({ coalesce: false });

  // Applied before InspectorApp (and its store.tap() tee) ever mounts.
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
  store.apply({
    kind: "snapshot",
    streams: [],
    machines: [
      {
        machineId: "m-pre",
        machineKind: "testMachine",
        args: [],
        state: { phase: "pre-mount" },
        disposed: false,
        createdAt: 500,
      },
    ],
  });

  render(<InspectorApp store={store} />);

  // A log row generated only after mount — its reconstructed state must
  // still carry the pre-mount machine if the seed worked.
  act(() => {
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq: 1,
          ts: 1000,
          streamId: "fx.price$",
          value: 1,
          coalesced: 1,
        },
      ],
    });
  });

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(1);

  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  fireEvent.click(screen.getByTestId("context-tab-state"));

  expect(screen.getByText("m-pre")).toBeTruthy();
});

function sampleRecording(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "imported-app",
    startedAt: 5000,
    frames: [
      {
        kind: "snapshot",
        streams: [{ streamId: "z.a$", value: 7 }],
        machines: [],
      },
    ],
  };
}

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
