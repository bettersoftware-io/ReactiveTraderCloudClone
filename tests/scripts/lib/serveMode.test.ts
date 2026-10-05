import { describe, expect, it } from "vitest";

import { resolveServeMode } from "./serveMode.ts";

describe("resolveServeMode", () => {
  it("serves the production build unless told otherwise — unset and empty both mean the default", () => {
    expect(resolveServeMode({})).toBe("build");
    expect(resolveServeMode({ RTC_E2E_SERVE: "" })).toBe("build");
  });

  it("takes the mode RTC_E2E_SERVE names", () => {
    expect(resolveServeMode({ RTC_E2E_SERVE: "dev" })).toBe("dev");
    expect(resolveServeMode({ RTC_E2E_SERVE: "build" })).toBe("build");
  });

  it("refuses a name it does not know rather than falling back to the default", () => {
    expect(() => {
      return resolveServeMode({ RTC_E2E_SERVE: "prod" });
    }).toThrow('RTC_E2E_SERVE="prod" is not one of build, dev');
  });
});
