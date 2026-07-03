import { useEffect, useRef, useState } from "react";

import {
  DEALERS,
  fmtDate,
  fmtNum,
  INSTRUMENTS,
  parseNotional,
  RFQ_EXPIRY_SECS,
  RFQ_SEQ_START,
  SEED_RFQS,
  SEED_TRADES,
} from "#/credit/creditData";
import type { CreditTab, CreditTrade, Quote, Rfq } from "#/credit/types";
import type { RfqFormValue } from "#/credit/useCreditForm";
import { downloadCsv, toCsv } from "#/csvExport";

// PROTO L1169/L1173 (verbatim constants).
const QUOTE_MIN_DELAY_MS = 700;
const QUOTE_SPAN_MS = 3200;
const DEALER_PASS_PROB = 0.12;
const HOUSE_DEALER_ID = 1;
const HOUSE_EDGE = 0.18;
const PRICE_SPAN = 0.9;
const NEW_RFQ_FLASH_MS = 800;
const REMOVE_ANIM_MS = 330;
const EXITING_RETAIN_MS = 380;
const NOW_INTERVAL_MS = 400;
const TRADE_CAP = 40;

const CSV_HEADERS = [
  "Trade ID",
  "Status",
  "Trade Date",
  "Direction",
  "Counterparty",
  "CUSIP",
  "Security",
  "Quantity",
  "Order Type",
  "Unit Price",
];

export interface UseCreditRfqsOptions {
  rng?: () => number;
  nowIntervalMs?: number;
}

export interface CreditRfqsApi {
  rfqs: Rfq[];
  creditTab: CreditTab;
  creditTrades: CreditTrade[];
  now: number;
  liveCount: string;
  shownRfqs: Rfq[];
  noRfqs: boolean;
  newRfqId: number | null;
  newCreditId: number | null;
  exitingRfqs: number[];
  cardExitIds: number[];
  onTab(tab: CreditTab): void;
  sendRfq(form: RfqFormValue): void;
  acceptQuote(rfqId: number, dealerId: number): void;
  cancelRfq(rfqId: number): void;
  removeRfq(rfqId: number): void;
  onExport(): void;
}

interface DealerDraw {
  dealerId: number;
  delay: number;
  pass: boolean;
  price: number;
}

// PROTO L1173 (_checkExpiries): sweep Open RFQs past their expiry into
// Expired, flipping any still-pending quotes to passed.
function sweepExpiries(rfqs: Rfq[], now: number): Rfq[] {
  let changed = false;
  const next: Rfq[] = rfqs.map((r) => {
    if (r.state !== "Open" || now <= r.createdAt + r.expirySecs * 1000) {
      return r;
    }

    changed = true;

    const quotes: Quote[] = r.quotes.map((q) => {
      return q.state === "pending" ? { ...q, state: "passed" } : q;
    });

    return { ...r, state: "Expired", exitAt: now, quotes };
  });

  return changed ? next : rfqs;
}

// PROTO L1326: which tab an RFQ belongs to.
function rfqMatch(r: Rfq, tab: CreditTab): boolean {
  if (tab === "live") {
    return r.state === "Open";
  }

  if (tab === "closed") {
    return r.state !== "Open";
  }

  return true;
}

