import { RfqsPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const instruments: readonly Instrument[] = [
  {
    id: 1,
    name: "US Treasury 10Y",
    cusip: "912828ZQ6",
    ticker: "T 1.5 02/34",
    maturity: "2034-02-15",
    interestRate: 1.5,
    benchmark: "10Y",
    refPrice: 98.4,
  },
];

const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JPMorgan" },
];

describe("RfqsPanel", () => {
  it("shows the empty state when there are no RFQs", () => {
    const panel = mount(RfqsPanel, {
      hooks: { useInstruments: instruments, useDealers: dealers },
    });
    expect(panel.emptyMessage()).toBe("No RFQs to show");
    expect(panel.cardCount()).toBe(0);
  });

  it("defaults to the live filter, showing only Open RFQs", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
    });
    expect(panel.cardCount()).toBe(1);
    expect(panel.cardState(1)).toBe("live");
  });

  it("the closed filter shows every non-Open RFQ", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "closed",
    });
    expect(panel.cardCount()).toBe(3);
    expect(panel.cardState(2)).toBe("accepted");
    expect(panel.cardState(3)).toBe("terminated");
    expect(panel.cardState(4)).toBe("terminated");
  });

  it("the all filter shows every RFQ regardless of state", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(panel.cardCount()).toBe(4);
  });

  it("renders the LIVE/ACCEPTED/CANCELLED/EXPIRED state labels", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    expect(panel.hasText("LIVE")).toBe(true);

    const closedPanel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(2, { state: RfqState.Closed }),
          rfq(3, { state: RfqState.Cancelled }),
          rfq(4, { state: RfqState.Expired }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(closedPanel.hasText("ACCEPTED")).toBe(true);
    expect(closedPanel.hasText("CANCELLED")).toBe(true);
    expect(closedPanel.hasText("EXPIRED")).toBe(true);
  });

  it("marks the best-priced quote with a star and the Adaptive Bank row as house", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 1,
        state: { type: "pendingWithPrice", price: 99 },
      },
      {
        id: 11,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 97 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.isBestQuote(11)).toBe(true);
    expect(panel.isBestQuote(10)).toBe(false);
    expect(panel.isHouseQuote(10)).toBe(true);
    expect(panel.isHouseQuote(11)).toBe(false);
  });

  it("accepts a priced quote through the panel, recording the quote id", async () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 99 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.canAccept(10)).toBe(true);
    await panel.accept(10);
    expect(panel.acceptedQuoteIds()).toEqual([10]);
  });

  it("does not offer accept once the RFQ is no longer live, even for a priced quote", () => {
    const quotes: Quote[] = [
      {
        id: 10,
        rfqId: 1,
        dealerId: 2,
        state: { type: "pendingWithPrice", price: 99 },
      },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Cancelled })],
      },
      creditRfqFilter: "all",
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.canAccept(10)).toBe(false);
  });

  it("cancels a live RFQ through the panel, recording the rfq id", async () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    await panel.cancel(1);
    expect(panel.cancelledRfqIds()).toEqual([1]);
  });

  it("shows the accepted dealer's name once Closed", () => {
    const quotes: Quote[] = [
      { id: 10, rfqId: 1, dealerId: 3, state: { type: "accepted", price: 97 } },
    ];
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Closed })],
      },
      creditRfqFilter: "closed",
      parametric: { quotesForRfq: { 1: quotes } },
    });
    expect(panel.hasText("You traded with JPMorgan")).toBe(true);
  });

  it("removes a terminated RFQ from view via its remove control", async () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Expired })],
      },
      creditRfqFilter: "all",
    });
    expect(panel.cardCount()).toBe(1);
    await panel.remove(1);
    // The card plays its cardOut exit animation before it actually leaves —
    // still rendered (data-anim="exit") until the animation completes.
    expect(panel.cardCount()).toBe(1);
    expect(panel.cardAnim(1)).toBe("exit");
    panel.fireCardAnimationEnd(1);
    expect(panel.cardCount()).toBe(0);
    expect(panel.emptyMessage()).toBe("No RFQs to show");
  });

  it("dismisses a terminated RFQ immediately under prefers-reduced-motion", async () => {
    stubReducedMotion(true);
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Expired })],
      },
      creditRfqFilter: "all",
    });
    await panel.remove(1);
    expect(panel.cardCount()).toBe(0);
  });

  it("plays a cardIn entrance animation for a newly-arrived RFQ, clearing on animationend", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
    });
    // The initial seed render never plays an entrance animation.
    expect(panel.cardAnim(1)).toBe("none");

    panel.emit({
      useRfqs: [
        rfq(2, { state: RfqState.Open, creationTimestamp: 1_700_000_001_000 }),
        rfq(1, { state: RfqState.Open }),
      ],
    });
    expect(panel.cardAnim(2)).toBe("enter");
    // A lone new arrival never staggers (0ms delay).
    expect(panel.cardDelay(2)).toBe("0ms");
    expect(panel.cardAnim(1)).toBe("none");

    panel.fireCardAnimationEnd(2);
    expect(panel.cardAnim(2)).toBe("none");
  });

  it("staggers every card's re-entrance by its grid index when the filter changes", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, {
            state: RfqState.Cancelled,
            creationTimestamp: 1_700_000_002_000,
          }),
          rfq(3, {
            state: RfqState.Expired,
            creationTimestamp: 1_700_000_003_000,
          }),
        ],
      },
      creditRfqFilter: "all",
    });
    // Sorted newest-first: 3, 2, 1 — none animate on the initial mount.
    expect(panel.cardAnim(3)).toBe("none");

    panel.setCreditRfqFilter("closed");
    // "closed" shows 3 then 2 (newest first); both are surviving (not new)
    // ids re-entering as part of the cascade, staggered by grid index.
    expect(panel.cardCount()).toBe(2);
    expect(panel.cardAnim(3)).toBe("enter");
    expect(panel.cardDelay(3)).toBe("0ms");
    expect(panel.cardAnim(2)).toBe("enter");
    expect(panel.cardDelay(2)).toBe("45ms");
  });

  // PROTO isTabRecent: a DISJOINT filter switch (live→closed shares no ids)
  // still staggers every revealed card by grid index — the 0ms fast path is
  // only for a genuinely just-CREATED RFQ, never a filter-revealed one.
  it("staggers a disjoint filter switch (live→closed) instead of treating revealed cards as new", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, {
            state: RfqState.Cancelled,
            creationTimestamp: 1_700_000_002_000,
          }),
          rfq(3, {
            state: RfqState.Expired,
            creationTimestamp: 1_700_000_003_000,
          }),
        ],
      },
      creditRfqFilter: "live",
    });
    expect(panel.cardCount()).toBe(1);

    panel.setCreditRfqFilter("closed");
    // Shows 3 then 2 (newest first) — neither was in the previous SHOWN set,
    // but both already existed unfiltered, so they cascade by grid index.
    expect(panel.cardCount()).toBe(2);
    expect(panel.cardAnim(3)).toBe("enter");
    expect(panel.cardDelay(3)).toBe("0ms");
    expect(panel.cardAnim(2)).toBe("enter");
    expect(panel.cardDelay(2)).toBe("45ms");
  });

  // PROTO exitAt/EXITING_RETAIN_MS: an RFQ that leaves the active filter via
  // a STATE change (Open→Expired while viewing LIVE) plays its exit
  // animation before vanishing, rather than popping out instantly. Ported
  // clock-free: retained in the exit set until its own animationend.
  it("plays an exit animation when an RFQ leaves the live filter via a state change", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [rfq(1, { state: RfqState.Open })],
      },
      creditRfqFilter: "live",
    });
    expect(panel.cardCount()).toBe(1);

    panel.emit({ useRfqs: [rfq(1, { state: RfqState.Expired })] });
    // No longer matches "live", but retained mid exit animation.
    expect(panel.cardCount()).toBe(1);
    expect(panel.cardAnim(1)).toBe("exit");

    panel.fireCardAnimationEnd(1);
    expect(panel.cardCount()).toBe(0);

    // NOT dismissed — only hidden by the filter; CLOSED must still show it.
    panel.setCreditRfqFilter("closed");
    expect(panel.cardCount()).toBe(1);
    expect(panel.cardState(1)).toBe("terminated");
  });

  // PROTO: a card revealed by a state transition while viewing another tab
  // (Open→Expired seen from CLOSED) appears plain — no entrance animation.
  it("does not animate a card revealed by a state change while viewing another tab", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, {
            state: RfqState.Cancelled,
            creationTimestamp: 1_700_000_002_000,
          }),
        ],
      },
      creditRfqFilter: "closed",
    });
    expect(panel.cardCount()).toBe(1);

    panel.emit({
      useRfqs: [
        rfq(1, { state: RfqState.Expired }),
        rfq(2, {
          state: RfqState.Cancelled,
          creationTimestamp: 1_700_000_002_000,
        }),
      ],
    });
    expect(panel.cardCount()).toBe(2);
    expect(panel.cardAnim(1)).toBe("none");
    expect(panel.cardAnim(2)).toBe("none");
  });

  it("shows the live countdown seconds and progress-bar percentage, ticking down under fake timers", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, {
            state: RfqState.Open,
            creationTimestamp: now,
            expirySecs: 10,
          }),
        ],
      },
    });
    expect(panel.secsCaption(1)).toBe("10 secs");
    expect(panel.barPct(1)).toBe("100%");

    // advanceTimersByTimeAsync yields to the microtask queue between ticks,
    // which the underlying rx-state/useSyncExternalStore bridge needs to
    // actually flush a re-render.
    await vi.advanceTimersByTimeAsync(5000);
    expect(panel.secsCaption(1)).toBe("5 secs");
    expect(panel.barPct(1)).toBe("50%");
  });

  it("does not offer a remove control on a live or accepted card", () => {
    const panel = mount(RfqsPanel, {
      hooks: {
        useInstruments: instruments,
        useDealers: dealers,
        useRfqs: [
          rfq(1, { state: RfqState.Open }),
          rfq(2, { state: RfqState.Closed }),
        ],
      },
      creditRfqFilter: "all",
    });
    expect(panel.hasRemoveControl(1)).toBe(false);
    expect(panel.hasRemoveControl(2)).toBe(false);
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

/** Install a window.matchMedia stub for one test (jsdom omits it) — same
 * helper as BootGate.contract.spec.ts/BootSequence.contract.spec.ts. */
function stubReducedMotion(matches: boolean): void {
  function fakeMatchMedia(query: string): MediaQueryList {
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => {
        return false;
      },
    } as MediaQueryList;
  }

  vi.stubGlobal("matchMedia", fakeMatchMedia);
}
