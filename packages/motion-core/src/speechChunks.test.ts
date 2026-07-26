import { describe, expect, it } from "vitest";

import { SPEECH_CHUNK_INTERVAL_MS, speechChunks } from "./speechChunks";

describe("speechChunks", () => {
  it("splits text into 2-4 char chunks that reassemble exactly", () => {
    const text = "EURUSD is trading at 1.0842, up 12 pips since the open.";
    const chunks = speechChunks(text);
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThanOrEqual(1); // final chunk may be short
      expect(c.length).toBeLessThanOrEqual(4);
    }
  });

  it("is deterministic (same input, same chunks)", () => {
    expect(speechChunks("hello world")).toEqual(speechChunks("hello world"));
  });

  it("handles empty and single-char strings", () => {
    expect(speechChunks("")).toEqual([]);
    expect(speechChunks("a")).toEqual(["a"]);
  });

  it("exports the cadence constant", () => {
    expect(SPEECH_CHUNK_INTERVAL_MS).toBe(26);
  });
});
