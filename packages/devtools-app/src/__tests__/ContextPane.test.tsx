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

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import * as devtoolsCore from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { ContextPane } from "#/timeline/ContextPane";
import styles from "#/timeline/ContextPane.module.css";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

// Restore in afterEach (not only after the assertion below) so a failing
// assertion can never leak the mock into a later test.
afterEach(() => {
  vi.restoreAllMocks();
});

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
    harness.pin(rowAt(harness.log, 1));
  });

  fireEvent.click(screen.getByTestId("context-tab-state"));
  expect(screen.getByText("1")).toBeTruthy(); // historical value
  expect(screen.getByText("≠ live")).toBeTruthy();
});

test("diff tab shows leaf changes vs the predecessor", () => {
  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(screen.getByText("changed")).toBeTruthy();
});

test("a pinned moment is named in the context pane header and the badge leaves on resume", () => {
  const harness = mount();

  expect(screen.queryByTestId("state-at-seq")).toBeNull();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
  });
  expect(screen.getByTestId("state-at-seq").textContent).toBe(
    `@ seq ${rowAt(harness.log, 2).seq}`,
  );

  act(() => {
    harness.resume();
  });
  expect(screen.queryByTestId("state-at-seq")).toBeNull();
});

test("resuming from a pinned Diff selection clears the stale tab highlight", () => {
  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
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

// This is a plumbing test, not a real-failure scenario: findPredecessorRow /
// diffableValueOf / diffSerialized are pure and cannot throw on well-formed
// input. It only proves DiffTab's try/catch still routes a thrown error to
// ErrorCard after the JSX-out-of-try/catch restructure.
test("diff tab renders ErrorCard when the diff computation throws", () => {
  vi.spyOn(devtoolsCore, "diffSerialized").mockImplementation(() => {
    throw new Error("boom");
  });

  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));

  expect(screen.getByText("⚠ Diff failed: Error: boom")).toBeTruthy();
});

test("wire scope disables the State tab and explains why", () => {
  mount({ kind: "wire" });

  expect(
    (screen.getByTestId("context-tab-state") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText("wire messages carry no state")).toBeTruthy();
});

test("machine scope shows the Machine tab with state and intents", () => {
  mount({ kind: "machine", machineId: "m1" }, true);

  fireEvent.click(screen.getByTestId("context-tab-machine"));
  expect(screen.getByText("tileExecution")).toBeTruthy();
  expect(screen.getByText("Intents (0)")).toBeTruthy();
});

test("pinning a machine row under All surfaces the Machine tab; a stream row hides it", () => {
  const harness = mount(ALL_SCOPE, true);

  expect(screen.queryByTestId("context-tab-machine")).toBeNull();

  act(() => {
    harness.pin(rowAt(harness.log, 4));
  });
  expect(screen.getByTestId("context-tab-machine")).toBeTruthy();

  act(() => {
    harness.pin(rowAt(harness.log, 1));
  });
  expect(screen.queryByTestId("context-tab-machine")).toBeNull();
});

test("the first value a source ever emitted has no prior value to diff against", () => {
  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 1));
  });

  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(screen.getByText("No prior value to diff against.")).toBeTruthy();
});

test("a moment aged out of the rolling buffer explains itself instead of blanking", () => {
  vi.spyOn(
    devtoolsCore.LiveHistory.prototype,
    "oldestSeq",
    "get",
  ).mockReturnValue(5);

  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
  });

  expect(
    screen.getByText(
      "⚠ This moment left the rolling buffer — Resume to return to live.",
    ),
  ).toBeTruthy();
});

test("a reconstruction that throws renders the failure, not a blank pane", () => {
  vi.spyOn(devtoolsCore.LiveHistory.prototype, "stateAt").mockImplementation(
    () => {
      throw new Error("torn history");
    },
  );

  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 2));
  });

  expect(
    screen.getByText("⚠ State reconstruction failed: Error: torn history"),
  ).toBeTruthy();
});

test("a reconstruction failure renders the reconstruction-failed card, not a blank pane", () => {
  vi.spyOn(devtoolsCore.LiveHistory.prototype, "stateAt").mockImplementation(
    () => {
      throw new Error("history is corrupt");
    },
  );
  const harness = mount();

  act(() => {
    harness.pin(rowAt(harness.log, 1));
  });

  expect(
    screen.getByText(
      "⚠ State reconstruction failed: Error: history is corrupt",
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(
    screen.getByText(
      "⚠ State reconstruction failed: Error: history is corrupt",
    ),
  ).toBeTruthy();
});

interface HarnessHandle {
  pin: (row: LogRow) => void;
  resume: () => void;
  log: readonly LogRow[];
}

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

function rowAt(log: readonly LogRow[], seq: number): LogRow {
  const row = log.find((r) => {
    return r.seq === seq;
  });

  if (row === undefined) {
    throw new Error(`no row with seq ${seq}`);
  }

  return row;
}

// Component is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply. `pin` is exposed to the
// calling test via a mutable handle object, assigned during render, since a
// nested component can't itself be referenced from outside mount().
function mount(scope: Scope = ALL_SCOPE, withMachine = false): HarnessHandle {
  const handle: HarnessHandle = {
    pin: () => {},
    resume: () => {},
    log: [],
  };

  function Harness(): ReactElement {
    const [{ history, log, present }] = useState(() => {
      return seed(withMachine);
    });
    const model = useTimeline(log, history, scope, present);

    handle.pin = model.pin;
    handle.resume = model.resume;
    handle.log = log;

    return (
      <ContextPane
        model={model}
        log={log}
        presentState={present}
        scope={scope}
        dev={false}
      />
    );
  }

  render(<Harness />);

  return handle;
}

function seed(withMachine: boolean): SeedResult {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [
    {
      kind: "snapshot",
      streams: [],
      machines: withMachine
        ? [
            {
              machineId: "m1",
              machineKind: "tileExecution",
              args: ["EURUSD"],
              state: { phase: "idle" },
              disposed: false,
              createdAt: 0,
            },
          ]
        : [],
    },
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

  if (withMachine) {
    frames.push({
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
