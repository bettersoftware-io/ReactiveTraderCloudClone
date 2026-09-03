import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { InspectorState, MachineRow, StreamRow } from "@rtc/devtools-core";

import { ALL_SCOPE } from "#/nav/scope";
import { stateTabPage } from "#tests/pages/StateTabPage";

const stateTab = stateTabPage();

afterEach(() => {
  stateTab.unmountAll();
});

// StateTreePanel's rows change-flash via WAAPI (panels/flash.ts); jsdom has
// no real Element.animate, so stub it the same way ContextPane.test.tsx does.
beforeEach(() => {
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

test("presenter scope narrows State to that presenter's streams and keeps the search box", () => {
  const live = inspectorState({
    streams: [stream("fx.price$", 3), stream("blotter.trades$", 5)],
  });

  stateTab.mountStateTab({
    state: live,
    presentState: live,
    marked: false,
    scope: { kind: "presenter", presenter: "fx" },
  });

  expect(stateTab.hasText("fx.price$")).toBe(true);
  expect(stateTab.hasText("blotter.trades$")).toBe(false);
  expect(stateTab.hasPlaceholder("Search state…")).toBe(true);
});

test("stream scope shows the single stream row without a search box", () => {
  const live = inspectorState({
    streams: [stream("fx.price$", 3), stream("fx.spread$", 1)],
  });

  stateTab.mountStateTab({
    state: live,
    presentState: live,
    marked: false,
    scope: { kind: "stream", streamId: "fx.price$" },
  });

  expect(stateTab.testIdCount("devtools-stream-row")).toBe(1);
  expect(stateTab.hasPlaceholder("Search state…")).toBe(false);
});

test("machineKind scope lists only that kind's instances, marked ≠ live when the pinned state differs", () => {
  const live = inspectorState({
    machines: [
      machine("m1", "tileExecution", { phase: "busy" }),
      machine("m2", "priceStream", { phase: "idle" }),
    ],
  });

  const pinned = inspectorState({
    machines: [
      machine("m1", "tileExecution", { phase: "idle" }),
      machine("m2", "priceStream", { phase: "idle" }),
    ],
  });

  stateTab.mountStateTab({
    state: pinned,
    presentState: live,
    marked: true,
    scope: { kind: "machineKind", machineKind: "tileExecution" },
  });

  expect(stateTab.testIdCount("devtools-machine-row")).toBe(1);
  expect(stateTab.testIdCount("devtools-stream-row")).toBe(0);
  expect(stateTab.hasText("≠ live")).toBe(true);
});

test("machine scope renders the single machine's state via ValueView", () => {
  const live = inspectorState({
    machines: [
      machine("m1", "tileExecution", { phase: "busy" }),
      machine("m2", "priceStream", { marker: "focused-machine-value" }),
    ],
  });

  stateTab.mountStateTab({
    state: live,
    presentState: live,
    marked: false,
    scope: { kind: "machine", machineId: "m2" },
  });

  expect(stateTab.hasText("Object(1)")).toBe(true);
  expect(stateTab.hasText('"focused-machine-value"')).toBe(true);
});

test("the search matches a stream by id and by its serialized value", () => {
  const live = inspectorState({
    streams: [
      stream("fx.price$", 3),
      stream("fx.spread$", 1),
      stream("blotter.trades$", { symbol: "EURUSD" }),
    ],
  });

  stateTab.mountStateTab({
    state: live,
    presentState: live,
    marked: false,
    scope: ALL_SCOPE,
  });

  stateTab.changeSearch("Search state…", "zzz");
  expect(stateTab.testIdCount("devtools-stream-row")).toBe(0);

  stateTab.changeSearch("Search state…", "price");
  expect(stateTab.testIdCount("devtools-stream-row")).toBe(1);

  stateTab.changeSearch("Search state…", "eurusd");
  expect(stateTab.testIdCount("devtools-stream-row")).toBe(1);
});

interface InspectorStateFixture {
  streams?: readonly StreamRow[];
  machines?: readonly MachineRow[];
}

function inspectorState(fixture: InspectorStateFixture): InspectorState {
  return {
    connected: true,
    dev: false,
    appId: "app",
    protocolMismatch: null,
    streams: fixture.streams ?? [],
    machines: fixture.machines ?? [],
    log: [],
  };
}

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
  state: unknown,
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
