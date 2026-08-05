import { NEVER, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { CurrencyPair } from "@rtc/domain";

import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "#/layout/defaultLayoutPort";
import { createLayoutMachine } from "#/presenters/LayoutMachine";

import { createMachineFactories, type Presenters } from "./composition";

// `createMachineFactories` is a WIRING TABLE: ~12 thunks, each pairing a machine
// with the presenter members that feed it. Every entry looks plausible, so a
// mis-wire is invisible — `staleFlag` and `analyticsStaleFlag` differ ONLY in
// which stream they read. That is the same shape as appHeadRegistry, which sat
// at 0% inside a passing 98.45% tier in this repo.
//
// So these tests assert WHICH presenter member each factory reaches for, not
// what the resulting machine does — the machines have their own tests.

describe("createMachineFactories — wiring", () => {
  it("staleFlag watches the PRICE stream for its pair", () => {
    const { presenters, spies } = stubPresenters();

    createMachineFactories(presenters).staleFlag(PAIR);

    expect(spies.price$).toHaveBeenCalledWith(PAIR);
  });

  it("analyticsStaleFlag watches ANALYTICS, not the price stream", () => {
    const { presenters, spies } = stubPresenters();

    createMachineFactories(presenters).analyticsStaleFlag();

    // The discriminator: these two factories are otherwise identical, so if
    // analyticsStaleFlag had been copy-pasted from staleFlag this would fail.
    expect(spies.price$).not.toHaveBeenCalled();
  });

  it("rfqSubmission and ticketSubmission reach for DIFFERENT rfqs members", () => {
    const { presenters, spies } = stubPresenters();
    const factories = createMachineFactories(presenters);

    factories.rfqSubmission();

    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createTicketSubmission).not.toHaveBeenCalled();

    factories.ticketSubmission();

    expect(spies.createTicketSubmission).toHaveBeenCalledTimes(1);
    expect(spies.createSubmission).toHaveBeenCalledTimes(1);
  });

  it("boot seeds from the persisted variant and advances it for the next boot", () => {
    const { presenters, spies } = stubPresenters();

    createMachineFactories(presenters).boot(() => {});

    // Constructing the machine ADVANCES the stored variant — that is the
    // round-robin giving each boot a different scene, and it is why the factory
    // reads `current()` and writes `setVariant()` rather than being a pure
    // construction. Pinning it here guards a side effect that is easy to drop
    // while refactoring.
    expect(spies.setVariant).toHaveBeenCalledTimes(1);
  });

  it("builds every remaining factory without an eager side effect", () => {
    const { presenters, spies } = stubPresenters();
    const factories = createMachineFactories(presenters);

    expect(factories.tileExecution(PAIR)).toBeDefined();
    expect(factories.rfqTile(PAIR)).toBeDefined();
    expect(factories.rowHighlight(true)).toBeDefined();
    expect(factories.notional(1_000_000)).toBeDefined();
    expect(factories.orderTicket("AAPL")).toBeDefined();
    expect(factories.layout("fx")).toBeDefined();

    // None of these should trade, quote or place on construction — a factory
    // with an eager side effect would fire on every machine creation.
    expect(spies.execute).not.toHaveBeenCalled();
    expect(spies.requestQuote).not.toHaveBeenCalled();
    expect(spies.place).not.toHaveBeenCalled();
  });
});

interface FactorySpies {
  price$: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  requestQuote: ReturnType<typeof vi.fn>;
  createSubmission: ReturnType<typeof vi.fn>;
  createTicketSubmission: ReturnType<typeof vi.fn>;
  place: ReturnType<typeof vi.fn>;
  setVariant: ReturnType<typeof vi.fn>;
}

interface PresenterStub {
  presenters: Presenters;
  spies: FactorySpies;
}

const PAIR = { symbol: "EURUSD", pipsPosition: 4 } as unknown as CurrencyPair;

/**
 * Stubs only the presenter members these factories touch. The cast is
 * deliberate and narrow — widening it to a full `Presenters` double would add
 * ~20 unused members whose drift nobody would notice.
 */
function stubPresenters(): PresenterStub {
  const spies: FactorySpies = {
    price$: vi.fn(() => {
      return NEVER;
    }),
    execute: vi.fn(() => {
      return of(undefined);
    }),
    requestQuote: vi.fn(() => {
      return of(undefined);
    }),
    createSubmission: vi.fn(() => {
      return { submit: vi.fn() };
    }),
    createTicketSubmission: vi.fn(() => {
      return { submit: vi.fn() };
    }),
    place: vi.fn(() => {
      return of(undefined);
    }),
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
    ordersBlotter: { place: spies.place },
    bootPreference: {
      current: () => {
        return "core";
      },
      setVariant: spies.setVariant,
    },
    // layoutFor: Task 10 made `factories.layout` a thin passthrough onto this
    // singleton accessor (see composition.ts's `layoutFor` doc) instead of a
    // bare `createLayoutMachine` call — stub it the same narrow way as every
    // other member here, returning a fresh instance per call (this test only
    // asserts the factory returns SOMETHING, not identity/singleton
    // behaviour — that is composition.jarvis.test.ts's job).
    layoutFor: (tab: string) => {
      return createLayoutMachine(createDefaultLayoutPort(tab as WorkspaceTab));
    },
  } as unknown as Presenters;

  return { presenters, spies };
}
