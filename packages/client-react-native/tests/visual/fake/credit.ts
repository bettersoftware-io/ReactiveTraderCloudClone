import type {
  RfqSubmissionIntents,
  RfqSubmissionState,
  RfqTileIntents,
  RfqState as RfqTileState,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/client-core";
import {
  DEALERS_CATALOG,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

import { DAY_MS, PINNED_NOW_MS } from "./pinnedClock";
import type { CreditSlice } from "./sliceTypes";

/** `useRfqTile`'s composed return shape — mirrors `createViewModel.ts`'s own
 * (unexported) `UseRfqTileResult` alias. */
type RfqTileFixture = { state: RfqTileState } & RfqTileIntents;

/** `useRfqSubmission`'s composed return shape — mirrors `createViewModel.ts`'s
 * own (unexported) `UseRfqSubmissionResult` alias. */
type RfqSubmissionFixture = {
  state: RfqSubmissionState;
} & RfqSubmissionIntents;

/** `useTicketSubmission`'s composed return shape — mirrors
 * `createViewModel.ts`'s own (unexported) `UseTicketSubmissionResult` alias. */
type TicketSubmissionFixture = {
  state: TicketSubmissionState;
} & TicketSubmissionIntents;

/**
 * Credit: RFQs, their quotes, the dealer/instrument reference data, and the
 * buy-side / sell-side submission machines.
 *
 * Both scenarios this slice serves — `credit/rfq-tiles` and
 * `credit/sell-side` — mount leaf components (`RfqCard`/`RfqFilterTabs`,
 * `SellSideTicket`) with LITERAL `rfq`/`quotes`/`instrument`/`dealers` props
 * (`CreditRfqTilesFixture`/`CreditSellSideFixture` in `tests/visual/fixtures.tsx`),
 * bypassing `RfqTilesPanel`/`SellSidePanel` — the only readers of
 * `useRfqs`/`useQuotesForRfq`/`useDealers`/`useInstruments`/`useAcceptQuote`.
 * So of this slice's 12 hooks, only THREE are actually read through the seam
 * by what these two scenarios mount:
 *
 *  - **`useRfqCountdown`** — `RfqCard` and `SellSideTicket` both call it
 *    directly (`useRfqCountdown(rfq.creationTimestamp, totalMs)`), but both
 *    fixtures also pass a `pinnedRemainingMs` prop, and
 *    `pinnedRemainingMs ?? liveRemainingMs` means the fixture's pin always
 *    wins — this hook's return value is computed and then discarded in both
 *    scenarios. It still has to be pinned correctly (see below): the "trap"
 *    the brief calls out is that this is the one hook in the whole fake whose
 *    *real* implementation is a live 100ms clock.
 *  - **`useCreditRfqFilterPreference`** — read by `RfqFilterTabs`, which
 *    `credit/rfq-tiles` mounts directly, to compute each pill's active state.
 *  - **`useTicketSubmission`** — read by `SellSideTicket` (`credit/sell-side`
 *    only), but only its two intents (`submitPrice`/`pass`) are destructured;
 *    `state.submitted` is never read; the open/settled branch is driven by
 *    the `rfq`/`quote` props instead.
 *
 * The other nine hooks (`useAcceptQuote`, `useAllQuotes`, `useCancelRfq`,
 * `useDealers`, `useInstruments`, `useQuotesForRfq`, `useRfqs`,
 * `useRfqSubmission`, `useRfqTile`) are not read by either fixture today —
 * `useRfqTile` in particular is never called anywhere in this package at all
 * (it belongs to the FX tile, `client-react`-only). They still get fully
 * correct, populated values here: fixtures pass props today, but a fixture
 * that started reading the seam (mounting `RfqTilesPanel`/`SellSidePanel`
 * instead of the leaf) should pick up real data, not a blank panel.
 */
export const creditSlice: CreditSlice = {
  useAcceptQuote: () => {
    return acceptQuoteNoop;
  },
  useAllQuotes: () => {
    return ALL_QUOTES_BY_ID;
  },
  useCancelRfq: () => {
    return cancelRfqNoop;
  },
  useCreditRfqFilterPreference: () => {
    return { filter: "live", setFilter: setCreditRfqFilterNoop };
  },
  useDealers: () => {
    return DEALERS;
  },
  useInstruments: () => {
    return INSTRUMENTS;
  },
  useQuotesForRfq: (rfqId: number) => {
    return QUOTES_BY_RFQ_ID[rfqId] ?? EMPTY_QUOTES;
  },
  useRfqCountdown: (_creationTimestamp: number, totalMs: number) => {
    // Derived from `totalMs` (a plain argument, not a clock read) — 35% of
    // the window remaining, clear of both the empty and the full edge values
    // so a golden that ever exercises the live path (rather than a fixture's
    // `pinnedRemainingMs` override) still proves the ring paints a partial
    // arc. Mirrors `fixtures.tsx`'s own `PINNED_REMAINING_MS` comment
    // ("mid-window, above the urgent threshold") at the same 120s expiry:
    // 120_000 * 0.35 = 42_000, the exact value that file pins by hand.
    return Math.round(totalMs * 0.35);
  },
  useRfqs: () => {
    return RFQS;
  },
  useRfqSubmission: () => {
    return RFQ_SUBMISSION_EDITING;
  },
  useRfqTile: () => {
    return RFQ_TILE_RESTING;
  },
  useTicketSubmission: () => {
    return TICKET_SUBMISSION_INITIAL;
  },
};

async function acceptQuoteNoop(): Promise<void> {}

async function cancelRfqNoop(): Promise<void> {}

function setCreditRfqFilterNoop(): void {}

function noRequestRfqTileQuote(): void {}

function noCancelRfqTile(): void {}

function noRejectRfqTile(): void {}

function noAcceptRfqTile(): void {}

function noSubmitRfq(): void {}

function noSubmitPrice(): void {}

function noPass(): void {}

/** The real desks, same catalogue slice `fixtures.tsx`'s `PINNED_DEALERS`
 * pins (ids 0-4: Adaptive Bank, Citi, JP Morgan, Goldman Sachs, Morgan
 * Stanley) — replacing the `Bank A/B/C` + a stray id-9 `ADAPTIVE_BANK_NAME`
 * entry this slice carried until 2026-08-30. `useDealers` is one of the nine
 * hooks not read by either visual fixture today (see this file's header
 * comment), but a future seam-reading fixture should see the same five
 * desks the pinned one already renders — not a placeholder roster with its
 * own, different "our desk" id. */
const DEALERS: readonly Dealer[] = DEALERS_CATALOG.slice(0, 5);

/** `DEALERS[0]`'s id — "Adaptive Bank", the sell-side's own desk. */
const ADAPTIVE_BANK_ID = 0;

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
  {
    id: 2,
    name: "Vertex 4.25% 2028",
    cusip: "000000BB2",
    ticker: "VRTX",
    maturity: "2028",
    interestRate: 4.25,
    benchmark: "T 3.5 2028",
    refPrice: 101.2,
  },
];

/** Four RFQs, one per `RfqState` arm — `Open`, `Closed`, `Expired`,
 * `Cancelled` — so the golden (and this slice's own test) exercises more
 * than the single "live" arm a smaller fixture would settle for. */
const RFQ_OPEN: Rfq = {
  id: 401,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: PINNED_NOW_MS,
};

const RFQ_CLOSED: Rfq = {
  id: 402,
  instrumentId: 2,
  quantity: 1_000_000,
  direction: Direction.Sell,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: PINNED_NOW_MS - DAY_MS,
};

const RFQ_EXPIRED: Rfq = {
  id: 403,
  instrumentId: 1,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Expired,
  expirySecs: 120,
  creationTimestamp: PINNED_NOW_MS - DAY_MS,
};

const RFQ_CANCELLED: Rfq = {
  id: 404,
  instrumentId: 2,
  quantity: 3_000_000,
  direction: Direction.Buy,
  state: RfqState.Cancelled,
  expirySecs: 120,
  creationTimestamp: PINNED_NOW_MS - DAY_MS,
};

const RFQS: readonly Rfq[] = [RFQ_OPEN, RFQ_CLOSED, RFQ_EXPIRED, RFQ_CANCELLED];

/** One quote per `QuoteState` arm — `pendingWithPrice`/`pendingWithoutPrice`
 * on the open RFQ, `accepted` on the closed one, `rejectedWithPrice`/
 * `passed` on the expired one, `rejectedWithoutPrice` on the cancelled one —
 * so every quote-row treatment `QuoteCard` can paint is exercised by at
 * least one fixture quote. */
const QUOTES_BY_RFQ_ID: Readonly<Record<number, readonly Quote[]>> = {
  [RFQ_OPEN.id]: [
    {
      id: 5001,
      rfqId: RFQ_OPEN.id,
      dealerId: 1,
      state: { type: "pendingWithPrice", price: 98.4 },
    },
    {
      id: 5002,
      rfqId: RFQ_OPEN.id,
      dealerId: 2,
      state: { type: "pendingWithoutPrice" },
    },
    {
      // Our own desk's quote on the live RFQ — pendingWithoutPrice, so a
      // future seam-reading fixture (`SellSidePanel`) has a real live
      // ticket to find via `adaptiveBankId`, not an "our desk" that never
      // quotes anything.
      id: 5007,
      rfqId: RFQ_OPEN.id,
      dealerId: ADAPTIVE_BANK_ID,
      state: { type: "pendingWithoutPrice" },
    },
  ],
  [RFQ_CLOSED.id]: [
    {
      id: 5003,
      rfqId: RFQ_CLOSED.id,
      dealerId: 1,
      state: { type: "accepted", price: 101.35 },
    },
  ],
  [RFQ_EXPIRED.id]: [
    {
      id: 5004,
      rfqId: RFQ_EXPIRED.id,
      dealerId: 2,
      state: { type: "rejectedWithPrice", price: 99.0 },
    },
    {
      id: 5005,
      rfqId: RFQ_EXPIRED.id,
      dealerId: 3,
      state: { type: "passed" },
    },
  ],
  [RFQ_CANCELLED.id]: [
    {
      id: 5006,
      rfqId: RFQ_CANCELLED.id,
      dealerId: 1,
      state: { type: "rejectedWithoutPrice" },
    },
  ],
};

/** Stable shared reference for any rfqId with no quotes — including unknown
 * ids — never `undefined`. */
const EMPTY_QUOTES: readonly Quote[] = [];

/** Flattened `id -> Quote` view of `QUOTES_BY_RFQ_ID`, built once at module
 * load so `useAllQuotes()` returns the identical `Map` on every call. */
const ALL_QUOTES_BY_ID: ReadonlyMap<number, Quote> = new Map(
  Object.values(QUOTES_BY_RFQ_ID)
    .flat()
    .map((quote) => {
      return [quote.id, quote] as const;
    }),
);

/** The FX quote-request tile's resting arm (`RfqTileMachine`'s own `INIT`
 * constant) — this hook is never actually called anywhere in
 * `client-react-native` (it belongs to `client-react`'s `Tile.tsx`), so this
 * exists for type completeness only. */
const RFQ_TILE_RESTING: RfqTileFixture = {
  state: { status: "init", quote: null, remainingMs: 0 },
  requestQuote: noRequestRfqTileQuote,
  cancel: noCancelRfqTile,
  reject: noRejectRfqTile,
  accept: noAcceptRfqTile,
};

/** `NewRfqForm`'s initial, un-submitted arm (mirrors `RfqsPresenter`'s own
 * `{ status: "editing" }` starting state). */
const RFQ_SUBMISSION_EDITING: RfqSubmissionFixture = {
  state: { status: "editing" },
  submit: noSubmitRfq,
};

/** `TradeTicket`'s initial, un-submitted arm (mirrors `RfqsPresenter`'s own
 * `NOT_SUBMITTED` constant). `SellSideTicket` never reads `state.submitted`
 * — only the `submitPrice`/`pass` intents — so this value's sole job is to
 * be a correct, stable initial arm. */
const TICKET_SUBMISSION_INITIAL: TicketSubmissionFixture = {
  state: { submitted: false },
  submitPrice: noSubmitPrice,
  pass: noPass,
};
