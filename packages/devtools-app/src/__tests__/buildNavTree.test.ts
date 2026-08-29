import { expect, test } from "vitest";

import type { InspectorState, LogRow } from "@rtc/devtools-core";

import { buildNavTree, wireHealthLine } from "#/nav/buildNavTree";

test("four roots in order; All counts every visible row", () => {
  const tree = buildNavTree(stateWith(), logWith());

  expect(
    tree.map((n) => {
      return n.id;
    }),
  ).toEqual(["all", "presenters", "machines", "wire"]);
  expect(tree[0]).toMatchObject({
    scope: { kind: "all" },
    count: 5,
    lastSeq: 5,
  });
  expect(tree[1]?.scope).toBeNull();
  expect(tree[2]?.scope).toBeNull();
  expect(tree[3]?.scope).toEqual({ kind: "wire" });
});

test("presenters group streams with leaf labels, counts and lastSeq rolled up", () => {
  const presenters = buildNavTree(stateWith(), logWith())[1];
  const blotter = presenters?.children.find((n) => {
    return n.id === "presenter:blotter";
  });

  expect(
    presenters?.children.map((n) => {
      return n.id;
    }),
  ).toEqual(["presenter:blotter", "presenter:priceHistory"]);
  expect(blotter).toMatchObject({
    label: "blotter",
    scope: { kind: "presenter", presenter: "blotter" },
    count: 2,
    lastSeq: 3,
  });
  expect(
    blotter?.children.map((n) => {
      return [n.id, n.label, n.count];
    }),
  ).toEqual([
    ["stream:blotter.activity$", "activity$", 0],
    ["stream:blotter.trades$", "trades$", 2],
  ]);
  expect(presenters?.children[1]?.children[0]).toMatchObject({
    id: 'stream:priceHistory.history$[["EURCAD"]]',
    label: "history$ · EURCAD",
    count: 1,
  });
});

test("machines group by kind → instance with disposed flag and arg summary", () => {
  const machines = buildNavTree(stateWith(), logWith())[2];
  const tile = machines?.children.find((n) => {
    return n.id === "machineKind:tileExecution";
  });

  expect(
    machines?.children.map((n) => {
      return n.id;
    }),
  ).toEqual(["machineKind:incident", "machineKind:tileExecution"]);
  expect(tile).toMatchObject({ count: 1, lastSeq: 4 });
  expect(
    tile?.children.map((n) => {
      return [n.id, n.label, n.disposed, n.count];
    }),
  ).toEqual([
    ["machine:m1", 'm1 ["EURUSD"]', false, 1],
    ["machine:m2", 'm2 ["USDJPY"]', true, 0],
  ]);
});

test("wire root lists msgTypes with counts and carries the health line", () => {
  const wire = buildNavTree(stateWith(), logWith())[3];

  expect(wire).toMatchObject({ count: 1, lastSeq: 5 });
  expect(
    wire?.children.map((n) => {
      return [n.id, n.label, n.count];
    }),
  ).toEqual([["msgType:PRICE", "PRICE", 1]]);
  expect(wire?.detail).toBe("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0");
});

test("an empty visible log (just cleared) zeroes every count but keeps the structure", () => {
  const tree = buildNavTree(stateWith(), []);

  expect(tree[0]?.count).toBe(0);
  expect(tree[1]?.children.length).toBe(2);
  expect(tree[3]?.children).toEqual([]);
  expect(tree[3]?.detail).toBeNull();
  expect(wireHealthLine([])).toBeNull();
});

test("wireHealthLine counts a re-registered stream as a reconnect", () => {
  const log: LogRow[] = [
    wireIn(1, "PRICE", 1000),
    registered(2, "fx.price$", 1500),
    registered(3, "fx.price$", 1600),
  ];

  expect(wireHealthLine(log)).toBe("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 1");
});

