import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { useTimeline } from "#/timeline/useTimeline";

test("pin captures the row and reconstructs state at that seq; resume returns to follow", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();

  act(() => {
    result.current.pin(rowAt(log, 1));
  });

  expect(result.current.selection.mode).toBe("pinned");
  expect(result.current.selectedRow?.seq).toBe(1);
  const pinnedRow = result.current.pinnedState?.streams.find((s) => {
    return s.streamId === "fx.price$";
  });
  expect(pinnedRow?.lastValue).toBe(1);

  act(() => {
    result.current.resume();
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();
});

test("selectPrev from follow pins the last row; selectNext walks forward", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selectedRow?.seq).toBe(3);

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selectedRow?.seq).toBe(2);

  act(() => {
    result.current.selectNext();
  });
  expect(result.current.selectedRow?.seq).toBe(3);
});

test("flags agedOut when the pinned seq precedes the retained window", () => {
  const history = new LiveHistory({ maxEvents: 2 });
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(10)) {
    history.record(frame);
    store.apply(frame);
  }

  const present = store.getSnapshot();
  const { result } = renderHook(() => {
    return useTimeline(present.log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.pin(rowAt(present.log, 1));
  });

  expect(result.current.agedOut).toBe(true);
  expect(result.current.pinnedState).toBeNull();
});

test("a pinned row survives leaving the log: selectedRow stays, pinnedRowEvicted flips", () => {
  const { history, log, present } = seeded(3);
  const { result, rerender } = renderHook(
    ({ rows }: RowsProps) => {
      return useTimeline(rows, history, ALL_SCOPE, present);
    },
    { initialProps: { rows: log } },
  );

  act(() => {
    result.current.pin(rowAt(log, 1));
  });
  expect(result.current.pinnedRowEvicted).toBe(false);

  // The store's LOG_CAP evicts oldest rows; simulate by handing the hook a
  // log that no longer contains seq 1.
  rerender({ rows: log.slice(1) });

  expect(result.current.selectedRow?.seq).toBe(1);
  expect(result.current.pinnedRowEvicted).toBe(true);
});

test("scope narrows rows; switching scope keeps the pin and flags it hidden", () => {
  const { history, log, present } = seeded(3, "blotter.trades$");
  const blotter: Scope = { kind: "presenter", presenter: "blotter" };
  const { result, rerender } = renderHook(
    ({ scope }: ScopeProps) => {
      return useTimeline(log, history, scope, present);
    },
    { initialProps: { scope: ALL_SCOPE } },
  );

  expect(result.current.rows.length).toBe(6);

  rerender({ scope: blotter });
  expect(
    result.current.rows.every((row) => {
      return row.summary.startsWith("blotter.");
    }),
  ).toBe(true);
  expect(result.current.rows.length).toBe(3);

  act(() => {
    result.current.pin(result.current.rows[0] as LogRow);
  });
  expect(result.current.pinnedRowHidden).toBe(false);

  rerender({ scope: { kind: "stream", streamId: "fx.price$" } });
  expect(result.current.selection.mode).toBe("pinned");
  expect(result.current.pinnedRowHidden).toBe(true);
});

test("clear hides everything at or before the latest seq, resumes, and unclear restores", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.pin(rowAt(log, 2));
  });
  act(() => {
    result.current.clear();
  });

  expect(result.current.filter.clearedBeforeSeq).toBe(3);
  expect(result.current.rows).toEqual([]);
  expect(result.current.selection).toEqual({ mode: "follow" });

  act(() => {
    result.current.unclear();
  });

  expect(result.current.filter.clearedBeforeSeq).toBe(0);
  expect(result.current.rows.length).toBe(3);
});

test("a moment pinned before a later clear is flagged pinnedBeforeClear", () => {
  const { history, log, present } = seeded(3);
  const { result, rerender } = renderHook(
    ({ rows }: RowsProps) => {
      return useTimeline(rows, history, ALL_SCOPE, present);
    },
    { initialProps: { rows: log.slice(0, 2) as readonly LogRow[] } },
  );

  act(() => {
    result.current.clear();
  });
  rerender({ rows: log });

  act(() => {
    result.current.pin(rowAt(log, 3));
  });
  expect(result.current.pinnedBeforeClear).toBe(false);

  act(() => {
    result.current.pin(rowAt(log, 1));
  });
  expect(result.current.pinnedBeforeClear).toBe(true);
});

test("tail attachment: detach sticks; resume re-attaches", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  expect(result.current.tailAttached).toBe(true);

  act(() => {
    result.current.setTailAttached(false);
  });
  expect(result.current.tailAttached).toBe(false);

  act(() => {
    result.current.resume();
  });
  expect(result.current.tailAttached).toBe(true);
});

test("an empty timeline has nothing to clear and nowhere to step", () => {
  const { history, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(EMPTY_LOG, history, ALL_SCOPE, present);
  });

  expect(result.current.rows).toEqual([]);

  act(() => {
    result.current.clear();
    result.current.selectPrev();
    result.current.selectNext();
  });

  expect(result.current.filter.clearedBeforeSeq).toBe(0);
  expect(result.current.selection).toEqual({ mode: "follow" });
});

test("stepping while the pin sits outside the scope jumps to that scope's tail", () => {
  const { history, log, present } = seeded(3, "blotter.trades$");
  const { result, rerender } = renderHook(
    ({ scope }: ScopeProps) => {
      return useTimeline(log, history, scope, present);
    },
    { initialProps: { scope: ALL_SCOPE } },
  );

  act(() => {
    result.current.pin(rowAt(log, 1));
  });

  rerender({ scope: { kind: "presenter", presenter: "blotter" } });
  expect(result.current.pinnedRowHidden).toBe(true);

  act(() => {
    result.current.selectNext();
  });

  const tail = result.current.rows[result.current.rows.length - 1];

  expect(result.current.selection.mode).toBe("pinned");
  expect(result.current.selectedRow?.seq).toBe(tail?.seq);
});

test("a reconstruction that throws surfaces as reconstructError, not a crash", () => {
  const { history, log, present } = seeded(3);

  history.stateAt = (): never => {
    throw new Error("history is corrupt");
  };

  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.pin(rowAt(log, 2));
  });

  expect(result.current.pinnedState).toBeNull();
  expect(result.current.reconstructError).toContain("history is corrupt");
});

const EMPTY_LOG: readonly LogRow[] = [];

interface RowsProps {
  rows: readonly LogRow[];
}

interface ScopeProps {
  scope: Scope;
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

function priceFrames(count: number, extraStreamId?: string): AppToInspector[] {
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [], machines: [] },
  ];
  let seq = 0;

  for (let i = 1; i <= count; i += 1) {
    seq += 1;
    frames.push({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          seq,
          ts: 1000 + seq,
          streamId: "fx.price$",
          value: i,
          coalesced: 1,
        },
      ],
    });

    if (extraStreamId !== undefined) {
      seq += 1;
      frames.push({
        kind: "batch",
        events: [
          {
            kind: "stream:emission",
            seq,
            ts: 1000 + seq,
            streamId: extraStreamId,
            value: i,
            coalesced: 1,
          },
        ],
      });
    }
  }

  return frames;
}

interface Seeded {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

function seeded(count: number, extraStreamId?: string): Seeded {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(count, extraStreamId)) {
    history.record(frame);
    store.apply(frame);
  }

  const present = store.getSnapshot();

  return { history, log: present.log, present };
}
