import { expect, test } from "vitest";

import type { InspectorState } from "@rtc/devtools-core";

import {
  ALL_SCOPE,
  compileScope,
  parseStreamId,
  scopeKey,
  scopesEqual,
  shortLabel,
  streamLeafLabel,
} from "#/nav/scope";

test("parseStreamId splits presenter / prop / args for the three id shapes", () => {
  expect(parseStreamId("blotter.trades$")).toEqual({
    presenter: "blotter",
    prop: "trades$",
    argsKey: null,
  });
  expect(parseStreamId('priceHistory.history$[["EURCAD"]]')).toEqual({
    presenter: "priceHistory",
    prop: "history$",
    argsKey: '[["EURCAD"]]',
  });
  expect(
    parseStreamId(
      'priceStream.price$[[{"symbol":"EURUSD","ratePrecision":5}]]',
    ),
  ).toEqual({
    presenter: "priceStream",
    prop: "price$",
    argsKey: '[[{"symbol":"EURUSD","ratePrecision":5}]]',
  });
  // No dot at all: the whole id is the presenter and the prop is empty.
  expect(parseStreamId("orphan")).toEqual({
    presenter: "orphan",
    prop: "",
    argsKey: null,
  });
});

test("scopeKey is stable and unique per variant; scopesEqual compares by key", () => {
  expect(scopeKey(ALL_SCOPE)).toBe("all");
  expect(scopeKey({ kind: "presenter", presenter: "blotter" })).toBe(
    "presenter:blotter",
  );
  expect(scopeKey({ kind: "stream", streamId: "blotter.trades$" })).toBe(
    "stream:blotter.trades$",
  );
  expect(scopeKey({ kind: "machineKind", machineKind: "tileExecution" })).toBe(
    "machineKind:tileExecution",
  );
  expect(scopeKey({ kind: "machine", machineId: "m3" })).toBe("machine:m3");
  expect(scopeKey({ kind: "wire" })).toBe("wire");
  expect(scopeKey({ kind: "msgType", msgType: "PRICE" })).toBe("msgType:PRICE");
  expect(
    scopesEqual(
      { kind: "machine", machineId: "m3" },
      { kind: "machine", machineId: "m3" },
    ),
  ).toBe(true);
  expect(scopesEqual(ALL_SCOPE, { kind: "wire" })).toBe(false);
});

test("compileScope: every variant compiles to families + pills", () => {
  const state = stateWith();

  expect(compileScope(ALL_SCOPE, state)).toEqual({
    families: { stream: true, machine: true, wire: true, devtools: true },
    pills: null,
  });
  expect(
    compileScope({ kind: "presenter", presenter: "blotter" }, state),
  ).toEqual({
    families: { stream: true, machine: false, wire: false, devtools: false },
    pills: [
      { type: "stream", id: "blotter.activity$" },
      { type: "stream", id: "blotter.trades$" },
    ],
  });
  expect(
    compileScope({ kind: "stream", streamId: "blotter.trades$" }, state),
  ).toEqual({
    families: { stream: true, machine: false, wire: false, devtools: false },
    pills: [{ type: "stream", id: "blotter.trades$" }],
  });
  expect(
    compileScope({ kind: "machineKind", machineKind: "tileExecution" }, state),
  ).toEqual({
    families: { stream: false, machine: true, wire: false, devtools: false },
    pills: [
      { type: "machine", id: "m1" },
      { type: "machine", id: "m2" },
    ],
  });
  expect(compileScope({ kind: "machine", machineId: "m2" }, state)).toEqual({
    families: { stream: false, machine: true, wire: false, devtools: false },
    pills: [{ type: "machine", id: "m2" }],
  });
  expect(compileScope({ kind: "wire" }, state)).toEqual({
    families: { stream: false, machine: false, wire: true, devtools: false },
    pills: null,
  });
  expect(compileScope({ kind: "msgType", msgType: "PRICE" }, state)).toEqual({
    families: { stream: false, machine: false, wire: true, devtools: false },
    pills: [{ type: "msgType", id: "PRICE" }],
  });
});

test("compileScope: a presenter/kind with no members yields an EMPTY pill set, not an unconstrained one", () => {
  const state = stateWith();

  expect(
    compileScope({ kind: "presenter", presenter: "gone" }, state).pills,
  ).toEqual([]);
  expect(
    compileScope({ kind: "machineKind", machineKind: "gone" }, state).pills,
  ).toEqual([]);
});

test("labels: streamLeafLabel and shortLabel per scope", () => {
  expect(streamLeafLabel("blotter.trades$")).toBe("trades$");
  expect(streamLeafLabel('priceHistory.history$[["EURCAD"]]')).toBe(
    "history$ · EURCAD",
  );
  expect(
    streamLeafLabel(
      'priceStream.price$[[{"symbol":"EURUSD","ratePrecision":5}]]',
    ),
  ).toBe("price$ · EURUSD");
  expect(streamLeafLabel('animationDirector.intentsFor[["tile:EURUSD"]]')).toBe(
    "intentsFor · tile:EURUSD",
  );
  // Unparseable args fall back to the raw args key.
  expect(streamLeafLabel("x.y$[not json]")).toBe("y$ · not json");

  const id = 'priceHistory.history$[["EURCAD"]]';

  expect(shortLabel(id, ALL_SCOPE)).toBe(id);
  expect(shortLabel(id, { kind: "presenter", presenter: "priceHistory" })).toBe(
    "history$ · EURCAD",
  );
  // A non-matching presenter scope (a stray row) keeps the full id.
  expect(shortLabel(id, { kind: "presenter", presenter: "blotter" })).toBe(id);
  expect(shortLabel(id, { kind: "stream", streamId: id })).toBe("EURCAD");
  expect(
    shortLabel("blotter.trades$", {
      kind: "stream",
      streamId: "blotter.trades$",
    }),
  ).toBe("trades$");
  expect(shortLabel(id, { kind: "wire" })).toBe(id);
});

test("stream labels fall back per arg shape: nested array, string-less object, null, primitive, multi-arg join", () => {
  expect(streamLeafLabel('fx.price[[["EURUSD","GBPUSD"]]]')).toContain(
    "EURUSD, GBPUSD",
  );
  expect(streamLeafLabel('fx.price[[{"count":5}]]')).toContain('{"count":5}');
  expect(streamLeafLabel("fx.price[[null]]")).toContain("null");
  expect(streamLeafLabel("fx.price[[42]]")).toContain("42");
  expect(streamLeafLabel('fx.price[["EURUSD",7]]')).toContain("EURUSD, 7");
});

function stateWith(): InspectorState {
  return {
    connected: true,
    dev: false,
    appId: "rtc-web",
    protocolMismatch: null,
    streams: [
      {
        streamId: "analytics.position$",
        lastValue: null,
        lastSeq: 0,
        totalEmissions: 0,
        ratePerSec: 0,
      },
      {
        streamId: "blotter.activity$",
        lastValue: null,
        lastSeq: 0,
        totalEmissions: 0,
        ratePerSec: 0,
      },
      {
        streamId: "blotter.trades$",
        lastValue: null,
        lastSeq: 0,
        totalEmissions: 0,
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
        disposed: false,
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
