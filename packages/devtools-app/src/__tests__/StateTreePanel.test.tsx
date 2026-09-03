import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { stateTreePanelPage } from "#tests/pages/StateTreePanelPage";

const panel = stateTreePanelPage();

afterEach(() => {
  panel.unmountAll();
});

beforeEach(() => {
  // jsdom lacks a real WAAPI; the change-flash effect calls element.animate().
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

test("groups streams from different presenters under separate sections", () => {
  const streams: StreamRow[] = [
    streamRow({ streamId: "blotter.trades$" }),
    streamRow({ streamId: 'priceStream.price$[["EURUSD"]]' }),
  ];

  panel.mountStateTreePanel({ streams });

  expect(panel.hasText("blotter")).toBe(true);
  expect(panel.hasText("priceStream")).toBe(true);
  expect(panel.hasText("blotter.trades$")).toBe(true);
  expect(panel.hasText('priceStream.price$[["EURUSD"]]')).toBe(true);
});

test("re-renders the changed value when the underlying row updates", () => {
  const initial: StreamRow[] = [streamRow({ lastValue: 1, lastSeq: 1 })];
  panel.mountStateTreePanel({ streams: initial });

  expect(panel.hasText("1")).toBe(true);

  const updated: StreamRow[] = [streamRow({ lastValue: 2, lastSeq: 2 })];
  panel.rerenderWith({ streams: updated });

  expect(panel.hasText("2")).toBe(true);
  expect(panel.hasText("1")).toBe(false);
});

test("shows a rate badge only when ratePerSec exceeds 0.5", () => {
  const streams: StreamRow[] = [
    streamRow({ streamId: "a.x$", ratePerSec: 0.1 }),
    streamRow({ streamId: "b.y$", ratePerSec: 2.7 }),
  ];

  panel.mountStateTreePanel({ streams });

  expect(panel.hasText("2.7/s")).toBe(true);
  expect(panel.hasText("0.1/s")).toBe(false);
});

function streamRow(overrides: Partial<StreamRow>): StreamRow {
  return {
    streamId: "blotter.trades$",
    lastValue: null,
    lastSeq: 0,
    totalEmissions: 0,
    ratePerSec: 0,
    ...overrides,
  };
}
