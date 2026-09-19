import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { createRowHighlightMachine } from "#/machines/rowHighlight";

describe("createRowHighlightMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is true at once and false at exactly BLOTTER_ROW_HIGHLIGHT_MS", async () => {
    const m = createRowHighlightMachine(true);
    const seen: boolean[] = [];
    const sub = m.state$.subscribe((value) => {
      seen.push(value);
    });
    expect(seen).toEqual([true]);
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS - 1);
    expect(seen).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([true, false]);
    sub.unsubscribe();
    m.dispose();
  });

  it("a row that is not new stays false and starts no timer", async () => {
    const m = createRowHighlightMachine(false);
    const seen: boolean[] = [];
    const sub = m.state$.subscribe((value) => {
      seen.push(value);
    });
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS);
    expect(seen).toEqual([false]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() before the timer keeps the value true", async () => {
    const m = createRowHighlightMachine(true);
    const sub = m.state$.subscribe(() => {});
    sub.unsubscribe();
    m.dispose();
    await vi.advanceTimersByTimeAsync(BLOTTER_ROW_HIGHLIGHT_MS);
    const fresh: boolean[] = [];
    m.state$
      .subscribe((value) => {
        fresh.push(value);
      })
      .unsubscribe();
    expect(fresh).toEqual([true]);
  });
});
