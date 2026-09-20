import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { createRowHighlightMachine } from "#/machines/rowHighlight";

describe("createRowHighlightMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a new row is true synchronously and flips to false at exactly BLOTTER_ROW_HIGHLIGHT_MS", async () => {
    const m = createRowHighlightMachine(true);
    const seen = collect(m.state$);
    expect(seen).toEqual([true]);
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS - 1);
    await settle();
    expect(seen).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(seen).toEqual([true, false]);
    m.dispose();
  });

  it("a row that is not new is false and stays false", async () => {
    const m = createRowHighlightMachine(false);
    const seen = collect(m.state$);
    expect(seen).toEqual([false]);
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS);
    await settle();
    expect(seen).toEqual([false]);
    m.dispose();
  });

  it("dispose() interrupts the sleep before it fires; a fresh subscription still yields true synchronously", async () => {
    const m = createRowHighlightMachine(true);
    const seen = collect(m.state$);
    m.dispose();
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS);
    await settle();
    expect(seen).toEqual([true]);
    expect(collect(m.state$)).toEqual([true]);
  });
});

function collect(stream: Stream<boolean>): boolean[] {
  const values: boolean[] = [];
  stream.subscribe((value: boolean) => {
    values.push(value);
  });
  return values;
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}
