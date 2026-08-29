import { expect, test } from "vitest";

import type { MachineRow, StreamRow } from "@rtc/devtools-core";

import {
  changedIds,
  EMPTY_IDS,
  filterStreams,
  machineKey,
  machinesInScope,
  machineValue,
  streamKey,
  streamsInScope,
  streamValue,
} from "#/timeline/scopeState";

test("streamsInScope narrows to the exact match under presenter and stream scope, else passes through", () => {
  const streams: StreamRow[] = [
    stream("fx.price$", 1),
    stream("fx.spread$", 2),
    stream("blotter.trades$", 3),
  ];

  expect(
    streamsInScope(streams, { kind: "presenter", presenter: "fx" }),
  ).toEqual([streams[0], streams[1]]);
  expect(
    streamsInScope(streams, { kind: "stream", streamId: "blotter.trades$" }),
  ).toEqual([streams[2]]);
  expect(streamsInScope(streams, { kind: "all" })).toBe(streams);
  expect(
    streamsInScope(streams, { kind: "machineKind", machineKind: "x" }),
  ).toBe(streams);
  expect(streamsInScope(streams, { kind: "wire" })).toBe(streams);
});

test("machinesInScope narrows by kind or id, else passes through", () => {
  const machines: MachineRow[] = [
    machine("m1", "tileExecution"),
    machine("m2", "tileExecution"),
    machine("m3", "priceStream"),
  ];

  expect(
    machinesInScope(machines, {
      kind: "machineKind",
      machineKind: "tileExecution",
    }),
  ).toEqual([machines[0], machines[1]]);
  expect(
    machinesInScope(machines, { kind: "machine", machineId: "m3" }),
  ).toEqual([machines[2]]);
  expect(machinesInScope(machines, { kind: "all" })).toBe(machines);
  expect(
    machinesInScope(machines, { kind: "presenter", presenter: "fx" }),
  ).toBe(machines);
});

test("changedIds flags a pinned row with no live twin, and one whose tracked value differs; equal rows are untouched", () => {
  const pinned: StreamRow[] = [
    stream("fx.price$", 1),
    stream("fx.spread$", 2),
    stream("gone.stream$", 3),
  ];
  const live: StreamRow[] = [stream("fx.price$", 1), stream("fx.spread$", 99)];

  const changed = changedIds(pinned, live, streamKey, streamValue);

  expect(changed.has("fx.price$")).toBe(false);
  expect(changed.has("fx.spread$")).toBe(true);
  expect(changed.has("gone.stream$")).toBe(true);
});

test("EMPTY_IDS is a stable empty set", () => {
  expect(EMPTY_IDS.size).toBe(0);
});

test("streamKey / streamValue / machineKey / machineValue read the tracked fields", () => {
  const row = stream("fx.price$", 7);
  const m = machine("m1", "tileExecution", { phase: "busy" });

  expect(streamKey(row)).toBe("fx.price$");
  expect(streamValue(row)).toBe(7);
  expect(machineKey(m)).toBe("m1");
  expect(machineValue(m)).toEqual({ phase: "busy" });
});

test("filterStreams: empty query returns the input by identity", () => {
  const streams: StreamRow[] = [stream("fx.price$", 1)];

  expect(filterStreams(streams, "")).toBe(streams);
  expect(filterStreams(streams, "   ")).toBe(streams);
});

test("filterStreams matches by id substring, case-insensitively", () => {
  const streams: StreamRow[] = [
    stream("fx.price$", 1),
    stream("blotter.trades$", 2),
  ];

  expect(filterStreams(streams, "PRICE")).toEqual([streams[0]]);
});

test("filterStreams matches by serialized value", () => {
  const streams: StreamRow[] = [
    stream("fx.price$", 1),
    stream("blotter.trades$", { symbol: "EURUSD" }),
  ];

  expect(filterStreams(streams, "eurusd")).toEqual([streams[1]]);
});

test("filterStreams returns an empty array when nothing matches", () => {
  const streams: StreamRow[] = [stream("fx.price$", 1)];

  expect(filterStreams(streams, "zzz")).toEqual([]);
});

function stream(streamId: string, lastValue: unknown): StreamRow {
  return {
    streamId,
    lastValue: lastValue as StreamRow["lastValue"],
    lastSeq: 1,
    totalEmissions: 1,
    ratePerSec: 0,
  };
}

function machine(
  machineId: string,
  machineKind: string,
  state: unknown = null,
): MachineRow {
  return {
    machineId,
    machineKind,
    args: [],
    state: state as MachineRow["state"],
    disposed: false,
    createdAt: 0,
    intents: [],
    transitions: 0,
  };
}
