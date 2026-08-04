/** Round-price axis ticks for a visible range. rawStep = (cmax − cmin)/4 is
 * rounded to the nearest 1-2-5×10^k step by d3's tick-increment thresholds
 * (err ≥ √50 → 10, ≥ √10 → 5, ≥ √2 → 2, else 1) — NOT snapped up, which
 * under-produces (101→109.5 would yield one tick). Every integer multiple of
 * the step inside [cmin, cmax], ascending; ~3–6 ticks by construction.
 * Count: typically 3–6 (target 4), HARD bounds [2, 7] — boundary alignment
 * can cost a tick, matching d3 (spec §3, amended). cmax ≤ cmin (unreachable
 * with real OHLC) returns [cmin] to stay total. */
export function priceTicks(cmin: number, cmax: number): readonly number[] {
  if (cmax <= cmin) {
    return [cmin];
  }

  const rawStep = (cmax - cmin) / 4;
  const power = Math.floor(Math.log10(rawStep));
  const err = rawStep / 10 ** power;
  let multiplier: number;

  if (err >= Math.sqrt(50)) {
    multiplier = 10;
  } else if (err >= Math.sqrt(10)) {
    multiplier = 5;
  } else if (err >= Math.sqrt(2)) {
    multiplier = 2;
  } else {
    multiplier = 1;
  }

  const step = multiplier * 10 ** power;
  const ticks: number[] = [];

  for (let k = Math.ceil(cmin / step); k <= Math.floor(cmax / step); k++) {
    ticks.push(k * step);
  }

  return ticks;
}
