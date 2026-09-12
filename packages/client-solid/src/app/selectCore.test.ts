import { describe, expect, it } from "vitest";

import { CORE_IMPLS, resolveCoreImpl } from "#/app/selectCore";

describe("resolveCoreImpl", () => {
  it("defaults to rxjs when unset or empty", () => {
    expect(resolveCoreImpl(undefined)).toBe("rxjs");
    expect(resolveCoreImpl("")).toBe("rxjs");
  });

  it("accepts every known implementation", () => {
    for (const impl of CORE_IMPLS) {
      expect(resolveCoreImpl(impl)).toBe(impl);
    }
  });

  it("fails closed on an unknown value", () => {
    expect(() => resolveCoreImpl("rx")).toThrow(/VITE_CORE_IMPL/);
  });
});
