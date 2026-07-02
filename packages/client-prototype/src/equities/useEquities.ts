import { useEffect, useRef, useState } from "react";

import { EQ_META, EQ_SYMS, seedVols } from "#/equities/equitiesData";
import type { EqSym } from "#/equities/types";

const DEFAULT_INTERVAL_MS = 850;
const WALK_FACTOR = 0.0016;
const PREV_SMOOTH = 0.12;
const PREV_SEED_SPAN = 0.02;
const PREV_SEED_BIAS = 0.4;

export interface FlashEvent {
  dir: 1 | -1;
  ts: number;
}

export interface EquitiesApi {
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
}

export interface UseEquitiesOptions {
  rng?: () => number;
  intervalMs?: number;
}

type WalkState = Pick<EquitiesApi, "rates" | "prev" | "flash">;

// PROTO L807: rates seed at the meta price; prev seeds slightly off so the
// opening %-change is non-zero.
function seedWalk(rng: () => number): WalkState {
  const rates = {} as Record<EqSym, number>;
  const prev = {} as Record<EqSym, number>;
  const flash = {} as Record<EqSym, FlashEvent>;

  for (const sym of EQ_SYMS) {
    const px = EQ_META[sym].px;
    rates[sym] = px;
    prev[sym] = px * (1 - (rng() - PREV_SEED_BIAS) * PREV_SEED_SPAN);
    flash[sym] = { dir: 1, ts: 0 };
  }

  return { rates, prev, flash };
}

// PROTO L1134: per tick each rate walks by ±0.08%, prev eases 12% toward it,
// and the flash records the tick direction with a fresh timestamp.
function walkTick(state: WalkState, rng: () => number): WalkState {
  const rates = {} as Record<EqSym, number>;
  const prev = {} as Record<EqSym, number>;
  const flash = {} as Record<EqSym, FlashEvent>;
  const ts = Date.now();

  for (const sym of EQ_SYMS) {
    const rate = state.rates[sym];
    const dlt = rate * (rng() - 0.5) * WALK_FACTOR;
    const nv = +(rate + dlt).toFixed(2);
    const dir: 1 | -1 = dlt >= 0 ? 1 : -1;

    rates[sym] = nv;
    prev[sym] = state.prev[sym] + (nv - state.prev[sym]) * PREV_SMOOTH;
    flash[sym] = { dir, ts };
  }

  return { rates, prev, flash };
}

export function useEquities(opts: UseEquitiesOptions = {}): EquitiesApi {
  const { rng = Math.random, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  const rngRef = useRef(rng);
  const [walk, setWalk] = useState<WalkState>(() => {
    return seedWalk(rngRef.current);
  });
  const [vol] = useState<Record<EqSym, string>>(() => {
    return seedVols(rngRef.current);
  });

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

  return { rates: walk.rates, prev: walk.prev, flash: walk.flash, vol };
}
