import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { AppToInspector, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { ContextPane } from "#/timeline/ContextPane";
import styles from "#/timeline/ContextPane.module.css";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

beforeEach(() => {
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;
});

test("follow mode shows the live state tree", () => {
  mount();

  expect(screen.getByText("fx.price$")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy(); // latest value
});

test("pinned mode reconstructs State and marks values that differ from live", () => {
  const harness = mount();

  act(() => {
    harness.pin(1);
  });

  fireEvent.click(screen.getByTestId("context-tab-state"));
  expect(screen.getByText("1")).toBeTruthy(); // historical value
  expect(screen.getByText("≠ live")).toBeTruthy();
});

test("diff tab shows leaf changes vs the predecessor", () => {
  const harness = mount();

  act(() => {
    harness.pin(2);
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(screen.getByText("changed")).toBeTruthy();
});

test("resuming from a pinned Diff selection clears the stale tab highlight", () => {
  const harness = mount();

  act(() => {
    harness.pin(2);
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));

  act(() => {
    harness.resume();
  });

  const diffTab = screen.getByTestId("context-tab-diff");
  const stateTab = screen.getByTestId("context-tab-state");

  expect(diffTab.classList.contains(styles.tabActive)).toBe(false);
  expect(diffTab.classList.contains(styles.tab)).toBe(true);
  expect(stateTab.classList.contains(styles.tabActive)).toBe(true);
});

interface HarnessHandle {
  pin: (seq: number) => void;
  resume: () => void;
}

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
  present: ReturnType<InspectorStore["getSnapshot"]>;
}

// Component is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply. `pin` is exposed to the
// calling test via a mutable handle object, assigned during render, since a
// nested component can't itself be referenced from outside mount().
function mount(): HarnessHandle {
  const handle: HarnessHandle = {
    pin: () => {},
    resume: () => {},
  };

  function Harness(): ReactElement {
    const [{ history, log, present }] = useState(seed);
    const model = useTimeline(log, history);

    handle.pin = model.pin;
    handle.resume = model.resume;

    return <ContextPane model={model} log={log} presentState={present} />;
  }

  render(<Harness />);

  return handle;
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

  const snapshot = store.getSnapshot();

  return { history, log: snapshot.log, present: snapshot };
}
