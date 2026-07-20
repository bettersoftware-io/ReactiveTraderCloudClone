import { expect, test } from "vitest";

import type { DevtoolsEvent, LogRow } from "@rtc/devtools-core";

import {
  ALL_FAMILIES_ON,
  diffableValueOf,
  filterLog,
  findPredecessorRow,
  pillKey,
  seqOfMachineIntent,
  sourceOfEvent,
} from "#/timeline/timelineModel";

test("sourceOfEvent maps each family to its pill", () => {
  expect(sourceOfEvent(emission(1, "fx.price$", 1))).toEqual({
    type: "stream",
    id: "fx.price$",
  });
  expect(sourceOfEvent(machineState(2, "m1", "idle"))).toEqual({
    type: "machine",
    id: "m1",
  });
  expect(sourceOfEvent(wireIn(3, "priceUpdate"))).toEqual({
    type: "msgType",
    id: "priceUpdate",
  });
  expect(pillKey({ type: "stream", id: "fx.price$" })).toBe("stream:fx.price$");
});

test("filterLog composes families AND pills AND text AND radius", () => {
  const log = [
    row(emission(1, "fx.price$", 1)),
    row(emission(2, "blotter.trades$", 2)),
    row(wireIn(3, "priceUpdate")),
  ];

  expect(
    filterLog(log, {
      families: { ...ALL_FAMILIES_ON, wire: false },
      pills: [],
      text: "",
      radius: null,
    }).map((r) => {
      return r.seq;
    }),
  ).toEqual([1, 2]);

  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [{ type: "stream", id: "fx.price$" }],
      text: "",
      radius: null,
    }).map((r) => {
      return r.seq;
    }),
  ).toEqual([1]);

  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [],
      text: "trades",
      radius: null,
    }).map((r) => {
      return r.seq;
    }),
  ).toEqual([2]);

  // windowMs 1 around ts 1001 keeps rows at 1001/1002 (delta ≤ 1), drops 1003.
  expect(
    filterLog(log, {
      families: ALL_FAMILIES_ON,
      pills: [],
      text: "",
      radius: { centerTs: 1001, windowMs: 1 },
    }).map((r) => {
      return r.seq;
    }),
  ).toEqual([1, 2]);
});

test("findPredecessorRow finds the last comparable event before the row", () => {
  const log = [
    row(emission(1, "fx.price$", 1)),
    row(emission(2, "blotter.trades$", 9)),
    row(emission(3, "fx.price$", 2)),
  ];
  const pred = findPredecessorRow(log, log[2] as LogRow);

  expect(pred?.seq).toBe(1);
  expect(findPredecessorRow(log, log[0] as LogRow)).toBeNull();
});

test("wire predecessors match msgType AND direction", () => {
  const log = [
    row(wireIn(1, "priceUpdate")),
    row({
      kind: "wire:out",
      seq: 2,
      ts: 1002,
      msgType: "priceUpdate",
      payload: null,
    }),
    row(wireIn(3, "priceUpdate")),
  ];

  expect(findPredecessorRow(log, log[2] as LogRow)?.seq).toBe(1);
});

test("diffableValueOf extracts the comparable payload", () => {
  expect(diffableValueOf(emission(1, "fx.price$", 42))).toBe(42);
  expect(diffableValueOf(machineState(2, "m1", "busy"))).toBe("busy");
  expect(
    diffableValueOf({
      kind: "machine:disposed",
      seq: 3,
      ts: 1,
      machineId: "m1",
    }),
  ).toBeNull();
});

test("seqOfMachineIntent locates the log row for an intent", () => {
  const log = [
    row({
      kind: "machine:intent",
      seq: 7,
      ts: 1007,
      machineId: "m1",
      name: "execute",
      args: [],
    }),
  ];

  expect(seqOfMachineIntent(log, "m1", "execute", 1007)).toBe(7);
  expect(seqOfMachineIntent(log, "m1", "cancel", 1007)).toBeNull();
});

function emission(seq: number, streamId: string, value: number): DevtoolsEvent {
  return {
    kind: "stream:emission",
    seq,
    ts: 1000 + seq,
    streamId,
    value,
    coalesced: 1,
  };
}

function machineState(
  seq: number,
  machineId: string,
  state: string,
): DevtoolsEvent {
  return {
    kind: "machine:state",
    seq,
    ts: 1000 + seq,
    machineId,
    state,
    coalesced: 1,
  };
}

function wireIn(seq: number, msgType: string): DevtoolsEvent {
  return { kind: "wire:in", seq, ts: 1000 + seq, msgType, payload: null };
}

function row(event: DevtoolsEvent): LogRow {
  return {
    seq: event.seq,
    ts: event.ts,
    kind: event.kind,
    summary: summaryOf(event),
    event,
  };
}

function summaryOf(event: DevtoolsEvent): string {
  if (event.kind === "stream:emission") {
    return `${event.streamId} ${JSON.stringify(event.value)}`;
  }

  return event.kind;
}
