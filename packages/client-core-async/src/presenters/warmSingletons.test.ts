import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  AnalyticsPort,
  CurrencyPair,
  Dealer,
  DealerPort,
  Instrument,
  InstrumentPort,
  PositionUpdates,
  ReferenceDataPort,
} from "@rtc/domain";

import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
  createDealersPresenter,
  createInstrumentsPresenter,
} from "#/presenters/warmSingletons";

describe("warm singleton presenters (async)", () => {
  it("currencyPairs: calls the port once at construction, holds the subscription across zero subscribers, releases it on the lifetime abort", () => {
    const { port, calls, pairs } = createReferenceData();
    const lifetime = new AbortController();
    const presenter = createCurrencyPairsPresenter(port, lifetime.signal);
    expect(calls.count).toBe(1);
    presenter.pairs$.subscribe(() => {}).unsubscribe();
    expect(calls.count).toBe(1);
    expect(pairs.observed).toBe(true);
    lifetime.abort();
    expect(pairs.observed).toBe(false);
  });

  it("analytics: same warm-singleton shape", () => {
    const { port, calls, position } = createAnalytics();
    const lifetime = new AbortController();
    const presenter = createAnalyticsPresenter(port, lifetime.signal);
    expect(calls.count).toBe(1);
    presenter.position$.subscribe(() => {}).unsubscribe();
    expect(calls.count).toBe(1);
    expect(position.observed).toBe(true);
    lifetime.abort();
    expect(position.observed).toBe(false);
  });

  it("dealers: same warm-singleton shape", () => {
    const { port, calls, roster } = createDealers();
    const lifetime = new AbortController();
    const presenter = createDealersPresenter(port, lifetime.signal);
    expect(calls.count).toBe(1);
    presenter.list$.subscribe(() => {}).unsubscribe();
    expect(calls.count).toBe(1);
    expect(roster.observed).toBe(true);
    lifetime.abort();
    expect(roster.observed).toBe(false);
  });

  it("instruments: same warm-singleton shape", () => {
    const { port, calls, roster } = createInstruments();
    const lifetime = new AbortController();
    const presenter = createInstrumentsPresenter(port, lifetime.signal);
    expect(calls.count).toBe(1);
    presenter.list$.subscribe(() => {}).unsubscribe();
    expect(calls.count).toBe(1);
    expect(roster.observed).toBe(true);
    lifetime.abort();
    expect(roster.observed).toBe(false);
  });

  interface CallCount {
    count: number;
  }

  interface ReferenceDataFixture {
    port: ReferenceDataPort;
    calls: CallCount;
    pairs: Subject<readonly CurrencyPair[]>;
  }

  interface AnalyticsFixture {
    port: AnalyticsPort;
    calls: CallCount;
    position: Subject<PositionUpdates>;
  }

  interface DealersFixture {
    port: DealerPort;
    calls: CallCount;
    roster: Subject<readonly Dealer[]>;
  }

  interface InstrumentsFixture {
    port: InstrumentPort;
    calls: CallCount;
    roster: Subject<readonly Instrument[]>;
  }

  function createReferenceData(): ReferenceDataFixture {
    const calls: CallCount = { count: 0 };
    const pairs = new Subject<readonly CurrencyPair[]>();
    return {
      calls,
      pairs,
      port: {
        getCurrencyPairs: () => {
          calls.count += 1;
          return pairs;
        },
      },
    };
  }

  function createAnalytics(): AnalyticsFixture {
    const calls: CallCount = { count: 0 };
    const position = new Subject<PositionUpdates>();
    return {
      calls,
      position,
      port: {
        getAnalytics: () => {
          calls.count += 1;
          return position;
        },
      },
    };
  }

  function createDealers(): DealersFixture {
    const calls: CallCount = { count: 0 };
    const roster = new Subject<readonly Dealer[]>();
    return {
      calls,
      roster,
      port: {
        getDealers: () => {
          calls.count += 1;
          return roster;
        },
      },
    };
  }

  function createInstruments(): InstrumentsFixture {
    const calls: CallCount = { count: 0 };
    const roster = new Subject<readonly Instrument[]>();
    return {
      calls,
      roster,
      port: {
        getInstruments: () => {
          calls.count += 1;
          return roster;
        },
      },
    };
  }
});
