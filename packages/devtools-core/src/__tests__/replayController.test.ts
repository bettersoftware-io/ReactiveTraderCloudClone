import { describe, expect, it } from "vitest";

import type { InspectorState } from "../InspectorStore";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, DevtoolsEvent } from "../protocol";
import { ReplayController } from "../ReplayController";
import type { Recording } from "../recording";
import { RECORDING_VERSION } from "../recording";

describe("ReplayController", () => {
  it("length reflects the number of frames", () => {
    expect(new ReplayController(buildRecording(10)).length).toBe(11);
  });

  it("stateAt(k) equals a naive fold of frames[0..k], independent of checkpoints", () => {
    const rec = buildRecording(30);
    const replay = new ReplayController(rec, { checkpointInterval: 5 });

    for (const k of [0, 1, 7, 12, 23, 30]) {
      expect(replay.stateAt(k)).toEqual(naiveFold(rec.frames, k));
    }
  });

  it("clamps out-of-range indices", () => {
    const rec = buildRecording(4);
    const replay = new ReplayController(rec);

    expect(replay.stateAt(999)).toEqual(naiveFold(rec.frames, 4));
    expect(replay.stateAt(-5)).toEqual(naiveFold(rec.frames, 0));
  });

  it("folds at most checkpointInterval frames per query (checkpointed, not from 0)", () => {
    const rec = buildRecording(1000);
    const replay = new ReplayController(rec, { checkpointInterval: 50 });

    replay.stateAt(1000);
    replay.stateAt(998); // backward jump

    // A from-0 fold would be 998; from the nearest checkpoint it is <= 50.
    expect(replay.lastFoldCount).toBeLessThanOrEqual(50);
  });

  it("tsAt returns the latest captured event ts up to the frame", () => {
    const replay = new ReplayController(buildRecording(5));

    expect(replay.tsAt(0)).toBe(0); // seed snapshot only -> startedAt
    expect(replay.tsAt(3)).toBe(30); // frame 3 = emission ts 30
  });
});

function emission(
  streamId: string,
  value: number,
  seq: number,
  ts: number,
): DevtoolsEvent {
  return { kind: "stream:emission", streamId, value, coalesced: 1, seq, ts };
}

/** A recording whose frame 0 is a seed snapshot and frames 1..n are one
 * emission each (value === seq === i, ts === i*10). */
function buildRecording(n: number): Recording {
  const frames: AppToInspector[] = [
    {
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 0 }],
      machines: [],
    },
  ];

  for (let i = 1; i <= n; i += 1) {
    frames.push({ kind: "batch", events: [emission("s.a$", i, i, i * 10)] });
  }

  return { version: RECORDING_VERSION, appId: "r", startedAt: 0, frames };
}

/** The reference: fold frames[0..k] through a fresh, plain InspectorStore. */
function naiveFold(
  frames: readonly AppToInspector[],
  k: number,
): InspectorState {
  const store = new InspectorStore();

  for (const frame of frames.slice(0, k + 1)) {
    store.apply(frame);
  }

  return store.getSnapshot();
}
