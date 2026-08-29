import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { AppToInspector, Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  PROTOCOL_VERSION,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

afterEach(cleanup);
afterEach(() => {
  vi.restoreAllMocks();
});

test("connection badge reads disconnected before any welcome arrives", () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  expect(screen.getByTestId("connection-badge").textContent).toBe(
    "disconnected",
  );
});

test("tree scoping, pin/Escape, Machine tab, Clear, and the wire probe — the full journey", () => {
  // jsdom lacks a real WAAPI; StateTreePanel's change-flash calls it.
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;

  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
          state: { phase: "idle" },
          disposed: false,
          createdAt: 0,
        },
      ],
    });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:state",
          seq: 4,
          ts: 1004,
          machineId: "m1",
          state: { phase: "busy" },
          coalesced: 1,
        },
        {
          kind: "wire:in",
          seq: 5,
          ts: 1005,
          msgType: "PRICE",
          payload: null,
        },
      ],
    });
  });

  expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");
  expect(screen.getAllByTestId("timeline-row").length).toBe(5);

  // Scope to the fx presenter: only its emissions remain, State narrows.
  fireEvent.click(navNode("presenter:fx"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
  expect(screen.queryByTestId("devtools-machine-row")).toBeNull();

  // Pin via keyboard from follow mode; State@seq differs from live.
  fireEvent.keyDown(window, { key: "ArrowUp" });
  fireEvent.keyDown(window, { key: "ArrowUp" });
  fireEvent.keyDown(window, { key: "ArrowUp" });
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();
  fireEvent.click(screen.getByTestId("context-tab-state"));
  expect(screen.getByText("≠ live")).toBeTruthy();

  // Wire probe: scope jumps to All with a ±100ms radius; Esc restores fx.
  fireEvent.click(
    screen.getByText("wire ±100ms", {
      selector: "[data-testid='pinned-bar'] button",
    }),
  );
  expect(navNode("all").dataset.selected).toBe("true");
  expect(screen.getByText("±100ms ✕")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(navNode("presenter:fx").dataset.selected).toBe("true");
  expect(screen.queryByText("±100ms ✕")).toBeNull();
  expect(screen.getByTestId("pinned-bar")).toBeTruthy(); // still pinned

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByTestId("pinned-bar")).toBeNull();

  // Machines branch: the kind node scopes to machine rows; the Machine tab
  // appears for an instance.
  fireEvent.click(navNode("machineKind:tileExecution"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(1);
  expect(screen.getByTestId("devtools-machine-row").textContent).toContain(
    "tileExecution",
  );
  fireEvent.click(
    navNode("machineKind:tileExecution").parentElement?.querySelector(
      "[aria-label='Expand']",
    ) as HTMLElement,
  );
  fireEvent.click(navNode("machine:m1"));
  fireEvent.click(screen.getByTestId("context-tab-machine"));
  expect(screen.getByText("Intents (0)")).toBeTruthy();

  // Wire branch: State is unavailable.
  fireEvent.click(navNode("msgType:PRICE"));
  expect(screen.getByText("wire messages carry no state")).toBeTruthy();

  // Clear (keyboard) empties every scope and zeroes the All badge; Unclear
  // restores.
  fireEvent.click(navNode("all"));
  fireEvent.keyDown(window, { key: "c" });
  expect(screen.queryAllByTestId("timeline-row")).toEqual([]);
  expect(navNode("all").textContent).toContain("0");
  fireEvent.click(screen.getByTestId("unclear-log"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(5);
});

test("shortcuts are ignored while the tree has focus, and the keydown listener is bound once", () => {
  const store = new InspectorStore({ coalesce: false });
  const addSpy = vi.spyOn(window, "addEventListener");
  const { rerender } = render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  rerender(<InspectorApp store={store} />);
  rerender(<InspectorApp store={store} />);
  expect(
    addSpy.mock.calls.filter(([type]) => {
      return type === "keydown";
    }).length,
  ).toBe(1);

  // Focus-WITHIN, not a focused container: the tree's own nodes are what
  // take focus, and their keydown bubbles to the window listener carrying a
  // target inside `[data-nav-tree]` — which the router must ignore.
  const allNode = navNode("all");

  allNode.focus();
  fireEvent.keyDown(allNode, { key: "ArrowUp" });
  expect(screen.queryByTestId("pinned-bar")).toBeNull();

  fireEvent.keyDown(window, { key: "ArrowUp" });
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();
});

test("ArrowDown steps forward, / focuses the scoped search, and keys typed in an input stay the input's", () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  fireEvent.keyDown(window, { key: "ArrowUp" }); // follow → the tail, seq 3
  fireEvent.keyDown(window, { key: "ArrowUp" }); // seq 2
  fireEvent.keyDown(window, { key: "ArrowDown" }); // back to seq 3
  fireEvent.click(screen.getByTestId("context-tab-event"));
  expect(pinnedEventSeq()).toBe("3");

  fireEvent.keyDown(window, { key: "/" });

  const search = screen.getByPlaceholderText("Search scope… ( / )");

  expect(document.activeElement).toBe(search);

  // Typing inside the search box is the box's business, not the timeline's.
  fireEvent.keyDown(search, { key: "ArrowUp" });
  expect(pinnedEventSeq()).toBe("3");

  // …except Escape, which blurs it without also resuming the timeline.
  fireEvent.keyDown(search, { key: "Escape" });
  expect(document.activeElement).not.toBe(search);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();
});

test("Escape re-attaches a detached tail once nothing is scoped or pinned", () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  // jsdom lays nothing out, so every element reads 0 tall and every scroll
  // looks like "at the bottom" — the detached state has to be staged.
  const rows = screen.getByTestId("timeline-rows");

  Object.defineProperty(rows, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(rows, "clientHeight", {
    value: 100,
    configurable: true,
  });
  fireEvent.scroll(rows);
  expect(screen.getByTestId("live-chip")).toBeTruthy();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByTestId("live-chip")).toBeNull();
});

test("show in All widens the scope around a hidden pin; an intent-history click pins its own row", () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: [],
          state: { phase: "idle" },
          disposed: false,
          createdAt: 0,
        },
      ],
    });
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:intent",
          seq: 1,
          ts: 1001,
          machineId: "m1",
          name: "execute",
          args: [],
        },
        {
          kind: "stream:emission",
          seq: 2,
          ts: 1002,
          streamId: "fx.price$",
          value: 7,
          coalesced: 1,
        },
      ],
    });
  });

  // Pin the fx row under All, then scope to the machines branch: the pin
  // survives but is out of view, so the bar offers the way back.
  const emissionRow = screen.getAllByTestId("timeline-row")[1] as HTMLElement;

  fireEvent.click(emissionRow.querySelector("button") as HTMLElement);
  fireEvent.click(navNode("machineKind:tileExecution"));
  fireEvent.click(screen.getByTestId("show-in-all"));
  expect(navNode("all").dataset.selected).toBe("true");

  fireEvent.click(
    navNode("machineKind:tileExecution").parentElement?.querySelector(
      "[aria-label='Expand']",
    ) as HTMLElement,
  );
  fireEvent.click(navNode("machine:m1"));
  fireEvent.click(screen.getByTestId("context-tab-machine"));
  fireEvent.click(screen.getByTestId("intent-name"));
  fireEvent.click(screen.getByTestId("context-tab-event"));
  expect(pinnedEventSeq()).toBe("1");
});

