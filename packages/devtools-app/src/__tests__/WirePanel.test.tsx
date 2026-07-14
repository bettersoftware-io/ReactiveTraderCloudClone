import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { LogRow } from "@rtc/devtools-core";

import { WirePanel } from "#/panels/WirePanel";

afterEach(cleanup);

test("shows the exact empty-state text when the log has no wire events", () => {
  const log: LogRow[] = [nonWireRow({ seq: 1 })];

  render(<WirePanel log={log} />);

  expect(
    screen.getByText(
      "No wire traffic — the app is running on in-process simulators (no WebSocket).",
    ),
  ).toBeTruthy();
});

test("filters the log down to wire:in/wire:out rows only", () => {
  const log: LogRow[] = [
    nonWireRow({ seq: 1 }),
    wireRow({ seq: 2, kind: "wire:out", msgType: "order" }),
    wireRow({ seq: 3, kind: "wire:in", msgType: "price_tick" }),
  ];

  render(<WirePanel log={log} />);

  expect(screen.getByText("▲ out")).toBeTruthy();
  expect(screen.getByText("▼ in")).toBeTruthy();
  expect(screen.queryByText(/registered/)).toBeNull();

  // Only the two wire rows are counted / rendered.
  expect(screen.getByText("order: 1")).toBeTruthy();
  expect(screen.getByText("price_tick: 1")).toBeTruthy();
});

interface WireRowParams {
  seq: number;
  kind: "wire:in" | "wire:out";
  msgType: string;
}

function wireRow({ seq, kind, msgType }: WireRowParams): LogRow {
  return {
    seq,
    ts: 0,
    kind,
    summary: `${msgType} payload`,
    event: { kind, seq, ts: 0, msgType, payload: null },
  };
}

interface NonWireRowParams {
  seq: number;
}

function nonWireRow({ seq }: NonWireRowParams): LogRow {
  return {
    seq,
    ts: 0,
    kind: "stream:registered",
    summary: "s registered",
    event: { kind: "stream:registered", seq, ts: 0, streamId: "s" },
  };
}
