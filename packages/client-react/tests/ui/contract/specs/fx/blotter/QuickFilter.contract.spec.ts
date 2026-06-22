import { QuickFilter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("QuickFilter", () => {
  it("renders the controlled value and placeholder", () => {
    const filter = mount(QuickFilter, {
      props: { value: "eur", onChange: () => {} },
    });
    expect(filter.value()).toBe("eur");
    expect(filter.placeholder()).toMatch(/quick filter/i);
  });

  it("reports each keystroke to onChange", async () => {
    const seen: string[] = [];
    const filter = mount(QuickFilter, {
      props: {
        value: "",
        onChange: (v) => {
          return seen.push(v);
        },
      },
    });
    await filter.type("ab");
    // Controlled input stays empty (value prop never changes), so each keystroke
    // reports a single character.
    expect(seen).toEqual(["a", "b"]);
  });

  it("reflects a new controlled value pushed via props", () => {
    const filter = mount(QuickFilter, {
      props: { value: "", onChange: () => {} },
    });
    expect(filter.value()).toBe("");
    filter.setProps({ value: "gbp" });
    expect(filter.value()).toBe("gbp");
  });
});
