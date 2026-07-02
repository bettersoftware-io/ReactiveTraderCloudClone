import type {
  CreditTrade,
  Dealer,
  Instrument,
  Quote,
  Rfq,
} from "#/credit/types";

export const RFQ_SEQ_START = 700;
export const RFQ_EXPIRY_SECS = 120;

// PROTO L757: the 9 seeded dealers; id 1 "Adaptive Bank" is the house dealer.
export const DEALERS: Dealer[] = [
  { id: 1, name: "Adaptive Bank" },
  { id: 2, name: "Citi" },
  { id: 3, name: "JP Morgan" },
  { id: 4, name: "Goldman Sachs" },
  { id: 5, name: "Morgan Stanley" },
  { id: 6, name: "Barclays" },
  { id: 7, name: "RBC" },
  { id: 8, name: "HSBC" },
  { id: 9, name: "Deutsche Bank" },
];

// PROTO L758-762: the 8 seeded corporate/treasury bonds.
export const INSTRUMENTS: Instrument[] = [
  {
    id: 1,
    ticker: "AAPL 2.4 08/30",
    name: "Apple Inc",
    cusip: "037833DX5",
    ref: 98.4,
  },
  {
    id: 2,
    ticker: "MSFT 3.3 02/27",
    name: "Microsoft Corp",
    cusip: "594918BV5",
    ref: 99.8,
  },
  {
    id: 3,
    ticker: "AMZN 4.05 08/47",
    name: "Amazon.com Inc",
    cusip: "023135BW5",
    ref: 96.2,
  },
  {
    id: 4,
    ticker: "GOOGL 1.1 08/30",
    name: "Alphabet Inc",
    cusip: "02079KAC1",
    ref: 91.5,
  },
  {
    id: 5,
    ticker: "TSLA 5.3 08/25",
    name: "Tesla Inc",
    cusip: "88160RAG6",
    ref: 100.6,
  },
  {
    id: 6,
    ticker: "UST 4.0 11/34",
    name: "US Treasury 10Y",
    cusip: "91282CFP1",
    ref: 98.9,
  },
  {
    id: 7,
    ticker: "VZ 4.5 08/33",
    name: "Verizon Comms",
    cusip: "92343VGE9",
    ref: 97.3,
  },
  {
    id: 8,
    ticker: "KO 1.45 06/27",
    name: "Coca-Cola Co",
    cusip: "191216DA5",
    ref: 93.7,
  },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Local formatters (Credit stays self-contained — no import from fx/; the spec
// defers a shared format module as YAGNI). Bodies match fxData verbatim.
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function parseNotional(str: string | null): number {
  if (str == null) {
    return Number.NaN;
  }

  let s = String(str).trim().toLowerCase().replace(/,/g, "");
  let m = 1;

  if (s.endsWith("m")) {
    m = 1e6;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    m = 1e3;
    s = s.slice(0, -1);
  }

  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? Number.NaN : Math.round(n * m);
}

export function fmtDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// PROTO L835 _seedRfq, simplified to a static shape: a Closed RFQ (accepted at
// 99.80 by Citi) and a Cancelled RFQ. Static prices — no RNG at module load.
function seedQuotes(
  dealerIds: number[],
  acceptedId: number | null,
  price: number | null,
  ref: number,
): Quote[] {
  return dealerIds.map((did) => {
    if (did === acceptedId) {
      return { dealerId: did, state: "accepted", price };
    }

    return {
      dealerId: did,
      state: acceptedId == null ? "passed" : "priced",
      price: price ?? ref,
    };
  });
}

// PROTO L820: rfqs seed — #238 Closed (Buy MSFT id 2, accepted by dealer 2 @ 99.80),
// #237 Cancelled (Sell Morgan Stanley id 5). createdAt is far in the past so the
// live countdown never applies; dealer set is the first four.
const CLOSED_DEALERS = [1, 2, 3, 4];
export const SEED_RFQS: Rfq[] = [
  {
    id: 238,
    state: "Closed",
    dir: "Buy",
    instrumentId: 2,
    qty: 3_500_000,
    dealerIds: CLOSED_DEALERS,
    quotes: seedQuotes(CLOSED_DEALERS, 2, 99.8, 99.8),
    acceptedDealerId: 2,
    createdAt: 0,
    expirySecs: RFQ_EXPIRY_SECS,
  },
  {
    id: 237,
    state: "Cancelled",
    dir: "Sell",
    instrumentId: 5,
    qty: 2_000_000,
    dealerIds: CLOSED_DEALERS,
    quotes: seedQuotes(CLOSED_DEALERS, null, null, 100.6),
    acceptedDealerId: null,
    createdAt: 0,
    expirySecs: RFQ_EXPIRY_SECS,
  },
];

// PROTO L821: two seeded credit trades in the blotter.
export const SEED_TRADES: CreditTrade[] = [
  {
    id: 238,
    status: "Done",
    date: fmtDate(-2),
    dir: "Buy",
    cp: "Citi",
    cusip: "594918BV5",
    sec: "MSFT 3.3 02/27",
    qty: "3,500,000",
    ot: "AON",
    price: "$99.8",
  },
  {
    id: 235,
    status: "Done",
    date: fmtDate(-6),
    dir: "Sell",
    cp: "Goldman Sachs",
    cusip: "037833DX5",
    sec: "AAPL 2.4 08/30",
    qty: "2,000,000",
    ot: "AON",
    price: "$101.2",
  },
];
