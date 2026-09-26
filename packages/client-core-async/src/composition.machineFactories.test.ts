import { NEVER, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Presenters } from "@rtc/core-api";
import type { CurrencyPair } from "@rtc/domain";

import { createMachineFactories } from "#/composition";

// `nativeMachines` is a WIRING TABLE: every entry looks plausible, so a
// mis-wire is invisible — `staleFlag` and `analyticsStaleFlag` differ ONLY
// in which stream they read. These tests assert WHICH presenter member each
// factory reaches for, not what the resulting machine does; the machines
// have their own tests. The RxJS precedent is
// `packages/client-core/src/composition.machineFactories.test.ts`.

describe("nativeMachines — wiring", () => {
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

    // The discriminator: these two factories are otherwise identical, so a
    // copy-paste from staleFlag would fail here.
    expect(spies.price$).not.toHaveBeenCalled();
  });

  it("tileExecution reaches execution.execute lazily — not at construction", () => {
    const { presenters, spies } = createStubPresenters();

    const machine = createMachineFactories(presenters).tileExecution(PAIR);

    expect(spies.execute).not.toHaveBeenCalled();
    machine.dispose();
  });

  it("rfqTile reaches rfqQuote.requestQuote lazily — not at construction", () => {
    const { presenters, spies } = createStubPresenters();

    const machine = createMachineFactories(presenters).rfqTile(PAIR);

    expect(spies.requestQuote).not.toHaveBeenCalled();
    machine.intents.requestQuote();
    expect(spies.requestQuote).toHaveBeenCalledWith("EURUSD", 4);
    machine.dispose();
  });

  it("rfqSubmission and ticketSubmission reach for DIFFERENT rfqs members", () => {
    const { presenters, spies } = createStubPresenters();
    const machines = createMachineFactories(presenters);

    machines.rfqSubmission();

    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).not.toHaveBeenCalled();
    machines.ticketSubmission();
    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).toHaveBeenCalledTimes(1);
  });

  it("rfqCountdown seeds from BOTH fields of its seed — a 1 000 ms window created now starts at 1 000", () => {
    // Freeze the wall clock: the machine reads `Date.now()` a second time
    // internally, so an unmocked clock can read elapsed=1 on a loaded
    // runner and flake to 999.
    //
    // What this catches: the seeded VALUE catches a dropped or hard-coded
    // field (either one missing reads as a clamped 0), which `toBeDefined()`
    // would not. A SWAPPED pair is a type error since the seed became an
    // object — the formula is symmetric in the two fields, so no value
    // could have caught it.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    try {
      const { presenters } = createStubPresenters();

      const countdown = createMachineFactories(presenters).rfqCountdown({
        creationTimestamp: Date.now(),
        totalMs: 1_000,
      });

      let seen: number | null = null;
      countdown.state$
        .subscribe((value: number) => {
          seen = value;
        })
        .unsubscribe();
      expect(seen).toBe(1_000);
      countdown.dispose();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("orderTicket reaches ordersBlotter.place lazily — not at construction, then with the submitted request", () => {
    const { presenters, spies } = createStubPresenters();

    const machine = createMachineFactories(presenters).orderTicket("AAPL");

    expect(spies.place).not.toHaveBeenCalled();
    machine.intents.setQty(1);
    machine.intents.submit();
    expect(spies.place).toHaveBeenCalledTimes(1);
    expect(spies.place).toHaveBeenCalledWith({
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 1,
    });
    machine.dispose();
  });

  interface FactorySpies {
    price$: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    requestQuote: ReturnType<typeof vi.fn>;
    createSubmission: ReturnType<typeof vi.fn>;
    createTicketSubmission: ReturnType<typeof vi.fn>;
    place: ReturnType<typeof vi.fn>;
  }

  interface PresenterStub {
    presenters: Presenters;
    spies: FactorySpies;
  }

  /** Stubs only the presenter members these factories touch. The cast is
   * deliberate and narrow — widening it to a full `Presenters` double would
   * add ~20 unused members whose drift nobody would notice. */
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
      createSubmission: vi.fn(),
      createTicketSubmission: vi.fn(),
      place: vi.fn(() => {
        return NEVER;
      }),
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
      ordersBlotter: { place: spies.place },
      bootPreference: {
        current: () => {
          return "core";
        },
        setVariant: vi.fn(),
      },
      layoutFor: vi.fn(),
    } as unknown as Presenters;

    return { presenters, spies };
  }
});

const PAIR = { symbol: "EURUSD", pipsPosition: 4 } as unknown as CurrencyPair;
