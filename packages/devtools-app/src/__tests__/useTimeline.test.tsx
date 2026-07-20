import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import type { AppToInspector, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import { useTimeline } from "#/timeline/useTimeline";

test("pin reconstructs state at that seq; resume returns to follow", () => {
  const { history, log } = seeded();
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();

  act(() => {
    result.current.pin(1);
  });

  expect(result.current.selection).toEqual({ mode: "pinned", seq: 1 });
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
  const { history, log } = seeded();
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 3 });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 2 });

  act(() => {
    result.current.selectNext();
  });
  expect(result.current.selection).toEqual({ mode: "pinned", seq: 3 });
});

test("flags agedOut when the pinned seq precedes the retained window", () => {
  const history = new LiveHistory({ maxEvents: 2 });
  const frames = priceFrames(10);
  const store = new InspectorStore({ coalesce: false });

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  const log = store.getSnapshot().log;
  const { result } = renderHook(() => {
    return useTimeline(log, history);
  });

  act(() => {
    result.current.pin(1);
  });

  expect(result.current.agedOut).toBe(true);
  expect(result.current.pinnedState).toBeNull();
});

function priceFrames(count: number): AppToInspector[] {
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [], machines: [] },
  ];

  for (let seq = 1; seq <= count; seq += 1) {
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

  return frames;
}

interface Seeded {
  history: LiveHistory;
  log: readonly LogRow[];
}

function seeded(): Seeded {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(3)) {
    history.record(frame);
    store.apply(frame);
  }

  return { history, log: store.getSnapshot().log };
}
