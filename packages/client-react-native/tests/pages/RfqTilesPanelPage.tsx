// packages/client-react-native/tests/pages/RfqTilesPanelPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { useState } from "react";

import type {
  CreditRfqFilter,
  Dealer,
  Instrument,
  Quote,
  Rfq,
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

interface RfqTilesPanelFixture {
  rfqs: readonly Rfq[];
  accept?: (id: number) => Promise<void>;
  filter?: CreditRfqFilter;
}

interface CreditRfqFilterPref {
  filter: CreditRfqFilter;
  setFilter: (next: CreditRfqFilter) => void;
}

function fakeViewModel(
  opts: RfqTilesPanelFixture,
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

export interface RfqTilesPanelPage {
  mount(opts: RfqTilesPanelFixture): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  matchingCount(pattern: RegExp): number;
  press(testId: string): Promise<void>;
}

/** The framework surface for `RfqTilesPanel.test.tsx`. */
export function rfqTilesPanelPage(): RfqTilesPanelPage {
  interface PanelHarnessProps {
    opts: RfqTilesPanelFixture;
  }

  // Declared inside the factory (not at module scope), as `useActiveModule`'s
  // page does: Biome's `useComponentExportOnlyModules` requires every
  // top-level component in a module to be exported, which a page-internal
  // test fixture must not be. Holds the shared filter in real React state so
  // a tab press re-renders the whole subtree, exactly as the preference
  // stream does in the app.
  function PanelHarness({ opts }: PanelHarnessProps): JSX.Element {
    const [filter, setFilter] = useState<CreditRfqFilter>(
      opts.filter ?? "live",
    );

    return (
      <ViewModelProvider viewModel={fakeViewModel(opts, { filter, setFilter })}>
        <RfqTilesPanel />
      </ViewModelProvider>
    );
  }

  return {
    async mount(opts: RfqTilesPanelFixture): Promise<void> {
      await renderWithTheme(<PanelHarness opts={opts} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    matchingCount(pattern: RegExp): number {
      return screen.queryAllByTestId(pattern).length;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
