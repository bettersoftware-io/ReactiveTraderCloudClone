// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  PROTOCOL_VERSION,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

afterEach(cleanup);

beforeEach(() => {
  // jsdom does not implement object URLs; the export path may touch them.
  vi.stubGlobal("URL", {
    createObjectURL: () => {
      return "blob:fake";
    },
    revokeObjectURL: () => {},
  });
  // jsdom lacks a real WAAPI; StateTreePanel's change-flash effect calls
  // element.animate() on every rendered row.
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("record -> replay seam", () => {
  it("captures a live session and scrubs the panels to past state", async () => {
    const store = new InspectorStore();
    render(<InspectorApp store={store} />);

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "fx.EURUSD$", value: null }],
      machines: [],
    });
    await waitFor(() => {
      expect(screen.getByTestId("connection-badge").textContent).toBe(
        "rtc-web",
      );
    });

    fireEvent.click(screen.getByTestId("record-toggle")); // start
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "fx.EURUSD$",
          value: 1.1,
          coalesced: 1,
          seq: 1,
          ts: 1000,
        },
      ],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "fx.EURUSD$",
          value: 1.2,
          coalesced: 1,
          seq: 2,
          ts: 2000,
        },
      ],
    });
    fireEvent.click(screen.getByTestId("record-toggle")); // stop

    // Replay is now available; switch to it.
    fireEvent.click(screen.getByTestId("mode-replay"));
    const scrubber = screen.getByTestId("scrubber") as HTMLInputElement;

    // Last frame -> the latest emission value.
    fireEvent.change(scrubber, { target: { value: scrubber.max } });
    await waitFor(() => {
      expect(screen.getByText("1.2")).toBeTruthy();
    });

    // Seed frame -> the stream exists but the latest value is gone.
    fireEvent.change(scrubber, { target: { value: "0" } });
    await waitFor(() => {
      expect(screen.getByText("fx.EURUSD$")).toBeTruthy();
    });
    expect(screen.queryByText("1.2")).toBeNull();
  });

  it("imports a recording file and switches to replay", async () => {
    const rec: Recording = {
      version: RECORDING_VERSION,
      appId: "imported",
      startedAt: 5000,
      frames: [
        {
          kind: "snapshot",
          streams: [{ streamId: "z.a$", value: 7 }],
          machines: [],
        },
      ],
    };
    const store = new InspectorStore();
    render(<InspectorApp store={store} />);

    const file = new File([serializeRecording(rec)], "r.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByTestId("import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("z.a$")).toBeTruthy();
    });
    expect(screen.getByTestId("scrubber")).toBeTruthy();
  });
});