test("presenter and machine-kind roots order by localeCompare, not code-unit sort", () => {
  const state = stateWith({
    presenters: ["b", "a", "B"],
    machineKinds: ["b", "a", "B"],
  });
  const tree = buildNavTree(state, []);
  const presenters = tree[1]?.children.map((n) => {
    return n.label;
  });

  const kinds = tree[2]?.children.map((n) => {
    return n.label;
  });

  expect(presenters).toEqual(["a", "b", "B"]);
  expect(kinds).toEqual(["a", "b", "B"]);
});

interface StateOverrides {
  presenters?: readonly string[];
  machineKinds?: readonly string[];
}

function stateWith(overrides?: StateOverrides): InspectorState {
  if (overrides === undefined) {
    return {
      connected: true,
      dev: false,
      appId: "rtc-web",
      protocolMismatch: null,
      streams: [
        {
          streamId: "blotter.activity$",
          lastValue: null,
          lastSeq: 0,
          totalEmissions: 0,
          ratePerSec: 0,
        },
        {
          streamId: "blotter.trades$",
          lastValue: 2,
          lastSeq: 3,
          totalEmissions: 2,
          ratePerSec: 0,
        },
        {
          streamId: 'priceHistory.history$[["EURCAD"]]',
          lastValue: 1,
          lastSeq: 2,
          totalEmissions: 1,
          ratePerSec: 0,
        },
      ],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
          state: null,
          disposed: false,
          createdAt: 0,
          intents: [],
          transitions: 0,
        },
        {
          machineId: "m2",
          machineKind: "tileExecution",
          args: ["USDJPY"],
          state: null,
          disposed: true,
          createdAt: 0,
          intents: [],
          transitions: 0,
        },
        {
          machineId: "m3",
          machineKind: "incident",
          args: [],
          state: null,
          disposed: false,
          createdAt: 0,
          intents: [],
          transitions: 0,
        },
      ],
      log: [],
    };
  }

  return {
    connected: true,
    dev: false,
    appId: "rtc-web",
    protocolMismatch: null,
    streams: (overrides.presenters ?? []).map((presenter) => {
      return streamRow(`${presenter}.x$`);
    }),
    machines: (overrides.machineKinds ?? []).map((machineKind, index) => {
      return machineRow(`m${index}`, machineKind);
    }),
    log: [],
  };
}

function streamRow(streamId: string): InspectorState["streams"][number] {
  return {
    streamId,
    lastValue: null,
    lastSeq: 0,
    totalEmissions: 0,
    ratePerSec: 0,
  };
}

function machineRow(
  machineId: string,
  machineKind: string,
): InspectorState["machines"][number] {
  return {
    machineId,
    machineKind,
    args: [],
    state: null,
    disposed: false,
    createdAt: 0,
    intents: [],
    transitions: 0,
  };
}

function logWith(): LogRow[] {
  return [
    emission(1, "blotter.trades$", 1, 1001),
    emission(2, 'priceHistory.history$[["EURCAD"]]', 1, 1002),
    emission(3, "blotter.trades$", 2, 1003),
    {
      seq: 4,
      ts: 1004,
      kind: "machine:state",
      summary: "m1 {} ×1",
      event: {
        kind: "machine:state",
        seq: 4,
        ts: 1004,
        machineId: "m1",
        state: {},
        coalesced: 1,
      },
    },
    wireIn(5, "PRICE", 1005),
  ];
}

function emission(
  seq: number,
  streamId: string,
  value: number,
  ts: number,
): LogRow {
  return {
    seq,
    ts,
    kind: "stream:emission",
    summary: `${streamId} ${value} ×1`,
    event: { kind: "stream:emission", seq, ts, streamId, value, coalesced: 1 },
  };
}

function wireIn(seq: number, msgType: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "wire:in",
    summary: `${msgType} null`,
    event: { kind: "wire:in", seq, ts, msgType, payload: null },
  };
}

function registered(seq: number, streamId: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "stream:registered",
    summary: `${streamId} registered`,
    event: { kind: "stream:registered", seq, ts, streamId },
  };
}
