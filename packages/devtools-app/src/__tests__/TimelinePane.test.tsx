import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import type { AppToInspector, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { TimelinePane } from "#/timeline/TimelinePane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  mount();

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(3);

  fireEvent.click(rows[0] as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  fireEvent.click(screen.getByText("Resume"));
  expect(screen.queryByTestId("pinned-bar")).toBeNull();
});

test("clicking a row's source adds a pill without pinning", () => {
  mount();

  const sourceButtons = screen.getAllByTitle("Filter to this source");

  fireEvent.click(sourceButtons[0] as HTMLElement);

  expect(screen.queryByTestId("pinned-bar")).toBeNull();
  expect(screen.getAllByTestId("timeline-row").length).toBe(3); // same source on all rows
});

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
}

// Harness is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply, and a test file may not
// export anything at all (lint/suspicious/noExportsInTest).
function mount(): void {
  function Harness(): ReactElement {
    const [{ history, log }] = useState(seed);
    const model = useTimeline(log, history);

    return <TimelinePane model={model} />;
  }

  render(<Harness />);
}

function seed(): SeedResult {
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

  return { history, log: store.getSnapshot().log };
}
