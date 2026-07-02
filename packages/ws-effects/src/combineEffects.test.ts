import { map, type Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { combineEffects } from "#/combineEffects";
import { matchType, out } from "#/operators";
import type { Inbound, Outbound } from "#/types";

describe("combineEffects", () => {
  it("merges outputs of all effects over one inbound stream", () => {
    // A hot Subject (not a cold `of(...)`) so each effect's independent
    // subscription observes the same live emissions in the same order —
    // this is what a real shared inbound stream (e.g. a socket's
    // `messages$`) behaves like, and is what `merge` actually interleaves.
    const in$ = new Subject<Inbound>();
    const combined = combineEffects(echoA, echoB);
    const outs: Outbound[] = [];
    combined(in$, undefined).subscribe((frame) => {
      outs.push(frame);
    });

    in$.next({ type: "a" });
    in$.next({ type: "b" });
    in$.next({ type: "a" });
    in$.complete();

    expect(outs).toEqual([{ type: "A" }, { type: "B" }, { type: "A" }]);
  });
});

function echoA(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("a"),
    map(() => {
      return out("A");
    }),
  );
}

function echoB(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("b"),
    map(() => {
      return out("B");
    }),
  );
}
