import { NewRfqHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("NewRfqHead", () => {
  it("renders the icon+label tab title", () => {
    const page = mount(NewRfqHead);
    expect(page.titleText()).toBe("✚ New RFQ");
  });

  it("always renders active (the panel has only one view, so it never toggles)", () => {
    const page = mount(NewRfqHead);
    expect(page.isActive()).toBe(true);
  });
});
