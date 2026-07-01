import { useEffect, useRef, useState } from "react";

import { BASE_RATES, META, ORDER } from "#/fx/fxData";
import type { Sym } from "#/fx/types";

const HIST_LEN = 30;
const DEFAULT_INTERVAL_MS = 250;

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

export function useFxRates(opts: UseFxRatesOptions = {}): RatesApi {
  const { rng = Math.random, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const [opens] = useState<Record<Sym, number>>(seedOpens);
  const [walk, setWalk] = useState<WalkState>(seedWalkState);

  useEffect(() => {
    const id = setInterval(() => {
      setWalk((prev) => {
        return walkTick(prev, rngRef.current);
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return {
    rates: walk.rates,
    opens,
    dirs: walk.dirs,
    flash: walk.flash,
    hist: walk.hist,
  };
}
