import { firstValueFrom } from "rxjs";
import { filter, take } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import { RfqState } from "../credit/rfq.js";
import type { RfqEvent } from "../ports/workflowPort.js";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./DealerSimulator.js";

// Everything scheduled against an RFQ outlives the RFQ: expiry timers and
// dealer-response timers are already queued when a user cancels. Each callback
// re-reads state before acting, and CreditRfqSimulator.test.ts never lets one
// fire against a CLOSED rfq — so the "it went away while I was waiting" arms,
// the ones that would resurrect a cancelled RFQ, had no witness.

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CreditRfqSimulator against a closed RFQ", () => {
  it("does not expire an RFQ that was already cancelled", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const rfqId = await createRfq(sim);

    await firstValueFrom(sim.cancelRfq(rfqId));

    const seen: RfqEvent[] = [];
    const sub = sim.events().subscribe((event) => {
      return seen.push(event);
    });

    // Run past the 60s expiry the RFQ was created with. The queued expiry
    // callback still fires; it must find the RFQ non-Open and do nothing.
    await vi.advanceTimersByTimeAsync(120_000);
    sub.unsubscribe();

    const expired = seen.filter((event) => {
      return (
        event.type === "rfqClosed" && event.payload.state === RfqState.Expired
      );
    });

    // A second close would flip a Cancelled RFQ to Expired in the blotter.
    expect(expired).toEqual([]);

    sim.dispose();
  });

  it("does not quote an RFQ that was cancelled before the dealer replied", async () => {
    vi.useFakeTimers();
    // Force the 70% participation branch to schedule a response, so a dealer
    // reply is genuinely in flight when the cancel lands.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    // NOT dealer 0: Adaptive Bank is the house dealer and createRfq skips
    // scheduling a simulated response for it, so asking it would leave no
    // in-flight reply to race the cancel and quietly assert nothing.
    const rfqId = await createRfq(sim, 1);

    await firstValueFrom(sim.cancelRfq(rfqId));

    const seen: RfqEvent[] = [];
    const sub = sim.events().subscribe((event) => {
      return seen.push(event);
    });

    await vi.advanceTimersByTimeAsync(60_000);
    sub.unsubscribe();

    const quotedForThisRfq = seen.filter((event) => {
      return event.type === "quoteQuoted";
    });

    // A price arriving after cancellation would show a live quote on a dead
    // RFQ — the guard that prevents it is the point of this test.
    expect(quotedForThisRfq).toEqual([]);

    sim.dispose();
  });

  it("ignores a quote for an unknown quoteId", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);

    // Reaching applyQuote's missing-quote guard from the public API: a stale
    // quoteId is exactly what a reconnecting client replays.
    await expect(
      firstValueFrom(sim.quote({ quoteId: 999_999, price: 101 })),
    ).resolves.toBeUndefined();

    sim.dispose();
  });
});

/** Creates an RFQ with a 60s expiry and settles the synchronous seed events. */
async function createRfq(
  sim: CreditRfqSimulator,
  dealerIndex = 0,
): Promise<number> {
  const rfqId = await firstValueFrom(
    sim.createRfq({
      instrumentId: 1,
      dealerIds: [defined(DEALERS_CATALOG[dealerIndex]).id],
      quantity: 1000,
      direction: "Buy" as never,
      expirySecs: 60,
    }),
  );

  await vi.advanceTimersByTimeAsync(0);

  return rfqId;
}
