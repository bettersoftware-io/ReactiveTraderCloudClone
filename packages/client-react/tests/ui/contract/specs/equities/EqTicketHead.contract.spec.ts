import { EqTicketHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("EqTicketHead", () => {
  it("renders the static Order Ticket title", () => {
    const head = mount(EqTicketHead, {});

    expect(head.title()).toBe("✚ Order Ticket");
  });
});
