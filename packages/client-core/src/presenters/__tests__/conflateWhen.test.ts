import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { conflateWhen } from "../conflateWhen";

describe("conflateWhen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes every emission through while the flag is off", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(false);
    source$.next(1);
    source$.next(2);
    source$.next(3);
    expect(seen).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });

  it("throttles leading+trailing while the flag is on", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(true);
    source$.next(1); // leading — emitted immediately
    source$.next(2);
    source$.next(3); // conflated; 3 is the trailing value
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual([1, 3]);
    sub.unsubscribe();
  });

  it("switches live when the flag flips", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(true);
    source$.next(1);
    flag$.next(false); // conflation off — passthrough resumes
    source$.next(2);
    source$.next(3);
    expect(seen).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });
});
