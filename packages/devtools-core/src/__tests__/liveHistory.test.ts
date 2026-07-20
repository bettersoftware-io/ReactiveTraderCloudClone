import { describe, expect, it } from "vitest";

import type { InspectorState } from "../InspectorStore";
import { InspectorStore } from "../InspectorStore";
import { LiveHistory } from "../LiveHistory";
import type { AppToInspector } from "../protocol";

describe("LiveHistory", () => {
  it("stateAt(seq) equals a naive filtered fold, independent of checkpoints", () => {
    const history = new LiveHistory({ checkpointInterval: 5 });
    const frames = priceFrames(30);

    for (const frame of frames) {
      history.record(frame);
    }

    for (const seq of [1, 4, 5, 17, 30]) {
      expect(history.stateAt(seq).streams).toEqual(
        naiveFoldTo(frames, seq).streams,
      );
      expect(history.stateAt(seq).machines).toEqual(
        naiveFoldTo(frames, seq).machines,
      );
    }
  });

  it("clamps out-of-range seqs", () => {
    const history = new LiveHistory();
    const frames = priceFrames(5);

    for (const frame of frames) {
      history.record(frame);
    }

    expect(history.stateAt(999).streams).toEqual(
      naiveFoldTo(frames, 5).streams,
    );
    // Negative seqs clamp to oldestSeq (0 before any trim) — an empty-window fold.
    expect(history.stateAt(-1).streams).toEqual(naiveFoldTo(frames, 0).streams);
  });

  it("trims oldest frames past maxEvents, advancing oldestSeq, without changing stateAt for retained seqs", () => {
    const history = new LiveHistory({ maxEvents: 10, checkpointInterval: 3 });
    const frames = priceFrames(30);

    for (const frame of frames) {
      history.record(frame);
    }

    expect(history.oldestSeq).toBeGreaterThan(0);
    expect(history.eventCount).toBeLessThanOrEqual(10);
    expect(history.latestSeq).toBe(30);
    expect(history.stateAt(30).streams).toEqual(
      naiveFoldTo(frames, 30).streams,
    );
    expect(history.stateAt(history.oldestSeq + 1).streams).toEqual(
      naiveFoldTo(frames, history.oldestSeq + 1).streams,
    );
  });

  it("round-trips through toRecording/fromRecording", () => {
    const history = new LiveHistory({ maxEvents: 10 });

    for (const frame of priceFrames(30)) {
      history.record(frame);
    }

    const imported = LiveHistory.fromRecording(
      history.toRecording("app", 1000),
    );

    // toRecording()'s seed frame goes through projectSnapshot, which
    // intentionally resets emission counters/rate (same contract as
    // Recorder's snapshot — a recording starts a fresh session view, not
    // mid-stream). streamId/lastValue/lastSeq are the round-trippable
    // fields; totalEmissions/ratePerSec are expected to reset to the
    // retained-window's own count, not the full pre-export history.
    expect(imported.stateAt(30).streams.map(streamIdentity)).toEqual(
      history.stateAt(30).streams.map(streamIdentity),
    );
    expect(imported.stateAt(imported.latestSeq).machines).toEqual(
      history.stateAt(history.latestSeq).machines,
    );
  });

  it("tracks firstTs from the earliest retained batch event", () => {
    const history = new LiveHistory();

    expect(history.firstTs).toBeNull();

    for (const frame of priceFrames(3)) {
      history.record(frame);
    }

    expect(history.firstTs).toBe(1001);
  });

  it("recomputes firstTs after trimming ages out the original earliest event", () => {
    const history = new LiveHistory({ maxEvents: 5, checkpointInterval: 3 });

    for (const frame of priceFrames(20)) {
      history.record(frame);
    }

    // The original earliest event (seq 1, ts 1001) has aged out of the
    // retained window — firstTs must track the earliest event still
    // retained, not the first one ever seen.
    expect(history.firstTs).toBe(1000 + history.oldestSeq + 1);
  });
});

function priceFrames(count: number): AppToInspector[] {
  const frames: AppToInspector[] = [
    { kind: "welcome", v: 2, appId: "app" },
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
          streamId: `fx.price$[[${seq % 3}]]`,
          value: seq,
          coalesced: 1,
        },
      ],
    });
  }

  return frames;
}

function naiveFoldTo(
  frames: readonly AppToInspector[],
  seq: number,
): InspectorState {
  const store = new InspectorStore({ coalesce: false, trackLog: false });

  for (const frame of frames) {
    if (frame.kind !== "batch") {
      store.apply(frame);
    } else {
      store.apply({
        kind: "batch",
        events: frame.events.filter((e) => {
          return e.seq <= seq;
        }),
      });
    }
  }

  return store.getSnapshot();
}

interface StreamIdentity {
  streamId: string;
  lastValue: unknown;
  lastSeq: number;
}

function streamIdentity(row: StreamIdentity): StreamIdentity {
  return {
    streamId: row.streamId,
    lastValue: row.lastValue,
    lastSeq: row.lastSeq,
  };
}
