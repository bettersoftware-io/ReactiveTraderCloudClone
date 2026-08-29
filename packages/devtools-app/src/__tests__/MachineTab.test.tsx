import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { MachineTab } from "#/timeline/MachineTab";

afterEach(cleanup);

test("shows kind, transitions, status, state and intent history newest-first", () => {
  render(
    <MachineTab
      machine={machineRow({
        transitions: 4,
        intents: [
          { name: "submit", args: [], ts: 1 },
          { name: "cancel", args: [], ts: 2 },
        ],
      })}
      dev={false}
    />,
  );

  expect(screen.getByText("OrderTicketMachine")).toBeTruthy();
  expect(screen.getByText("4")).toBeTruthy();
  expect(screen.getByText("LIVE")).toBeTruthy();
  expect(
    screen.getAllByTestId("intent-name").map((el) => {
      return el.textContent;
    }),
  ).toEqual(["cancel", "submit"]);
});

test("clicking an intent name calls onPinIntent with machineId/name/ts", () => {
  const onPinIntent = vi.fn();

  render(
    <MachineTab
      machine={machineRow({})}
      dev={false}
      onPinIntent={onPinIntent}
    />,
  );
  fireEvent.click(screen.getByTestId("intent-name"));

  expect(onPinIntent).toHaveBeenCalledWith("m1", "submit", 1);
});

test("hides the intent injector when the app is not a dev build", () => {
  render(<MachineTab machine={machineRow({})} dev={false} />);

  expect(screen.queryByTestId("intent-injector")).toBeNull();
});

test("shows one invoke button per DISTINCT observed intent name when dev", () => {
  render(
    <MachineTab
      machine={machineRow({
        intents: [
          { name: "submit", args: [], ts: 1 },
          { name: "cancel", args: [], ts: 2 },
          { name: "submit", args: [1], ts: 3 },
        ],
      })}
      dev
    />,
  );

  expect(
    screen.getAllByTestId("intent-invoke-button").map((b) => {
      return b.textContent;
    }),
  ).toEqual(["submit", "cancel"]);
});

test("confirming an armed intent calls onInvokeIntent with the parsed JSON array args", () => {
  const onInvokeIntent = vi.fn();

  render(
    <MachineTab machine={machineRow({})} dev onInvokeIntent={onInvokeIntent} />,
  );
  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: '["EURUSD", 1000000]' },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));

  expect(onInvokeIntent).toHaveBeenCalledWith("m1", "submit", [
    "EURUSD",
    1000000,
  ]);
});

test("rejects invalid JSON and non-array JSON without invoking", () => {
  const onInvokeIntent = vi.fn();

  render(
    <MachineTab machine={machineRow({})} dev onInvokeIntent={onInvokeIntent} />,
  );

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{ not valid" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));
  expect(screen.getByTestId("intent-error")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{}" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));
  expect(screen.getByTestId("intent-error")).toBeTruthy();

  expect(onInvokeIntent).not.toHaveBeenCalled();
});

test("Cancel disarms a pending intent", () => {
  render(<MachineTab machine={machineRow({})} dev />);

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  expect(screen.getByTestId("intent-confirm")).toBeTruthy();

  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.queryByTestId("intent-confirm")).toBeNull();
});

function machineRow(overrides: Partial<MachineRow>): MachineRow {
  return {
    machineId: "m1",
    machineKind: "OrderTicketMachine",
    args: { symbol: "EURUSD" },
    state: { status: "idle" },
    disposed: false,
    createdAt: 0,
    intents: [{ name: "submit", args: [], ts: 1 }],
    transitions: 0,
    ...overrides,
  };
}
