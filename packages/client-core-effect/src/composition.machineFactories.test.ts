import { NEVER, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Machine, Presenters } from "@rtc/core-api";
import type { CurrencyPair } from "@rtc/domain";

import { composeMachinesWithBase, createMachineFactories } from "#/composition";

// `createMachineFactories` is a WIRING TABLE: each thunk pairs a machine with
// the presenter members that feed it, and every entry looks plausible, so a
// mis-wire is invisible — `staleFlag` and `analyticsStaleFlag` differ ONLY in
// which stream they read. These cases assert WHICH presenter member each
// NATIVE factory reaches for, not what the resulting machine does (the
// machines have their own tests).

describe("createMachineFactories — native wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("staleFlag watches the PRICE stream for its pair", () => {
    const { presenters, spies } = createStubPresenters();

    createMachineFactories(presenters).staleFlag(PAIR).dispose();

    expect(spies.price$).toHaveBeenCalledWith(PAIR);
  });

  it("analyticsStaleFlag watches ANALYTICS, not the price stream", () => {
    const { presenters, spies } = createStubPresenters();

    createMachineFactories(presenters).analyticsStaleFlag().dispose();

    expect(spies.price$).not.toHaveBeenCalled();
  });

  it("builds tileExecution, rowHighlight and notional without an eager side effect", () => {
    const { presenters, spies } = createStubPresenters();
    const factories = createMachineFactories(presenters);

    const tileExecution = factories.tileExecution(PAIR);
    const rowHighlight = factories.rowHighlight(true);
    const notional = factories.notional(1_000_000);

    expect(tileExecution).toBeDefined();
    expect(rowHighlight).toBeDefined();
    expect(notional).toBeDefined();

    // Constructing a tile machine must not trade.
    expect(spies.execute).not.toHaveBeenCalled();

    // Every machine built here forks real Effect fibers (rowHighlight a 3 s
    // timer, staleFlag-shaped machines a live subscription) into a scope
    // nobody else closes — dispose each so the suite leaves nothing
    // detached, as the async twin does.
    tileExecution.dispose();
    rowHighlight.dispose();
    notional.dispose();
  });

  it("rfqTile reaches rfqQuote.requestQuote lazily — not at construction", async () => {
    const { presenters, spies } = createStubPresenters();

    const tile = createMachineFactories(presenters).rfqTile(PAIR);
    await settle();

    expect(spies.requestQuote).not.toHaveBeenCalled();
    tile.intents.requestQuote();
    await settle();
    expect(spies.requestQuote).toHaveBeenCalledWith("EURUSD", 4);
    tile.dispose();
  });

  it("rfqSubmission and ticketSubmission reach for DIFFERENT rfqs members", () => {
    const { presenters, spies } = createStubPresenters();
    const factories = createMachineFactories(presenters);

    factories.rfqSubmission().dispose();

    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).not.toHaveBeenCalled();

    factories.ticketSubmission().dispose();

    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).toHaveBeenCalledTimes(1);
  });

  it("rfqCountdown builds a machine of its own, with no presenter behind it", () => {
    const { presenters } = createStubPresenters();

    const countdown = createMachineFactories(presenters).rfqCountdown(
      Date.now(),
      1_000,
    );

    expect(countdown).toBeDefined();
    countdown.dispose();
  });

  it("a ported factory is a NEW closure and an unported one is the base's own", () => {
    const { presenters } = createStubPresenters();
    const { base, machines } = composeMachinesWithBase(presenters);

    // What `parity.test.ts` reads as native vs delegated, asserted here on
    // the one composition where both halves are in hand.
    expect(machines.notional).not.toBe(base.notional);
    expect(machines.staleFlag).not.toBe(base.staleFlag);
    expect(machines.rfqTile).not.toBe(base.rfqTile);
    expect(machines.rfqCountdown).not.toBe(base.rfqCountdown);
    expect(machines.boot).toBe(base.boot);
  });
});

interface FactorySpies {
  price$: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  requestQuote: ReturnType<typeof vi.fn>;
  createSubmission: ReturnType<typeof vi.fn>;
  createTicketSubmission: ReturnType<typeof vi.fn>;
  setVariant: ReturnType<typeof vi.fn>;
}

interface PresenterStub {
  presenters: Presenters;
  spies: FactorySpies;
}

const PAIR = { symbol: "EURUSD", pipsPosition: 4 } as unknown as CurrencyPair;

/** Stubs only the presenter members these factories touch. The cast is
 * deliberate and narrow — widening it to a full `Presenters` double would add
 * ~20 unused members whose drift nobody would notice. */
function createStubPresenters(): PresenterStub {
  const spies: FactorySpies = {
    price$: vi.fn(() => {
      return NEVER;
    }),
    execute: vi.fn(() => {
      return of(undefined);
    }),
    requestQuote: vi.fn(() => {
      return NEVER;
    }),
    createSubmission: vi.fn(createInertMachine),
    createTicketSubmission: vi.fn(createInertMachine),
    setVariant: vi.fn(),
  };

  const presenters = {
    priceStream: { price$: spies.price$ },
    connection: { status$: NEVER },
    analytics: { position$: NEVER },
    execution: { execute: spies.execute },
    rfqQuote: { requestQuote: spies.requestQuote },
    rfqs: {
      createSubmission: spies.createSubmission,
      createTicketSubmission: spies.createTicketSubmission,
    },
    ordersBlotter: {
      place: () => {
        return of(undefined);
      },
    },
    bootPreference: {
      current: () => {
        return "core";
      },
      setVariant: spies.setVariant,
    },
    layoutFor: () => {
      return undefined;
    },
  } as unknown as Presenters;

  return { presenters, spies };
}

/** The narrowest thing the two submission factories may hand back: a
 * machine the wiring case can dispose without running anything. */
function createInertMachine(): Machine<unknown, Record<string, never>> {
  return { state$: NEVER as never, intents: {}, dispose: vi.fn() };
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}
