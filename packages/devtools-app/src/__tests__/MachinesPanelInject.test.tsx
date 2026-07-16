import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { MachinesPanel } from "#/panels/MachinesPanel";

afterEach(cleanup);

test("hides the intent injector when the app is not a dev build", () => {
  render(<MachinesPanel machines={[machineRow({})]} />);
  fireEvent.click(screen.getByText("m1"));

  expect(screen.queryByTestId("intent-injector")).toBeNull();
});

test("shows one invoke button per DISTINCT observed intent name when dev", () => {
  const machine = machineRow({
    intents: [
      { name: "submit", args: [], ts: 1 },
      { name: "cancel", args: [], ts: 2 },
      { name: "submit", args: [1], ts: 3 },
    ],
  });
  render(<MachinesPanel machines={[machine]} dev />);
  fireEvent.click(screen.getByText("m1"));

  const labels = screen.getAllByTestId("intent-invoke-button").map((b) => {
    return b.textContent;
  });
  expect(labels).toEqual(["submit", "cancel"]);
});

test("confirming an armed intent calls onInvokeIntent with the parsed JSON array args", () => {
  const onInvokeIntent = vi.fn();
  render(
    <MachinesPanel
      machines={[machineRow({})]}
      dev
      onInvokeIntent={onInvokeIntent}
    />,
  );
  fireEvent.click(screen.getByText("m1"));

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

test("rejects invalid / non-array JSON args without invoking", () => {
  const onInvokeIntent = vi.fn();
  render(
    <MachinesPanel
      machines={[machineRow({})]}
      dev
      onInvokeIntent={onInvokeIntent}
    />,
  );
  fireEvent.click(screen.getByText("m1"));

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{ not valid" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));

  expect(onInvokeIntent).not.toHaveBeenCalled();
  expect(screen.getByTestId("intent-error")).toBeTruthy();
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