test("pinned selection resets when the datasource swaps (import lands, Back to live)", async () => {
  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  const rows = screen.getAllByTestId("timeline-row");
  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  const file = new File([serializeRecording(sampleRecording())], "r.json", {
    type: "application/json",
  });

  fireEvent.change(screen.getByTestId("import"), {
    target: { files: [file] },
  });

  await waitFor(() => {
    expect(screen.getByTestId("recording-banner")).toBeTruthy();
  });
  // Importing swapped the datasource out from under the old pin — it must
  // not silently survive onto the imported timeline. The banner landing
  // only proves `imported` state committed; the reset effect that clears
  // the pin runs as a passive effect on a later tick, so this needs its
  // own wait rather than an assertion immediately following the banner's.
  await waitFor(() => {
    expect(screen.queryByTestId("pinned-bar")).toBeNull();
  });

  fireEvent.click(screen.getByTestId("back-to-live"));
  await waitFor(() => {
    expect(screen.queryByTestId("recording-banner")).toBeNull();
  });
  // Back to live is itself a datasource swap — still following, not stuck
  // on whatever seq the import last had pinned. Same passive-effect gap as
  // above, so wait rather than assert immediately.
  await waitFor(() => {
    expect(screen.queryByTestId("pinned-bar")).toBeNull();
  });
});

