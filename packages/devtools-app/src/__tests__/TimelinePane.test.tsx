import { afterEach, expect, test, vi } from "vitest";

import { timelinePanePage } from "#tests/pages/TimelinePanePage";

const pane = timelinePanePage();

afterEach(() => {
  pane.unmountAll();
});

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  pane.mount();

  expect(pane.rowCount()).toBe(3);

  // The row itself is a non-interactive container; the pin target is its
  // first child button, which now covers the whole row's text.
  const pinnedRowSeq = pane.rowSeq(0);

  pane.clickPinButtonOfRow(0);
  expect(pane.text("pinned-bar")).toContain("pinned at");
  // The bar's own `data-seq` names the pinned row independently of its
  // label text — this is what an e2e driver reads to know which row got
  // pinned without trusting the badge under test.
  expect(pane.attr("pinned-bar", "data-seq")).toBe(pinnedRowSeq);

  pane.clickText("Resume");
  expect(pane.exists("pinned-bar")).toBe(false);
});

test("Clear empties the list and shows Unclear; Unclear brings the rows back", () => {
  pane.mount();

  pane.click("clear-log");
  expect(pane.rowCount()).toBe(0);

  pane.click("unclear-log");
  expect(pane.rowCount()).toBe(3);
  expect(pane.exists("unclear-log")).toBe(false);
});

test("search filters rows by summary text through the header input", () => {
  pane.mount();

  pane.changeSearch("Search scope… ( / )", "fx.price$ 3");
  expect(pane.rowCount()).toBe(1);
});

test("source label is scope-relative and hidden under a single-stream scope", () => {
  const handle = pane.mount();

  expect(pane.textCount("fx.price$")).toBe(3);

  handle.setScope({ kind: "presenter", presenter: "fx" });
  expect(pane.textCount("price$")).toBe(3);
  expect(pane.hasText("fx.price$")).toBe(false);

  handle.setScope({ kind: "stream", streamId: "fx.price$" });
  expect(pane.hasText("price$")).toBe(false);
  expect(pane.rowCount()).toBe(3);
});

test("wire ±100ms on a row calls onProbeWire with that row", () => {
  const handle = pane.mount();

  pane.clickTitled("Show wire traffic within ±100 ms", 1);
  expect(
    handle.probed.map((r) => {
      return r.seq;
    }),
  ).toEqual([2]);
});

test("the radius chip's dismiss (✕) calls onDismissRadius, not clearRadius directly", () => {
  const onDismissRadius = vi.fn();
  const handle = pane.mount(3, onDismissRadius);

  handle.probeRadius();
  pane.clickTitled("Clear radius filter");

  expect(onDismissRadius).toHaveBeenCalledTimes(1);
  // Clicking it alone must not have cleared the radius through some other
  // path — only `onDismissRadius` (InspectorApp's `dismissRadius`, which
  // also pops the probe scope) is wired to decide that.
  expect(handle.model().filter.radius).not.toBeNull();
});

test("scrolling away from the bottom detaches the tail; ⤓ live re-attaches", () => {
  const handle = pane.mount();
  const list = pane.element("timeline-rows");

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
  pane.scroll("timeline-rows");

  expect(handle.model().tailAttached).toBe(false);
  expect(pane.exists("live-chip")).toBe(true);

  pane.click("live-chip");
  expect(handle.model().tailAttached).toBe(true);
  expect(pane.exists("live-chip")).toBe(false);
});

test("auto-scroll runs only while attached", () => {
  const handle = pane.mount();
  const list = pane.element("timeline-rows");
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

  pane.scroll("timeline-rows"); // detaches (100 + 200 < 1000)
  scrollTopSetter.mockClear();
  handle.append(); // a new row arrives
  expect(scrollTopSetter).not.toHaveBeenCalled();

  pane.click("live-chip");
  expect(scrollTopSetter).toHaveBeenCalledWith(1000);
});

test("pinned bar flags a pin that is hidden by the current scope and offers show in All", () => {
  const handle = pane.mount();

  pane.clickPinButtonOfRow(0);
  handle.setScope({ kind: "wire" });

  expect(pane.text("pinned-bar")).toContain("not in this scope");
  pane.click("show-in-all");
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
  pane.mount(1000);

  const list = pane.element("timeline-rows");

  Object.defineProperty(list, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(list, "clientHeight", {
    value: 200,
    configurable: true,
  });
  // Before any scroll, follow mode renders the tail-500 (seq 501..1000),
  // so the list's first child is seq 501. Give it real height so the
  // anchor scan finds it there rather than falling back to "the first
  // child, whatever it is".
  Object.defineProperty(pane.firstChildOf("timeline-rows"), "offsetHeight", {
    value: 40,
    configurable: true,
  });
  list.scrollTop = 0;
  pane.scroll("timeline-rows");

  expect(pane.exists("live-chip")).toBe(true);

  // Re-centered ±250 around the anchor (seq 501, at full-log index 500):
  // seq 251..750 — proof the window moved OFF the tail (seq 1000 is no
  // longer rendered) and re-anchored on the row that was still on
  // screen, rather than staying pinned to a plain tail-500 slice.
  expect(pane.rowCount()).toBe(500);
  expect(pane.rowSeq(0)).toBe("251");
  expect(pane.rowSeq(pane.rowCount() - 1)).toBe("750");
  expect(pane.hasSeqInList("timeline-rows", "1000")).toBe(false);
}, 20_000);
