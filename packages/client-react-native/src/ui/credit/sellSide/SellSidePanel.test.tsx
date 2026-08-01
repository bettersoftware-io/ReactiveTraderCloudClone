import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const ADAPTIVE_BANK_ID = 9;

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

const DEALERS: readonly Dealer[] = [
  { id: ADAPTIVE_BANK_ID, name: ADAPTIVE_BANK_NAME },
  { id: 1, name: "Bank A" },
];

// THE §3.1 DECISION, ENCODED. The prototype shows one rotating ticket; the seam
// has many open at once. If this ever passes with a length of 1, the panel has
// quietly reverted to the prototype's information architecture.
test("renders a ticket per open rfq, not just the first", async () => {
  await renderPanel({
    rfqs: [openRfq(5), openRfq(6), openRfq(7)],
    quoteFor: () => {
      return unpriced();
    },
  });

  expect(screen.getAllByTestId(/^sell-side-ticket-/)).toHaveLength(3);
});

test("renders an empty state when nothing is open", async () => {
  await renderPanel({
    rfqs: [],
    quoteFor: () => {
      return undefined;
    },
  });
  expect(screen.getByTestId("sell-side-empty")).toBeTruthy();
});

test("skips an rfq this desk was not asked to price", async () => {
  await renderPanel({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return {
        id: 88,
        rfqId: 5,
        dealerId: 1,
        state: { type: "pendingWithoutPrice" },
      };
    },
  });

  expect(screen.queryByTestId("sell-side-ticket-5")).toBeNull();
});

test("stepping the price and submitting sends the desk's own quote", async () => {
  const submitPrice = jest.fn<(quoteId: number, price: number) => void>();
  await renderPanel({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return unpriced();
    },
    submitPrice,
  });

  // Seeded from the instrument's 98.4 reference price.
  await fireEvent.press(screen.getByTestId("price-stepper-up"));
  await fireEvent.press(screen.getByTestId("sell-side-submit-5"));

  expect(submitPrice).toHaveBeenCalledWith(88, 98.45);
});

test("a client Buy asks the desk for an OFFER, a client Sell for a BID", async () => {
  await renderPanel({
    rfqs: [openRfq(5, Direction.Buy)],
    quoteFor: () => {
      return unpriced();
    },
  });
  expect(screen.getByText("SUBMIT OFFER")).toBeTruthy();
  expect(screen.getByText(/CLIENT BUYS/)).toBeTruthy();

  await renderPanel({
    rfqs: [openRfq(5, Direction.Sell)],
    quoteFor: () => {
      return unpriced();
    },
  });
  expect(screen.getByText("SUBMIT BID")).toBeTruthy();
  expect(screen.getByText(/CLIENT SELLS/)).toBeTruthy();
});

// Won/lost comes from real QuoteState, NOT a 2600ms resolve timer (§3.1).
test("an accepted quote reads WON and a rejected one LOST", async () => {
  await renderPanel({
    rfqs: [settledRfq(5), settledRfq(6)],
    quoteFor: (rfqId: number): Quote => {
      return {
        id: rfqId,
        rfqId,
        dealerId: ADAPTIVE_BANK_ID,
        state:
          rfqId === 5
            ? { type: "accepted", price: 99.5 }
            : { type: "rejectedWithPrice", price: 97.25 },
      };
    },
  });

  expect(screen.getByTestId("sell-side-status-5")).toHaveTextContent("WON");
  expect(screen.getByTestId("sell-side-status-6")).toHaveTextContent("LOST");
  expect(screen.getByText("99.50")).toBeTruthy();
});

test("a priced-but-undecided quote leaves the ticket and reads PENDING", async () => {
  await renderPanel({
    rfqs: [openRfq(5)],
    quoteFor: () => {
      return {
        id: 88,
        rfqId: 5,
        dealerId: ADAPTIVE_BANK_ID,
        state: { type: "pendingWithPrice", price: 98.45 },
      };
    },
  });

  expect(screen.queryByTestId("sell-side-ticket-5")).toBeNull();
  expect(screen.getByTestId("sell-side-status-5")).toHaveTextContent("PENDING");
});

function unpriced(): Quote {
  return {
    id: 88,
    rfqId: 5,
    dealerId: ADAPTIVE_BANK_ID,
    state: { type: "pendingWithoutPrice" },
  };
}

function openRfq(id: number, direction: Direction = Direction.Buy): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function settledRfq(id: number): Rfq {
  return { ...openRfq(id), state: RfqState.Closed };
}

interface Fake {
  rfqs: readonly Rfq[];
  quoteFor: (rfqId: number) => Quote | undefined;
  submitPrice?: (quoteId: number, price: number) => void;
}

function renderPanel(opts: Fake): Promise<unknown> {
  const viewModel = {
    useRfqs: () => {
      return opts.rfqs;
    },
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useQuotesForRfq: (rfqId: number) => {
      const quote = opts.quoteFor(rfqId);
      return quote ? [quote] : [];
    },
    useRfqCountdown: () => {
      return 60_000;
    },
    useTicketSubmission: () => {
      return {
        state: { submitted: false },
        submitPrice: opts.submitPrice ?? noopSubmit,
        pass: noopPass,
      };
    },
  } as unknown as ViewModel;

  return renderWithTheme(
    <ViewModelProvider viewModel={viewModel}>
      <SellSidePanel />
    </ViewModelProvider>,
  );
}

function noopSubmit(): void {}

function noopPass(): void {}
