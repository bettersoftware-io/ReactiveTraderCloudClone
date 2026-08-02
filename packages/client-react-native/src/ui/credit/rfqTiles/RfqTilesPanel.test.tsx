import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { useState } from "react";

import {
  type CreditRfqFilter,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
    refPrice: 98.4,
  },
];
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

test("defaults to the Live filter, which hides settled-but-untraded RFQs", async () => {
  await renderPanel({
    rfqs: [rfq(1, RfqState.Open), rfq(3, RfqState.Expired)],
  });
  expect(screen.getByTestId("rfq-card-1")).toBeTruthy();
  expect(screen.queryByTestId("rfq-card-3")).toBeNull();
});

// The accept linger, seen from the panel: a traded rfq stays put under LIVE so
// its ACCEPTED stamp can be read, and leaves only when dismissed.
test("a traded RFQ stays under Live until it is dismissed", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("rfq-dismiss-2"));

  expect(screen.queryByTestId("rfq-card-2")).toBeNull();
});

test("switching to ALL reveals closed RFQs", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  await fireEvent.press(screen.getByTestId("rfq-filter-all"));
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();
});

test("empty state when no RFQs match", async () => {
  // Expired, not Closed: a traded rfq deliberately survives the Live filter.
  await renderPanel({ rfqs: [rfq(3, RfqState.Expired)] });
  expect(screen.getByTestId("credit-tiles-empty")).toBeTruthy();
});

test("renders one card per matching rfq", async () => {
  await renderPanel({
    rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Open), rfq(3, RfqState.Open)],
  });
  expect(screen.getAllByTestId(/^rfq-card-/)).toHaveLength(3);
});

test("dismissing a settled RFQ removes it from the list", async () => {
  await renderPanel({ rfqs: [rfq(3, RfqState.Expired)] });
  await fireEvent.press(screen.getByTestId("rfq-filter-all"));
  expect(screen.getByTestId("rfq-card-3")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("rfq-dismiss-3"));
  expect(screen.queryByTestId("rfq-card-3")).toBeNull();
});

function rfq(id: number, state: RfqState): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: id,
  };
}

interface FakeOpts {
  rfqs: readonly Rfq[];
  accept?: (id: number) => Promise<void>;
  filter?: CreditRfqFilter;
}

function fakeViewModel(
  opts: FakeOpts,
  filterPref: CreditRfqFilterPref,
): ViewModel {
  return {
    useRfqs: () => {
      return opts.rfqs;
    },
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useAcceptQuote: () => {
      return (
        opts.accept ??
        (() => {
          return Promise.resolve();
        })
      );
    },
    useQuotesForRfq: () => {
      return [] as readonly Quote[];
    },
    useRfqCountdown: () => {
      return 60_000;
    },
    // The countdown ring's motion gate reads power-saver off the same seam.
    usePowerSaver: () => {
      return { isFreeze: false };
    },
    // The RFQ filter is a shared preference now, not panel-local state. Both
    // the panel and its tabs call this hook, so the fake must hand them the
    // SAME value — a per-call `useState` would give each its own copy and the
    // tabs would silently stop driving the list.
    useCreditRfqFilterPreference: () => {
      return filterPref;
    },
  } as unknown as ViewModel;
}

interface CreditRfqFilterPref {
  filter: CreditRfqFilter;
  setFilter: (next: CreditRfqFilter) => void;
}

/** Holds the shared filter in real React state so a tab press re-renders the
 * whole subtree, exactly as the preference stream does in the app. */
function renderPanel(opts: FakeOpts): Promise<unknown> {
  // Declared INSIDE the helper, as `useRowInsertFlash.test.tsx` does: Biome's
  // `useComponentExportOnlyModules` rejects a top-level unexported component in
  // a module that also holds non-components, which every test file does.
  function PanelHarness(): JSX.Element {
    const [filter, setFilter] = useState<CreditRfqFilter>(
      opts.filter ?? "live",
    );

    return (
      <ViewModelProvider viewModel={fakeViewModel(opts, { filter, setFilter })}>
        <RfqTilesPanel />
      </ViewModelProvider>
    );
  }

  return renderWithTheme(<PanelHarness />);
}
