import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";

const INSTRUMENT: Instrument = {
  id: 1,
  name: "Acme 5.5% 2030",
  cusip: "000000AA1",
  ticker: "ACME",
  maturity: "2030",
  interestRate: 5.5,
  benchmark: "T 4.0 2030",
  refPrice: 98.4,
};
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

// dc.html:233 — `BUY · 1.0M USD · #3045`: the side in caps and coloured, then
// the abbreviated notional and the RFQ id, all separated by middots. The app
// printed `Buy | Qty: 25` here until 2026-08-30.
test("shows the instrument and the design's BUY · notional · #id subtitle", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByTestId("rfq-card-3")).toBeTruthy();
  expect(screen.getByText("Acme 5.5% 2030")).toBeTruthy();
  expect(screen.getByTestId("rfq-meta-3")).toHaveTextContent(
    "BUY · 25 USD · #3",
  );
});

test("upper-cases a Sell side too", async () => {
  await renderCard({ ...rfq(RfqState.Open), direction: Direction.Sell }, []);
  expect(screen.getByTestId("rfq-meta-3")).toHaveTextContent(
    "SELL · 25 USD · #3",
  );
});

// The prototype only ever seeds whole millions, so `toFixed(1)` alone is the
// whole rule there; the app has to survive the smaller RFQs the domain can
// produce without abbreviating them to `0.0M USD`.
test("abbreviates the notional the way the design does", async () => {
  await renderCard({ ...rfq(RfqState.Open), quantity: 5_000_000 }, []);
  expect(screen.getByTestId("rfq-meta-3")).toHaveTextContent(
    "BUY · 5.0M USD · #3",
  );
});

test("falls back to thousands below a million rather than 0.0M", async () => {
  await renderCard({ ...rfq(RfqState.Open), quantity: 250_000 }, []);
  expect(screen.getByTestId("rfq-meta-3")).toHaveTextContent(
    "BUY · 250K USD · #3",
  );
});

// The prototype's header slot is exclusive: a live RFQ shows the countdown
// ring, a closed one shows the state pill (dc.html:228-237). A live card needs
// no "Live" badge — the running ring already says so.
test("an open RFQ shows the countdown ring in place of a state badge", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
  expect(screen.queryByTestId("rfq-badge-3")).toBeNull();
});

// "Accepted" is not an `RfqState` member: the domain models a traded RFQ as
// `Closed` (the web client's `rfqCardVm` derives `accepted` the same way).
test("stamps a traded rfq in the header slot, not below the quote rows", async () => {
  await renderCard(rfq(RfqState.Closed), []);
  // The prototype's header slot is exclusive: a countdown ring while live, one
  // animated state pill once settled (dc.html:238). We used to render BOTH a
  // static `Done` here AND a boxed `ACCEPTED` banner under the rows — two
  // elements for one fact, spending a row of the scarcest resource on a phone.
  expect(screen.getByTestId("rfq-badge-3")).toHaveTextContent("✓ ACCEPTED");
  // Exactly one element says it. `getBy*` throws on multiple matches, so this
  // is the assertion that actually pins the merge — a second banner would fail
  // here even if the header pill were correct.
  expect(screen.getByText("✓ ACCEPTED")).toBeTruthy();
});

test("does not render the stamp while the rfq is live", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.queryByText("✓ ACCEPTED")).toBeNull();
  // A live card's header holds the ring instead — the slot is one-or-the-other.
  expect(screen.getByTestId("rfq-countdown-ring")).toBeTruthy();
});

test("an expired rfq gets the neutral pill, never the accepted one", async () => {
  await renderCard(rfq(RfqState.Expired), []);
  expect(screen.queryByText("✓ ACCEPTED")).toBeNull();
  expect(screen.getByTestId("rfq-badge-3")).toHaveTextContent("Expired");
});

test("a closed RFQ shows the state badge and a dismiss button, no ring", async () => {
  await renderCard(rfq(RfqState.Closed), []);
  expect(screen.queryByTestId("rfq-countdown-ring")).toBeNull();
  expect(screen.getByTestId("rfq-badge-3")).toHaveTextContent("✓ ACCEPTED");
  expect(screen.getByTestId("rfq-dismiss-3")).toBeTruthy();
});

test("renders a quote per quote", async () => {
  const quotes: Quote[] = [
    {
      id: 42,
      rfqId: 3,
      dealerId: 7,
      state: { type: "pendingWithPrice", price: 99 },
    },
  ];
  await renderCard(rfq(RfqState.Open), quotes);
  expect(screen.getByTestId("quote-accept-42")).toBeTruthy();
});

test("renders a gradient tile surface on 3d skins", async () => {
  await renderCard(rfq(RfqState.Open), [], rnThemeTokens.holo3d.dark);
  expect(screen.getByTestId("surface-sheen")).toBeTruthy();
});

test("flat skins render no gradient tile surface", async () => {
  // renderCard defaults to holo.dark (a flat skin, depth.level 0).
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function rfq(state: RfqState): Rfq {
  return {
    id: 3,
    instrumentId: 1,
    quantity: 25,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function fakeViewModel(remainingMs: number): ViewModel {
  return {
    useRfqCountdown: () => {
      return remainingMs;
    },
    // The ring's motion gate reads power-saver off the same seam.
    usePowerSaver: () => {
      return { isFreeze: false };
    },
  } as unknown as ViewModel;
}

function renderCard(
  rfqValue: Rfq,
  quotes: readonly Quote[],
  theme?: RnTheme,
): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(60_000)}>
      <RfqCard
        rfq={rfqValue}
        quotes={quotes}
        instrument={INSTRUMENT}
        dealers={DEALERS}
        onAccept={() => {
          return undefined;
        }}
        onDismiss={() => {
          return undefined;
        }}
      />
    </ViewModelProvider>,
    theme,
  );
}
