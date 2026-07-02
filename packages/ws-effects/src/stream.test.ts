import { map } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { out } from "#/operators";
import { stream } from "#/stream";
import type { Inbound, Outbound } from "#/types";

describe("stream", () => {
  let scheduler: TestScheduler;
  beforeEach(() => {
    scheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it("projects each matching inbound into its outbound stream", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      // project: for a subscribe.pricing message, emit two ticks then keep going
      const ticks$ = cold("x-y|", { x: out("tick", 1), y: out("tick", 2) });
      const effect = stream<unknown>("subscribe.pricing", () => {
        return ticks$;
      });

      const in$ = hot("  a---", {
        a: { type: "subscribe.pricing" } as Inbound,
      });
      const expected = " x-y";
      expectObservable(effect(in$, undefined)).toBe(expected, {
        x: out("tick", 1) as Outbound,
        y: out("tick", 2) as Outbound,
      });
    });
  });

  it("keeps each matching inbound's inner stream alive concurrently (mergeMap, not switch/concat)", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      // Each inner emits over several frames; the two inbounds overlap in time.
      // mergeMap interleaves both inners → "ab-ab".
      // switchMap would cancel `a`'s inner when `b` arrives → "ab--b".
      // concatMap would defer `b`'s inner until `a`'s completes → "a--ab--b".
      const effect = stream<unknown>("subscribe.pricing", (payload) => {
        return cold("x--x|", { x: out("tick", payload) });
      });

      const in$ = hot("ab", {
        a: { type: "subscribe.pricing", payload: "a" } as Inbound,
        b: { type: "subscribe.pricing", payload: "b" } as Inbound,
      });
      const expected = "ab-ab";
      expectObservable(effect(in$, undefined)).toBe(expected, {
        a: out("tick", "a") as Outbound,
        b: out("tick", "b") as Outbound,
      });
    });
  });

  it("ignores non-matching inbound", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      const effect = stream<unknown>("subscribe.pricing", () => {
        return cold("x|", { x: out("tick", 1) });
      });
      const in$ = hot("b|", { b: { type: "subscribe.other" } as Inbound });
      expectObservable(
        effect(in$, undefined).pipe(
          map((m) => {
            return m;
          }),
        ),
      ).toBe("-|");
    });
  });
});