export function useCreditRfqs(opts: UseCreditRfqsOptions = {}): CreditRfqsApi {
  const { rng = Math.random, nowIntervalMs = NOW_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const seqRef = useRef(RFQ_SEQ_START);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [rfqs, setRfqs] = useState<Rfq[]>(SEED_RFQS);
  const [creditTab, setCreditTab] = useState<CreditTab>("all");
  const [creditTrades, setCreditTrades] = useState<CreditTrade[]>(SEED_TRADES);
  const [now, setNow] = useState(() => {
    return Date.now();
  });
  const [newRfqId, setNewRfqId] = useState<number | null>(null);
  const [newCreditId, setNewCreditId] = useState<number | null>(null);
  const [exitingRfqs, setExitingRfqs] = useState<number[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setRfqs((prev) => {
        return sweepExpiries(prev, ts);
      });
    }, nowIntervalMs);

    return () => {
      clearInterval(id);
    };
  }, [nowIntervalMs]);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }

      timers.clear();
    };
  }, []);

  function onTab(tab: CreditTab): void {
    setCreditTab(tab);
  }

  // PROTO L1169 (sendRfq): draw each dealer's delay/pass/price synchronously
  // (never inside a setState updater, which StrictMode may double-invoke),
  // then schedule a timer per dealer that applies the pre-drawn outcome.
  function sendRfq(form: RfqFormValue): void {
    const qty = parseNotional(form.qty) * 1000;

    if (form.instrumentId == null || qty <= 0 || form.dealerIds.length === 0) {
      return;
    }

    const instrumentId = form.instrumentId;
    const inst = INSTRUMENTS.find((i) => {
      return i.id === instrumentId;
    });

    if (!inst) {
      return;
    }

    const id = seqRef.current;
    seqRef.current += 1;

    const draws: DealerDraw[] = form.dealerIds.map((did) => {
      const delay = QUOTE_MIN_DELAY_MS + rngRef.current() * QUOTE_SPAN_MS;
      const pass = rngRef.current() < DEALER_PASS_PROB;
      let raw = inst.ref + (rngRef.current() - 0.5) * PRICE_SPAN;

      if (did === HOUSE_DEALER_ID) {
        raw -= form.dir === "Buy" ? HOUSE_EDGE : -HOUSE_EDGE;
      }

      return { dealerId: did, delay, pass, price: +raw.toFixed(2) };
    });

    const quotes: Quote[] = form.dealerIds.map((did) => {
      return { dealerId: did, state: "pending", price: null };
    });

    const rfq: Rfq = {
      id,
      state: "Open",
      dir: form.dir,
      instrumentId,
      qty,
      dealerIds: [...form.dealerIds],
      quotes,
      acceptedDealerId: null,
      createdAt: Date.now(),
      expirySecs: RFQ_EXPIRY_SECS,
    };

    setRfqs((prev) => {
      return [rfq, ...prev];
    });
    setCreditTab("live");
    setNewRfqId(id);

    const flashTimer = setTimeout(() => {
      timersRef.current.delete(flashTimer);
      setNewRfqId((prev) => {
        return prev === id ? null : prev;
      });
    }, NEW_RFQ_FLASH_MS);
    timersRef.current.add(flashTimer);

    for (const draw of draws) {
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        timersRef.current.delete(timeoutId);
        setRfqs((prev) => {
          return prev.map((r) => {
            if (r.id !== id || r.state !== "Open") {
              return r;
            }

            const nextQuotes: Quote[] = r.quotes.map((q) => {
              if (q.dealerId !== draw.dealerId) {
                return q;
              }

              return {
                ...q,
                state: draw.pass ? "passed" : "priced",
                price: draw.pass ? null : draw.price,
              };
            });

            return { ...r, quotes: nextQuotes };
          });
        });
      }, draw.delay);
      timersRef.current.add(timeoutId);
    }
  }

  // PROTO L1170 (acceptQuote): close the RFQ, accept the quote, book a trade.
  function acceptQuote(rfqId: number, dealerId: number): void {
    const r = rfqs.find((x) => {
      return x.id === rfqId;
    });

    if (!r) {
      return;
    }

    const inst = INSTRUMENTS.find((i) => {
      return i.id === r.instrumentId;
    });
    const dealer = DEALERS.find((d) => {
      return d.id === dealerId;
    });
    const q = r.quotes.find((x) => {
      return x.dealerId === dealerId;
    });

    if (!inst || !dealer) {
      return;
    }

    const exitAt = Date.now();

    setRfqs((prev) => {
      return prev.map((x) => {
        if (x.id !== rfqId) {
          return x;
        }

        const nextQuotes: Quote[] = x.quotes.map((qq) => {
          return qq.dealerId === dealerId ? { ...qq, state: "accepted" } : qq;
        });

        return {
          ...x,
          state: "Closed",
          exitAt,
          acceptedDealerId: dealerId,
          quotes: nextQuotes,
        };
      });
    });

    const trade: CreditTrade = {
      id: rfqId,
      status: "Done",
      date: fmtDate(0),
      dir: r.dir,
      cp: dealer.name,
      cusip: inst.cusip,
      sec: inst.ticker,
      qty: fmtNum(r.qty),
      ot: "AON",
      price: `$${(q?.price ?? inst.ref).toFixed(2)}`,
    };

    setCreditTrades((prev) => {
      return [trade, ...prev].slice(0, TRADE_CAP);
    });
    setNewCreditId(rfqId);
  }

  // PROTO L1171 (cancelRfq).
  function cancelRfq(rfqId: number): void {
    const exitAt = Date.now();

    setRfqs((prev) => {
      return prev.map((r) => {
        return r.id === rfqId && r.state === "Open"
          ? { ...r, state: "Cancelled", exitAt }
          : r;
      });
    });
  }

  // PROTO L1172 (removeRfq): animate out, then drop the RFQ from state.
  function removeRfq(rfqId: number): void {
    if (exitingRfqs.includes(rfqId)) {
      return;
    }

    setExitingRfqs((prev) => {
      return [...prev, rfqId];
    });

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      timersRef.current.delete(timeoutId);
      setRfqs((prev) => {
        return prev.filter((r) => {
          return r.id !== rfqId;
        });
      });
      setExitingRfqs((prev) => {
        return prev.filter((x) => {
          return x !== rfqId;
        });
      });
    }, REMOVE_ANIM_MS);
    timersRef.current.add(timeoutId);
  }

  // PROTO L1161 (exportCredit).
  function onExport(): void {
    const csv = toCsv(
      CSV_HEADERS,
      creditTrades.map((t) => {
        return [
          t.id,
          t.status,
          t.date,
          t.dir,
          t.cp,
          t.cusip,
          t.sec,
          t.qty,
          t.ot,
          t.price,
        ];
      }),
    );
    downloadCsv("credit-trades.csv", csv);
  }

  // PROTO L1327/L1330: shown = matches the active tab, plus anything mid
  // remove-animation, plus anything that just left "live" (accepted/
  // cancelled/expired) so its card can animate out before vanishing.
  // cardExitIds is the union RfqCard's isExiting reads from — a manual
  // trash-click exit (exitingRfqs) or this auto-exit (still inside its
  // EXITING_RETAIN_MS grace window) both play the same cardOut fade.
  const autoExitRfqIds = rfqs
    .filter((r) => {
      return (
        creditTab === "live" &&
        r.state !== "Open" &&
        r.exitAt != null &&
        now - r.exitAt < EXITING_RETAIN_MS
      );
    })
    .map((r) => {
      return r.id;
    });
  const cardExitIds = Array.from(new Set([...exitingRfqs, ...autoExitRfqIds]));
  const shownRfqs = rfqs.filter((r) => {
    return (
      rfqMatch(r, creditTab) ||
      exitingRfqs.includes(r.id) ||
      autoExitRfqIds.includes(r.id)
    );
  });
  const liveRfqs = rfqs.filter((r) => {
    return r.state === "Open";
  });
  const liveCount = liveRfqs.length ? `(${liveRfqs.length})` : "";
  const noRfqs: boolean = shownRfqs.length === 0;

  return {
    rfqs,
    creditTab,
    creditTrades,
    now,
    liveCount,
    shownRfqs,
    noRfqs,
    newRfqId,
    newCreditId,
    exitingRfqs,
    cardExitIds,
    onTab,
    sendRfq,
    acceptQuote,
    cancelRfq,
    removeRfq,
    onExport,
  };
}
