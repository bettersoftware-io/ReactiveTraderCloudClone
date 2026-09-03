import { afterEach, expect, test, vi } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { machineTabPage } from "#tests/pages/MachineTabPage";

const tab = machineTabPage();

afterEach(() => {
  tab.unmountAll();
});

test("shows kind, transitions, status, state and intent history newest-first", () => {
  tab.mountMachineTab({
    machine: machineRow({
      transitions: 4,
      intents: [
        { name: "submit", args: [], ts: 1 },
        { name: "cancel", args: [], ts: 2 },
      ],
    }),
    dev: false,
  });

  expect(tab.hasText("OrderTicketMachine")).toBe(true);
  expect(tab.hasText("4")).toBe(true);
  expect(tab.hasText("LIVE")).toBe(true);
  expect(tab.testIdTexts("intent-name")).toEqual(["cancel", "submit"]);
});

test("clicking an intent name calls onPinIntent with machineId/name/ts", () => {
  const onPinIntent = vi.fn();

  tab.mountMachineTab({
    machine: machineRow({}),
    dev: false,
    onPinIntent,
  });
  tab.click("intent-name");

  expect(onPinIntent).toHaveBeenCalledWith("m1", "submit", 1);
});

test("hides the intent injector when the app is not a dev build", () => {
  tab.mountMachineTab({ machine: machineRow({}), dev: false });

  expect(tab.hasTestId("intent-injector")).toBe(false);
});

test("shows one invoke button per DISTINCT observed intent name when dev", () => {
  tab.mountMachineTab({
    machine: machineRow({
      intents: [
        { name: "submit", args: [], ts: 1 },
        { name: "cancel", args: [], ts: 2 },
        { name: "submit", args: [1], ts: 3 },
      ],
    }),
    dev: true,
  });

  expect(tab.testIdTexts("intent-invoke-button")).toEqual(["submit", "cancel"]);
});

test("confirming an armed intent calls onInvokeIntent with the parsed JSON array args", () => {
  const onInvokeIntent = vi.fn();

  tab.mountMachineTab({
    machine: machineRow({}),
    dev: true,
    onInvokeIntent,
  });
  tab.click("intent-invoke-button");
  tab.changeLabeledInput("Args (JSON array)", '["EURUSD", 1000000]');
  tab.click("intent-confirm-yes");

  expect(onInvokeIntent).toHaveBeenCalledWith("m1", "submit", [
    "EURUSD",
    1000000,
  ]);
});

test("rejects invalid JSON and non-array JSON without invoking", () => {
  const onInvokeIntent = vi.fn();

  tab.mountMachineTab({
    machine: machineRow({}),
    dev: true,
    onInvokeIntent,
  });

  tab.click("intent-invoke-button");
  tab.changeLabeledInput("Args (JSON array)", "{ not valid");
  tab.click("intent-confirm-yes");
  expect(tab.hasTestId("intent-error")).toBe(true);

  tab.changeLabeledInput("Args (JSON array)", "{}");
  tab.click("intent-confirm-yes");
  expect(tab.hasTestId("intent-error")).toBe(true);

  expect(onInvokeIntent).not.toHaveBeenCalled();
});

test("Cancel disarms a pending intent", () => {
  tab.mountMachineTab({ machine: machineRow({}), dev: true });

  tab.click("intent-invoke-button");
  expect(tab.hasTestId("intent-confirm")).toBe(true);

  tab.clickText("Cancel");
  expect(tab.hasTestId("intent-confirm")).toBe(false);
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
