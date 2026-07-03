import { useEffect, useRef, useState } from "react";

import {
  BASE_RATES,
  FX_SEQ_START,
  fmtDate,
  fmtNum,
  META,
  ORDER,
  parseNotional,
  RFQ_THRESHOLD,
  SEED_TRADES,
} from "#/fx/fxData";
import type { ActivityEvent, Dir, Sym, TileState, Trade } from "#/fx/types";

const HIST_LEN = 30;
const DEFAULT_INTERVAL_MS = 250;
const EXPIRY_SWEEP_MS = 400;
const BOOK_DELAY_MS = 1200;
const RFQ_QUOTE_DELAY_MS = 1700;
const RFQ_WINDOW_MS = 15_000;
const REJECT_PROBABILITY = 0.12;
const PNL_SPAN = 800;
const PNL_BIAS = 0.3;
const PNL_SEED = 17120;
const PNL_TICK_SPAN = 500;
const PNL_TICK_BIAS = 0.42;
const MAX_NOTIONAL = 1e9;
const DEFAULT_NOTIONAL = "1,000,000";
const ACTIVITY_CAP = 40;
const TRADE_CAP = 40;

interface FlashEvent {
  dir: 1 | -1;
  ts: number;
}

export interface RatesApi {
  rates: Record<Sym, number>;
  opens: Record<Sym, number>;
  dirs: Record<Sym, 1 | -1>;
  flash: Record<Sym, FlashEvent>;
  hist: Record<Sym, number[]>;
  notionals: Record<Sym, string>;
  tiles: Record<Sym, TileState>;
  activity: ActivityEvent[];
  trades: Trade[];
  newRowId: number | null;
  pnl: number;
  onNotional(sym: Sym, raw: string): void;
  onReset(sym: Sym): void;
  onSell(sym: Sym): void;
  onBuy(sym: Sym): void;
  onDismiss(sym: Sym): void;
}

export interface UseFxRatesOptions {
  rng?: () => number;
  intervalMs?: number;
}

type WalkState = Pick<RatesApi, "rates" | "dirs" | "flash" | "hist">;

function seedWalkState(): WalkState {
  const rates = {} as Record<Sym, number>;
  const dirs = {} as Record<Sym, 1 | -1>;
  const flash = {} as Record<Sym, FlashEvent>;
  const hist = {} as Record<Sym, number[]>;

  for (const sym of ORDER) {
    rates[sym] = BASE_RATES[sym];
    dirs[sym] = 1;
    flash[sym] = { dir: 1, ts: 0 };
    hist[sym] = Array.from({ length: HIST_LEN }, () => {
      return BASE_RATES[sym];
    });
  }

  return { rates, dirs, flash, hist };
}

function seedOpens(): Record<Sym, number> {
  const opens = {} as Record<Sym, number>;

  for (const sym of ORDER) {
    opens[sym] = BASE_RATES[sym];
  }

  return opens;
}

function seedNotionals(): Record<Sym, string> {
  const notionals = {} as Record<Sym, string>;

  for (const sym of ORDER) {
    notionals[sym] = DEFAULT_NOTIONAL;
  }

  return notionals;
}

function seedTiles(): Record<Sym, TileState> {
  const tiles = {} as Record<Sym, TileState>;

  for (const sym of ORDER) {
    tiles[sym] = { stage: "idle" };
  }

  return tiles;
}

function walkTick(prev: WalkState, rng: () => number): WalkState {
  const rates = {} as Record<Sym, number>;
  const dirs = {} as Record<Sym, 1 | -1>;
  const flash = {} as Record<Sym, FlashEvent>;
  const hist = {} as Record<Sym, number[]>;
  const ts = Date.now();

  for (const sym of ORDER) {
    const meta = META[sym];
    const rate = prev.rates[sym];
    const step = meta.d === 3 ? 0.02 : 0.00018;
    const dlt = (rng() - 0.5) * step;
    const nv = rate + dlt;
    const kept = nv <= 0 ? rate : nv;
    const dir: 1 | -1 = dlt >= 0 ? 1 : -1;

    rates[sym] = +kept.toFixed(meta.d);
    dirs[sym] = dir;
    flash[sym] = { dir, ts };
    hist[sym] = [...prev.hist[sym].slice(1), rates[sym]];
  }

  return { rates, dirs, flash, hist };
}

function hhmm(): string {
  return new Date().toTimeString().slice(0, 8);
}

function priceUnit(d: number): number {
  return d === 3 ? 0.01 : 0.0001;
}

function sidePrice(cur: number, side: Dir, half: number): number {
  return side === "Sell" ? cur - half : cur + half;
}

