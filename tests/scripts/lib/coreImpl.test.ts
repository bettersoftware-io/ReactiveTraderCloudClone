import { describe, expect, it } from "vitest";

import { adoptCoreImpl, resolveCoreImpl } from "./coreImpl.ts";

describe("resolveCoreImpl", () => {
  it("defaults to rxjs when neither variable is set", () => {
    expect(resolveCoreImpl({})).toBe("rxjs");
  });

  it("reads RTC_CORE_IMPL", () => {
    expect(resolveCoreImpl({ RTC_CORE_IMPL: "effect" })).toBe("effect");
  });

  it("honours VITE_CORE_IMPL when RTC_CORE_IMPL is unset", () => {
    expect(resolveCoreImpl({ VITE_CORE_IMPL: "async" })).toBe("async");
  });

  it("treats an empty value as unset", () => {
    expect(
      resolveCoreImpl({ RTC_CORE_IMPL: "", VITE_CORE_IMPL: "async" }),
    ).toBe("async");
  });

  it("accepts the two variables when they agree", () => {
    expect(
      resolveCoreImpl({ RTC_CORE_IMPL: "async", VITE_CORE_IMPL: "async" }),
    ).toBe("async");
  });

  it("refuses the two variables when they disagree", () => {
    expect(() => {
      return resolveCoreImpl({
        RTC_CORE_IMPL: "async",
        VITE_CORE_IMPL: "effect",
      });
    }).toThrow(/RTC_CORE_IMPL="async".*VITE_CORE_IMPL="effect"/);
  });

  it("refuses an unknown core name", () => {
    expect(() => {
      return resolveCoreImpl({ VITE_CORE_IMPL: "efect" });
    }).toThrow(/"efect" is not one of rxjs, async, effect/);
  });
});

describe("adoptCoreImpl", () => {
  it("writes the resolved core back as RTC_CORE_IMPL for every downstream reader", () => {
    const env: NodeJS.ProcessEnv = { VITE_CORE_IMPL: "effect" };

    adoptCoreImpl(env);

    expect(env.RTC_CORE_IMPL).toBe("effect");
  });
});
