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

test("wireHealthLine counts wire:out too, and the wire root sorts multiple msgTypes", () => {
  const log: LogRow[] = [
    wireIn(1, "PRICE", 1000),
    wireOut(2, "EXECUTE", 1000),
    devtoolsErrorRow(3, 1000),
  ];

  expect(wireHealthLine(log)).toBe("▼ 0.1 in/s · ▲ 0.1 out/s · reconnects: 0");

  const wire = buildNavTree(stateWithMachines([]), log)[3];

  expect(
    wire?.children.map((n) => {
      return n.id;
    }),
  ).toEqual(["msgType:EXECUTE", "msgType:PRICE"]);
});

test("a machine with null args gets no arg summary in its label", () => {
  const state = stateWithMachines([
    { ...machineRow("m1", "tileExecution"), args: null },
  ]);
  const machines = buildNavTree(state, [])[2];
  const tile = machines?.children.find((n) => {
    return n.id === "machineKind:tileExecution";
  });

  expect(tile?.children[0]?.label).toBe("m1");
});

test("machines the log still references but the store evicted surface as one Evicted leaf", () => {
  const state = stateWithMachines([]); // no live rows
  const log = [
    machineEventRow({ machineId: "ghost-1", seq: 1 }),
    machineEventRow({ machineId: "ghost-2", seq: 2 }),
  ];
  const machines = buildNavTree(state, log)[2];

  expect(machines?.children.at(-1)).toMatchObject({
    id: "machines:evicted",
    label: "Evicted (2)",
    scope: null,
    count: 2,
    disposed: true,
  });
});

test("no Evicted leaf when every logged machine is still in state", () => {
  const state = stateWithMachines([machineRow("m1", "tileExecution")]);
  const log = [machineEventRow({ machineId: "m1", seq: 1 })];
  const machines = buildNavTree(state, log)[2];

  expect(
    machines?.children.map((n) => {
      return n.id;
    }),
  ).toEqual(["machineKind:tileExecution"]);
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

interface MachineEventRowOverrides {
  machineId: string;
  seq: number;
}

function machineEventRow(overrides: MachineEventRowOverrides): LogRow {
  const { machineId, seq } = overrides;
  const ts = 1000 + seq;

  return {
    seq,
    ts,
    kind: "machine:state",
    summary: `${machineId} {} ×1`,
    event: {
      kind: "machine:state",
      seq,
      ts,
      machineId,
      state: {},
      coalesced: 1,
    },
  };
}

function stateWithMachines(
  machines: readonly InspectorState["machines"][number][],
): InspectorState {
  return {
    connected: true,
    dev: false,
    appId: "rtc-web",
    protocolMismatch: null,
    streams: [],
    machines,
    log: [],
  };
}

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

function wireOut(seq: number, msgType: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "wire:out",
    summary: `${msgType} null`,
    event: { kind: "wire:out", seq, ts, msgType, payload: null },
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

/** A row whose event kind `sourceOfEvent` maps to no stream/machine/msgType
 * source (`timelineModel.ts`) — exercises the log tally's skip branch for
 * housekeeping events that never bucket into a nav count. */
function devtoolsErrorRow(seq: number, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "devtools:error",
    summary: "boom",
    event: {
      kind: "devtools:error",
      seq,
      ts,
      context: "test",
      message: "boom",
    },
  };
}
