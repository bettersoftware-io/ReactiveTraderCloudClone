import { expect, test } from "vitest";

import type {
  AppToInspector,
  InspectorState,
  LogRow,
} from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { mountTimeline } from "#tests/pages/UseTimelinePage";

test("pin captures the row and reconstructs state at that seq; resume returns to follow", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  expect(tl.state.selection).toEqual({ mode: "follow" });
  expect(tl.state.pinnedState).toBeNull();

  tl.pin(rowAt(log, 1));

  expect(tl.state.selection.mode).toBe("pinned");
  expect(tl.state.selectedRow?.seq).toBe(1);
  const pinnedRow = tl.state.pinnedState?.streams.find((s) => {
    return s.streamId === "fx.price$";
  });
  expect(pinnedRow?.lastValue).toBe(1);

  tl.resume();

  expect(tl.state.selection).toEqual({ mode: "follow" });
  expect(tl.state.pinnedState).toBeNull();
});

test("selectPrev from follow pins the last row; selectNext walks forward", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  tl.selectPrev();
  expect(tl.state.selectedRow?.seq).toBe(3);

  tl.selectPrev();
  expect(tl.state.selectedRow?.seq).toBe(2);

  tl.selectNext();
  expect(tl.state.selectedRow?.seq).toBe(3);
});

test("flags agedOut when the pinned seq precedes the retained window", () => {
  const history = new LiveHistory({ maxEvents: 2 });
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(10)) {
    history.record(frame);
    store.apply(frame);
  }

  const present = store.getSnapshot();
  const tl = mountTimeline({
    log: present.log,
    history,
    scope: ALL_SCOPE,
    present,
  });

  tl.pin(rowAt(present.log, 1));

  expect(tl.state.agedOut).toBe(true);
  expect(tl.state.pinnedState).toBeNull();
});

test("a pinned row survives leaving the log: selectedRow stays, pinnedRowEvicted flips", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  tl.pin(rowAt(log, 1));
  expect(tl.state.pinnedRowEvicted).toBe(false);

  // The store's LOG_CAP evicts oldest rows; simulate by handing the hook a
  // log that no longer contains seq 1.
  tl.rerenderWithRows(log.slice(1));

  expect(tl.state.selectedRow?.seq).toBe(1);
  expect(tl.state.pinnedRowEvicted).toBe(true);
});

test("scope narrows rows; switching scope keeps the pin and flags it hidden", () => {
  const { history, log, present } = seeded(3, "blotter.trades$");
  const blotter: Scope = { kind: "presenter", presenter: "blotter" };
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  expect(tl.state.rows.length).toBe(6);

  tl.rerenderWithScope(blotter);
  expect(
    tl.state.rows.every((row) => {
      return row.summary.startsWith("blotter.");
    }),
  ).toBe(true);
  expect(tl.state.rows.length).toBe(3);

  tl.pin(tl.state.rows[0] as LogRow);
  expect(tl.state.pinnedRowHidden).toBe(false);

  tl.rerenderWithScope({ kind: "stream", streamId: "fx.price$" });
  expect(tl.state.selection.mode).toBe("pinned");
  expect(tl.state.pinnedRowHidden).toBe(true);
});

test("clear hides everything at or before the latest seq, resumes, and unclear restores", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  tl.pin(rowAt(log, 2));
  tl.clear();

  expect(tl.state.filter.clearedBeforeSeq).toBe(3);
  expect(tl.state.rows).toEqual([]);
  expect(tl.state.selection).toEqual({ mode: "follow" });

  tl.unclear();

  expect(tl.state.filter.clearedBeforeSeq).toBe(0);
  expect(tl.state.rows.length).toBe(3);
});

test("a moment pinned before a later clear is flagged pinnedBeforeClear", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({
    log: log.slice(0, 2),
    history,
    scope: ALL_SCOPE,
    present,
  });

  tl.clear();
  tl.rerenderWithRows(log);

  tl.pin(rowAt(log, 3));
  expect(tl.state.pinnedBeforeClear).toBe(false);

  tl.pin(rowAt(log, 1));
  expect(tl.state.pinnedBeforeClear).toBe(true);
});

test("tail attachment: detach sticks; resume re-attaches", () => {
  const { history, log, present } = seeded(3);
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  expect(tl.state.tailAttached).toBe(true);

  tl.setTailAttached(false);
  expect(tl.state.tailAttached).toBe(false);

  tl.resume();
  expect(tl.state.tailAttached).toBe(true);
});

test("an empty timeline has nothing to clear and nowhere to step", () => {
  const { history, present } = seeded(3);
  const tl = mountTimeline({
    log: EMPTY_LOG,
    history,
    scope: ALL_SCOPE,
    present,
  });

  expect(tl.state.rows).toEqual([]);

  tl.clear();
  tl.selectPrev();
  tl.selectNext();

  expect(tl.state.filter.clearedBeforeSeq).toBe(0);
  expect(tl.state.selection).toEqual({ mode: "follow" });
});

test("stepping while the pin sits outside the scope jumps to that scope's tail", () => {
  const { history, log, present } = seeded(3, "blotter.trades$");
  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  tl.pin(rowAt(log, 1));

  tl.rerenderWithScope({ kind: "presenter", presenter: "blotter" });
  expect(tl.state.pinnedRowHidden).toBe(true);

  tl.selectNext();

  const tail = tl.state.rows[tl.state.rows.length - 1];

  expect(tl.state.selection.mode).toBe("pinned");
  expect(tl.state.selectedRow?.seq).toBe(tail?.seq);
});

test("a reconstruction that throws surfaces as reconstructError, not a crash", () => {
  const { history, log, present } = seeded(3);

  history.stateAt = (): never => {
    throw new Error("history is corrupt");
  };

  const tl = mountTimeline({ log, history, scope: ALL_SCOPE, present });

  tl.pin(rowAt(log, 2));

  expect(tl.state.pinnedState).toBeNull();
  expect(tl.state.reconstructError).toContain("history is corrupt");
});

const EMPTY_LOG: readonly LogRow[] = [];

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
