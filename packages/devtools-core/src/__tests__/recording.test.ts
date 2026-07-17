import { describe, expect, it } from "vitest";

import type { AppToInspector } from "../protocol";
import {
  parseRecording,
  RECORDING_VERSION,
  type Recording,
  serializeRecording,
} from "../recording";

function sampleRecording(): Recording {
  const frames: AppToInspector[] = [
    {
      kind: "snapshot",
      streams: [{ streamId: "s.a$", value: 1 }],
      machines: [],
    },
    {
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "s.a$",
          value: 2,
          coalesced: 1,
          seq: 1,
          ts: 10,
        },
      ],
    },
  ];

  return { version: RECORDING_VERSION, appId: "a", startedAt: 42, frames };
}

describe("Recording serialize/parse", () => {
  it("round-trips serialize -> parse to an identical recording", () => {
    const rec = sampleRecording();
    expect(parseRecording(serializeRecording(rec))).toEqual(rec);
  });

  it("rejects non-JSON input with a clear error", () => {
    expect(() => parseRecording("not json")).toThrow(/Invalid recording JSON/);
  });

  it("rejects an unsupported recording version", () => {
    const json = JSON.stringify({
      version: 999,
      appId: "a",
      startedAt: 0,
      frames: [],
    });
    expect(() => parseRecording(json)).toThrow(/Unsupported recording version/);
  });

  it("rejects a malformed shape", () => {
    const json = JSON.stringify({ version: RECORDING_VERSION });
    expect(() => parseRecording(json)).toThrow(/appId must be a string/);
  });
});
