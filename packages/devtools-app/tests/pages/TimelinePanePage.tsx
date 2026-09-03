import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

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

interface TimelinePaneHandle {
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

export interface TimelinePanePage {
  mount(rowCount?: number, onDismissRadius?: () => void): TimelinePaneHandle;
  unmountAll(): void;
  rowCount(): number;
  rowSeq(index: number): string | null;
  exists(testId: string): boolean;
  text(testId: string): string;
  attr(testId: string, name: string): string | null;
  hasText(text: string): boolean;
  textCount(text: string): number;
  element(testId: string): HTMLElement;
  firstChildOf(testId: string): HTMLElement;
  hasSeqInList(testId: string, seq: string): boolean;
  click(testId: string): void;
  clickPinButtonOfRow(index: number): void;
  clickText(text: string): void;
  clickTitled(title: string, index?: number): void;
  changeSearch(placeholder: string, value: string): void;
  scroll(testId: string): void;
}

/** The framework surface for `TimelinePane.test.tsx`. */
export function timelinePanePage(): TimelinePanePage {
  return {
    /** `rowCount` seeds rows 1..rowCount directly into the store/history
     * before the first render — not via `handle.append()`'s one-act()-per-row,
     * which would make a many-hundred-row seed (needed to exercise the
     * >500-row render window) slow to set up. `onDismissRadius` defaults to
     * a no-op so every existing caller is unaffected; pass a spy to assert
     * the chip wires to it. */
    mount(
      rowCount = 3,
      onDismissRadius: () => void = () => {},
    ): TimelinePaneHandle {
      const handle: TimelinePaneHandle = {
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

        // The caller invokes these from outside React's render cycle (a
        // test harness, not an event handler), so each update needs an
        // explicit `act()` to flush synchronously — react-dom's createRoot
        // otherwise defers the re-render past the assertion that
        // immediately follows.
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
            model.setRadiusAround(state.log[0] as LogRow);
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
    },
    unmountAll(): void {
      cleanup();
    },

    // Queries
    rowCount(): number {
      return screen.queryAllByTestId("timeline-row").length;
    },
    rowSeq(index: number): string | null {
      return (
        screen.getAllByTestId("timeline-row")[index] as HTMLElement
      ).getAttribute("data-seq");
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    attr(testId: string, name: string): string | null {
      return screen.getByTestId(testId).getAttribute(name);
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    textCount(text: string): number {
      return screen.queryAllByText(text).length;
    },
    element(testId: string): HTMLElement {
      return screen.getByTestId(testId);
    },
    firstChildOf(testId: string): HTMLElement {
      return screen.getByTestId(testId).children[0] as HTMLElement;
    },
    hasSeqInList(testId: string, seq: string): boolean {
      return (
        screen.getByTestId(testId).querySelector(`[data-seq="${seq}"]`) != null
      );
    },

    // Actions
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    clickPinButtonOfRow(index: number): void {
      const row = screen.getAllByTestId("timeline-row")[index] as HTMLElement;
      const button = row.querySelector("button") as HTMLElement;

      fireEvent.click(button);
    },
    clickText(text: string): void {
      fireEvent.click(screen.getByText(text));
    },
    clickTitled(title: string, index = 0): void {
      fireEvent.click(screen.getAllByTitle(title)[index] as HTMLElement);
    },
    changeSearch(placeholder: string, value: string): void {
      fireEvent.change(screen.getByPlaceholderText(placeholder), {
        target: { value },
      });
    },
    scroll(testId: string): void {
      fireEvent.scroll(screen.getByTestId(testId));
    },
  };
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
