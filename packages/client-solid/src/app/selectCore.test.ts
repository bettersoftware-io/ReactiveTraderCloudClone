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
    expect(() => {
      resolveCoreImpl("rx");
    }).toThrow(/VITE_CORE_IMPL/);
  });
});

describe("selectCore module init", () => {
  it("publishes the VALIDATED selection on <html data-core-impl>", async () => {
    await import("#/app/selectCore");

    expect(document.documentElement.dataset.coreImpl).toBe("rxjs");
  });
});
