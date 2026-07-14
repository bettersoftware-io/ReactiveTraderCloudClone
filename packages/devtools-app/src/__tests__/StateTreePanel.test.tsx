import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { StreamRow } from "@rtc/devtools-core";

import { StateTreePanel } from "#/panels/StateTreePanel";

afterEach(cleanup);

test("groups streams from different presenters under separate sections", () => {
  const streams: StreamRow[] = [
    streamRow({ streamId: "blotter.trades$" }),
    streamRow({ streamId: 'priceStream.price$[["EURUSD"]]' }),
  ];

  render(<StateTreePanel streams={streams} />);

  expect(screen.getByText("blotter")).toBeTruthy();
  expect(screen.getByText("priceStream")).toBeTruthy();
  expect(screen.getByText("blotter.trades$")).toBeTruthy();
  expect(screen.getByText('priceStream.price$[["EURUSD"]]')).toBeTruthy();
});

test("re-renders the changed value when the underlying row updates", () => {
  const initial: StreamRow[] = [streamRow({ lastValue: 1, lastSeq: 1 })];
  const { rerender } = render(<StateTreePanel streams={initial} />);

  expect(screen.getByText("1")).toBeTruthy();

  const updated: StreamRow[] = [streamRow({ lastValue: 2, lastSeq: 2 })];
  rerender(<StateTreePanel streams={updated} />);

  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.queryByText("1")).toBeNull();
});

test("shows a rate badge only when ratePerSec exceeds 0.5", () => {
  const streams: StreamRow[] = [
    streamRow({ streamId: "a.x$", ratePerSec: 0.1 }),
    streamRow({ streamId: "b.y$", ratePerSec: 2.7 }),
  ];

  render(<StateTreePanel streams={streams} />);

  expect(screen.getByText("2.7/s")).toBeTruthy();
  expect(screen.queryByText("0.1/s")).toBeNull();
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
