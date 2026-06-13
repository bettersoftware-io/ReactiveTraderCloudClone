import { describe, it, expect } from "vitest";
import { Direction, KNOWN_CURRENCY_PAIRS, type CurrencyPair, type Price } from "@rtc/domain";
import { mount } from "@ui-contract/mount";
import { TileRfq } from "@ui-contract/components";
import type {
  RfqStateLike,
} from "@ui-contract/pages/fx/liveRates/tile/TileRfqPage";
import type {
  RfqState,
  RfqQuote,
} from "../../../../../../../src/ui/fx/liveRates/tile/hooks/useRfqState";

const eurusd: CurrencyPair = KNOWN_CURRENCY_PAIRS[0];

const quote: RfqQuote = { bid: 1.0921, ask: 1.0925, timeoutMs: 10_000 };

const rfqState = (
  state: RfqState,
  over: Partial<RfqStateLike> = {},
): RfqStateLike => ({
  state,
  initiate: () => {},
  cancel: () => {},
  receiveQuote: () => {},
  reject: () => {},
  accept: () => quote,
  ...over,
});

describe("TileRfq", () => {
  it("offers an Initiate RFQ button in the init state", async () => {
    let requested = 0;
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState({ status: "init", quote: null, remainingMs: 0 }),
        onRequestQuote: () => (requested += 1),
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    expect(rfq.hasButton(/initiate rfq/i)).toBe(true);
    await rfq.click(/initiate rfq/i);
    expect(requested).toBe(1);
  });

  it("shows an awaiting-price state with a cancel action", async () => {
    let cancelled = 0;
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState(
          { status: "requested", quote: null, remainingMs: 0 },
          { cancel: () => (cancelled += 1) },
        ),
        onRequestQuote: () => {},
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    expect(rfq.text()).toMatch(/awaiting price/i);
    await rfq.click(/cancel rfq/i);
    expect(cancelled).toBe(1);
  });

  it("renders the two-sided quote with the countdown and reject action", () => {
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState({ status: "received", quote, remainingMs: 6_000 }),
        onRequestQuote: () => {},
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    expect(rfq.hasButton(/sell 1\.09210/i)).toBe(true);
    expect(rfq.hasButton(/buy 1\.09250/i)).toBe(true);
    expect(rfq.countdownCaption()).toBe("6s remaining");
    expect(rfq.hasButton(/reject/i)).toBe(true);
  });

  it("accepts a quote and executes the synthetic price for the chosen side", async () => {
    const executed: { dir: Direction; price: Price; notional: number }[] = [];
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState({ status: "received", quote, remainingMs: 6_000 }),
        onRequestQuote: () => {},
        onExecute: (dir, price, notional) => executed.push({ dir, price, notional }),
        notional: 2_000_000,
      },
    });
    await rfq.click(/buy 1\.09250/i);
    expect(executed).toHaveLength(1);
    expect(executed[0].dir).toBe(Direction.Buy);
    expect(executed[0].notional).toBe(2_000_000);
    expect(executed[0].price.bid).toBe(quote.bid);
    expect(executed[0].price.ask).toBe(quote.ask);
    expect(executed[0].price.symbol).toBe("EURUSD");
  });

  it("does not execute when accept yields no quote", async () => {
    const executed: Direction[] = [];
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState(
          { status: "received", quote, remainingMs: 6_000 },
          { accept: () => null },
        ),
        onRequestQuote: () => {},
        onExecute: (dir) => executed.push(dir),
        notional: 2_000_000,
      },
    });
    await rfq.click(/sell 1\.09210/i);
    expect(executed).toEqual([]);
  });

  it("rejects the quote when Reject is clicked", async () => {
    let rejected = 0;
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState(
          { status: "received", quote, remainingMs: 6_000 },
          { reject: () => (rejected += 1) },
        ),
        onRequestQuote: () => {},
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    await rfq.click(/reject/i);
    expect(rejected).toBe(1);
  });

  it("shows a quote-expired message in the rejected state", () => {
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState({ status: "rejected", quote: null, remainingMs: 0 }),
        onRequestQuote: () => {},
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    expect(rfq.text()).toMatch(/quote expired/i);
  });

  it("renders nothing when received but the quote is missing", () => {
    const rfq = mount(TileRfq, {
      props: {
        pair: eurusd,
        rfqState: rfqState({ status: "received", quote: null, remainingMs: 0 }),
        onRequestQuote: () => {},
        onExecute: () => {},
        notional: 1_000_000,
      },
    });
    expect(rfq.isEmpty()).toBe(true);
  });
});
