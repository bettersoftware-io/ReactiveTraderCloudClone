import { state } from "@rx-state/core";
import { of } from "rxjs";
import { describe, expectTypeOf, it } from "vitest";

import type { StateStream, Stream } from "#/stream";

describe("envelope aliases", () => {
  it("Stream<T> is assignable from an rxjs Observable", () => {
    const s: Stream<number> = of(1);
    expectTypeOf(s).toEqualTypeOf<Stream<number>>();
  });

  it("StateStream<S> is assignable from a defaulted state()", () => {
    const s: StateStream<number> = state(of(1), 0);
    expectTypeOf(s).toEqualTypeOf<StateStream<number>>();
  });
});
