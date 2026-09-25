import { describe, expect, it } from "vitest";

import * as coreLogic from "#/index";

describe("@rtc/core-logic", () => {
  it("exports the shared runtime logic every core composes over", () => {
    expect(Object.keys(coreLogic).length).toBeGreaterThan(0);
  });
});
