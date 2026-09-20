import { NEVER, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Presenters } from "@rtc/core-api";
import type { CurrencyPair } from "@rtc/domain";

import { composeMachinesWithBase } from "#/composition";

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

    composeMachinesWithBase(presenters).machines.staleFlag(PAIR).dispose();

    expect(spies.price$).toHaveBeenCalledWith(PAIR);
  });

  it("analyticsStaleFlag watches ANALYTICS, not the price stream", () => {
    const { presenters, spies } = createStubPresenters();

    composeMachinesWithBase(presenters).machines.analyticsStaleFlag().dispose();

    // The discriminator: these two factories are otherwise identical, so a
    // copy-paste from staleFlag would fail here.
    expect(spies.price$).not.toHaveBeenCalled();
  });

  it("tileExecution reaches execution.execute lazily — not at construction", () => {
    const { presenters, spies } = createStubPresenters();

    const machine =
      composeMachinesWithBase(presenters).machines.tileExecution(PAIR);

    expect(spies.execute).not.toHaveBeenCalled();
    machine.dispose();
  });

  it("rfqTile reaches rfqQuote.requestQuote lazily — not at construction", () => {
    const { presenters, spies } = createStubPresenters();

    const machine = composeMachinesWithBase(presenters).machines.rfqTile(PAIR);

    expect(spies.requestQuote).not.toHaveBeenCalled();
    machine.intents.requestQuote();
    expect(spies.requestQuote).toHaveBeenCalledWith("EURUSD", 4);
    machine.dispose();
  });

  it("rfqSubmission and ticketSubmission reach for DIFFERENT rfqs members", () => {
    const { presenters, spies } = createStubPresenters();
    const { machines } = composeMachinesWithBase(presenters);

    machines.rfqSubmission();

    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).not.toHaveBeenCalled();
    machines.ticketSubmission();
    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).toHaveBeenCalledTimes(1);
  });

  it("rowHighlight and notional are native — not the base's factories", () => {
    const { presenters } = createStubPresenters();
    const { base, machines } = composeMachinesWithBase(presenters);

    expect(machines.rowHighlight).not.toBe(base.rowHighlight);
    expect(machines.notional).not.toBe(base.notional);
    expect(machines.rfqTile).not.toBe(base.rfqTile);
    expect(machines.rfqCountdown).not.toBe(base.rfqCountdown);
    // A delegated member is still reference-identical to the base's.
    expect(machines.boot).toBe(base.boot);
  });

  interface FactorySpies {
    price$: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    requestQuote: ReturnType<typeof vi.fn>;
    createSubmission: ReturnType<typeof vi.fn>;
    createTicketSubmission: ReturnType<typeof vi.fn>;
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
      ordersBlotter: { place: vi.fn() },
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
