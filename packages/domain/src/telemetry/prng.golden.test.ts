import { describe, expect, it } from "vitest";

import { mulberry32 } from "./prng.js";

describe("mulberry32", () => {
  it("is deterministic for a fixed seed (golden sequence)", () => {
    const rand = mulberry32(42);
    const seq = [rand(), rand(), rand(), rand()].map((n) =>
      Number(n.toFixed(6)),
    );
    expect(seq).toEqual([0.601104, 0.448291, 0.852466, 0.669734]);
  });

  it("two generators with the same seed agree; different seeds diverge", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    expect(a()).toBe(b());
    expect(mulberry32(7)()).not.toBe(c());
  });
});
