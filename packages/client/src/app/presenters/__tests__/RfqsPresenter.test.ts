import { firstValueFrom, of, toArray } from "rxjs";
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
});
