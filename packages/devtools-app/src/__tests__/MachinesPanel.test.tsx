import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { MachinesPanel } from "#/panels/MachinesPanel";
import styles from "#/panels/MachinesPanel.module.css";

afterEach(cleanup);

test("renders a row per machine", () => {
  const machines: MachineRow[] = [
    machineRow({ machineId: "m1" }),
    machineRow({ machineId: "m2" }),
  ];

  render(<MachinesPanel machines={machines} />);

  expect(screen.getByText("m1")).toBeTruthy();
  expect(screen.getByText("m2")).toBeTruthy();
});

test("clicking a row selects that machine and shows its detail pane", () => {
  const machines: MachineRow[] = [
    machineRow({ machineId: "m1", machineKind: "AKind" }),
    machineRow({ machineId: "m2", machineKind: "BKind" }),
  ];

  render(<MachinesPanel machines={machines} />);

  expect(
    screen.getByText("Select a machine to inspect its state."),
  ).toBeTruthy();

  fireEvent.click(screen.getByText("m1"));

  expect(screen.getByRole("heading", { name: "m1" })).toBeTruthy();
  expect(screen.getAllByText("AKind").length).toBeGreaterThan(0);
});

test("applies the disposed row class to disposed machines only", () => {
  const machines: MachineRow[] = [
    machineRow({ machineId: "m1", disposed: false }),
    machineRow({ machineId: "m2", disposed: true }),
  ];

  render(<MachinesPanel machines={machines} />);

  const liveRow = screen.getByText("m1").closest("tr");
  const disposedRow = screen.getByText("m2").closest("tr");

  expect(liveRow?.classList.contains(styles.rowDisposed)).toBe(false);
  expect(disposedRow?.classList.contains(styles.rowDisposed)).toBe(true);
  expect(screen.getByText("DISPOSED")).toBeTruthy();
  expect(screen.getByText("LIVE")).toBeTruthy();
});

test("shows recorded intents newest-first in the detail pane", () => {
  const machines: MachineRow[] = [
    machineRow({
      machineId: "m1",
      intents: [
        { name: "first", args: {}, ts: 1 },
        { name: "second", args: {}, ts: 2 },
      ],
    }),
  ];

  render(<MachinesPanel machines={machines} />);
  fireEvent.click(screen.getByText("m1"));

  const names = screen.getAllByTestId("intent-name").map((el) => {
    return el.textContent;
  });

  expect(names).toEqual(["second", "first"]);
});

function machineRow(overrides: Partial<MachineRow>): MachineRow {
  return {
    machineId: "m1",
    machineKind: "OrderTicketMachine",
    args: { symbol: "EURUSD" },
    state: { status: "idle" },
    disposed: false,
    createdAt: 0,
    intents: [],
    transitions: 0,
    ...overrides,
  };
}
