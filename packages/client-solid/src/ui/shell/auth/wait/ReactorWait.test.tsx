import { describe, expect, it } from "vitest";

import { reactorWaitPage } from "#tests/ui/pages/ReactorWaitPage";

const page = reactorWaitPage();

describe("ReactorWait", () => {
  it("renders the status line legibly at base state", () => {
    page.mount();

    expect(page.exists("auth-wait-reactor")).toBe(true);
    expect(page.text("auth-wait-reactor")).toContain("AWAITING AUTH GRANT");
  });

  it("exposes the wait as a live region for assistive tech", () => {
    page.mount();

    expect(page.statusText()).toContain("AWAITING AUTH GRANT");
  });

  it("renders the indeterminate bar below the status content, decorative to assistive tech", () => {
    page.mount();

    expect(page.hasIndeterminateBar()).toBe(true);
    expect(page.indeterminateBarHasChild()).toBe(true);
  });

  it("no longer owns the reactor rings — those wrap the emblem via ReactorRings", () => {
    page.mount();

    expect(page.svgCount("auth-wait-reactor")).toBe(0);
  });
});
