import { firstValueFrom, lastValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EquityOrderSimulator } from "./EquityOrderSimulator.js";

// cancel() had no spec of its own: the port contract only places orders. Both
// of its arms matter — cancelling a real order must mark exactly that row, and
// cancelling an unknown id must be a silent no-op rather than a throw, because
// a stale id arrives routinely (a fill lands while the user is clicking ✕).

beforeEach(() => {
  return vi.useFakeTimers();
});

afterEach(() => {
  return vi.useRealTimers();
});

describe("EquityOrderSimulator cancel", () => {
  it("marks the matching order cancelled and leaves the others alone", async () => {
    const sim = new EquityOrderSimulator();

    const first = await placed(sim, "AAPL");
    const second = await placed(sim, "MSFT");

    await lastValueFrom(sim.cancel(first.id));

    const book = await firstValueFrom(sim.orders());

    expect(statusOf(book, first.id)).toBe("cancelled");
    expect(statusOf(book, second.id)).not.toBe("cancelled");
  });

  it("is a no-op for an id that is not in the book", async () => {
    const sim = new EquityOrderSimulator();
    const order = await placed(sim, "AAPL");
    const before = await firstValueFrom(sim.orders());

    await expect(
      lastValueFrom(sim.cancel("eq-does-not-exist")),
    ).resolves.toBeUndefined();

    const after = await firstValueFrom(sim.orders());

    expect(after).toEqual(before);
    expect(statusOf(after, order.id)).not.toBe("cancelled");
  });

  it("leaves an empty book empty", async () => {
    const sim = new EquityOrderSimulator();

    await lastValueFrom(sim.cancel("eq-1"));

    expect(await firstValueFrom(sim.orders())).toEqual([]);
  });
});

/** Places a market order and settles its whole lifecycle, so the book holds a
 * terminal row before the test acts on it. */
async function placed(
  sim: EquityOrderSimulator,
  symbol: string,
): Promise<{ id: string }> {
  const pending = lastValueFrom(
    sim.place({ symbol, side: "buy", type: "market", qty: 100 }),
  );

  await vi.advanceTimersByTimeAsync(5_000);

  return pending;
}

function statusOf(
  book: readonly { id: string; status: string }[],
  id: string,
): string | undefined {
  return book.find((order) => {
    return order.id === id;
  })?.status;
}
