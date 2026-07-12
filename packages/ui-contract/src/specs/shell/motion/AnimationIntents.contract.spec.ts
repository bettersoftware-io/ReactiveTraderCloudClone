import { AnimationProbe } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("AnimationIntents", () => {
  it("maps intent.kind to data-anim and absent when null", () => {
    const page = mount(AnimationProbe, { props: { target: "tile:EURUSD" } });

    // Before any intent fires the attribute is absent.
    expect(page.animData()).toBeNull();

    // Push tickUp → data-anim="tickUp".
    page.setIntent("tile:EURUSD", {
      target: "tile:EURUSD",
      kind: "tickUp",
    });
    expect(page.animData()).toBe("tickUp");

    // Push fill → data-anim="fill".
    page.setIntent("tile:EURUSD", {
      target: "tile:EURUSD",
      kind: "fill",
    });
    expect(page.animData()).toBe("fill");

    // Clear back to null → attribute absent again.
    page.setIntent("tile:EURUSD", null);
    expect(page.animData()).toBeNull();
  });
});
