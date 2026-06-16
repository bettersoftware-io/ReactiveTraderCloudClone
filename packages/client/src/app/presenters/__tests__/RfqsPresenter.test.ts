import { firstValueFrom, lastValueFrom, of, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  Direction, RfqState,
  type RfqEvent, type WorkflowPort, type Quote, type Rfq,
} from "@rtc/domain";
import { RfqsPresenter } from "../RfqsPresenter";

const rfq = (id: number): Rfq => ({
  id, instrumentId: 1, quantity: 1_000_000,
  direction: Direction.Buy, state: RfqState.Open, expirySecs: 120,
  creationTimestamp: Date.now(),
});
const quote = (id: number, rfqId: number): Quote => ({
  id, rfqId, dealerId: 1, state: { type: "pendingWithoutPrice" },
});

function port(events: readonly RfqEvent[]): WorkflowPort {
  return {
    events: () => of(...events),
    createRfq: () => of(0),
    cancelRfq: () => of(undefined),
    quote: () => of(undefined),
    pass: () => of(undefined),
    accept: () => of(undefined),
  };
}

describe("RfqsPresenter", () => {
  it("emits arrays of rfqs", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "rfqCreated", payload: rfq(1) },
      { type: "rfqCreated", payload: rfq(2) },
      { type: "endOfStateOfTheWorld" },
    ];
    const presenter = new RfqsPresenter(port(events));
    const last = await firstValueFrom(presenter.rfqs$.pipe(toArray()));
    expect(last.at(-1)?.map((r) => r.id)).toEqual([1, 2]);
  });

  it("filters quotes per rfqId via quotesForRfq$", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "quoteCreated", payload: quote(10, 1) },
      { type: "quoteCreated", payload: quote(11, 2) },
      { type: "quoteCreated", payload: quote(12, 1) },
    ];
    const presenter = new RfqsPresenter(port(events));
    const last = await firstValueFrom(presenter.quotesForRfq$(1).pipe(toArray()));
    expect(last.at(-1)?.map((q) => q.id).sort()).toEqual([10, 12]);
  });

  it("createRfq delegates to WorkflowPort.createRfq", async () => {
    let received: unknown;
    const wp: WorkflowPort = {
      ...port([]),
      createRfq: (req) => {
        received = req;
        return of(42);
      },
    };
    const presenter = new RfqsPresenter(wp);
    expect(
      await firstValueFrom(
        presenter.createRfq({
          instrumentId: 1, dealerIds: [1], quantity: 1, direction: Direction.Buy, expirySecs: 120,
        }),
      ),
    ).toBe(42);
    expect(received).toMatchObject({ instrumentId: 1, expirySecs: 120 });
  });

  it("acceptQuote / cancelRfq / passQuote return Observable<void>", async () => {
    const presenter = new RfqsPresenter(port([]));
    expect(await firstValueFrom(presenter.acceptQuote(1))).toBeUndefined();
    expect(await firstValueFrom(presenter.cancelRfq(1))).toBeUndefined();
    expect(await firstValueFrom(presenter.passQuote(1))).toBeUndefined();
  });

  it("quoteRfq delegates to WorkflowPort.quote", async () => {
    let received: unknown;
    const wp: WorkflowPort = {
      ...port([]),
      quote: (req) => {
        received = req;
        return of(undefined);
      },
    };
    const presenter = new RfqsPresenter(wp);
    expect(
      await firstValueFrom(presenter.quoteRfq({ quoteId: 99, price: 101.5 })),
    ).toBeUndefined();
    expect(received).toEqual({ quoteId: 99, price: 101.5 });
  });

  it("allQuotes$ emits the quotes map keyed by quote id", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "quoteCreated", payload: quote(10, 1) },
      { type: "quoteCreated", payload: quote(11, 2) },
    ];
    const presenter = new RfqsPresenter(port(events));
    const map = await lastValueFrom(presenter.allQuotes$);
    expect([...map.keys()].sort()).toEqual([10, 11]);
    expect(map.get(10)?.rfqId).toBe(1);
  });

  it("re-emits rfqs$ across a length change (shallowArrayEquals length-mismatch arm)", async () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "rfqCreated", payload: rfq(1) },
      { type: "endOfStateOfTheWorld" },
      { type: "rfqCreated", payload: rfq(2) },
    ];
    const presenter = new RfqsPresenter(port(events));
    const emissions = await firstValueFrom(presenter.rfqs$.pipe(toArray()));
    const lengths = emissions.map((e) => e.length);
    expect(lengths).toContain(1);
    expect(lengths).toContain(2);
  });

  it("re-emits quotesForRfq$ when an element changes identity (element-diff arm)", async () => {
    // quoteQuoted is the real "replace existing quote" RfqEvent variant; the
    // reducer sets a NEW Quote object into a fresh Map, so the filtered array
    // keeps length 1 but the element changes identity -> shallowArrayEquals
    // fails on the element comparison -> re-emit.
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      { type: "quoteCreated", payload: quote(20, 5) },
      { type: "quoteQuoted", payload: quote(20, 5) },
    ];
    const presenter = new RfqsPresenter(port(events));
    const emissions = await firstValueFrom(presenter.quotesForRfq$(5).pipe(toArray()));
    const lenOne = emissions.filter((e) => e.length === 1);
    expect(lenOne.length).toBeGreaterThanOrEqual(2);
  });

  it("quotesForRfq$ returns the same Observable instance on repeat calls (cache)", () => {
    const presenter = new RfqsPresenter(port([]));
    const first = presenter.quotesForRfq$(7);
    const second = presenter.quotesForRfq$(7);
    expect(second).toBe(first);
    expect(presenter.quotesForRfq$(8)).not.toBe(first);
  });
});
