import { describe, expect, it } from "vitest";

import {
  nextTickFlash,
  TICK_FLASH_DURATION_MS,
  tickDirection,
} from "./tickFlash";

describe("tickDirection", () => {
  it("returns flat for the first value and for sub-epsilon moves", () => {
    expect(tickDirection(null, 1.2345)).toBe("flat");
    expect(tickDirection(1.2345, 1.2345)).toBe("flat");
  });
  it("returns up/down on a real move", () => {
    expect(tickDirection(1.2345, 1.2346)).toBe("up");
    expect(tickDirection(1.2346, 1.2345)).toBe("down");
  });
});

describe("nextTickFlash", () => {
  it("bumps nonce only on a real change", () => {
    const a = nextTickFlash({ value: null, nonce: 0 }, 100); // flat (first)
    expect(a.dir).toBe("flat");
    expect(a.state.nonce).toBe(0);
    const b = nextTickFlash(a.state, 101); // up
    expect(b.dir).toBe("up");
    expect(b.state.nonce).toBe(1);
    const c = nextTickFlash(b.state, 101); // flat (unchanged)
    expect(c.state.nonce).toBe(1);
  });
  it("exposes a positive flash duration", () => {
    expect(TICK_FLASH_DURATION_MS).toBeGreaterThan(0);
  });
});
