import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { ContextPane } from "#/timeline/ContextPane";
import { useTimeline } from "#/timeline/useTimeline";

interface RawHandle {
  pin: (row: LogRow) => void;
  resume: () => void;
  log: readonly LogRow[];
}

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

interface ContextPaneHandle {
  readonly log: readonly LogRow[];
  pin(row: LogRow): void;
  resume(): void;
}

export interface ContextPanePage {
  mount(scope?: Scope, withMachine?: boolean): ContextPaneHandle;
  unmountAll(): void;
  hasText(text: string): boolean;
  exists(testId: string): boolean;
  isDisabled(testId: string): boolean;
  textOf(testId: string): string;
  hasClass(testId: string, className: string): boolean;
  click(testId: string): void;
}

/** The framework surface for `ContextPane.test.tsx`. */
export function contextPanePage(): ContextPanePage {
  return {
    mount(scope: Scope = ALL_SCOPE, withMachine = false): ContextPaneHandle {
      // The Component is nested inside `mount` (not a module-top-level
      // declaration), so Biome's fast-refresh export-only-modules check —
      // which only guards top-level component declarations — doesn't apply.
      // `pin`/`resume` are exposed via a mutable handle assigned during
      // render, since a nested component can't itself be referenced from
      // outside this function.
      const raw: RawHandle = {
        pin: () => {},
        resume: () => {},
        log: [],
      };

      function Harness(): ReactElement {
        const [{ history, log, present }] = useState(() => {
          return seed(withMachine);
        });
        const model = useTimeline(log, history, scope, present);

        raw.pin = model.pin;
        raw.resume = model.resume;
        raw.log = log;

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

      return {
        get log(): readonly LogRow[] {
          return raw.log;
        },
        // The caller invokes these from outside React's render cycle (a test
        // harness, not an event handler), so each update needs an explicit
        // flush to happen synchronously — react-dom's createRoot otherwise
        // defers the re-render past the assertion that immediately follows.
        pin(row: LogRow): void {
          act(() => {
            raw.pin(row);
          });
        },
        resume(): void {
          act(() => {
            raw.resume();
          });
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    isDisabled(testId: string): boolean {
      return (screen.getByTestId(testId) as HTMLButtonElement).disabled;
    },
    textOf(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    hasClass(testId: string, className: string): boolean {
      return screen.getByTestId(testId).classList.contains(className);
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
  };
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
