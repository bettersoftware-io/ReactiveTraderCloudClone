import { describe, expect, it } from "vitest";

import type { InspectorState } from "../InspectorStore";
import { InspectorStore } from "../InspectorStore";
import type { AppToInspector, DevtoolsEvent } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";
import { Recorder } from "../Recorder";
import { RECORDING_VERSION } from "../recording";

describe("Recorder", () => {
  it("seeds frame 0 with a snapshot from live state and appends frames in order", () => {
    const recorder = new Recorder();
    recorder.start(seededState(), 1000);
    expect(recorder.recording).toBe(true);

    recorder.capture(batch(1));
    recorder.capture(batch(2));
    recorder.stop();
    expect(recorder.recording).toBe(false);

    const rec = recorder.toRecording();
    expect(rec.version).toBe(RECORDING_VERSION);
    expect(rec.appId).toBe("rtc");
    expect(rec.startedAt).toBe(1000);
    expect(rec.frames).toHaveLength(3);
    expect(rec.frames[0]?.kind).toBe("snapshot");
    expect(rec.frames[1]?.kind).toBe("batch");
    expect(rec.frames[2]?.kind).toBe("batch");
  });

  it("carries the seed snapshot's streams into frame 0", () => {
    const recorder = new Recorder();
    recorder.start(seededState(), 0);
    const frame0 = recorder.toRecording().frames[0];

    expect(frame0).toEqual({
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 1 }],
      machines: [],
    });
  });

  it("bounds the buffer and logs each dropped frame (no silent truncation)", () => {
    const logs: string[] = [];
    const recorder = new Recorder({
      maxFrames: 2,
      log: (message: string) => {
        logs.push(message);
      },
    });

    recorder.start(seededState(), 0); // frame 0 = snapshot -> length 1
    recorder.capture(batch(1)); // length 2
    recorder.capture(batch(2)); // length 3 > 2 -> drop oldest -> 2
    recorder.capture(batch(3)); // length 3 > 2 -> drop oldest -> 2

    expect(recorder.frameCount).toBe(2);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(/dropped oldest frame/);
  });

  it("capture is a no-op when not recording; toRecording throws with nothing captured", () => {
    const recorder = new Recorder();
    recorder.capture(batch(1)); // ignored — never started
    expect(() => {
      return recorder.toRecording();
    }).toThrow(/nothing recorded/);
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

function batch(seq: number): AppToInspector {
  return { kind: "batch", events: [emission("s.a$", seq, seq, seq * 10)] };
}

function seededState(): InspectorState {
  const store = new InspectorStore({ coalesce: false });
  store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc" });
  store.apply({
    kind: "snapshot",
    streams: [{ streamId: "s.a$", value: 1 }],
    machines: [],
  });

  return store.getSnapshot();
}
