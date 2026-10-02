import { describe, expect, it } from "vitest";

import { createTokenBucket } from "#/socket/tokenBucket";

describe("tokenBucket", () => {
  it("allows burst tokens at once, then refuses", () => {
    const bucket = createTokenBucket(3, 1);

    expect([
      bucket.tryTake(0),
      bucket.tryTake(0),
      bucket.tryTake(0),
      bucket.tryTake(0),
    ]).toEqual([true, true, true, false]);
  });

  it("refills at refillPerSecond, capped at burst", () => {
    const bucket = createTokenBucket(2, 10);
    bucket.tryTake(0);
    bucket.tryTake(0);

    expect(bucket.tryTake(50)).toBe(false);
    expect(bucket.tryTake(100)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(true);
    expect(bucket.tryTake(100_000)).toBe(false);
  });
});
