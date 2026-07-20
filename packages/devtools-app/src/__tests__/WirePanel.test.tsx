import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    wireRow(2, "wire:out", "order", 0),
    wireRow(3, "wire:in", "price_tick", 0),
  ];

  render(<WirePanel log={log} />);

  expect(screen.getByText("▲ out")).toBeTruthy();
  expect(screen.getByText("▼ in")).toBeTruthy();
  expect(screen.queryByText(/registered/)).toBeNull();

  // Only the two wire rows are counted / rendered.
  expect(screen.getByText("order: 1")).toBeTruthy();
  expect(screen.getByText("price_tick: 1")).toBeTruthy();
});

test("health header shows rates and reconnects; msgType chips add pills", () => {
  const log = [
    wireRow(1, "wire:in", "priceUpdate", 1000),
    wireRow(2, "wire:in", "priceUpdate", 6000),
    wireRow(3, "wire:out", "executeTrade", 9000),
    registeredRow(4, "fx.price$", 9500),
    registeredRow(5, "fx.price$", 9900), // re-registration => 1 reconnect
  ];
  const pills: string[] = [];

  render(
    <WirePanel
      log={log}
      onMsgTypePill={(msgType: string): void => {
        pills.push(msgType);
      }}
    />,
  );

  expect(screen.getByText(/reconnects: 1/)).toBeTruthy();
  expect(screen.getByText(/in\/s/)).toBeTruthy();

  fireEvent.click(screen.getByText("priceUpdate: 2"));
  expect(pills).toEqual(["priceUpdate"]);
});

interface NonWireRowParams {
  seq: number;
}

function wireRow(
  seq: number,
  kind: "wire:in" | "wire:out",
  msgType: string,
  ts: number,
): LogRow {
  return {
    seq,
    ts,
    kind,
    summary: `${msgType} payload`,
    event: { kind, seq, ts, msgType, payload: null },
  };
}

function registeredRow(seq: number, streamId: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "stream:registered",
    summary: `${streamId} registered`,
    event: { kind: "stream:registered", seq, ts, streamId },
  };
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
