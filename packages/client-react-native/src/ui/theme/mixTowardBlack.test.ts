import { describe, expect, test } from "vitest";

import { mixTowardBlack } from "./mixTowardBlack";

describe("mixTowardBlack", () => {
  test("scales each channel by the kept fraction", () => {
    expect(mixTowardBlack("#64c896", 0.5)).toBe("#32644b");
  });

  test("keep 1 returns the colour unchanged", () => {
    expect(mixTowardBlack("#2bffb3", 1)).toBe("#2bffb3");
  });

  test("keep 0 is black, with zero-padded bytes", () => {
    expect(mixTowardBlack("#0a0b0c", 0)).toBe("#000000");
  });
});
