import { PositionsHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("PositionsHead", () => {
  it("renders the icon+label tab title", () => {
    const page = mount(PositionsHead);
    expect(page.titleText()).toBe("◎ Positions");
  });

  it("always renders active (the panel has only one view, so it never toggles)", () => {
    const page = mount(PositionsHead);
    expect(page.isActive()).toBe(true);
  });
});
