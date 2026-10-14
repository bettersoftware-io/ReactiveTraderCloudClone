import { describe, expectTypeOf, it } from "vitest";

import type { AccountAccessState } from "#/index";

describe("AccountAccessState contract", () => {
  it("names no secret: across every phase its keys are exactly these", () => {
    // The machine holds the chosen password in its closure and sends the
    // code straight to the port (spec §5.3). A `password` or `code` key on
    // any phase would put a secret in every emission, and into whatever
    // records them.
    expectTypeOf<KeysOfEachPhase<AccountAccessState>>().toEqualTypeOf<
      "phase" | "busy" | "error" | "flow" | "email" | "passwordHeld" | "resent"
    >();
  });
});

/** The union of every member's keys (plain `keyof` of a union yields only
 * the keys all members share). */
type KeysOfEachPhase<T> = T extends unknown ? keyof T : never;
