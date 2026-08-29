import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { ALL_SCOPE } from "#/nav/scope";
import { TimelinePane } from "#/timeline/TimelinePane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  mount();

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(3);

  // The row itself is a non-interactive container (valid HTML — no nested
  // interactive elements); the pin target is its first child button, which
  // covers the time/kind-chip/summary area.
  const pinButton = (rows[0] as HTMLElement).querySelector("button");

  fireEvent.click(pinButton as HTMLElement);
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();

  fireEvent.click(screen.getByText("Resume"));
  expect(screen.queryByTestId("pinned-bar")).toBeNull();
});

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

// Harness is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply, and a test file may not
// export anything at all (lint/suspicious/noExportsInTest).
function mount(): void {
  function Harness(): ReactElement {
    const [{ history, log, present }] = useState(seed);
    const model = useTimeline(log, history, ALL_SCOPE, present);

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

  const present = store.getSnapshot();

  return { history, log: present.log, present };
}
