import { CreditBlotterHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("CreditBlotterHead", () => {
  it("renders the icon+label tab title", () => {
    const page = mount(CreditBlotterHead);
    expect(page.titleText()).toBe("▤ Credit Blotter");
  });

  it("always renders active (the panel has only one view, so it never toggles)", () => {
    const page = mount(CreditBlotterHead);
    expect(page.isActive()).toBe(true);
  });
});
