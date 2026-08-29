import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { TimelinePane } from "#/timeline/TimelinePane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  mount();

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(3);

  // The row itself is a non-interactive container; the pin target is its
  // first child button, which now covers the whole row's text.
  fireEvent.click(
    (rows[0] as HTMLElement).querySelector("button") as HTMLElement,
  );
  expect(screen.getByTestId("pinned-bar").textContent).toContain("pinned at");

  fireEvent.click(screen.getByText("Resume"));
  expect(screen.queryByTestId("pinned-bar")).toBeNull();
});

test("Clear empties the list and shows Unclear; Unclear brings the rows back", () => {
  mount();

  fireEvent.click(screen.getByTestId("clear-log"));
  expect(screen.queryAllByTestId("timeline-row")).toEqual([]);

  fireEvent.click(screen.getByTestId("unclear-log"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
  expect(screen.queryByTestId("unclear-log")).toBeNull();
});

test("search filters rows by summary text through the header input", () => {
  mount();

  fireEvent.change(screen.getByPlaceholderText("Search scope… ( / )"), {
    target: { value: "fx.price$ 3" },
  });
  expect(screen.getAllByTestId("timeline-row").length).toBe(1);
});

test("source label is scope-relative and hidden under a single-stream scope", () => {
  const handle = mount();

  expect(screen.getAllByText("fx.price$").length).toBe(3);

  handle.setScope({ kind: "presenter", presenter: "fx" });
  expect(screen.getAllByText("price$").length).toBe(3);
  expect(screen.queryByText("fx.price$")).toBeNull();

  handle.setScope({ kind: "stream", streamId: "fx.price$" });
  expect(screen.queryByText("price$")).toBeNull();
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
});

test("wire ±100ms on a row calls onProbeWire with that row", () => {
  const handle = mount();

  fireEvent.click(
    screen.getAllByTitle("Show wire traffic within ±100 ms")[1] as HTMLElement,
  );
  expect(
    handle.probed.map((r) => {
      return r.seq;
    }),
  ).toEqual([2]);
});

test("scrolling away from the bottom detaches the tail; ⤓ live re-attaches", () => {
  const handle = mount();
  const list = screen.getByTestId("timeline-rows");

  // jsdom has no layout: fake the geometry the handler reads.
  Object.defineProperty(list, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(list, "clientHeight", {
    value: 200,
    configurable: true,
  });
  list.scrollTop = 100;
  fireEvent.scroll(list);

  expect(handle.model().tailAttached).toBe(false);
  expect(screen.getByTestId("live-chip")).toBeTruthy();

  fireEvent.click(screen.getByTestId("live-chip"));
  expect(handle.model().tailAttached).toBe(true);
  expect(screen.queryByTestId("live-chip")).toBeNull();
});

test("auto-scroll runs only while attached", () => {
  const handle = mount();
  const list = screen.getByTestId("timeline-rows");
  const scrollTopSetter = vi.fn();

  Object.defineProperty(list, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(list, "clientHeight", {
    value: 200,
    configurable: true,
  });
  Object.defineProperty(list, "scrollTop", {
    get: () => {
      return 100;
    },
    set: scrollTopSetter,
    configurable: true,
  });

  fireEvent.scroll(list); // detaches (100 + 200 < 1000)
  scrollTopSetter.mockClear();
  handle.append(); // a new row arrives
  expect(scrollTopSetter).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("live-chip"));
  expect(scrollTopSetter).toHaveBeenCalledWith(1000);
});

test("pinned bar flags a pin that is hidden by the current scope and offers show in All", () => {
  const handle = mount();

  fireEvent.click(
    (screen.getAllByTestId("timeline-row")[0] as HTMLElement).querySelector(
      "button",
    ) as HTMLElement,
  );
  handle.setScope({ kind: "wire" });

  expect(screen.getByTestId("pinned-bar").textContent).toContain(
    "not in this scope",
  );
  fireEvent.click(screen.getByTestId("show-in-all"));
  expect(handle.shownInAll).toBe(1);
});

test("detaching anchors the render window on the first row still on screen", () => {
  mount();

  const list = screen.getByTestId("timeline-rows");

  Object.defineProperty(list, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(list, "clientHeight", {
    value: 200,
    configurable: true,
  });
  // Give the first row real height so the anchor scan finds it there rather
  // than falling back to "the first child, whatever it is".
  Object.defineProperty(list.children[0] as HTMLElement, "offsetHeight", {
    value: 40,
    configurable: true,
  });
  list.scrollTop = 0;
  fireEvent.scroll(list);

  expect(screen.getByTestId("live-chip")).toBeTruthy();
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
});

interface Handle {
  setScope: (scope: Scope) => void;
  append: () => void;
  model: () => ReturnType<typeof useTimeline>;
  probed: LogRow[];
  shownInAll: number;
}

interface Seed {
  history: LiveHistory;
  store: InspectorStore;
}

function mount(): Handle {
  const handle: Handle = {
    setScope: () => {},
    append: () => {},
    model: () => {
      throw new Error("not mounted");
    },
    probed: [],
    shownInAll: 0,
  };

  function Harness(): ReactElement {
    const [{ history, store }] = useState(seed);
    const [state, setState] = useState<InspectorState>(store.getSnapshot());
    const [scope, setScope] = useState<Scope>(ALL_SCOPE);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const model = useTimeline(state.log, history, scope, state);

    // The caller invokes these from outside React's render cycle (a test
    // harness, not an event handler), so each update needs an explicit
    // `act()` to flush synchronously — react-dom's createRoot otherwise
    // defers the re-render past the assertion that immediately follows
    // (same pattern as NavTree.test.tsx's `bump`).
    handle.setScope = (next: Scope): void => {
      act(() => {
        setScope(next);
      });
    };

    handle.model = (): ReturnType<typeof useTimeline> => {
      return model;
    };

    handle.append = (): void => {
      const seq = state.log.length + 1;
      const frame: AppToInspector = {
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
      };

      act(() => {
        history.record(frame);
        store.apply(frame);
        setState(store.getSnapshot());
      });
    };

    function probeWire(row: LogRow): void {
      handle.probed.push(row);
    }

    function showInAll(): void {
      handle.shownInAll += 1;
    }

    return (
      <TimelinePane
        model={model}
        scope={scope}
        searchInputRef={searchRef}
        onProbeWire={probeWire}
        onShowInAll={showInAll}
      />
    );
  }

  render(<Harness />);

  return handle;
}

function seed(): Seed {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [], machines: [] },
  ];

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

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  return { history, store };
}