test("liveHistory seeds pre-mount store state — a pinned row reconstructs a machine that only ever existed before mount", () => {
  const store = new InspectorStore({ coalesce: false });

  // Applied before InspectorApp (and its store.tap() tee) ever mounts.
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
  store.apply({
    kind: "snapshot",
    streams: [],
    machines: [
      {
        machineId: "m-pre",
        machineKind: "testMachine",
        args: [],
        state: { phase: "pre-mount" },
        disposed: false,
        createdAt: 500,
      },
    ],
  });

  render(<InspectorApp store={store} />);

  // A log row generated only after mount — its reconstructed state must
  // still carry the pre-mount machine if the seed worked.
  act(() => {
    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq: 1,
          ts: 1000,
          streamId: "fx.price$",
          value: 1,
          coalesced: 1,
        },
      ],
    });
  });

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(1);

  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  fireEvent.click(screen.getByTestId("context-tab-state"));

  expect(screen.getByText("m-pre")).toBeTruthy();
});

test("re-renders do not re-tap the store — liveHistory keeps its identity across renders", () => {
  const store = new InspectorStore({ coalesce: false });
  const tapSpy = vi.spyOn(store, "tap");

  const { rerender } = render(<InspectorApp store={store} />);

  rerender(<InspectorApp store={store} />);
  rerender(<InspectorApp store={store} />);

  expect(tapSpy).toHaveBeenCalledTimes(1);
});

test("re-renders inside React.StrictMode do not grow past its own double-invoke baseline", () => {
  const store = new InspectorStore({ coalesce: false });
  const tapSpy = vi.spyOn(store, "tap");

  const { rerender } = render(
    <StrictMode>
      <InspectorApp store={store} />
    </StrictMode>,
  );

  // StrictMode's dev-only mount check (mount effect, synthetic cleanup,
  // re-mount effect against the same committed closure) always tees this
  // exact effect twice, independent of whether liveHistory's identity is
  // stable — that pair alone can't distinguish the fix from the bug. What
  // it CAN'T explain is growth from further re-renders: only a real
  // re-render can hand the effect's dependency array a fresh liveHistory,
  // so the regression this guards against is the count climbing past the
  // StrictMode baseline as rerender() is called again.
  rerender(
    <StrictMode>
      <InspectorApp store={store} />
    </StrictMode>,
  );
  rerender(
    <StrictMode>
      <InspectorApp store={store} />
    </StrictMode>,
  );

  expect(tapSpy).toHaveBeenCalledTimes(2);
});

/** The Event tab's `seq` row — the cheapest witness of WHICH row is pinned.
 * Assumes the Event tab is already showing. */
function pinnedEventSeq(): string {
  return screen.getByText("seq").nextElementSibling?.textContent ?? "";
}

/** The tree's selectable rows all share one testid; `data-scope-id` is the
 * scope key, so this is "click the node for this scope". */
function navNode(id: string): HTMLElement {
  const match = screen.getAllByTestId("nav-node").find((el) => {
    return el.dataset.scopeId === id;
  });

  if (match === undefined) {
    throw new Error(`no nav-node ${id}`);
  }

  return match;
}

function sampleRecording(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "imported-app",
    startedAt: 5000,
    frames: [
      {
        kind: "snapshot",
        streams: [{ streamId: "z.a$", value: 7 }],
        machines: [],
      },
    ],
  };
}

function emissionBatches(): readonly AppToInspector[] {
  const frames: AppToInspector[] = [];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq,
          ts: 1000 + seq,
          streamId: "fx.price$",
          value: seq,
          coalesced: 1,
        },
      ],
    });
  }

  return frames;
}
