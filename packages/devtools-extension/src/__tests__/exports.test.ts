import { describe, expect, it } from "vitest";

import { InspectorApp } from "@rtc/devtools-app";

describe("package wiring", () => {
  it("re-exports InspectorApp from @rtc/devtools-app", () => {
    expect(typeof InspectorApp).toBe("function");
  });
});
