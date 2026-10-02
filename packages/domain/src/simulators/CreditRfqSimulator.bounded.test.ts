import { firstValueFrom, lastValueFrom, takeWhile, toArray } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction } from "../fx/trade.js";
import type { CreateRfqRequest } from "../ports/workflowPort.js";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./DealerSimulator.js";

// S9 — the RFQ store is shared and process-lifetime, fed by every connection.
// Bounding only the RFQ map is not enough (Review Focus 5): each RFQ owns
// quotes in two more maps and an armed expiry timer, so an eviction has to
// take all of them with it or those keep growing while the RFQ count looks
// bounded.

beforeEach(() => {
  vi.useFakeTimers();
  // No simulated dealer responses — only the expiry timers are of interest.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CreditRfqSimulator — bounded store (S9)", () => {
  it("evicting an RFQ removes its quotes and cancels its expiry timer, and the SoW shrinks to the cap", async () => {
    // The constructor seeds THREE RFQs (238, 237, 235) with twelve quotes and
    // no expiry timers. A cap of 1 leaves one seed standing.
    const sim = new CreditRfqSimulator(DEALERS_CATALOG, 1);
    expect((await collectSow(sim)).rfqIds).toHaveLength(1);

    const first = await firstValueFrom(sim.createRfq(createRfqRequest()));
    expect((await collectSow(sim)).rfqIds).toEqual([first]);
    expect(sim.expiryTimerCount()).toBe(1);

    const second = await firstValueFrom(sim.createRfq(createRfqRequest()));
    const sow = await collectSow(sim);

    expect(sow.rfqIds).toEqual([second]);
    expect(sow.quoteRfqIds).toHaveLength(2);
    expect(
      sow.quoteRfqIds.every((id) => {
        return id === second;
      }),
    ).toBe(true);
    // `first`'s expiry timer was cancelled with it — only `second`'s remains…
    expect(sim.expiryTimerCount()).toBe(1);

    // …and it fires on schedule, removing itself.
    await vi.advanceTimersByTimeAsync(EXPIRY_SECS * 1000 + 10_000);
    expect(sim.expiryTimerCount()).toBe(0);

    sim.dispose();
  });

  it("an evicted RFQ's quotes are gone from the quote store too", async () => {
    const sim = new CreditRfqSimulator(DEALERS_CATALOG, 1);
    const first = await firstValueFrom(sim.createRfq(createRfqRequest()));
    const firstQuoteId = (await collectSow(sim)).quoteIds[0];
    expect(firstQuoteId).toBeDefined();

    await firstValueFrom(sim.createRfq(createRfqRequest()));

    // `pass` acts on the quote map alone (it never consults the RFQ), so a
    // quote the store still held would surface as a quotePassed event here.
    const live: string[] = [];
    const sub = sim.events().subscribe((e) => {
      live.push(e.type);
    });
    await firstValueFrom(sim.pass(firstQuoteId ?? -1));
    sub.unsubscribe();

    expect(live).not.toContain("quotePassed");
    expect((await collectSow(sim)).rfqIds).not.toContain(first);

    sim.dispose();
  });
});

interface SowShape {
  readonly rfqIds: readonly number[];
  readonly quoteIds: readonly number[];
  readonly quoteRfqIds: readonly number[];
}

async function collectSow(sim: CreditRfqSimulator): Promise<SowShape> {
  const events = await lastValueFrom(
    sim.events().pipe(
      takeWhile((e) => {
        return e.type !== "endOfStateOfTheWorld";
      }),
      toArray(),
    ),
  );

  return {
    rfqIds: events.flatMap((e) => {
      return e.type === "rfqCreated" ? [e.payload.id] : [];
    }),
    quoteIds: events.flatMap((e) => {
      return e.type === "quoteCreated" ? [e.payload.id] : [];
    }),
    quoteRfqIds: events.flatMap((e) => {
      return e.type === "quoteCreated" ? [e.payload.rfqId] : [];
    }),
  };
}

function createRfqRequest(): CreateRfqRequest {
  return {
    instrumentId: 1,
    dealerIds: [0, 1],
    quantity: 1_000_000,
    direction: Direction.Buy,
    expirySecs: EXPIRY_SECS,
  };
}

const EXPIRY_SECS = 120;
