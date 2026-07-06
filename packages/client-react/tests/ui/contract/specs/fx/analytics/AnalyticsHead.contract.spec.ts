import { AnalyticsHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AnalyticsHead", () => {
  it("renders the icon+label tab title", () => {
    const page = mount(AnalyticsHead);
    expect(page.titleText()).toBe("◉ Analytics");
  });

  it("always renders active (the panel has only one view, so it never toggles)", () => {
    const page = mount(AnalyticsHead);
    expect(page.isActive()).toBe(true);
  });
});
