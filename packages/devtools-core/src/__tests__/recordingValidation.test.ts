import { describe, expect, it } from "vitest";

import { parseRecording, RECORDING_VERSION } from "../recording";

// parseRecording is the trust boundary for a file the user picked off disk.
// Each guard below is the only thing standing between a malformed recording and
// a replay that fails much later, somewhere unrelated, with a confusing error.

describe("parseRecording — rejects malformed input at the boundary", () => {
  it("rejects JSON that parses to something other than an object", () => {
    expect(() => {
      return parseRecording("42");
    }).toThrow(/expected an object/);
  });

  it("rejects null, which is typeof object", () => {
    // The guard is `typeof parsed !== "object" || parsed === null` — drop the
    // second half and this input sails through into property reads.
    expect(() => {
      return parseRecording("null");
    }).toThrow(/expected an object/);
  });

  it("rejects a non-numeric startedAt", () => {
    expect(() => {
      return parseRecording(
        JSON.stringify({
          version: RECORDING_VERSION,
          appId: "rtc",
          startedAt: "yesterday",
          frames: [],
        }),
      );
    }).toThrow(/startedAt must be a number/);
  });

  it("rejects frames that are not an array", () => {
    expect(() => {
      return parseRecording(
        JSON.stringify({
          version: RECORDING_VERSION,
          appId: "rtc",
          startedAt: 0,
          frames: { 0: "not-an-array" },
        }),
      );
    }).toThrow(/frames must be an array/);
  });

  it("accepts a well-formed recording", () => {
    const parsed = parseRecording(
      JSON.stringify({
        version: RECORDING_VERSION,
        appId: "rtc",
        startedAt: 123,
        frames: [],
      }),
    );

    expect(parsed.startedAt).toBe(123);
    expect(parsed.frames).toEqual([]);
  });
});
