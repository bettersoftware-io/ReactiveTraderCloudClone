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
  const pinnedRow = rows[0] as HTMLElement;

  fireEvent.click(pinnedRow.querySelector("button") as HTMLElement);
  expect(screen.getByTestId("pinned-bar").textContent).toContain("pinned at");
  // The bar's own `data-seq` names the pinned row independently of its
  // label text — this is what an e2e driver reads to know which row got
  // pinned without trusting the badge under test.
  expect(screen.getByTestId("pinned-bar").getAttribute("data-seq")).toBe(
    pinnedRow.getAttribute("data-seq"),
  );

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

test("the radius chip's dismiss (✕) calls onDismissRadius, not clearRadius directly", () => {
  const onDismissRadius = vi.fn();
  const handle = mount(3, onDismissRadius);

  handle.probeRadius();
  fireEvent.click(screen.getByTitle("Clear radius filter"));

  expect(onDismissRadius).toHaveBeenCalledTimes(1);
  // Clicking it alone must not have cleared the radius through some other
  // path — only `onDismissRadius` (InspectorApp's `dismissRadius`, which
  // also pops the probe scope) is wired to decide that.
  expect(handle.model().filter.radius).not.toBeNull();
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

// Flaked on the shared GitHub runner at vitest's 5000 ms default (runs
// 33282539448 / PR #608 and 33292172917 / PR #614, both 2026-08-30; suite
// wall time 6.8-7.4s there, never reproduced locally). The 1000-row seed
// below is load-bearing for what the test proves — don't shrink it to fit
// the default budget; widen the budget instead.
test("detaching re-centers the >500-row render window on the first row still on screen", () => {
  // With only 3 rows the windowed and tail-500 slices are IDENTICAL (both
  // are just "all 3 rows"), so a 3-row fixture can't distinguish real
  // anchoring from `windowedRows` silently falling back to a plain tail
  // slice. 1000 rows puts the anchor comfortably inside both the render
  // cap (500) and the ±250-row half-window on either side, so the window
  // this test asserts on isn't clamped against either edge.
  mount(1000);

  const list = screen.getByTestId("timeline-rows");

  Object.defineProperty(list, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(list, "clientHeight", {
    value: 200,
    configurable: true,
  });
  // Before any scroll, follow mode renders the tail-500 (seq 501..1000),
  // so `list.children[0]` is seq 501. Give it real height so the anchor
  // scan finds it there rather than falling back to "the first child,
  // whatever it is".
  Object.defineProperty(list.children[0] as HTMLElement, "offsetHeight", {
    value: 40,
    configurable: true,
  });
  list.scrollTop = 0;
  fireEvent.scroll(list);

  expect(screen.getByTestId("live-chip")).toBeTruthy();

  // Re-centered ±250 around the anchor (seq 501, at full-log index 500):
  // seq 251..750 — proof the window moved OFF the tail (seq 1000 is no
  // longer rendered) and re-anchored on the row that was still on screen,
  // rather than staying pinned to a plain tail-500 slice.
  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(500);
  expect(rows[0]?.getAttribute("data-seq")).toBe("251");
  expect(rows[rows.length - 1]?.getAttribute("data-seq")).toBe("750");
  expect(list.querySelector('[data-seq="1000"]')).toBeNull();
}, 20_000);

interface Handle {
  setScope: (scope: Scope) => void;
  append: () => void;
  probeRadius: () => void;
  model: () => ReturnType<typeof useTimeline>;
  probed: LogRow[];
  shownInAll: number;
}

interface Seed {
  history: LiveHistory;
  store: InspectorStore;
}

/** `rowCount` seeds rows 1..rowCount directly into the store/history before
 * the first render — not via `handle.append()`'s one-act()-per-row, which
 * would make a many-hundred-row seed (needed to exercise the >500-row
 * render window) slow to set up. `onDismissRadius` defaults to a no-op so
 * every existing caller is unaffected; pass a spy to assert the chip wires
 * to it. */
function mount(rowCount = 3, onDismissRadius: () => void = () => {}): Handle {
  const handle: Handle = {
    setScope: () => {},
    append: () => {},
    probeRadius: () => {},
    model: () => {
      throw new Error("not mounted");
    },
    probed: [],
    shownInAll: 0,
  };

  function Harness(): ReactElement {
    const [{ history, store }] = useState(() => {
      return seed(rowCount);
    });
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

    handle.probeRadius = (): void => {
      act(() => {
        model.setRadiusAround(state.log[0]);
      });
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
        onDismissRadius={onDismissRadius}
      />
    );
  }

  render(<Harness />);

  return handle;
}

function seed(rowCount: number): Seed {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [], machines: [] },
  ];

  for (let seq = 1; seq <= rowCount; seq += 1) {
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
