import { describe, expect, it } from "vitest";

import type { CoreHostState } from "#/coreHost";
import { CORE_OPTIONS } from "#/coreSelection";
import { coreSwapOf } from "#/coreSwapView";

describe("coreSwapOf", () => {
  it.each(["covering", "loading", "handover", "revealing"] as const)(
    "%s → the swap, with both cores' options",
    (phase) => {
      const state: CoreHostState = { phase, from: "rxjs", to: "effect" };

      expect(coreSwapOf(state, CORE_OPTIONS)).toEqual({
        from: CORE_OPTIONS[0],
        to: CORE_OPTIONS[2],
        phase,
      });
    },
  );

  it("running → null: no swap is under way", () => {
    const state: CoreHostState = { phase: "running", impl: "async" };

    expect(coreSwapOf(state, CORE_OPTIONS)).toBeNull();
  });

  it("fatal → null: nothing may cover the boot-error screen", () => {
    expect(coreSwapOf({ phase: "fatal" }, CORE_OPTIONS)).toBeNull();
  });

  it("a core with no option is named by its impl", () => {
    const state: CoreHostState = {
      phase: "loading",
      from: "rxjs",
      to: "async",
    };

    expect(coreSwapOf(state, [CORE_OPTIONS[0]])?.to).toEqual({
      impl: "async",
      label: "async",
      description: "",
    });
  });
});
