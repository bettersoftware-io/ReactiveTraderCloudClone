import { defer, finalize, Subject, shareReplay } from "rxjs";
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
    const sub = source$.pipe(conflateWhen(flag$, 250)).subscribe((v) => {
      return seen.push(v);
    });
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
    const sub = source$.pipe(conflateWhen(flag$, 250)).subscribe((v) => {
      return seen.push(v);
    });
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
    const sub = source$.pipe(conflateWhen(flag$, 250)).subscribe((v) => {
      return seen.push(v);
    });
    flag$.next(true);
    source$.next(1);
    flag$.next(false); // conflation off — passthrough resumes
    source$.next(2);
    source$.next(3);
    expect(seen).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });

  it("does not resubscribe the upstream source when the flag flips (single-consumer shareReplay stays alive)", () => {
    let subscribeCount = 0;
    let teardownCount = 0;
    const innerSource$ = new Subject<number>();
    // Mirrors how the price presenters feed conflateWhen: a use-case stream
    // multicast with a single-consumer refCount shareReplay. `finalize` on
    // the defer'd observable is the teardown/finalize spy — it fires exactly
    // when the shareReplay's internal subscription to the source actually
    // ends, whether that's from a real final unsubscribe or (in the buggy
    // implementation) a spurious flag-flip resubscribe.
    const source$ = defer(() => {
      subscribeCount += 1;
      return innerSource$.pipe(
        finalize(() => {
          teardownCount += 1;
        }),
      );
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const flag$ = new Subject<boolean>();
    const seen: number[] = [];
    const sub = source$
      .pipe(
        conflateWhen(flag$, 250),
        shareReplay({ bufferSize: 1, refCount: true }),
      )
      .subscribe((v) => {
        return seen.push(v);
      });

    flag$.next(false);
    innerSource$.next(1);
    expect(subscribeCount).toBe(1);
    expect(teardownCount).toBe(0);

    // Flip the flag while subscribed — switchMap unsubscribes the current
    // inner and subscribes the next one synchronously. With the fix, the
    // shared source's refCount reset is deferred and cancelled by the
    // synchronous resubscribe, so the underlying use case is never torn
    // down. Against the old implementation this assertion fails: the
    // synchronous unsub->resub drops refCount to zero and back up,
    // immediately tearing down and recreating the source subscription
    // (subscribeCount would go 1 -> 2, teardownCount 0 -> 1).
    flag$.next(true);
    innerSource$.next(2);
    flag$.next(false);
    innerSource$.next(3);
    flag$.next(true);
    innerSource$.next(4);

    expect(subscribeCount).toBe(1);
    expect(teardownCount).toBe(0);
    expect(seen).toEqual([1, 2, 3, 4]);

    // A genuine final unsubscribe must still tear the shared source down —
    // this is not a leak, just a deferred reset. Immediately after
    // unsubscribing, the reset is still pending (deferred via timer(0)).
    sub.unsubscribe();
    expect(teardownCount).toBe(0);
    vi.advanceTimersByTime(0);
    expect(teardownCount).toBe(1);
  });
});
