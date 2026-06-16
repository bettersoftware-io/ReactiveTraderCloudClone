import { describe, it, expect, vi, afterEach } from "vitest";
import { firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./creditReferenceDataSimulator.js";
import type { RfqEvent } from "../ports/workflowPort.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function collectEvents(sim: CreditRfqSimulator): { events: RfqEvent[]; stop: () => void } {
  const events: RfqEvent[] = [];
  const sub = sim.events().subscribe((e) => events.push(e));
  return { events, stop: () => sub.unsubscribe() };
}

async function createRfqAndQuoteId(sim: CreditRfqSimulator): Promise<{ rfqId: number; quoteId: number }> {
  const quoteCreated = firstValueFrom(
    sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(1)),
  );
  const rfqId = await firstValueFrom(
    sim.createRfq({
      instrumentId: 1,
      dealerIds: [DEALERS_CATALOG[0]!.id],
      quantity: 1000,
      direction: "Buy" as never,
      expirySecs: 60,
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  const e = (await quoteCreated) as Extract<RfqEvent, { type: "quoteCreated" }>;
  return { rfqId, quoteId: e.payload.id };
}

describe("CreditRfqSimulator", () => {
  it("cancelRfq closes an open RFQ via an rfqClosed event with Cancelled state", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { rfqId } = await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const closed = events.find((e) => e.type === "rfqClosed");
    expect(closed).toBeDefined();
    const payload = (closed as Extract<RfqEvent, { type: "rfqClosed" }>).payload;
    expect(payload.id).toBe(rfqId);
    expect(payload.state).toBe("Cancelled");
  });

  it("cancelRfq on an already-cancelled RFQ is a no-op (no further rfqClosed event)", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { rfqId } = await createRfqAndQuoteId(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.cancelRfq(rfqId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "rfqClosed")).toBe(false);
  });

  it("pass moves a quote to passed and emits quotePassed", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { quoteId } = await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.pass(quoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const passed = events.find((e) => e.type === "quotePassed");
    expect(passed).toBeDefined();
    const payload = (passed as Extract<RfqEvent, { type: "quotePassed" }>).payload;
    expect(payload.id).toBe(quoteId);
    expect(payload.state.type).toBe("passed");
  });

  it("pass on an unknown quoteId is a no-op (no quotePassed event)", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    await createRfqAndQuoteId(sim);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.pass(999_999));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "quotePassed")).toBe(false);
  });

  it("accept on a multi-dealer RFQ emits quoteAccepted then closes the RFQ", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0); // force scheduled dealers to NOT participate
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const quoteCreatedTwice = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(2)),
    );
    const firstQuotePromise = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteCreated"), take(1)),
    );
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [DEALERS_CATALOG[0]!.id, DEALERS_CATALOG[1]!.id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 60,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await quoteCreatedTwice;
    const winningQuoteId = ((await firstQuotePromise) as Extract<RfqEvent, { type: "quoteCreated" }>).payload.id;
    await firstValueFrom(sim.quote({ quoteId: winningQuoteId, price: 100 }));
    await vi.advanceTimersByTimeAsync(0);
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.accept(winningQuoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const accepted = events.find((e) => e.type === "quoteAccepted");
    expect(accepted).toBeDefined();
    const acceptedPayload = (accepted as Extract<RfqEvent, { type: "quoteAccepted" }>).payload;
    expect(acceptedPayload.id).toBe(winningQuoteId);
    expect(acceptedPayload.state).toEqual({ type: "accepted", price: 100 });
    const closed = events.find((e) => e.type === "rfqClosed");
    expect(closed).toBeDefined();
    expect((closed as Extract<RfqEvent, { type: "rfqClosed" }>).payload.state).toBe("Closed");
  });

  it("accept on a quote without a price is a no-op", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const { quoteId } = await createRfqAndQuoteId(sim); // pendingWithoutPrice
    const { events, stop } = collectEvents(sim);
    await firstValueFrom(sim.accept(quoteId));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(events.some((e) => e.type === "quoteAccepted")).toBe(false);
    expect(events.some((e) => e.type === "rfqClosed")).toBe(false);
  });

  it("a simulated dealer responds within DEALER_RESPONSE_WINDOW_MS, pricing the quote", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // participates; delay 15s; price 100 + 5*-1 = 95
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const quoted = firstValueFrom(
      sim.events().pipe(filter((e: RfqEvent) => e.type === "quoteQuoted"), take(1)),
    );
    await firstValueFrom(
      sim.createRfq({
        instrumentId: 1,
        dealerIds: [DEALERS_CATALOG[0]!.id],
        quantity: 1000,
        direction: "Buy" as never,
        expirySecs: 60,
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const e = (await quoted) as Extract<RfqEvent, { type: "quoteQuoted" }>;
    expect(e.payload.state.type).toBe("pendingWithPrice");
    expect(e.payload.state).toEqual({ type: "pendingWithPrice", price: 95 });
  });
});
