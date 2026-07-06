import { RfqsHead } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { Direction, type Rfq, RfqState } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("RfqsHead", () => {
  it("renders the icon+label tab title, always active (the panel has only one view)", () => {
    const page = mount(RfqsHead);
    expect(page.titleText()).toBe("◳ RFQs");
    expect(page.isTitleActive()).toBe(true);
  });

  it("shows the LIVE count of Open rfqs from useRfqs", () => {
    const page = mount(RfqsHead, {
      hooks: {
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Open }),
          rfq(3, { state: RfqState.Closed }),
        ],
      },
    });
    expect(page.pillText("live")).toBe("LIVE (2)");
  });

  // PROTO useCreditRfqs.ts: liveCount is "" (not "0") when nothing is live.
  it("shows a bare LIVE label when no rfq is Open", () => {
    const page = mount(RfqsHead, {
      hooks: { useRfqs: [rfq(1, { state: RfqState.Closed })] },
    });
    expect(page.pillText("live")).toBe("LIVE");
  });

  it("defaults to the LIVE filter highlighted", () => {
    const page = mount(RfqsHead);
    expect(page.isPillActive("live")).toBe(true);
    expect(page.isPillActive("closed")).toBe(false);
    expect(page.isPillActive("all")).toBe(false);
  });

  it("reflects the seeded creditRfqFilter preference", () => {
    const page = mount(RfqsHead, { creditRfqFilter: "all" });
    expect(page.isPillActive("all")).toBe(true);
    expect(page.isPillActive("live")).toBe(false);
  });

  it("writes the shared filter preference when a pill is clicked, moving the highlight", async () => {
    const page = mount(RfqsHead);
    expect(page.isPillActive("live")).toBe(true);
    await page.clickPill("closed");
    expect(page.isPillActive("closed")).toBe(true);
    expect(page.isPillActive("live")).toBe(false);
    await page.clickPill("all");
    expect(page.isPillActive("all")).toBe(true);
    expect(page.isPillActive("closed")).toBe(false);
  });
});

function rfq(id: number, over: Partial<Rfq> = {}): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 1000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 1_700_000_000_000 + id,
    ...over,
  };
}