export function useFxRates(opts: UseFxRatesOptions = {}): RatesApi {
  const { rng = Math.random, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const [opens] = useState<Record<Sym, number>>(seedOpens);
  const [walk, setWalk] = useState<WalkState>(seedWalkState);
  const ratesRef = useRef<Record<Sym, number>>(walk.rates);

  const [notionals, setNotionals] =
    useState<Record<Sym, string>>(seedNotionals);
  const notionalsRef = useRef<Record<Sym, string>>(notionals);

  const [tiles, setTiles] = useState<Record<Sym, TileState>>(seedTiles);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [trades, setTrades] = useState<Trade[]>(SEED_TRADES);
  const [newRowId, setNewRowId] = useState<number | null>(null);
  const [pnl, setPnl] = useState(PNL_SEED);

  const fxSeqRef = useRef(FX_SEQ_START);
  const activitySeqRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      setWalk((prev) => {
        const next = walkTick(prev, rngRef.current);
        ratesRef.current = next.rates;
        return next;
      });
      setPnl((prev) => {
        return Math.max(
          0,
          prev + Math.round((rngRef.current() - PNL_TICK_BIAS) * PNL_TICK_SPAN),
        );
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      setTiles((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const sym of ORDER) {
          const t = next[sym];

          if (t.stage === "rfqRecv" && t.rfqEnd != null && now > t.rfqEnd) {
            next[sym] = { stage: "idle" };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, EXPIRY_SWEEP_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }

      timers.clear();
    };
  }, []);

  function logEvt(tag: string, msg: string, color: string): void {
    const id = activitySeqRef.current++;
    setActivity((prev) => {
      return [{ id, t: hhmm(), tag, msg, color }, ...prev].slice(
        0,
        ACTIVITY_CAP,
      );
    });
  }

  function setTile(sym: Sym, patch: Partial<TileState>): void {
    setTiles((prev) => {
      return { ...prev, [sym]: { ...prev[sym], ...patch } };
    });
  }

  function book(sym: Sym, side: Dir, forced?: string | null): void {
    setTile(sym, { stage: "executing" });

    const timeoutId = setTimeout(() => {
      timersRef.current.delete(timeoutId);

      const meta = META[sym];
      const cur = ratesRef.current[sym];
      const pu = priceUnit(meta.d);
      const half = (parseFloat(meta.spread) / 2) * pu;
      const rate =
        forced != null ? parseFloat(forced) : sidePrice(cur, side, half);
      const rateStr = rate.toFixed(meta.d);
      const n = parseNotional(notionalsRef.current[sym]);
      const rejected = rngRef.current() < REJECT_PROBABILITY;
      const id = fxSeqRef.current;
      fxSeqRef.current += 1;

      if (rejected) {
        setTile(sym, { stage: "failure", trade: { id, dir: side } });
        logEvt("REJECT", `Trade ${id} ${sym} rejected`, "var(--sell)");
        return;
      }

      const trade: Trade = {
        id,
        status: "Done",
        dir: side,
        symbol: sym,
        dealtCcy: meta.base,
        notional: fmtNum(n),
        notionalNum: n,
        rate: rateStr,
        trader: "You",
        tradeDate: fmtDate(0),
        valueDate: fmtDate(2),
      };

      setTiles((prev) => {
        return { ...prev, [sym]: { stage: "success", trade } };
      });
      setTrades((prev) => {
        return [trade, ...prev].slice(0, TRADE_CAP);
      });
      setPnl((prev) => {
        return Math.max(
          0,
          prev + Math.round((rngRef.current() - PNL_BIAS) * PNL_SPAN),
        );
      });
      setNewRowId(id);
      logEvt(
        "TRADE",
        `${side} ${sym} ${fmtNum(n)} @ ${rateStr}`,
        "var(--accent2)",
      );
    }, BOOK_DELAY_MS);

    timersRef.current.add(timeoutId);
  }

  function initTileRfq(sym: Sym): void {
    setTile(sym, { stage: "rfqReq" });
    logEvt("RFQ", `Quote requested · ${sym}`, "var(--accent)");

    const timeoutId = setTimeout(() => {
      timersRef.current.delete(timeoutId);

      const meta = META[sym];
      const cur = ratesRef.current[sym];
      const pu = priceUnit(meta.d);
      const half = ((parseFloat(meta.spread) * 1.4) / 2) * pu;
      const start = Date.now();

      setTile(sym, {
        stage: "rfqRecv",
        quote: {
          Sell: (cur - half).toFixed(meta.d),
          Buy: (cur + half).toFixed(meta.d),
        },
        rfqStart: start,
        rfqEnd: start + RFQ_WINDOW_MS,
      });
    }, RFQ_QUOTE_DELAY_MS);

    timersRef.current.add(timeoutId);
  }

  function priceClick(sym: Sym, side: Dir): void {
    const st = tiles[sym] ?? { stage: "idle" };
    const n = parseNotional(notionals[sym]);

    if (Number.isNaN(n) || n > MAX_NOTIONAL) {
      return;
    }

    const isRfq = n > RFQ_THRESHOLD;

    if (isRfq) {
      if (st.stage === "rfqRecv") {
        book(sym, side, st.quote ? st.quote[side] : null);
      } else if (st.stage === "idle") {
        initTileRfq(sym);
      }

      return;
    }

    book(sym, side);
  }

  function onNotional(sym: Sym, raw: string): void {
    const n = parseNotional(raw);

    setNotionals((prev) => {
      const next = { ...prev, [sym]: Number.isNaN(n) ? raw : fmtNum(n) };
      notionalsRef.current = next;
      return next;
    });
  }

  function onReset(sym: Sym): void {
    setNotionals((prev) => {
      const next = { ...prev, [sym]: DEFAULT_NOTIONAL };
      notionalsRef.current = next;
      return next;
    });
  }

  function onSell(sym: Sym): void {
    priceClick(sym, "Sell");
  }

  function onBuy(sym: Sym): void {
    priceClick(sym, "Buy");
  }

  function onDismiss(sym: Sym): void {
    setTile(sym, { stage: "idle" });
  }

  return {
    rates: walk.rates,
    opens,
    dirs: walk.dirs,
    flash: walk.flash,
    hist: walk.hist,
    notionals,
    tiles,
    activity,
    trades,
    newRowId,
    pnl,
    onNotional,
    onReset,
    onSell,
    onBuy,
    onDismiss,
  };
}
