import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { InspectorState, MachineRow, StreamRow } from "@rtc/devtools-core";

import { ALL_SCOPE } from "#/nav/scope";
import { StateTab } from "#/timeline/StateTab";

afterEach(cleanup);

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

  render(
    <StateTab
      state={live}
      presentState={live}
      marked={false}
      scope={{ kind: "presenter", presenter: "fx" }}
    />,
  );

  expect(screen.getByText("fx.price$")).toBeTruthy();
  expect(screen.queryByText("blotter.trades$")).toBeNull();
  expect(screen.getByPlaceholderText("Search state…")).toBeTruthy();
});

test("stream scope shows the single stream row without a search box", () => {
  const live = inspectorState({
    streams: [stream("fx.price$", 3), stream("fx.spread$", 1)],
  });

  render(
    <StateTab
      state={live}
      presentState={live}
      marked={false}
      scope={{ kind: "stream", streamId: "fx.price$" }}
    />,
  );

  expect(screen.getAllByTestId("devtools-stream-row").length).toBe(1);
  expect(screen.queryByPlaceholderText("Search state…")).toBeNull();
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

  render(
    <StateTab
      state={pinned}
      presentState={live}
      marked={true}
      scope={{ kind: "machineKind", machineKind: "tileExecution" }}
    />,
  );

  expect(screen.getAllByTestId("devtools-machine-row").length).toBe(1);
  expect(screen.queryByTestId("devtools-stream-row")).toBeNull();
  expect(screen.getByText("≠ live")).toBeTruthy();
});

test("machine scope renders the single machine's state via ValueView", () => {
  const live = inspectorState({
    machines: [
      machine("m1", "tileExecution", { phase: "busy" }),
      machine("m2", "priceStream", { marker: "focused-machine-value" }),
    ],
  });

  render(
    <StateTab
      state={live}
      presentState={live}
      marked={false}
      scope={{ kind: "machine", machineId: "m2" }}
    />,
  );

  expect(screen.getByText("Object(1)")).toBeTruthy();
  expect(screen.getByText('"focused-machine-value"')).toBeTruthy();
});

test("the search matches a stream by id and by its serialized value", () => {
  const live = inspectorState({
    streams: [
      stream("fx.price$", 3),
      stream("fx.spread$", 1),
      stream("blotter.trades$", { symbol: "EURUSD" }),
    ],
  });

  render(
    <StateTab
      state={live}
      presentState={live}
      marked={false}
      scope={ALL_SCOPE}
    />,
  );

  const search = screen.getByPlaceholderText("Search state…");

  fireEvent.change(search, { target: { value: "zzz" } });
  expect(screen.queryAllByTestId("devtools-stream-row")).toEqual([]);

  fireEvent.change(search, { target: { value: "price" } });
  expect(screen.getAllByTestId("devtools-stream-row").length).toBe(1);

  fireEvent.change(search, { target: { value: "eurusd" } });
  expect(screen.getAllByTestId("devtools-stream-row").length).toBe(1);
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
